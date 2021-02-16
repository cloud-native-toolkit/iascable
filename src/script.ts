#!/usr/bin/env node

import {CommandModule, scriptName} from 'yargs';

const yarg = scriptName('iascable')
  .usage('IasCable - Infrastructure as Code component builder')
  .usage('')
  .usage('Usage: $0 <command> [args]')
  .demandCommand()
  .commandDir('commands');

yarg.help()
  .argv;
