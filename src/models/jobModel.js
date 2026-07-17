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

module.exports = {
  insertJob,
  getJobById,
  listJobs,
  countByState
};