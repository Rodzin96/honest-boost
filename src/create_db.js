/* create_db.js — initialize the SQLite database (`npm run init-db`).
 * The same schema is applied automatically on server boot, so running this is
 * optional; it stays available for provisioning scripts and CI. */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { initSchema } = require('./schema');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath);

initSchema(db)
  .then(() => db.close(() => console.log('Database initialized at', dbPath)))
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    db.close(() => process.exit(1));
  });
