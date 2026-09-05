/* server.js — Honest Boost (PostgreSQL + Railway) */
require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/* Middleware */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (IS_PRODUCTION) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));

/* Session - memory store for boot, switch to PG later */
app.use(session({
  name: 'hb.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

/* Database lazy load */
let db = null;
let dbReady = false;
let dbInitPromise = null;

function getDb() {
  if (!db) {
    const { initSchema, get: dbGet, all: dbAll, run: dbRun } = require('./src/db');
    db = { initSchema, dbGet, dbAll, dbRun };
  }
  return db;
}

async function provisionConfiguredAdmin() {
  const email = normalizeEmail(process.env.ADMIN_USER);
  const password = process.env.ADMIN_PASS;
  if (!isValidEmail(email) || typeof password !== 'string' || password.length < 8) return;
  const hash = await bcrypt.hash(password, 12);
  await getDb().dbRun(
    `INSERT INTO users (username, password_hash, nickname, role, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
    [email, hash, 'Admin', 'admin', new Date().toISOString()]
  );
}

async function ensureDbReady() {
  if (dbReady) return true;
  if (!dbInitPromise) {
    dbInitPromise = getDb().initSchema()
      .then(async () => {
        await provisionConfiguredAdmin();
        dbReady = true;
        return true;
      })
      .catch((err) => {
        dbInitPromise = null;
        // Logged once per failed attempt so Railway's deploy logs show the
        // real Postgres error (auth failure, wrong host, missing SSL, etc.)
        // instead of every route silently returning database_not_ready.
        console.error('✗ Database not ready:', err && err.message ? err.message : err);
        throw err;
      });
  }
  return dbInitPromise;
}

/* Auth helpers */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'not_authenticated', loginUrl: '/login.html' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  if (req.session && req.session.user) return res.status(403).json({ error: 'forbidden' });
  return res.status(401).json({ error: 'not_authenticated', loginUrl: '/login.html' });
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* Rate limiters */
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });

/* Validation */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(body) {
  const errors = [];
  const username = body.username;
  const password = body.password;
  if (!username || typeof username !== 'string' || !username.trim()) errors.push('username_required');
  else if (username.length > 254) errors.push('username_too_long');
  else if (!EMAIL_RE.test(username.trim())) errors.push('username_must_be_email');
  if (!password || typeof password !== 'string' || password.length < 8) errors.push('password_too_short');
  else if (password.length > 200) errors.push('password_too_long');
  return errors;
}

function newLicenseKey() {
  return 'HB-' + uuidv4().replace(/-/g, '').toUpperCase().match(/.{1,4}/g).join('-');
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  return EMAIL_RE.test(normalizeEmail(value));
}

function publicOrder(order, license) {
  return {
    orderId: order.order_id,
    product: order.product,
    amount: order.amount,
    status: order.status,
    createdAt: order.created_at,
    license: license && license.status === 'active' ? license.license_key : null
  };
}

async function activeLicenseForEmail(email) {
  return getDb().dbGet(
    'SELECT * FROM licenses WHERE email = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
    [email, 'active']
  );
}

function passwordResetTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

/* Routes */
app.get('/health', (req, res) => {
  res.json({ ok: true });
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

app.post('/api/register', registerLimiter, asyncRoute(async (req, res) => {
  if (!dbReady) {
    try {
      await ensureDbReady();
    } catch (err) {
      return res.status(503).json({ error: 'database_not_ready' });
    }
  }
  
  const { nickname, username, password, confirmPassword } = req.body;
  const errors = validateCredentials({ username, password });
  if (errors.length) return res.status(400).json({ error: errors[0] });

  const nick = typeof nickname === 'string' ? nickname.trim() : '';
  if (!nick) return res.status(400).json({ error: 'nickname_required' });
  if (nick.length < 2 || nick.length > 30) return res.status(400).json({ error: 'nickname_invalid_length' });

  if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
    return res.status(400).json({ error: 'passwords_do_not_match' });
  }
  
  const email = username.trim().toLowerCase();
  const existing = await getDb().dbGet('SELECT id FROM users WHERE username = $1', [email]);
  if (existing) return res.status(409).json({ error: 'user_already_exists' });
  
  const hash = await bcrypt.hash(password, 12);
  await getDb().dbRun(
    'INSERT INTO users (username, password_hash, nickname, role, created_at) VALUES ($1, $2, $3, $4, $5)',
    [email, hash, nick, 'user', new Date().toISOString()]
  );
  
  return res.status(201).json({ ok: true, email, nickname: nick });
}));

app.post('/api/login', loginLimiter, asyncRoute(async (req, res) => {
  if (!dbReady) {
    try {
      await ensureDbReady();
    } catch (err) {
      return res.status(503).json({ error: 'database_not_ready' });
    }
  }
  
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  
  const email = username.trim().toLowerCase();
  const user = await getDb().dbGet('SELECT * FROM users WHERE username = $1', [email]);
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
  
  req.session.user = { id: user.id, username: user.username, nickname: user.nickname || null, role: user.role };
  return res.json({ ok: true, user: req.session.user });
}));

app.post('/api/logout', (req, res) => {
  if (req.session) req.session.destroy();
  return res.json({ ok: true });
});

/* Password recovery. Tokens are stored hashed and never returned in production. */
app.post('/api/password-reset-request', resetLimiter, asyncRoute(async (req, res) => {
  try {
    await ensureDbReady();
  } catch {
    return res.status(503).json({ error: 'database_not_ready' });
  }

  const email = normalizeEmail(req.body && req.body.username);
  // Always return the same response so this endpoint cannot enumerate accounts.
  const response = { ok: true, message: 'Se a conta existir, um email de recuperação será enviado.' };
  if (!isValidEmail(email)) return res.json(response);

  const user = await getDb().dbGet('SELECT id FROM users WHERE username = $1', [email]);
  if (!user) return res.json(response);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires = Date.now() + (60 * 60 * 1000);
  await getDb().dbRun('UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3', [tokenHash, expires, user.id]);

  const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const resetUrl = `${baseUrl}/reset.html?token=${encodeURIComponent(rawToken)}`;
  const transport = passwordResetTransport();
  if (transport) {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Redefinição de senha — Honest Boost',
      text: `Use este link para redefinir sua senha (válido por 1 hora): ${resetUrl}`
    });
  } else if (!IS_PRODUCTION) {
    response.devToken = rawToken;
  } else {
    console.warn('Password reset requested but SMTP is not configured.');
  }
  return res.json(response);
}));

app.post('/api/password-reset-confirm', resetLimiter, asyncRoute(async (req, res) => {
  try {
    await ensureDbReady();
  } catch {
    return res.status(503).json({ error: 'database_not_ready' });
  }
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const newPassword = req.body?.newPassword;
  if (!token || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
    return res.status(400).json({ error: 'invalid_password' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await getDb().dbGet(
    'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > $2',
    [tokenHash, Date.now()]
  );
  if (!user) return res.status(400).json({ error: 'invalid_token' });
  const hash = await bcrypt.hash(newPassword, 12);
  await getDb().dbRun(
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2',
    [hash, user.id]
  );
  return res.json({ ok: true });
}));

/* Download - available to any logged-in user (trial or premium) */
app.get('/api/download', requireAuth, asyncRoute(async (req, res) => {
  const downloadsDir = path.join(__dirname, 'public', 'downloads');
  const installer = ['HonestBoostSetup.exe', 'honest-boost-setup.exe', 'Honest Boost Setup 2.0.0.exe'].find((name) =>
    require('fs').existsSync(path.join(downloadsDir, name))
  );
  if (!installer) return res.status(503).json({ error: 'download_not_available' });
  return res.json({ ok: true, url: `/downloads/${installer}`, filename: installer });
}));

/* API Keys */
app.post('/api/keys', requireAuth, asyncRoute(async (req, res) => {
  if (!dbReady) {
    try {
      await ensureDbReady();
    } catch (err) {
      return res.status(503).json({ error: 'database_not_ready' });
    }
  }
  
  const userId = req.session.user.id;
  const license = await activeLicenseForEmail(req.session.user.username);
  const product = license ? require('./src/products').getProduct(license.product) : null;
  
  // Determine key type and expiry
  const isPremium = !!license && !!product;
  const keyType = isPremium ? 'premium' : 'trial';
  const maxActive = isPremium ? (product.seats || 1) : 1;
  
  // Trial: 4 hours. Premium: 1 year (365 days)
  const ttlMs = isPremium ? 365 * 24 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
  
  const activeKeys = await getDb().dbGet(
    'SELECT COUNT(*)::int AS count FROM api_keys WHERE user_id = $1 AND status = $2 AND expires_at > $3',
    [userId, 'active', new Date().toISOString()]
  );
  if (Number(activeKeys && activeKeys.count) >= maxActive) {
    return res.status(409).json({ error: 'device_limit_reached', max: maxActive });
  }
  
  const rawKey = 'hb_' + crypto.randomBytes(24).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  
  await getDb().dbRun(
    'INSERT INTO api_keys (id, user_id, key_hash, key_prefix, created_at, expires_at, status, ip_address, key_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, userId, keyHash, keyPrefix, createdAt, expiresAt, 'active', req.ip, keyType]
  );
  
  return res.status(201).json({ ok: true, id, key: rawKey, expiresAt, type: keyType });
}));

app.get('/api/keys', requireAuth, asyncRoute(async (req, res) => {
  if (!dbReady) return res.json({ ok: true, keys: [] });
  
  const userId = req.session.user.id;
  const keys = await getDb().dbAll(
    'SELECT id, key_prefix, created_at, expires_at, last_used_at, status, key_type FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
  return res.json({ ok: true, keys });
}));

app.delete('/api/keys/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!dbReady) return res.json({ ok: true });
  
  const userId = req.session.user.id;
  await getDb().dbRun('UPDATE api_keys SET status = $1, revoked_at = $2 WHERE id = $3 AND user_id = $4', ['revoked', new Date().toISOString(), req.params.id, userId]);
  return res.json({ ok: true });
}));

/* App auth */
app.post('/api/app/auth', asyncRoute(async (req, res) => {
  if (!dbReady) {
    try {
      await ensureDbReady();
    } catch (err) {
      return res.status(503).json({ error: 'database_not_ready' });
    }
  }
  
  const { key, deviceInfo } = req.body;
  if (!key) return res.status(400).json({ error: 'missing_key' });
  
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const dbKey = await getDb().dbGet('SELECT * FROM api_keys WHERE key_hash = $1', [keyHash]);
  
  if (!dbKey) return res.status(401).json({ error: 'key_not_found' });
  if (dbKey.status !== 'active') return res.status(401).json({ error: 'key_' + dbKey.status });
  if (new Date(dbKey.expires_at) < new Date()) return res.status(401).json({ error: 'key_expired' });
  
  await getDb().dbRun('UPDATE api_keys SET last_used_at = $1 WHERE id = $2', [new Date().toISOString(), dbKey.id]);
  
  const user = await getDb().dbGet('SELECT id, username, nickname, role FROM users WHERE id = $1', [dbKey.user_id]);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  // Determine tier from active license
  const license = await activeLicenseForEmail(user.username);
  const tier = license ? license.product : 'trial';

  return res.json({
    ok: true,
    token: key,
    user: { id: user.id, username: user.username, nickname: user.nickname || null, role: user.role, tier },
    expiresAt: dbKey.expires_at,
    tier
  });
}));

/* Commerce administration. Payment creation remains deliberately disabled until
 * a provider integration can attach a provider transaction to our order id. */
app.post('/api/create-checkout-session', asyncRoute(async (req, res) => {
  const { isValidProduct } = require('./src/products');
  const email = normalizeEmail(req.body && req.body.email);
  if (!isValidProduct(req.body && req.body.product)) return res.status(400).json({ error: 'invalid_product' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  return res.status(503).json({
    error: 'checkout_not_configured',
    message: 'O checkout ainda não está configurado para vincular pagamentos a licenças com segurança.'
  });
}));

app.get('/api/orders/:orderId', requireAuth, asyncRoute(async (req, res) => {
  try {
    await ensureDbReady();
  } catch {
    return res.status(503).json({ error: 'database_not_ready' });
  }
  const order = await getDb().dbGet('SELECT * FROM orders WHERE order_id = $1', [req.params.orderId]);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (req.session.user.role !== 'admin' && order.email !== req.session.user.username) return res.status(403).json({ error: 'forbidden' });
  const license = await getDb().dbGet('SELECT * FROM licenses WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1', [order.order_id]);
  return res.json(publicOrder(order, license));
}));

app.get('/api/orders', requireAdmin, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const orders = await getDb().dbAll('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200');
  return res.json(orders);
}));

app.get('/api/licenses', requireAdmin, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const licenses = await getDb().dbAll('SELECT * FROM licenses ORDER BY created_at DESC LIMIT 200');
  return res.json(licenses);
}));

/* Manual issuance is kept for support and migration. It creates an active
 * entitlement, which is required before a customer can issue desktop keys. */
app.post('/api/licenses', requireAdmin, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const { getProduct } = require('./src/products');
  const email = normalizeEmail(req.body && req.body.email);
  const product = getProduct(req.body && req.body.product);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!product) return res.status(400).json({ error: 'invalid_product' });
  const license = newLicenseKey();
  const createdAt = new Date().toISOString();
  await getDb().dbRun(
    'INSERT INTO licenses (license_key, email, product, status, created_at) VALUES ($1, $2, $3, $4, $5)',
    [license, email, product.id, 'active', createdAt]
  );
  return res.status(201).json({ ok: true, license });
}));

app.post('/api/licenses/verify', asyncRoute(async (req, res) => {
  await ensureDbReady();
  const suppliedKey = req.body?.licenseKey || req.body?.license;
  const licenseKey = typeof suppliedKey === 'string' ? suppliedKey.trim() : '';
  const license = await getDb().dbGet(
    'SELECT license_key, email, product, status FROM licenses WHERE license_key = $1',
    [licenseKey]
  );
  if (!license || license.status !== 'active') return res.status(401).json({ error: 'invalid_license' });
  return res.json({ ok: true, valid: true, product: license.product, email: license.email });
}));

/* Dashboard */
app.get('/dashboard', (req, res) => {
  if (req.session && req.session.user) {
    return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  }
  return res.redirect('/login.html?next=%2Fdashboard');
});

app.get('/admin', (req, res) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  return res.redirect('/login.html?next=%2Fadmin');
});

/* 404 */
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

/* Error handler */
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_error' });
});

/* Boot - start server immediately */
const server = app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  
  // Init schema after server starts (non-blocking)
  setTimeout(async () => {
    try {
      await ensureDbReady();
    } catch (err) {
      console.error('⚠ Schema init failed:', err.message);
    }
  }, 1000);
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  const done = () => process.exit(0);
  server.close(done);
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
