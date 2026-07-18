const { execSync } = require('child_process');
const { claimNextJob, markCompleted, markFailed } = require('../models/jobModel');
const { getConfig } = require('../config/config');

/**
 * Attempts to claim and execute exactly one job.
 * (Same logic as Stage 5/6 — unchanged.)
 */
function processOneJob() {
  const job = claimNextJob();

  if (!job) {
    return { status: 'idle' };
  }

  console.log(`[worker ${process.pid}] Claimed job ${job.id}: "${job.command}"`);

  try {
    const output = execSync(job.command, { encoding: 'utf8', stdio: 'pipe' });
    markCompleted(job.id);
    console.log(`[worker ${process.pid}] Job ${job.id} completed successfully.`);
    return { status: 'completed', jobId: job.id };
  } catch (err) {
    const errorMessage = err.message || 'Unknown execution error';
    const config = getConfig();
    const updatedJob = markFailed(job.id, errorMessage, config.backoff_base);

    if (updatedJob.movedToDLQ) {
      console.log(`[worker ${process.pid}] Job ${job.id} FAILED permanently after ${updatedJob.attempts} attempts. Moved to DLQ.`);
      return { status: 'dead', jobId: job.id };
    } else {
      console.log(`[worker ${process.pid}] Job ${job.id} FAILED (attempt ${updatedJob.attempts}/${updatedJob.max_retries}). Retry in ${updatedJob.retryDelaySeconds}s.`);
      return { status: 'failed', jobId: job.id };
    }
  }
}

/**
 * Continuous worker loop — this function is what runs when this file
 * is forked as a child process. It polls for jobs repeatedly until
 * told to shut down gracefully.
 */
function runWorkerLoop() {
  const POLL_INTERVAL_MS = 1000;
  let shuttingDown = false;

  console.log(`[worker ${process.pid}] Started.`);

  // Graceful shutdown: when the manager sends SIGTERM, we set a flag
  // instead of exiting immediately. The current job (if any) finishes
  // because processOneJob() is synchronous — execSync blocks until
  // the shell command completes. We only stop picking up NEW jobs.
  const handleShutdownSignal = (signal) => {
    console.log(`[worker ${process.pid}] Received ${signal}. Finishing current work...`);
    shuttingDown = true;
  };

  process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
  process.on('SIGINT', () => handleShutdownSignal('SIGINT'));

  function tick() {
    if (shuttingDown) {
      console.log(`[worker ${process.pid}] Shut down gracefully.`);
      setTimeout(() => process.exit(0), 100);
      return;
    }

    processOneJob();

    setTimeout(tick, POLL_INTERVAL_MS);
  }

  tick();
}
// If this file is run directly as a forked child process, start the loop.
// (When required as a module elsewhere — e.g. for future tests — this does NOT auto-run.)
if (require.main === module) {
  runWorkerLoop();
}

module.exports = { processOneJob, runWorkerLoop };