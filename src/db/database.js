const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure the data/ folder exists (it does from Stage 1, but this makes
// the module safe to run from any environment/fresh clone).
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'queue.db');

const db = new Database(DB_PATH);

// WAL mode allows multiple processes (multiple workers + the CLI)
// to read and write the same DB file concurrently without
// "database is locked" errors. This is essential for our multi-worker design.
db.pragma('journal_mode = WAL');

// busy_timeout makes SQLite wait (instead of immediately erroring)
// if it briefly finds the DB locked by another process — smooths
// over the tiny race windows between worker processes.
db.pragma('busy_timeout = 5000');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      next_attempt_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Index speeds up the atomic claim query (Stage 5), which filters
  // on state and orders by created_at — this will matter once the
  // jobs table has hundreds/thousands of rows.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_state_created
    ON jobs (state, created_at);
  `);
}

initSchema();

module.exports = db;