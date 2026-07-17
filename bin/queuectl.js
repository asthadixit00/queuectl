#!/usr/bin/env node

const { Command } = require('commander');
const enqueueCommand = require('../src/commands/enqueue');

const program = new Command();

program
  .name('queuectl')
  .description('CLI-based background job queue system with retry, exponential backoff, and DLQ support.')
  .version('1.0.0');

program
  .command('enqueue [jobJson]')
  .description('Add a new job to the queue. Pass a JSON string with at least a "command" field, or use --file.')
  .option('-f, --file <path>', 'Read job JSON from a file instead of the command line')
  .action((jobJson, options) => {
    enqueueCommand(jobJson, options);
  });
program.parse(process.argv);