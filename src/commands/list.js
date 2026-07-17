const { listJobs } = require('../models/jobModel');

const VALID_STATES = ['pending', 'processing', 'completed', 'failed', 'dead'];

/**
 * Handles: queuectl list --state pending
 */
function listCommand(options = {}) {
  if (options.state && !VALID_STATES.includes(options.state)) {
    console.error(`Error: Invalid state "${options.state}". Must be one of: ${VALID_STATES.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const jobs = listJobs({ state: options.state });

  if (jobs.length === 0) {
    console.log(options.state ? `No jobs with state "${options.state}".` : 'No jobs in the queue.');
    return;
  }

  console.log(JSON.stringify(jobs, null, 2));
}

module.exports = listCommand;