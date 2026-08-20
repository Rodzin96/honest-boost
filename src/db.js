/* src/db.js — PostgreSQL database module */
const { Pool } = require('pg');

let pool;
let connected = false;

/** Railway (and most managed Postgres providers) require SSL on their public
 * and private hostnames; only plain localhost connections should skip it.
 * Relying on NODE_ENV here was fragile because Railway does not always set
 * NODE_ENV=production for the running service. */
function resolveSslConfig(connectionString) {
  if (!connectionString) return false;
  const isLocalHost = /(^|@)(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
  return isLocalHost ? false : { rejectUnauthorized: false };
}

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      console.error('✗ DATABASE_URL is not set. Add a PostgreSQL database in Railway and link its DATABASE_URL to this service (Variables → Add Reference).');
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: resolveSslConfig(process.env.DATABASE_URL),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    
    pool.on('error', (err) => {
      console.error('PG pool error:', err.message);
      connected = false;
    });
  }
  return pool;
}

async function testConnection() {
  try {
    const p = getPool();
    await p.query('SELECT 1');
    connected = true;
    return true;
  } catch (err) {
    connected = false;
    console.error('DB connection failed:', err.message);
    return false;
  }
}

function isConnected() {
  return connected;
}

async function initSchema() {
  const p = getPool();
  
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password_hash TEXT,
      role TEXT DEFAULT 'user',
      reset_token TEXT,
      reset_expires BIGINT,
      created_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      expires BIGINT,
      data TEXT
    );
    
    CREATE TABLE IF NOT EXISTS licenses (
      id SERIAL PRIMARY KEY,
      license_key TEXT UNIQUE,
      email TEXT,
      product TEXT,
      status TEXT DEFAULT 'pending',
      order_id TEXT,
      activated_at TEXT,
      created_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_id TEXT UNIQUE,
      email TEXT,
      product TEXT,
      amount INTEGER,
      status TEXT DEFAULT 'pending',
      provider TEXT,
      paid_at TEXT,
      created_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS optimizations (
      id TEXT PRIMARY KEY,
      name TEXT,
      game TEXT,
      category TEXT,
      description TEXT,
      version TEXT,
      status TEXT,
      applied_at TEXT,
      applied_by TEXT
    );
    
    CREATE TABLE IF NOT EXISTS api_keys (
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
      revoked_at TEXT,
      revoke_reason TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_licenses_order ON licenses(order_id);
    CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
    CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
    CREATE INDEX IF NOT EXISTS idx_users_reset ON users(reset_token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);
  
  connected = true;
  console.log('✓ Schema initialized');
}

function get(sql, params = []) {
  return getPool().query(sql, params).then(r => r.rows[0] || null);
}

function all(sql, params = []) {
  return getPool().query(sql, params).then(r => r.rows);
}

function run(sql, params = []) {
  return getPool().query(sql, params);
}

module.exports = { initSchema, get, all, run, getPool, testConnection, isConnected };
