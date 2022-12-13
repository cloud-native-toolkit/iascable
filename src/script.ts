#!/usr/bin/env node

import yargs = require('yargs');
import {iascableBuild} from './commands/iascable-build'
import {iascableCatalog} from './commands/iascable-catalog';
import {iascableDocs} from './commands/iascable-docs';
import {iascableList} from './commands/iascable-list';
import {iascableMetadata} from './commands/iascable-metadata';
import {iascablePrint} from './commands/iascable-print';

const yarg = yargs.scriptName('iascable')
  .usage('IasCable - Infrastructure as Code component builder')
  .usage('')
  .usage('Usage: $0 <command> [args]')
  .demandCommand()
  .command(iascableBuild)
  .command(iascableCatalog)
  .command(iascableDocs)
  .command(iascableList)
  .command(iascableMetadata)
  .command(iascablePrint)

yarg.help()
  .argv;
