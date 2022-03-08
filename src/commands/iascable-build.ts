import {Container} from 'typescript-ioc';
import {Arguments, Argv} from 'yargs';
import {promises, fchmod, lstatSync, chmodSync} from 'fs';
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
      demandOption: false,
    })
    .option('reference', {
      alias: 'r',
      description: 'The reference BOM to use for the build',
      conflicts: 'input',
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
      description: 'The name for the tile. Required if you want to generate the tile metadata.',
      demandOption: false,
    })
    .option('tileDescription', {
      description: 'The description of the tile.',
      demandOption: false,
    })
    .option('ci', {
      type: 'boolean',
      demandOption: false,
      conflicts: 'prompt',
    })
    .option('prompt', {
      type: 'boolean',
      demandOption: false,
      conflicts: 'ci',
    })
    .option('debug', {
      type: 'boolean',
      describe: 'Flag to turn on more detailed output message',
    });
};

export const handler = async (argv: Arguments<IascableInput & CommandLineInput>) => {
  process.env.LOG_LEVEL = argv.debug ? 'debug' : 'info';

  const cmd: IascableApi = Container.get(IascableApi);
  const logger: LoggerApi = Container.get(LoggerApi).child('build');

  if (!argv.reference && !argv.input) {
    console.log('Bill of Materials not provided. Provide the path to the bill of material file with the -i or -r flag.')
    return
  }

  const bom: BillOfMaterialModel | undefined = argv.reference
    ? await loadReferenceBom(argv.reference, argv.name)
    : await loadBillOfMaterialFromFile(argv.input, argv.name);

  if ((argv.input || argv.reference) && !argv.prompt) {
    argv.ci = true;
  }

  const name = bom?.metadata?.name || 'component';
  console.log('Name:', name);

  const options: IascableOptions = buildCatalogBuilderOptions(argv);

  try {
    const result = await cmd.build(argv.catalogUrl, bom, options);

    const outputDir = argv.outDir || './output';

    console.log(`Writing output to: ${outputDir}`)
    await outputResult(join(outputDir, name), result);
  } catch (err) {
    console.log('')
    console.error(`Error: ${err.message}`)

    if (argv.debug) {
      logger.error('Error building config', {err})
    }
  }
};

function buildCatalogBuilderOptions(input: IascableInput): IascableOptions {
  const tileConfig = {
    label: input.tileLabel,
    name: input.name,
    shortDescription: input.tileDescription,
  };

  return {
    interactive: !input.ci,
    filter: {
      platform: input.platform,
      provider: input.provider,
    },
    tileConfig: isTileConfig(tileConfig) ? tileConfig : undefined,
  };
}

async function chmodRecursive(root: string, mode: number) {
  chmodSync(root, mode)

  const childDirs: string[] = (await promises.readdir(root))
    .map(value => join(root, value))
    .filter(value => lstatSync(value).isDirectory())

  childDirs.forEach(dir => chmodRecursive(join(root, dir), mode))
}

async function outputBillOfMaterial(rootPath: string, billOfMaterial: BillOfMaterialModel) {
  await promises.mkdir(rootPath, {recursive: true})

  await chmodRecursive(rootPath, 0o777)

  return promises.writeFile(join(rootPath, 'bom.yaml'), jsYaml.dump(billOfMaterial));
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
  const launchScriptPath: string = join(rootPath, '../launch.sh')

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
  }
}

async function outputResult(rootPath: string, result: IascableResult): Promise<void> {
  await outputBillOfMaterial(rootPath, result.billOfMaterial);
  await outputTerraform(join(rootPath, 'terraform'), result.terraformComponent);
  await outputTile(rootPath, result.tile);
  await outputLaunchScript(rootPath);
}

const launchScript: string = `#!/bin/bash

# IBM Ecosystem Labs

SCRIPT_DIR="$(cd $(dirname $0); pwd -P)"
SRC_DIR="\${SCRIPT_DIR}"

DOCKER_IMAGE="quay.io/ibmgaragecloud/cli-tools:v1.1"

SUFFIX=$(echo $(basename \${SCRIPT_DIR}) | base64 | sed -E "s/[^a-zA-Z0-9_.-]//g" | sed -E "s/.*(.{5})/\\1/g")
CONTAINER_NAME="cli-tools-\${SUFFIX}"

echo "Cleaning up old container: \${CONTAINER_NAME}"

DOCKER_CMD="docker"
\${DOCKER_CMD} kill \${CONTAINER_NAME} 1> /dev/null 2> /dev/null
\${DOCKER_CMD} rm \${CONTAINER_NAME} 1> /dev/null 2> /dev/null

if [[ -n "$1" ]]; then
    echo "Pulling container image: \${DOCKER_IMAGE}"
    \${DOCKER_CMD} pull "\${DOCKER_IMAGE}"
fi

ENV_FILE=""
if [[ -f "credentials.properties" ]]; then
  ENV_FILE="--env-file credentials.properties"
fi

echo "Initializing container \${CONTAINER_NAME} from \${DOCKER_IMAGE}"
\${DOCKER_CMD} run -itd --name \${CONTAINER_NAME} \\
   -v \${SRC_DIR}:/home/devops/src \\
   \${ENV_FILE} \\
   -w /home/devops/src \\
   \${DOCKER_IMAGE}

echo "Attaching to running container..."
\${DOCKER_CMD} attach \${CONTAINER_NAME}
`
