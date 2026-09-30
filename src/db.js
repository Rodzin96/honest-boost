/* src/db.js — PostgreSQL database module */
const { Pool } = require('pg');

let pool;
let connected = false;
// Fica true quando o índice único de licenses(order_id) existe. O server.js usa
// esta flag para decidir se pode confiar em ON CONFLICT (order_id).
let licenseOrderUnique = false;

/** Railway (and most managed Postgres providers) require SSL on their public
 * and private hostnames; only plain localhost connections should skip it.
 * Relying on NODE_ENV here was fragile because Railway does not always set
 * NODE_ENV=production for the running service. */
function resolveSslConfig(connectionString) {
  if (!connectionString) return false;
  // Plain localhost and Railway's private network hostname (*.railway.internal)
  // are unencrypted-by-default connections; only public/external hosts need TLS.
  const isUnencryptedHost = /(^|@)(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString)
    || /\.railway\.internal(:|\/)/.test(connectionString);
  if (isUnencryptedHost) return false;
  // rejectUnauthorized:false aceitava QUALQUER certificado — um MITM na rota
  // até o Postgres veria credenciais, hashes de senha e chaves de licença.
  // Para CA privada, aponte PGSSLROOTCERT (ou DATABASE_CA_CERT) com o PEM.
  const ca = process.env.DATABASE_CA_CERT || process.env.PGSSLROOTCERT;
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

function getPool() {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
      console.error('✗ DATABASE_URL is not set. Add a PostgreSQL database in Railway and link its DATABASE_URL to this service (Variables → Add Reference).');
    } else if (raw.includes('${{') || !/^postgres(ql)?:\/\//.test(raw)) {
      // Catches the classic copy/paste mistake in Railway's Variables tab:
      // pasting the raw connection string into the same field as the
      // ${{Postgres.DATABASE_URL}} reference token, so the value ends up as
      // "${{Postgres.DATABASE_URL}}postgresql://..." instead of just one or
      // the other.
      console.error('✗ DATABASE_URL looks malformed (starts with: ' + JSON.stringify(raw.slice(0, 32)) + '...). In Railway → Variables, set it to EITHER "${{Postgres.DATABASE_URL}}" OR the raw postgresql:// string — not both concatenated.');
    }

    pool = new Pool({
      connectionString: raw,
      ssl: resolveSslConfig(raw),
      // Neon (serverless Postgres) scales compute to zero on the Free plan:
      // the first connection after idling has to wake the compute, which can
      // take a few seconds. A 20s budget absorbs that cold start.
      connectionTimeoutMillis: 20000,
      idleTimeoutMillis: 60000,
    });
    
    pool.on('error', (err) => {
      // Idle clients are killed by Neon when the compute suspends (scale to
      // zero). pg recreates clients automatically on next use, so a stray
      // pool error must NOT flip the app into a permanent "offline" state.
      console.error('PG pool idle client error (non-fatal):', err.message);
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
      nickname TEXT,
      role TEXT DEFAULT 'user',
      auth_provider TEXT DEFAULT 'local',
      google_id TEXT UNIQUE,
      avatar_url TEXT,
      reset_token TEXT,
      reset_expires BIGINT,
      created_at TEXT
    );

    -- Migrations para colunas adicionadas depois
    ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    
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
      created_at TEXT,
      license_type TEXT DEFAULT 'lifetime',
      expires_at TEXT
    );
    
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS license_type TEXT DEFAULT 'lifetime';
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS expires_at TEXT;
    
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
      key_type TEXT DEFAULT 'trial',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_type TEXT DEFAULT 'trial';
    
    -- Dispositivos ativados por chave (limite de máquinas do plano).
    -- key_ref: api_keys.key_hash ou 'lic:' + licenses.license_key.
    CREATE TABLE IF NOT EXISTS key_machines (
      key_ref TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      hostname TEXT,
      platform TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      PRIMARY KEY (key_ref, machine_id)
    );
    CREATE INDEX IF NOT EXISTS idx_key_machines_ref ON key_machines(key_ref);

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

  /* A unicidade por pedido é aplicada à parte, de propósito.
   *
   * O CREATE UNIQUE INDEX falha se já existirem licenças duplicadas por
   * order_id. Se estivesse no bloco acima, essa falha abortaria a migração
   * inteira e a API ficaria em 503 (dbReady nunca vira true). Aqui a falha é
   * contida: o schema sobe e o que fica indisponível é apenas a garantia de
   * unicidade, com aviso explícito no log. */
  licenseOrderUnique = await enforceLicenseOrderUniqueness();

  connected = true;
  console.log('✓ Schema initialized');
}

/**
 * Tenta criar o índice único em licenses(order_id).
 * @returns {Promise<boolean>} true se o índice existe ao final (novo ou prévio).
 */
async function enforceLicenseOrderUniqueness() {
  try {
    await getPool().query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_licenses_order
        ON licenses(order_id) WHERE order_id IS NOT NULL;
    `);
    console.log('✓ Unicidade de licenses(order_id) garantida');
    return true;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error('⚠ NÃO foi possível criar o índice único de licenses(order_id).');
    console.error('  Motivo:', msg);
    if (/duplicate key|não é possível|not possible|could not create unique/i.test(msg)) {
      console.error('  Causa provável: existem licenças duplicadas por pedido.');
      console.error('  Investigue com:');
      console.error("    SELECT order_id, COUNT(*) FROM licenses WHERE order_id IS NOT NULL");
      console.error('    GROUP BY order_id HAVING COUNT(*) > 1;');
      console.error('  Enquanto isso o app segue funcionando, mas duas entregas concorrentes');
      console.error('  do mesmo webhook ainda podem emitir licenças duplicadas.');
    }
    return false;
  }
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

module.exports = {
  initSchema,
  get,
  all,
  run,
  getPool,
  testConnection,
  isConnected,
  /** @returns {boolean} true se o índice único de licenses(order_id) está ativo. */
  hasLicenseOrderUnique: () => licenseOrderUnique,
};
