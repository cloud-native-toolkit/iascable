import {Container} from 'typescript-ioc';
import {Arguments, Argv} from 'yargs';
import {promises} from 'fs';
import {default as jsYaml} from 'js-yaml';
import {dirname, join} from 'path';

import {IascableBuild, IascableValidate} from './inputs/iascable.input';
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
import {isUndefined} from '../util/object-util';

export const command = 'validate';
export const desc = 'Validate the provided bill of material against the catalog';
export const builder = (yargs: Argv<any>) => {
  return yargs
    .option('catalogUrl', {
      alias: 'u',
      description: 'The url of the module catalog. Can be https:// or file:/ protocol.',
      default: 'https://cloud-native-toolkit.github.io/garage-terraform-modules/index.yaml'
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
    .option('debug', {
      type: 'boolean',
      describe: 'Flag to turn on more detailed output message',
    });
};

export const handler = async (argv: Arguments<IascableValidate & CommandLineInput>) => {
  process.env.LOG_LEVEL = argv.debug ? 'debug' : 'info';

  const cmd: IascableApi = Container.get(IascableApi);
  const logger: LoggerApi = Container.get(LoggerApi).child('build');

  const bom: BillOfMaterialModel | undefined = argv.reference
    ? await loadReferenceBom(argv.reference, '')
    : await loadBillOfMaterialFromFile(argv.input, '');

  if (isUndefined(bom)) {
    console.log('No BOM found to validate!');
    return;
  }

  const name = bom?.metadata?.name || 'component';
  console.log('Validating:', name);

  const results = await cmd.validate(argv.catalogUrl, bom);

  console.log('Results:');
  results.forEach(result => {
    console.log('  Module: ', result);
  })
};
