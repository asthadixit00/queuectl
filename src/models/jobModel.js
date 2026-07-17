const db = require('../db/database');
const crypto = require('crypto');

function nowISO() {
  return new Date().toISOString();
}

/**
 * Insert a new job into the queue.
 * Fills in defaults for any fields not provided by the user.
 */
function insertJob({ id, command, max_retries }) {
  const jobId = id || crypto.randomUUID();
  const timestamp = nowISO();

  const stmt = db.prepare(`
    INSERT INTO jobs (id, command, state, attempts, max_retries, last_error, next_attempt_at, created_at, updated_at)
    VALUES (@id, @command, 'pending', 0, @max_retries, NULL, NULL, @created_at, @updated_at)
  `);

  stmt.run({
    id: jobId,
    command,
    max_retries: max_retries != null ? max_retries : 3,
    created_at: timestamp,
    updated_at: timestamp
  });

  return getJobById(jobId);
}

function getJobById(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

function listJobs({ state } = {}) {
  if (state) {
    return db.prepare('SELECT * FROM jobs WHERE state = ? ORDER BY created_at DESC').all(state);
  }
  return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
}

function countByState() {
  return db.prepare(`
    SELECT state, COUNT(*) as count FROM jobs GROUP BY state
  `).all();
}
/**
 * Atomically claim the oldest pending job.
 * This is the core race-condition-safe operation: the UPDATE only
 * succeeds if the row is STILL 'pending' at the moment of the write.
 * If two workers race, only one UPDATE will actually change a row.
 */
function claimNextJob() {
  const now = nowISO();

  // Step 1: find a candidate pending job id (oldest first).
 // Step 1: find a candidate pending job id (oldest first) whose
  // backoff wait (if any) has already elapsed. next_attempt_at is
  // NULL for fresh jobs (always eligible immediately).
  const candidate = db.prepare(`
    SELECT id FROM jobs
    WHERE state = 'pending'
      AND (next_attempt_at IS NULL OR next_attempt_at <= @now)
    ORDER BY created_at ASC
    LIMIT 1
  `).get({ now });

  if (!candidate) {
    return null; // nothing to do
  }

  // Step 2: attempt to atomically flip it to 'processing'.
  // The WHERE clause re-checks state = 'pending' — this is the
  // compare-and-swap. If another process already claimed it between
  // step 1 and step 2, `changes` will be 0 and we return null.
  const result = db.prepare(`
    UPDATE jobs
    SET state = 'processing', updated_at = @updated_at
    WHERE id = @id AND state = 'pending'
  `).run({ id: candidate.id, updated_at: now });

  if (result.changes === 0) {
    return null; // lost the race to another worker
  }

  return getJobById(candidate.id);
}

/**
 * Mark a job as completed after successful execution.
 */
function markCompleted(id) {
  const now = nowISO();
  db.prepare(`
    UPDATE jobs
    SET state = 'completed', updated_at = @updated_at, last_error = NULL
    WHERE id = @id
  `).run({ id, updated_at: now });
  return getJobById(id);
}

/**
 * Mark a job as failed after unsuccessful execution.
 * This stage just records the failure — retry/backoff/DLQ logic
 * comes in Stage 6.
 */
/**
 * Handles a failed job execution:
 * - increments attempts
 * - if attempts < max_retries: schedules a retry with exponential backoff (state -> pending)
 * - if attempts >= max_retries: moves the job to the dead letter queue (state -> dead)
 */
function markFailed(id, errorMessage, backoffBase) {
  const job = getJobById(id);
  const now = nowISO();
  const newAttempts = job.attempts + 1;

  if (newAttempts >= job.max_retries) {
    db.prepare(`
      UPDATE jobs
      SET state = 'dead', attempts = @attempts, updated_at = @updated_at,
          last_error = @last_error, next_attempt_at = NULL
      WHERE id = @id
    `).run({ id, attempts: newAttempts, updated_at: now, last_error: errorMessage });
    return { ...getJobById(id), movedToDLQ: true };
  }

  const { getNextAttemptTime } = require('../utils/backoff');
  const { nextAttemptAt, delaySeconds } = getNextAttemptTime(newAttempts, backoffBase);

  db.prepare(`
    UPDATE jobs
    SET state = 'pending', attempts = @attempts, updated_at = @updated_at,
        last_error = @last_error, next_attempt_at = @next_attempt_at
    WHERE id = @id
  `).run({
    id,
    attempts: newAttempts,
    updated_at: now,
    last_error: errorMessage,
    next_attempt_at: nextAttemptAt
  });

  return { ...getJobById(id), movedToDLQ: false, retryDelaySeconds: delaySeconds };
}
module.exports = {
  insertJob,
  getJobById,
  listJobs,
  countByState,
  claimNextJob,
  markCompleted,
  markFailed
};
