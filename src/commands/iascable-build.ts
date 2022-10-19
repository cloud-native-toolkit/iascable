import {Container} from 'typescript-ioc';
import {Arguments, Argv} from 'yargs';
import {fchmod, promises} from 'fs';
import {default as jsYaml} from 'js-yaml';
import {dirname, join} from 'path';
import uniq from 'lodash.uniq';

import {IascableInput} from './inputs/iascable.input';
import {CommandLineInput} from './inputs/command-line.input';
import {
  BillOfMaterialModel,
  isTileConfig,
  OutputFile,
  OutputFileType,
  TerraformComponent,
  Tile,
  UrlFile
} from '../models';
import {
  IascableApi,
  IascableBundle,
  IascableOptions,
  IascableBomResult,
  loadBillOfMaterialFromFile,
  loadReferenceBom
} from '../services';
import {LoggerApi} from '../util/logger';
import {DotGraphFile} from '../models/graph.model';
import {chmodRecursive} from '../util/file-util';
import {DEFAULT_CATALOG_URLS, setupCatalogUrls} from './support/middleware';
import {SolutionModel} from '../models/solution.model';
import {CustomResourceDefinition} from '../models/crd.model';
import {BundleWriter, BundleWriterType, getBundleWriter} from '../util/bundle-writer';

export const command = 'build';
export const desc = 'Configure (and optionally deploy) the iteration zero assets';
export const builder = (yargs: Argv<any>) => {
  return yargs
    .option('catalogUrls', {
      alias: 'c',
      type: 'array',
      description: 'The url of the module catalog. Can be https:// or file:/ protocol. This argument can be passed multiple times to include multiple catalogs.',
      default: DEFAULT_CATALOG_URLS
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
    .option('zipFile', {
      alias: 'z',
      description: 'The name of the zip file for the output. If not provided the files will be written to the filesystem',
      demandOption: false,
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
    .middleware(setupCatalogUrls(DEFAULT_CATALOG_URLS))
    .check((argv) => {
      if (!(argv.reference && argv.reference.length > 0) && !(argv.input && argv.input.length > 0)) {
        throw new Error('Bill of Materials not provided. Provide the path to the bill of material file with the -i or -r flag.')
      }

      return true
    });
};

export const handler = async (argv: Arguments<IascableInput & CommandLineInput & {flattenOutput: boolean, zipFile: string}>) => {
  process.env.LOG_LEVEL = argv.debug ? 'debug' : 'info';

  const cmd: IascableApi = Container.get(IascableApi);
  const logger: LoggerApi = Container.get(LoggerApi).child('build');

  const boms: Array<BillOfMaterialModel | SolutionModel> = await loadBoms(argv.reference, argv.input, argv.name);

  if ((argv.input || argv.reference) && !argv.prompt) {
    argv.ci = true;
  }

  const catalogUrls: string[] = loadCatalogUrls(boms, argv.catalogUrls)

  const options: IascableOptions = buildCatalogBuilderOptions(argv);

  try {
    const result: IascableBundle = await cmd.buildBoms(catalogUrls, boms, options);

    const outputDir = argv.outDir || './output';

    const writerType = argv.zipFile ? BundleWriterType.zip : BundleWriterType.filesystem
    const output = argv.zipFile ? join(outputDir, argv.zipFile) : outputDir

    console.log(`Writing output to: ${output}`)
    const bundleWriter: BundleWriter = result.writeBundle(
      getBundleWriter(writerType),
      {flatten: argv.flattenOutput}
    )

    await bundleWriter.generate(output)
  } catch (err) {
    if (argv.debug) {
      logger.error('Error building config', {err})
    } else {
      console.error(`Error: ${err.message}`)
    }
  }
};

const getBomPath = (outputDir1: string, bom: BillOfMaterialModel): string => {
  const pathParts: string[] = [
    bom.metadata?.annotations?.path || '',
    bom.metadata?.name || 'component'
  ]
    .filter(v => !!v)

  return join(...pathParts)
}

const loadCatalogUrls = (boms: CustomResourceDefinition[], inputUrls: string[]): string[] => {
  return boms
    .map(extractCatalogUrlsFromBom)
    .reduce((previous: string[], current: string[]) => {
      const result = previous.concat(current)

      return uniq(result)
    }, inputUrls)
}

const extractCatalogUrlsFromBom = (bom: CustomResourceDefinition): string[] => {
  const annotations: any = bom.metadata?.annotations || {}

  const catalogUrls: string[] = Object.keys(annotations)
    .filter(key => /^catalog[Uu]rl.*/.test(key))
    .reduce((result: string[], key: string) => {
      if (/^catalog[Uu]rl$/.test(key)) {
        const urls = annotations[key].split(',').filter((val: string) => !!val)

        result.push(...urls)
      } else if (annotations[key]) {
        result.push(annotations[key])
      }

      return result
    }, [])

  return catalogUrls
}

async function loadBoms(referenceNames?: string[], inputNames?: string[], names: string[] = []): Promise<Array<BillOfMaterialModel | SolutionModel>> {
  const boms: Array<BillOfMaterialModel | SolutionModel> = [];

  const bomNames: string[] = referenceNames && referenceNames.length > 0 ? referenceNames : inputNames as string[];
  const bomFunction = referenceNames && referenceNames.length > 0 ? loadReferenceBom : loadBillOfMaterialFromFile;

  for (let i = 0; i < bomNames.length; i++) {
    const name = names.length > i ? names[i] : ''

    const bom: BillOfMaterialModel | SolutionModel | undefined = await bomFunction(bomNames[i], name)

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
  const logger: LoggerApi = Container.get(LoggerApi)

  const promiseList = []
  for (let i = 0; i < terraformComponent.files.length; i++) {
    const file = terraformComponent.files[i]

    try {
      if (!file || !file.name) {
        continue
      }

      const path = join(rootPath, file.name);
      await promises.mkdir(dirname(path), {recursive: true})

      const fileContents = await file.contents;

      const result = promises.writeFile(path, fileContents);

      promiseList.push(result)
    } catch (err) {
      logger.warn(`Warning: Unable to generate file ${file.name}`)
      logger.debug('  Error: ', err)
    }
  }

  return Promise.all(promiseList)
}

async function outputTile(rootPath: string, tile: Tile | undefined) {
  if (!tile || !tile.file) {
    return;
  }

  await promises.mkdir(rootPath, {recursive: true})
  await chmodRecursive(rootPath, 0o777)

  return promises.writeFile(join(rootPath, tile.file.name), await tile.file.contents);
}

async function outputResult(outputDir: string, result: IascableBomResult, flatten: boolean = false): Promise<void> {
  const bomPath: string = getBomPath(outputDir, result.billOfMaterial)
  const rootPath: string = join(outputDir, bomPath)

  await outputTerraform(flatten ? rootPath : join(rootPath, 'terraform'), result.terraformComponent);
  await outputBillOfMaterial(rootPath, result.billOfMaterial);
  await outputTile(rootPath, result.tile);
  await outputDependencyGraph(rootPath, result.graph)
  await outputScripts(outputDir, [
    new UrlFile({name: 'launch.sh', url: 'https://raw.githubusercontent.com/cloud-native-toolkit/iascable/main/scripts/launch.sh', type: OutputFileType.executable}),
    new UrlFile({name: join(bomPath, 'apply.sh'), url: 'https://raw.githubusercontent.com/cloud-native-toolkit/iascable/main/scripts/apply.sh', type: OutputFileType.executable}),
    new UrlFile({name: join(bomPath, 'destroy.sh'), url: 'https://raw.githubusercontent.com/cloud-native-toolkit/iascable/main/scripts/destroy.sh', type: OutputFileType.executable}),
  ])
}

async function outputScripts(rootPath: string, files: OutputFile[]): Promise<string[]> {

  return Promise.all(files.map(f => outputScript(rootPath, f)))
}

async function outputScript(rootPath: string, file: OutputFile): Promise<string> {
  const scriptPath: string = join(rootPath, file.name)

  const fileContents = await file.contents.catch(() => {
    console.log(`  Warning: Unable to retrieve file: ${file.name}`)
    return ''
  })

  if (!fileContents) {
    return scriptPath
  }

  await promises.writeFile(scriptPath, fileContents)
    .catch(() => {
      return {}
    })

  try {
    const { fd } = await promises.open(scriptPath, 'r');
    // TODO is there a way to do the equivalent of `chmod +x` and not explicitly set 777?
    fchmod(fd, 0o777, err => {
      if (err) throw err;
    });
  } catch (error) {
    // nothing to do
  }

  return scriptPath
}
