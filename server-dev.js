/**
 * server-dev.js — Servidor de desenvolvimento com SQLite
 * Permite testar o app localmente sem PostgreSQL
 */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const PORT = 3000;

// SQLite local
const DB_PATH = path.join(__dirname, 'data', 'dev.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new sqlite3.Database(DB_PATH);

// Initialize schema
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    nickname TEXT,
    role TEXT DEFAULT 'user',
    auth_provider TEXT DEFAULT 'local',
    google_id TEXT UNIQUE,
    avatar_url TEXT,
    reset_token TEXT,
    reset_expires INTEGER,
    created_at TEXT
  )`);
  
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
    revoked_at TEXT,
    key_type TEXT DEFAULT 'trial',
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE,
    email TEXT,
    product TEXT,
    status TEXT DEFAULT 'pending',
    order_id TEXT,
    activated_at TEXT,
    created_at TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE,
    email TEXT,
    product TEXT,
    amount INTEGER,
    status TEXT DEFAULT 'pending',
    provider TEXT,
    paid_at TEXT,
    created_at TEXT
  )`);
  
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
});

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));

app.use(session({
  name: 'hb.sid',
  secret: 'dev-secret-key-for-local-testing',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Rate limiters
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });

// Auth helpers
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'not_authenticated' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  if (req.session && req.session.user) return res.status(403).json({ error: 'forbidden' });
  return res.status(401).json({ error: 'not_authenticated' });
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Validation
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
function isValidEmail(value) { return EMAIL_RE.test(normalizeEmail(value)); }

function newLicenseKey() {
  return 'HB-' + uuidv4().replace(/-/g, '').toUpperCase().match(/.{1,4}/g).join('-');
}

// ==================== Routes ====================

app.get('/health', (req, res) => {
  res.json({ ok: true, mode: 'dev-sqlite' });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: req.session.user });
  }
  return res.json({ authenticated: false });
});

app.get('/api/products', (req, res) => {
  const { publicCatalog } = require('./src/products');
  res.json(publicCatalog());
});

// Register
app.post('/api/register', registerLimiter, asyncRoute(async (req, res) => {
  const { nickname, username, password, confirmPassword } = req.body;
  
  if (!username || !EMAIL_RE.test(username)) return res.status(400).json({ error: 'invalid_email' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'password_too_short' });
  if (!nickname || nickname.length < 2) return res.status(400).json({ error: 'nickname_required' });
  if (confirmPassword && confirmPassword !== password) return res.status(400).json({ error: 'passwords_do_not_match' });
  
  const email = normalizeEmail(username);
  
  const existing = await new Promise((resolve, reject) => {
    db.get('SELECT id FROM users WHERE username = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  if (existing) return res.status(409).json({ error: 'user_already_exists' });
  
  const hash = await bcrypt.hash(password, 12);
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?)',
      [email, hash, nickname, 'user', new Date().toISOString()],
      function(err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
  
  return res.status(201).json({ ok: true, email, nickname });
}));

// Login
app.post('/api/login', loginLimiter, asyncRoute(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  
  const email = normalizeEmail(username);
  const user = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  if (!user.password_hash) return res.status(401).json({ error: 'invalid_credentials' });
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
  
  req.session.user = { id: user.id, username: user.username, nickname: user.nickname, role: user.role };
  return res.json({ ok: true, user: req.session.user });
}));

// Logout
app.post('/api/logout', (req, res) => {
  if (req.session) req.session.destroy();
  return res.json({ ok: true });
});

// API Keys
app.post('/api/keys', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  const entitlement = await accountEntitlement(req.session.user.username);
  if (!entitlement.license) {
    return res.status(403).json({ error: 'license_required' });
  }

  const activeKeys = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM api_keys WHERE user_id = ? AND status = ? AND expires_at > ?',
      [userId, 'active', new Date().toISOString()],
      (err, row) => { if (err) reject(err); else resolve(row?.count || 0); }
    );
  });
  
  if (Number(activeKeys) >= entitlement.maxActiveKeys) {
    return res.status(409).json({ error: 'device_limit_reached', max: entitlement.maxActiveKeys });
  }
  
  const rawKey = 'hb_' + crypto.randomBytes(24).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + entitlement.keyTtlMs).toISOString();
  
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO api_keys (id, user_id, key_hash, key_prefix, created_at, expires_at, status, ip_address, key_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, userId, keyHash, keyPrefix, createdAt, expiresAt, 'active', req.ip, entitlement.keyType],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
  
  return res.status(201).json({ ok: true, id, key: rawKey, expiresAt, type: entitlement.keyType, tier: entitlement.tier, maxActive: entitlement.maxActiveKeys });
}));

app.get('/api/keys', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  const entitlement = await accountEntitlement(req.session.user.username);
  
  const keys = await new Promise((resolve, reject) => {
    db.all('SELECT id, key_prefix, created_at, expires_at, last_used_at, status, key_type FROM api_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId],
      (err, rows) => { if (err) reject(err); else resolve(rows || []); }
    );
  });
  
  return res.json({ ok: true, keys, tier: entitlement.tier, keyType: entitlement.keyType, maxActive: entitlement.maxActiveKeys });
}));

// App auth
app.post('/api/app/auth', asyncRoute(async (req, res) => {
  const { key, deviceInfo } = req.body;
  if (!key) return res.status(400).json({ error: 'missing_key' });
  
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const dbKey = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM api_keys WHERE key_hash = ?', [keyHash], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  
  if (dbKey) {
    if (dbKey.status !== 'active') return res.status(401).json({ error: 'key_' + dbKey.status });
    if (new Date(dbKey.expires_at) < new Date()) return res.status(401).json({ error: 'key_expired' });

    await new Promise((resolve, reject) => {
      db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), dbKey.id],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, username, nickname, role FROM users WHERE id = ?', [dbKey.user_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const entitlement = await accountEntitlement(user.username);

    return res.json({
      ok: true,
      token: key,
      user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role, tier: entitlement.tier },
      expiresAt: dbKey.expires_at,
      lifetime: false,
      tier: entitlement.tier
    });
  }

  // Ponte HB- (dev): chave da compra ativa o app direto. Espelha a produção.
  const license = await new Promise((resolve, reject) => {
    db.get('SELECT license_key, email, product, status FROM licenses WHERE license_key = ?', [String(key).trim()], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  if (!license || license.status !== 'active') return res.status(401).json({ error: 'key_not_found' });

  const { getProduct } = require('./src/products');
  const product = getProduct(license.product);
  const tier = product ? product.id : 'pro';
  const linked = await new Promise((resolve, reject) => {
    db.get('SELECT id, username, nickname, role FROM users WHERE username = ?', [license.email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  return res.json({
    ok: true,
    token: key,
    user: linked
      ? { id: linked.id, username: linked.username, nickname: linked.nickname, role: linked.role, tier }
      : { id: null, username: license.email, nickname: null, role: 'user', tier },
    expiresAt: null,
    lifetime: true,
    tier
  });
}));

// Licenses
app.post('/api/licenses/verify', asyncRoute(async (req, res) => {
  const suppliedKey = req.body?.licenseKey || req.body?.license;
  const licenseKey = typeof suppliedKey === 'string' ? suppliedKey.trim() : '';
  
  const license = await new Promise((resolve, reject) => {
    db.get('SELECT license_key, email, product, status FROM licenses WHERE license_key = ?', [licenseKey], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  
  if (!license || license.status !== 'active') return res.status(401).json({ error: 'invalid_license' });
  return res.json({ ok: true, valid: true, product: license.product, email: license.email });
}));

app.post('/api/licenses', requireAdmin, asyncRoute(async (req, res) => {
  const { getProduct } = require('./src/products');
  const email = normalizeEmail(req.body?.email);
  const product = getProduct(req.body?.product);
  
  if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!product) return res.status(400).json({ error: 'invalid_product' });
  
  const license = newLicenseKey();
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO licenses (license_key, email, product, status, created_at) VALUES (?, ?, ?, ?, ?)',
      [license, email, product.id, 'active', new Date().toISOString()],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
  
  return res.status(201).json({ ok: true, license });
}));

// ==================== Helpers ====================

async function activeLicenseForEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM licenses WHERE email = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
      [email, 'active'],
      (err, row) => { if (err) reject(err); else resolve(row); }
    );
  });
}

async function accountEntitlement(email) {
  const license = await activeLicenseForEmail(email);
  const product = license ? require('./src/products').getProduct(license.product) : null;
  const isPremium = Boolean(license && product);
  // Sem período de teste: só licença ativa gera keys.
  return {
    license,
    product,
    tier: isPremium ? product.id : 'trial',
    keyType: isPremium ? 'premium' : null,
    maxActiveKeys: isPremium ? (product.seats || 1) : 0,
    keyTtlMs: isPremium ? 365 * 24 * 60 * 60 * 1000 : 0
  };
}

// ==================== 404 & Error ====================

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_error' });
});

// ==================== Boot ====================

app.listen(PORT, () => {
  console.log(`\n🚀 Honest Boost DEV Server (SQLite) running on http://localhost:${PORT}`);
  console.log(`   DB: ${DB_PATH}`);
  console.log(`   Mode: Development (no PostgreSQL required)`);
  console.log(`\n   Endpoints:`);
  console.log(`   POST /api/register`);
  console.log(`   POST /api/login`);
  console.log(`   POST /api/keys (auth required)`);
  console.log(`   POST /api/app/auth`);
  console.log(`   POST /api/licenses/verify`);
  console.log(`   GET  /health\n`);
});

module.exports = app;
