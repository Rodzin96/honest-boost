// migrate.js — Run database migrations
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { initSchema, migrateApiKeys } = require('./src/schema');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
});

initSchema(db)
  .then(() => migrateApiKeys(db))
  .then(() => {
    console.log('✓ Migration completed successfully');
    console.log('  - api_keys table ready');
    console.log('  - audit_logs table ready');
    db.close();
  })
  .catch((err) => {
    console.error('✗ Migration failed:', err);
    db.close();
    process.exit(1);
  });
