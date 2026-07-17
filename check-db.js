const db = require('./src/db/database');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();

console.log('Tables:', tables);

const cols = db
  .prepare('PRAGMA table_info(jobs)')
  .all();

console.log('Columns:', cols.map(c => c.name));