const { execSync } = require('child_process');
const { claimNextJob, markCompleted, markFailed } = require('../models/jobModel');
const { getConfig } = require('../config/config');

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
  }  catch (err) {
    // err.status is the exit code; err.message includes stderr info.
    const errorMessage = err.message || 'Unknown execution error';
    const config = getConfig();
    const updatedJob = markFailed(job.id, errorMessage, config.backoff_base);

    if (updatedJob.movedToDLQ) {
      console.log(`[worker] Job ${job.id} FAILED permanently after ${updatedJob.attempts} attempts. Moved to DLQ.`);
      return { status: 'dead', jobId: job.id, error: errorMessage };
    } else {
      console.log(`[worker] Job ${job.id} FAILED (attempt ${updatedJob.attempts}/${updatedJob.max_retries}). Retry in ${updatedJob.retryDelaySeconds}s.`);
      return { status: 'failed', jobId: job.id, error: errorMessage, retryDelaySeconds: updatedJob.retryDelaySeconds };
    }
  }
}

module.exports = { processOneJob };