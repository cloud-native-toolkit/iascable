import { Container } from 'typescript-ioc'
import { Arguments, Argv, CommandBuilder, CommandModule } from 'yargs'
import { fchmod, promises } from 'fs'
import { default as jsYaml } from 'js-yaml'
import { dirname, join } from 'path'
import uniq from 'lodash.uniq'

import { IascableInput } from './inputs/iascable.input'
import { CommandLineInput } from './inputs/command-line.input'
import { DEFAULT_CATALOG_URLS, setupCatalogUrls } from './support/middleware'
import {
  BillOfMaterialModel,
  CustomResourceDefinition,
  DotGraphFile,
  isTileConfig,
  OutputFile,
  OutputFileType,
  SolutionModel,
  TerraformComponentModel,
  Tile,
  UrlFile
} from '../models'
import { IascableApi, IascableBomResult, IascableBundle, IascableOptions } from '../services'
import {
  BundleWriter,
  BundleWriterType,
  chmodRecursive,
  getBundleWriter,
  loadBillOfMaterialFromFile,
  loadReferenceBom,
  LoggerApi
} from '../util'

export const command = 'build';
export const desc = 'Configure (and optionally deploy) the iteration zero assets';
export const builder: CommandBuilder<any, any> = (yargs: Argv<any>) => {
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

type BuilderArgs = IascableInput & CommandLineInput & {flattenOutput: boolean, zipFile: string}

export const handler = async (argv: Arguments<BuilderArgs>) => {
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

    const basePath = argv.zipFile ? './' : outputDir

    console.log(`Writing output to: ${output}`)
    const bundleWriter: BundleWriter = result.writeBundle(
      getBundleWriter(writerType),
      {flatten: argv.flattenOutput, basePath}
    )

    await bundleWriter.generate(output)
  } catch (err: any) {
    if (argv.debug) {
      logger.error('Error building config', {err})
    } else {
      console.error(`Error: ${err.message}`)
    }
  }
};

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

export const iascableBuild: CommandModule = {
  command,
  describe: desc,
  builder,
  handler: handler as any
}
