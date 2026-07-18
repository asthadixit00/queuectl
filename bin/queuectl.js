#!/usr/bin/env node

const { Command } = require('commander');
const enqueueCommand = require('../src/commands/enqueue');
const statusCommand = require('../src/commands/status');
const listCommand = require('../src/commands/list');
const { startWorkers, stopWorkers } = require('../src/worker/workerManager');
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
const workerCmd = program
  .command('worker')
  .description('Manage worker processes.');

workerCmd
  .command('start')
  .description('Start N worker processes that claim and execute jobs.')
  .option('-c, --count <number>', 'Number of worker processes to start', '1')
  .action((options) => {
    const count = parseInt(options.count, 10);
    if (isNaN(count) || count < 1) {
      console.error('Error: --count must be a positive integer.');
      process.exitCode = 1;
      return;
    }
    startWorkers(count);
  });

workerCmd
  .command('stop')
  .description('Gracefully stop all running worker processes.')
  .action(() => {
    stopWorkers();
  });
program.parse(process.argv);