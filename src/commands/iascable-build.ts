import {Container} from 'typescript-ioc';
import {Arguments, Argv} from 'yargs';
import {fchmod, promises} from 'fs';
import {default as jsYaml} from 'js-yaml';
import {dirname, join} from 'path';

import {IascableInput} from './inputs/iascable.input';
import {CommandLineInput} from './inputs/command-line.input';
import {BillOfMaterialModel, isTileConfig, OutputFile, TerraformComponent, Tile} from '../models';
import {
  IascableApi,
  IascableOptions,
  IascableResult,
  loadBillOfMaterialFromFile,
  loadReferenceBom
} from '../services';
import {LoggerApi} from '../util/logger';
import {DotGraphFile} from '../models/graph.model';
import {chmodRecursive} from '../util/file-util';

export const command = 'build';
export const desc = 'Configure (and optionally deploy) the iteration zero assets';
export const builder = (yargs: Argv<any>) => {
  return yargs
    .option('catalogUrl', {
      alias: 'u',
      description: 'The url of the module catalog. Can be https:// or file:/ protocol.',
      default: 'https://modules.cloudnativetoolkit.dev/index.yaml'
    })
    .option('input', {
      alias: 'i',
      description: 'The path to the bill of materials to use as input',
      conflicts: 'reference',
      type: 'array',
      demandOption: false,
    })
    .option('reference', {
      alias: 'r',
      description: 'The reference BOM to use for the build',
      conflicts: 'input',
      type: 'array',
      demandOption: false,
    })
    .option('outDir', {
      alias: 'o',
      description: 'The base directory where the command output will be written',
      demandOption: false,
      default: './output'
    })
    .option('platform', {
      description: 'Filter for the platform (kubernetes or ocp4)',
      demandOption: false,
    })
    .option('provider', {
      description: 'Filter for the provider (ibm or k8s)',
      demandOption: false,
    })
    .option('tileLabel', {
      description: 'The label for the tile. Required if you want to generate the tile metadata.',
      demandOption: false,
    })
    .option('name', {
      description: 'The name used to override the module name in the bill of material.',
      demandOption: false,
      type: 'array'
    })
    .option('tileDescription', {
      description: 'The description of the tile.',
      demandOption: false,
    })
    .option('flattenOutput', {
      alias: ['flatten'],
      description: 'Flatten the generated output into a single directory (i.e. remove the terraform folder).',
      type: 'boolean',
      demandOption: false,
    })
    .option('debug', {
      type: 'boolean',
      describe: 'Flag to turn on more detailed output message',
    })
    .check((argv) => {
      if (!(argv.reference && argv.reference.length > 0) && !(argv.input && argv.input.length > 0)) {
        throw new Error('Bill of Materials not provided. Provide the path to the bill of material file with the -i or -r flag.')
      }

      return true
    });
};

export const handler = async (argv: Arguments<IascableInput & CommandLineInput & {flattenOutput: boolean}>) => {
  process.env.LOG_LEVEL = argv.debug ? 'debug' : 'info';

  const cmd: IascableApi = Container.get(IascableApi);
  const logger: LoggerApi = Container.get(LoggerApi).child('build');

  const boms: Array<BillOfMaterialModel> = await loadBoms(argv.reference, argv.input, argv.name);

  if ((argv.input || argv.reference) && !argv.prompt) {
    argv.ci = true;
  }

  const options: IascableOptions = buildCatalogBuilderOptions(argv);

  try {
    const results: IascableResult[] = await cmd.buildBoms(argv.catalogUrl, boms, options);

    const outputDir = argv.outDir || './output';

    console.log(`Writing output to: ${outputDir}`)
    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      await outputResult(outputDir, result, argv.flattenOutput);
    }
  } catch (err) {
    console.log('')
    console.error(`Error: ${err.message}`)

    if (argv.debug) {
      logger.error('Error building config', {err})
    }
  }
};

const buildRootPath = (outputDir: string, bom: BillOfMaterialModel): string => {
  const pathParts: string[] = [
    outputDir,
    bom.metadata?.annotations?.path || '',
    bom.metadata?.name || 'component'
  ]
    .filter(v => !!v)

  return join(...pathParts)
}

async function loadBoms(referenceNames?: string[], inputNames?: string[], names: string[] = []): Promise<Array<BillOfMaterialModel>> {
  const boms: Array<BillOfMaterialModel> = [];

  const bomNames: string[] = referenceNames && referenceNames.length > 0 ? referenceNames : inputNames as string[];
  const bomFunction = referenceNames && referenceNames.length > 0 ? loadReferenceBom : loadBillOfMaterialFromFile;

  for (let i = 0; i < bomNames.length; i++) {
    const name = names.length > i ? names[i] : ''

    const bom: BillOfMaterialModel | undefined = await bomFunction(bomNames[i], name)

    if (!bom) {
      throw new Error(`Unable to load BOM: ${bomNames[i]}`)
    }

    boms.push(bom);
  }

  return boms;
}

function buildCatalogBuilderOptions(input: IascableInput): IascableOptions {
  const tileConfig = {
    label: input.tileLabel,
    name: input.name,
    shortDescription: input.tileDescription,
  };

  return {
    interactive: false,
    filter: {
      platform: input.platform,
      provider: input.provider,
    },
    tileConfig: isTileConfig(tileConfig) ? tileConfig : undefined,
  };
}

async function outputBillOfMaterial(rootPath: string, billOfMaterial: BillOfMaterialModel) {
  await promises.mkdir(rootPath, {recursive: true})

  await chmodRecursive(rootPath, 0o777)

  return promises.writeFile(join(rootPath, 'bom.yaml'), jsYaml.dump(billOfMaterial));
}

async function outputDependencyGraph(rootPath: string, graph?: DotGraphFile) {
  if (!graph) {
    return
  }

  await promises.mkdir(rootPath, {recursive: true})

  await chmodRecursive(rootPath, 0o777)

  return promises.writeFile(join(rootPath, graph.name), await graph.contents);
}

async function outputTerraform(rootPath: string, terraformComponent: TerraformComponent) {
  return Promise.all(terraformComponent.files.map(async (file: OutputFile) => {
    const path = join(rootPath, file.name);
    await promises.mkdir(dirname(path), {recursive: true})
    await chmodRecursive(rootPath, 0o777)

    const fileContents = await file.contents;

    return promises.writeFile(path, fileContents);
  }));
}

async function outputTile(rootPath: string, tile: Tile | undefined) {
  if (!tile) {
    return;
  }

  await promises.mkdir(rootPath, {recursive: true})
  await chmodRecursive(rootPath, 0o777)

  return promises.writeFile(join(rootPath, tile.file.name), await tile.file.contents);
}

async function outputLaunchScript(rootPath: string) {
  const launchScriptPath: string = join(rootPath, 'launch.sh')

  await promises.writeFile(launchScriptPath, launchScript)
    .catch(err => {
      console.log('  Error writing launch script', err)
      return {}
    })

  try {
    const { fd } = await promises.open(launchScriptPath, 'r');
    fchmod(fd, 0o777, err => {
      if (err) throw err;
    });
  } catch (error) {
    // nothing to do
  }
}

async function outputApplyScript(rootPath: string) {
  const applyScriptPath: string = join(rootPath, 'apply.sh')

  await promises.writeFile(applyScriptPath, applyScript)
    .catch(err => {
      console.log('  Error writing apply script', err)
      return {}
    })

  try {
    const { fd } = await promises.open(applyScriptPath, 'r');
    fchmod(fd, 0o777, err => {
      if (err) throw err;
    });
  } catch (error) {
    // nothing to do
  }
}

async function outputDestroyScript(rootPath: string) {
  const destroyScriptPath: string = join(rootPath, 'destroy.sh')

  await promises.writeFile(destroyScriptPath, destroyScript)
    .catch(err => {
      console.log('  Error writing apply script', err)
      return {}
    })

  try {
    const { fd } = await promises.open(destroyScriptPath, 'r');
    fchmod(fd, 0o777, err => {
      if (err) throw err;
    });
  } catch (error) {
    // nothing to do
  }
}

async function outputResult(outputDir: string, result: IascableResult, flatten: boolean = false): Promise<void> {
  const rootPath: string = buildRootPath(outputDir, result.billOfMaterial)

  await outputBillOfMaterial(rootPath, result.billOfMaterial);
  await outputTerraform(flatten ? rootPath : join(rootPath, 'terraform'), result.terraformComponent);
  await outputTile(rootPath, result.tile);
  await outputDependencyGraph(rootPath, result.graph)
  await outputApplyScript(rootPath);
  await outputDestroyScript(rootPath);
  await outputLaunchScript(outputDir);
}

const launchScript: string = `#!/bin/bash

# IBM GSI Ecosystem Lab

SCRIPT_DIR="\$(cd \$(dirname "\$0"); pwd -P)"
SRC_DIR="\${SCRIPT_DIR}/automation"

AUTOMATION_BASE=\$(basename "\${SCRIPT_DIR}")

if [[ "\$1" == "-h" ]] || [[ "\$1" == "--help" ]]; then
  echo "Usage: launch.sh [{docker cmd}] [--pull]"
  echo "  where:"
  echo "    {docker cmd} is the docker command that should be used (e.g. docker, podman). Defaults to docker"
  echo "    --pull is a flag indicating the latest version of the container image should be pulled"
  exit 0
fi

DOCKER_CMD="docker"
if [[ -n "\$1" ]] && [[ "\$1" != "--pull" ]]; then
  DOCKER_CMD="\${1:-docker}"
fi

if [[ ! -d "\${SRC_DIR}" ]]; then
  SRC_DIR="\${SCRIPT_DIR}"
fi

# check if colima is installed, and apply dns override if no override file already exists
if command -v colima &> /dev/null
then
  if [ ! -f ~/.lima/_config/override.yaml ]; then
    echo "applying colima dns override..."

    COLIMA_STATUS="\$(colima status 2>&1)"
    SUB='colima is running'
    if [[ "\$COLIMA_STATUS" == *"\$SUB"* ]]; then
      echo "stopping colima"
      colima stop
    fi

    echo "writing ~/.lima/_config/override.yaml"
    mkdir -p ~/.lima/_config
    printf "useHostResolver: false\\ndns:\\n- 8.8.8.8" > ~/.lima/_config/override.yaml

    if [[ "\$COLIMA_STATUS" == *"\$SUB"* ]]; then
      echo "restarting colima"
      colima start
    fi
  fi
fi

DOCKER_IMAGE="quay.io/cloudnativetoolkit/cli-tools:v1.2"

SUFFIX=\$(echo \$(basename \${SCRIPT_DIR}) | base64 | sed -E "s/[^a-zA-Z0-9_.-]//g" | sed -E "s/.*(.{5})/\\1/g")
CONTAINER_NAME="cli-tools-\${SUFFIX}"

echo "Cleaning up old container: \${CONTAINER_NAME}"

\${DOCKER_CMD} kill \${CONTAINER_NAME} 1> /dev/null 2> /dev/null
\${DOCKER_CMD} rm \${CONTAINER_NAME} 1> /dev/null 2> /dev/null

ARG_ARRAY=( "\$@" )

if [[ " \${ARG_ARRAY[*]} " =~ " --pull " ]]; then
  echo "Pulling container image: \${DOCKER_IMAGE}"
  \${DOCKER_CMD} pull "\${DOCKER_IMAGE}"
fi

ENV_FILE=""
if [[ -f "credentials.properties" ]]; then
  ENV_FILE="--env-file credentials.properties"
fi

echo "Initializing container \${CONTAINER_NAME} from \${DOCKER_IMAGE}"
\${DOCKER_CMD} run -itd --name \${CONTAINER_NAME} \
   -u "\${UID}" \
   -v "\${SRC_DIR}:/terraform" \
   -v "workspace-\${AUTOMATION_BASE}:/workspaces" \
   \${ENV_FILE} \
   -w /terraform \
   \${DOCKER_IMAGE}

echo "Attaching to running container..."
\${DOCKER_CMD} attach \${CONTAINER_NAME}

`

const destroyScript: string = `#!/usr/bin/env bash

SCRIPT_DIR=\$(cd \$(dirname \$0); pwd -P)

cd "\${SCRIPT_DIR}/terraform"
terraform init
terraform destroy -auto-approve
`

const applyScript: string = `#!/usr/bin/env bash

SCRIPT_DIR=\$(cd \$(dirname \$0); pwd -P)

VARIABLES_FILE="\${1}"
if [[ -z "\${VARIABLES_FILE}" ]]; then
  VARIABLES_FILE="\${SCRIPT_DIR}/variables.yaml"
fi

YQ=\$(command -v yq4 || command -v yq)
if [[ -z "\${YQ}" ]] || [[ \$(\${YQ} --version | sed -E "s/.*version ([34]).*/\\1/g") == "3" ]]; then
  echo "yq v4 is required"
  exit 1
fi

if [[ -f "\${SCRIPT_DIR}/terraform/terraform.tfvars" ]]; then
  cp "\${SCRIPT_DIR}/terraform/terraform.tfvars" "\${SCRIPT_DIR}/terraform/terraform.tfvars.backup"
  rm "\${SCRIPT_DIR}/terraform/terraform.tfvars"
fi

if [[ ! -f "\${VARIABLES_FILE}" ]]; then
  echo "Variables can be provided in a yaml file passed as the first argument"
  echo ""
fi

TMP_VARIABLES_FILE="\${VARIABLES_FILE}.tmp"

echo "variables: []" > \${TMP_VARIABLES_FILE}

cat "\${SCRIPT_DIR}/bom.yaml" | \${YQ} e '.spec.variables[] | .name' - | while read name; do
  default_value=\$(cat "\${SCRIPT_DIR}/bom.yaml" | NAME="\${name}" \${YQ} e '.spec.variables[] | select(.name == env(NAME)) | .defaultValue // ""' -)
  sensitive=\$(cat "\${SCRIPT_DIR}/bom.yaml" | NAME="\${name}" \${YQ} e '.spec.variables[] | select(.name == env(NAME)) | .sensitive // false' -)
  description=\$(cat "\${SCRIPT_DIR}/bom.yaml" | NAME="\${name}" \${YQ} e '.spec.variables[] | select(.name == env(NAME)) | .description // ""' -)

  variable_name="TF_VAR_\${name}"

  environment_variable=\$(env | grep "\${variable_name}" | sed -E 's/.*="(.*)".*/\\1/g')
  value="\${environment_variable}"
  if [[ -f "\${VARIABLES_FILE}" ]]; then
    value=\$(cat "\${VARIABLES_FILE}" | NAME="\${name}" \${YQ} e '.variables[] | select(.name == env(NAME)) | .value // ""' -)
    if [[ -z "\${value}" ]]; then
      value="\${environment_variable}"
    fi
  fi

  while [[ -z "\${value}" ]]; do
    echo "Provide a value for '\${name}':"
    if [[ -n "\${description}" ]]; then
      echo "  \${description}"
    fi
    sensitive_flag=""
    if [[ "\${sensitive}" == "true" ]]; then
      sensitive_flag="-s"
    fi
    default_prompt=""
    if [[ -n "\${default_value}" ]]; then
      default_prompt="(\${default_value}) "
    fi
    read -u 1 \${sensitive_flag} -p "> \${default_prompt}" value
    value=\${value:-\$default_value}
  done

  echo "\${name} = \\"\${value}\\"" >> "\${SCRIPT_DIR}/terraform/terraform.tfvars"
  if [[ "\${sensitive}" != "true" ]]; then
    NAME="\${name}" VALUE="\${value}" \${YQ} e -i -P '.variables += [{"name": env(NAME), "value": env(VALUE)}]' "\${TMP_VARIABLES_FILE}"
  fi
done

cp "\${TMP_VARIABLES_FILE}" "\${VARIABLES_FILE}"
rm "\${TMP_VARIABLES_FILE}"

cd \${SCRIPT_DIR}/terraform
terraform init
terraform apply
`
