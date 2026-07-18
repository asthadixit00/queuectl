const { listJobs, retryDeadJob } = require('../models/jobModel');

function dlqListCommand() {
  const jobs = listJobs({ state: 'dead' });

  if (jobs.length === 0) {
    console.log('Dead Letter Queue is empty.');
    return;
  }

  console.log(JSON.stringify(jobs, null, 2));
}

function dlqRetryCommand(jobId) {
  const result = retryDeadJob(jobId);

  if (!result.success) {
    if (result.reason === 'not_found') {
      console.error(`Error: No job found with id "${jobId}".`);
    } else {
      console.error(`Error: Job "${jobId}" is not in the DLQ (current state: "${result.currentState}").`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Job "${jobId}" moved back to pending queue (attempts reset to 0):`);
  console.log(JSON.stringify(result.job, null, 2));
}

module.exports = { dlqListCommand, dlqRetryCommand };