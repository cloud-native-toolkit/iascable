import {Container} from 'typescript-ioc';
import {Arguments, Argv} from 'yargs';
import {fchmod, promises} from 'fs';
import {default as jsYaml} from 'js-yaml';
import {dirname, join} from 'path';

import {IascableInput} from './inputs/iascable.input';
import {CommandLineInput} from './inputs/command-line.input';
import {launchScript, applyScript, destroyScript} from './scripts';
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

