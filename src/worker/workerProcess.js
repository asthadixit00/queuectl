const { execSync } = require('child_process');
const { claimNextJob, markCompleted, markFailed } = require('../models/jobModel');

/**
 * Attempts to claim and execute exactly one job.
 * Returns a result object describing what happened, useful for logging.
 */
function processOneJob() {
  const job = claimNextJob();

  if (!job) {
    return { status: 'idle', message: 'No pending jobs available.' };
  }

  console.log(`[worker] Claimed job ${job.id}: "${job.command}"`);

  try {
    // execSync throws if the command exits with a non-zero code,
    // which is exactly the success/failure signal the spec requires.
    const output = execSync(job.command, { encoding: 'utf8', stdio: 'pipe' });
    markCompleted(job.id);
    console.log(`[worker] Job ${job.id} completed successfully.`);
    if (output && output.trim()) {
      console.log(`[worker] Output: ${output.trim()}`);
    }
    return { status: 'completed', jobId: job.id };
  } catch (err) {
    // err.status is the exit code; err.message includes stderr info.
    const errorMessage = err.message || 'Unknown execution error';
    markFailed(job.id, errorMessage);
    console.log(`[worker] Job ${job.id} FAILED: ${errorMessage.split('\n')[0]}`);
    return { status: 'failed', jobId: job.id, error: errorMessage };
  }
}

module.exports = { processOneJob };