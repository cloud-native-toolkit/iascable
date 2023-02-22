import {Arguments, Argv, CommandModule} from 'yargs';
import {default as jsYaml} from 'js-yaml';

import {CommandLineInput} from './inputs/command-line.input';
import {BillOfMaterialModel} from '../models';
import {loadReferenceBom} from '../util';

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

  const referenceBom: BillOfMaterialModel = await loadReferenceBom({path: argv.name, name: argv.name});

  const yaml = jsYaml.dump(referenceBom);
  console.log(yaml);
};

export const iascablePrint: CommandModule = {
  command,
  describe: desc,
  builder,
  handler: handler as any
}
