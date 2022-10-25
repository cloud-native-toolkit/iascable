import {Arguments, Argv} from 'yargs';
import {CommandLineInput} from './inputs/command-line.input';
import {BillOfMaterial, BillOfMaterialModel} from '../models';
import {loadReferenceBoms} from '../util/bill-of-material-builder';

export const command = 'list';
export const desc = 'List the available reference bill of materials';
export const builder = (yargs: Argv<any>) => {
  return yargs
    .option('debug', {
      type: 'boolean',
      describe: 'Flag to turn on more detailed output message',
    });
};

export const handler = async (argv: Arguments<CommandLineInput>) => {
  const referenceBoms: BillOfMaterialModel[] = await loadReferenceBoms();

  console.log('Available reference BOMs:');
  referenceBoms
    .map(bom => new BillOfMaterial(bom))
    .forEach(bom => {
      console.log(`  ${bom.getName()}: ${bom.getDescription()}`);
    });
};
