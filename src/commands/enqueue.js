const fs = require('fs');
const { insertJob, getJobById } = require('../models/jobModel');

/**
 * Handles: queuectl enqueue '{"id":"job1","command":"echo hello"}'
 * OR:      queuectl enqueue --file job.json
 */
function enqueueCommand(jsonString, options = {}) {
  let rawInput = jsonString;

  if (options.file) {
    try {
     rawInput = fs.readFileSync(options.file, 'utf8').replace(/^\uFEFF/, '');
    } catch (err) {
      console.error(`Error: Could not read file "${options.file}": ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!rawInput) {
    console.error('Error: Provide job JSON as an argument or use --file <path>.');
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawInput);
  } catch (err) {
    console.error('Error: Invalid JSON provided to enqueue.');
    console.error('Example: queuectl enqueue \'{"command":"echo hello"}\'');
    process.exitCode = 1;
    return;
  }

  if (!parsed.command || typeof parsed.command !== 'string') {
    console.error('Error: Job must include a "command" field (string).');
    process.exitCode = 1;
    return;
  }

  if (parsed.id) {
    const existing = getJobById(parsed.id);
    if (existing) {
      console.error(`Error: A job with id "${parsed.id}" already exists.`);
      process.exitCode = 1;
      return;
    }
  }

  const job = insertJob({
    id: parsed.id,
    command: parsed.command,
    max_retries: parsed.max_retries
  });

  console.log('Job enqueued successfully:');
  console.log(JSON.stringify(job, null, 2));
}

module.exports = enqueueCommand;