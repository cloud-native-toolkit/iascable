import {Arguments, Argv} from 'yargs';
import {default as jsYaml} from 'js-yaml';
import {CommandLineInput} from './inputs/command-line.input';
import {BillOfMaterialModel} from '../models';
import {loadReferenceBom} from '../util/bill-of-material-builder';

export const command = 'print <name>';
export const desc = 'Print the provided reference bill of materials';
export const builder = (yargs: Argv<any>) => {
  return yargs
    .positional('name', {
      type: 'string',
      describe: 'The name of the reference bill of materials'
    });
};

export const handler = async (argv: Arguments<{name: string} & CommandLineInput>) => {

  const referenceBom: BillOfMaterialModel = await loadReferenceBom(argv.name);

  const yaml = jsYaml.dump(referenceBom);
  console.log(yaml);
};
