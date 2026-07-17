#!/usr/bin/env node

const { Command } = require('commander');
const enqueueCommand = require('../src/commands/enqueue');
const statusCommand = require('../src/commands/status');
const listCommand = require('../src/commands/list');
const { processOneJob } = require('../src/worker/workerProcess');
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

program
  .command('status')
  .description('Show a summary of job counts grouped by state.')
  .action(() => {
    statusCommand();
  });

program
  .command('list')
  .description('List jobs, optionally filtered by state.')
  .option('-s, --state <state>', 'Filter by state (pending, processing, completed, failed, dead)')
  .action((options) => {
    listCommand(options);
  });
program
  .command('worker-run-once')
  .description('[TEMPORARY/DEBUG] Claim and execute exactly one job, then exit.')
  .action(() => {
    const result = processOneJob();
    console.log('Result:', result);
  });
program.parse(process.argv);