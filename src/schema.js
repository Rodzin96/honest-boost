/* schema.js — single source of truth for the SQLite schema.
 * Used by `npm run init-db` and also applied automatically on server boot so a
 * fresh clone works with `npm start` alone. */

/**
 * Create tables and apply additive migrations.
 * @param {import('sqlite3').Database} db
 * @returns {Promise<void>}
 */
function initSchema(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE,
        email TEXT,
        product TEXT,
        status TEXT,
        created_at TEXT
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE,
        email TEXT,
        product TEXT,
        amount INTEGER,
        created_at TEXT
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        role TEXT,
        created_at TEXT
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        expires INTEGER,
        data TEXT
      )`);

      // Additive migrations. SQLite has no "ADD COLUMN IF NOT EXISTS", so the
      // duplicate-column error is swallowed intentionally.
      const addColumn = (table, definition) =>
        db.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`, [], () => {});

      addColumn('users', 'reset_token TEXT');
      addColumn('users', 'reset_expires INTEGER');
      addColumn('licenses', 'order_id TEXT');
      addColumn('licenses', 'activated_at TEXT');
      addColumn('orders', 'status TEXT');
      addColumn('orders', 'provider TEXT');
      addColumn('orders', 'paid_at TEXT');

      // Optimizations table: stores applied/available optimizations for tracking
      db.run(`CREATE TABLE IF NOT EXISTS optimizations (
        id TEXT PRIMARY KEY,
        name TEXT,
        game TEXT,
        category TEXT,
        description TEXT,
        status TEXT,
        version TEXT,
        applied_at TEXT
      )`);

      db.run('CREATE INDEX IF NOT EXISTS idx_optimizations_status ON optimizations(status)');

      db.run('CREATE INDEX IF NOT EXISTS idx_licenses_order ON licenses(order_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email)');
      db.run('CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email)');
      db.run('CREATE INDEX IF NOT EXISTS idx_users_reset ON users(reset_token)');
      db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires)', [], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

// --- New tables for API keys and audit ---

/**
 * Create api_keys and audit_logs tables.
 * Run this after initSchema for existing installations.
 */
function migrateApiKeys(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // api_keys: temporary keys for app integration (4-hour expiry)
      db.run(`CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        key_prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_used_at TEXT,
        status TEXT DEFAULT 'active',
        device_info TEXT,
        ip_address TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      // audit_logs: track important actions
      db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      // Indexes for performance
      db.run('CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)');
      db.run('CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status)');
      db.run('CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at)');
      db.run('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)');
      db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)`);

      // Migrate existing columns if missing
      const addColumn = (table, definition) =>
        db.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`, [], () => {});

      addColumn('api_keys', 'revoked_at TEXT');
      addColumn('api_keys', 'revoke_reason TEXT');
      addColumn('optimizations', 'applied_by TEXT');

      resolve();
    });
  });
}

module.exports = { initSchema, migrateApiKeys };
