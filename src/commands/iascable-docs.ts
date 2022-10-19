import {Arguments, Argv} from 'yargs';
import {Container} from 'typescript-ioc';
import {promises} from 'fs';
import {join} from 'path';

import {CommandLineInput} from './inputs/command-line.input';
import {IascableDocsInput} from './inputs/iascable.input';
import {ModuleDoc} from '../models';
import {IascableApi} from '../services';
import {LoggerApi} from '../util/logger';
import {DEFAULT_CATALOG_URLS, setupCatalogUrls} from './support/middleware';

export const command = 'docs [module]';
export const desc = 'Produces the documentation for a given module';
export const builder = (yargs: Argv<any>) => {
  return yargs
    .positional('module', {
      type: 'string'
    })
    .option('catalogUrls', {
      alias: 'c',
      type: 'array',
      description: 'The url of the module catalog. Can be https:// or file:/ protocol. This argument can be passed multiple times to include multiple catalogs.',
      default: DEFAULT_CATALOG_URLS
    })
    .option('outDir', {
      alias: 'o',
      description: 'The base directory where the command output will be written',
      demandOption: false,
      default: './output'
    })
    .option('flattenOutput', {
      alias: 'f',
      description: 'Flag indicating the output path should be flattened. If false the documentation will be placed in {outDir}/{module}/README.md.',
      demandOption: false,
      default: false,
      type: 'boolean'
    })
    .middleware(setupCatalogUrls(DEFAULT_CATALOG_URLS))
    .option('debug', {
      type: 'boolean',
      describe: 'Flag to turn on more detailed output message',
    });
};

export const handler = async (argv: Arguments<IascableDocsInput & CommandLineInput>) => {
  process.env.LOG_LEVEL = argv.debug ? 'debug' : 'info';

  const cmd: IascableApi = Container.get(IascableApi);
  const logger: LoggerApi = Container.get(LoggerApi).child('build');

  try {
    const doc: ModuleDoc = await cmd.moduleDocumentation(argv.catalogUrls, argv.module)

    await outputResult(argv.outDir, argv.module, doc, argv)
  } catch (err) {
    console.log('')
    console.error(`Error: ${err.message}`)
  }
};

const outputResult = async (outputDir: string, moduleName: string, doc: ModuleDoc, options: {flattenOutput: boolean}) => {

  const basePath = options.flattenOutput ? outputDir : join(outputDir, moduleName)

  await promises.mkdir(basePath, {recursive: true})

  const filename = join(basePath, doc.name)

  console.log(`Writing readme for ${moduleName}: ${filename}`)

  await promises.writeFile(filename, await doc.contents)
}
