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

/* Stripe is only loaded when a secret is present so local/dev boots stay
 * dependency-light and don't make network calls. Missing STRIPE_SECRET makes
 * checkouts fail closed with a clear 503 instead of a broken payment flow. */
const stripe = process.env.STRIPE_SECRET ? require('stripe')(process.env.STRIPE_SECRET) : null;

/* InfinitePay (Brazilian PSP supporting Pix with zero fee). The handle is the
 * merchant InfiniteTag (without the leading $) from the "Checkout Integrado"
 * config. Payment links + status checks use this same handle. */
const INFINITEPAY_HANDLE = (process.env.INFINITEPAY_HANDLE || '').trim() || null;

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const HAS_EXTERNAL_DB = Boolean(process.env.DATABASE_URL);
const SESSION_SECRET = process.env.SESSION_SECRET || '';

/* A weak or missing session secret lets anyone forge auth cookies. A default
 * 'dev-secret' is only acceptable for pure local development without a real
 * database. Anywhere else — production, staging, or any deploy that connects
 * to a real DATABASE_URL — we refuse to boot. Relying on NODE_ENV alone is
 * fragile because some hosts (e.g. Railway) do not always set
 * NODE_ENV=production. */
if ((IS_PRODUCTION || HAS_EXTERNAL_DB) && SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be set to at least 32 characters in production.');
}

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

function createSessionStore() {
  if (!IS_PRODUCTION || !process.env.DATABASE_URL) return undefined;
  const PgSession = require('connect-pg-simple')(session);
  const { getPool } = require('./src/db');
  return new PgSession({
    pool: getPool(),
    tableName: 'user_sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 15,
    ttl: 60 * 60 * 24 * 7,
  });
}

/* Middleware */
/* Stripe webhook runs before express.json so the raw body stays available
 * for signature verification (json() would consume the stream). */
app.post('/webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (IS_PRODUCTION) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));

/* Session - memory store for boot, switch to PG later. If we got here with
 * an external DB, the guard above already ensured a strong SESSION_SECRET. */
app.use(session({
  name: 'hb.sid',
  secret: SESSION_SECRET || 'dev-secret',
  store: createSessionStore(),
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

/* Legacy pages removed in the site cleanup kept as 301s so old links and
 * search engines don't land on 404s. */
const LEGACY_REDIRECTS = {
  '/index-premium.html': '/',
  '/index.hb.html': '/',
  '/app.html': '/dashboard',
  '/changelog.html': '/',
  '/about-honest.html': '/',
  '/admin-honest.html': '/admin',
  '/contact-honest.html': '/contact.html',
  '/privacy-honest.html': '/privacy.html',
  '/terms-honest.html': '/terms.html',
  '/download-honest.html': '/download.html'
};
app.use((req, res, next) => {
  const target = LEGACY_REDIRECTS[req.path];
  if (target) return res.redirect(301, target);
  return next();
});

app.use(express.static(path.join(__dirname, 'public')));

/* Sessão manual via express-session (req.session.user). Sem Passport/Google OAuth. */

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
  // App desktop valida a chave no boot + no login manual; folga p/ retries e cold start.
  const appAuthLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
// Download público e abundante (instalador inútil sem licença); só anti-abuso.
const downloadLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

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

/* One-time receipt capability for an order. Branding a short-lived, signed
 * HMAC cookie on the Stripe success redirect lets an anonymous buyer poll
 * their own order/license without exposing other people's data. */
function orderAccessToken(orderId) {
  return crypto.createHmac('sha256', SESSION_SECRET || 'dev-secret').update(String(orderId)).digest('hex');
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > -1 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
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

async function accountEntitlement(email) {
  const license = await activeLicenseForEmail(email);
  const product = license ? require('./src/products').getProduct(license.product) : null;
  const isPremium = Boolean(license && product);
  // Sem período de teste: só licença ativa gera keys. Usuários sem licença
  // não têm direito a key (trial de 4h removido do produto).
  return {
    license,
    product,
    tier: isPremium ? product.id : 'trial',
    keyType: isPremium ? 'premium' : null,
    maxActiveKeys: isPremium ? (product.seats || 1) : 0,
    keyTtlMs: isPremium ? 365 * 24 * 60 * 60 * 1000 : 0
  };
}

async function audit(req, action, details) {
  try {
    const user = req.session && req.session.user;
    await require('./src/audit').log(null, {
      userId: user && user.id,
      action,
      details: details ? JSON.stringify(details) : null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
  } catch (err) {
    console.warn('Audit log failed:', err && err.message ? err.message : err);
  }
}

/* Stripe webhook — creates the order and activates a license for the buyer's
 * email, then (optionally) emails the key. Registered early (raw body), so it
 * is written as a hoisted function declaration instead of using asyncRoute. */
async function webhookHandler(req, res) {
  try {
    if (!stripe) return res.status(503).json({ error: 'stripe_not_configured' });
    const sig = req.headers['stripe-signature'];
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'webhook_not_configured' });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig || '', secret);
    } catch (err) {
      return res.status(400).json({ error: 'invalid_signature' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = normalizeEmail(
        (session.metadata && session.metadata.email) || session.customer_email
      );
      const { getProduct } = require('./src/products');
      const product = email && session.metadata && session.metadata.product
        ? getProduct(session.metadata.product)
        : null;
      if (product) {
        await ensureDbReady();
        const paidAt = new Date(session.paid_at ? session.paid_at * 1000 : Date.now()).toISOString();
        await getDb().dbRun(
          `INSERT INTO orders (order_id, email, product, amount, status, provider, paid_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (order_id)
           DO UPDATE SET status = EXCLUDED.status, paid_at = EXCLUDED.paid_at, provider = EXCLUDED.provider`,
          [session.id, email, product.id,
           Number.isInteger(session.amount_total) ? session.amount_total : product.amount,
           'paid', 'stripe', paidAt, paidAt]
        );
        const existing = await getDb().dbGet('SELECT id FROM licenses WHERE order_id = $1', [session.id]);
        if (!existing) {
          const license = newLicenseKey();
          await getDb().dbRun(
            `INSERT INTO licenses (license_key, email, product, status, order_id, activated_at, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [license, email, product.id, 'active', session.id, paidAt, paidAt]
          );
          await audit(req, 'payment.completed', {
            orderId: session.id, email, product: product.id, amount: session.amount_total
          });
          sendLicenseEmail(email, license, product).catch(() => {});
        }
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'webhook_error' });
  }
}

/* Sends the license to the buyer when SMTP is configured; failures are silent
 * because the key is also available on the success page / dashboard. */
async function sendLicenseEmail(to, licenseKey, product) {
  const transport = passwordResetTransport();
  if (!transport) return;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) return;
  await transport.sendMail({
    from,
    to,
    subject: 'Sua licença Honest Boost chegou!',
    text: `Olá!\n\nSua licença do plano ${product.name} está ativa.\n\nChave de licença: ${licenseKey}\n\nPara ativar: baixe o app, abra a tela Autenticação e cole essa chave — pronto, sem criar conta.\n\nGerencie seus dispositivos (limite do plano) em ${process.env.PUBLIC_BASE_URL || 'https://honest-boost.onrender.com'}/dashboard.\n\nHonest Boost`
  });
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
app.get('/health', async (req, res) => {
  // Touches the database on purpose: with Neon's scale-to-zero, a periodic
  // health ping (e.g. a cron keepalive) keeps the compute warm, and the db
  // flag lets us see connection health without failing Render's check.
  // Orçamento curto (3s): o health check interno do Render tem timeout por
  // tentativa — esperar o Neon acordar (até 20s) aqui já derrubou deploys
  // com "Timed out waiting for internal health check".
  let db = false;
  try {
    const { getPool } = require('./src/db');
    await Promise.race([
      getPool().query('SELECT 1').then(() => { db = true; }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health-db-slow')), 3000)),
    ]);
  } catch (err) {
    /* temporary — Neon may be waking up; still report ok to keep the check green */
  }
  res.json({ ok: true, db });
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
  await audit(req, 'user.register', { email });
  
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
  // Accounts created via Google OAuth have no password_hash; a password login
  // against them must fail cleanly (invalid_credentials), not crash the route.
  if (!user || !user.password_hash) return res.status(401).json({ error: 'invalid_credentials' });
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
  
  req.session.user = { id: user.id, username: user.username, nickname: user.nickname || null, role: user.role };
  await audit(req, 'login', { email });
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
  await audit(req, 'password.reset_confirm', { userId: user.id });
  return res.json({ ok: true });
}));

/* Login exclusivamente email + senha (Google OAuth removido do produto). */
/* Laudo VirusTotal exibido DENTRO do site (sem redirecionar).
 * Requer VT_API_KEY (gratuita) e INSTALLER_SHA256 da release atual.
 * Cache 24h (falhas 1h); limite free do VT é 4 req/min — o cache cobre. */
const VT_API_KEY = (process.env.VT_API_KEY || '').trim() || null;
// Aceita com ou sem prefixo "sha256:"; exige 64 hex (evita consulta lixo).
const _rawSha = (process.env.INSTALLER_SHA256 || '').trim().toLowerCase().replace(/^sha256:/, '');
const INSTALLER_SHA256 = /^[0-9a-f]{64}$/.test(_rawSha) ? _rawSha : null;
let _vtCache = { at: 0, payload: null };
async function fetchVtReport() {
  if (!VT_API_KEY || !INSTALLER_SHA256) return { available: false, reason: 'not_configured' };
  if (Date.now() - _vtCache.at < 24 * 3600 * 1000 && _vtCache.payload) return _vtCache.payload;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(`https://www.virustotal.com/api/v3/files/${INSTALLER_SHA256}`, {
      headers: { 'x-apikey': VT_API_KEY },
      signal: ctrl.signal,
    });
    if (resp.status === 404) {
      const p = { available: false, reason: 'never_scanned' };
      _vtCache = { at: Date.now() - 23 * 3600 * 1000, payload: p }; // retry em 1h
      return p;
    }
    if (!resp.ok) {
      const p = { available: false, reason: `http_${resp.status}` };
      _vtCache = { at: Date.now() - 23 * 3600 * 1000, payload: p };
      return p;
    }
    const data = await resp.json();
    const attr = (data && data.data && data.data.attributes) || {};
    const stats = attr.last_analysis_stats || {};
    const malicious = Number(stats.malicious) || 0;
    const suspicious = Number(stats.suspicious) || 0;
    const undetected = Number(stats.undetected) || 0;
    const harmless = Number(stats.harmless) || 0;
    const total = malicious + suspicious + undetected + harmless
      + (Number(stats.timeout) || 0) + (Number(stats.failure) || 0);
    const payload = {
      available: true,
      malicious, suspicious, undetected, harmless, total,
      clean: malicious === 0 && suspicious === 0,
      scannedAt: attr.last_analysis_date ? new Date(attr.last_analysis_date * 1000).toISOString() : null,
      permalink: `https://www.virustotal.com/gui/file/${INSTALLER_SHA256}/detection`,
    };
    _vtCache = { at: Date.now(), payload };
    return payload;
  } catch (e) {
    const p = { available: false, reason: 'fetch_failed' };
    _vtCache = { at: Date.now() - 23 * 3600 * 1000, payload: p };
    return p;
  } finally {
    clearTimeout(timer);
  }
}
app.get('/api/security/report', asyncRoute(async (req, res) => {
  const asset = await resolveInstallerAsset().catch(() => null);
  const vt = await fetchVtReport();
  return res.json({
    ok: true,
    version: asset && asset.filename ? (asset.filename.match(/(\d+\.\d+\.\d+)/) || [])[1] || null : null,
    filename: asset ? asset.filename : null,
    sha256: INSTALLER_SHA256,
    vt,
  });
}));

/* Instalador sempre atual: 1) arquivo local em public/downloads (dev);
 * 2) última Release do GitHub (lida do latest.yml do auto-update, cache 1h).
 * O binário de 75MB nunca entra no git — o Render não teria como servi-lo. */
const GH_OWNER = 'Rodzin96';
const GH_REPO = 'honest-boost';
let _dlCache = { at: 0, url: null, filename: null, version: null };
// Última Release (via latest.yml do auto-update). Fonte única p/ download,
// versão do site e checagens. Cache 1h; em falha, devolve o último válido.
async function getLatestRelease() {
  if (Date.now() - _dlCache.at < 3600000 && _dlCache.url) return _dlCache;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const resp = await fetch(`https://github.com/${GH_OWNER}/${GH_REPO}/releases/latest/download/latest.yml`, { signal: ctrl.signal });
    if (!resp.ok) return _dlCache.url ? _dlCache : null;
    const yml = await resp.text();
    const version = ((yml.match(/^version:\s*(.+)$/m) || [])[1] || '').trim();
    const asset = ((yml.match(/^path:\s*(.+)$/m) || [])[1] || '').trim();
    if (!version || !asset) return _dlCache.url ? _dlCache : null;
    _dlCache = {
      at: Date.now(), version,
      url: `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/v${version}/${asset}`,
      filename: asset,
    };
    return _dlCache;
  } catch {
    return _dlCache.url ? _dlCache : null;
  } finally {
    clearTimeout(timer);
  }
}
app.get('/api/app-version', asyncRoute(async (req, res) => {
  const rel = await getLatestRelease().catch(() => null);
  return res.json({ ok: true, version: rel ? rel.version : null });
}));
async function resolveInstallerAsset() {
  return getLatestRelease().catch(() => null);
}
/* Download PÚBLICO (sem login): o instalador sozinho não faz nada — a licença
 * é fiscalizada no app (ativação + seats). Travar download só criava atrito
 * no pós-compra (convidado clicava em baixar e caía no login). */
app.get('/api/download', downloadLimiter, asyncRoute(async (req, res) => {
  const downloadsDir = path.join(__dirname, 'public', 'downloads');
  const local = ['HonestBoostSetup.exe', 'honest-boost-setup.exe'].find((name) =>
    require('fs').existsSync(path.join(downloadsDir, name))
  );
  if (local) return res.json({ ok: true, url: `/downloads/${local}`, filename: local });
  const asset = await resolveInstallerAsset();
  if (!asset || !asset.url) return res.status(503).json({ error: 'download_not_available' });
  return res.json({ ok: true, url: asset.url, filename: asset.filename });
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
  const isAdminUser = req.session.user.role === 'admin';
  const entitlement = await accountEntitlement(req.session.user.username);
  if (!entitlement.license && !isAdminUser) {
    return res.status(403).json({ error: 'license_required' });
  }
  // Admin sem licença própria: pode gerar keys de suporte/teste (1 ano, teto 10).
  const keyType = entitlement.keyType || (isAdminUser ? 'premium' : null);
  const maxActive = entitlement.maxActiveKeys || (isAdminUser ? 10 : 0);
  const ttlMs = entitlement.keyTtlMs || (isAdminUser ? 365 * 24 * 60 * 60 * 1000 : 0);

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
  await audit(req, 'key.create', { keyId: id, keyType, tier: entitlement.tier });
  
  return res.status(201).json({ ok: true, id, key: rawKey, expiresAt, type: keyType, tier: entitlement.tier, maxActive });
}));

app.get('/api/keys', requireAuth, asyncRoute(async (req, res) => {
  if (!dbReady) return res.json({ ok: true, keys: [] });
  
  const userId = req.session.user.id;
  const isAdminUser = req.session.user.role === 'admin';
  const entitlement = await accountEntitlement(req.session.user.username);
  const keys = await getDb().dbAll(
    'SELECT id, key_prefix, created_at, expires_at, last_used_at, status, key_type FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
  return res.json({
    ok: true,
    keys,
    tier: isAdminUser && entitlement.tier === 'trial' ? 'admin' : entitlement.tier,
    keyType: entitlement.keyType,
    maxActive: entitlement.maxActiveKeys || (isAdminUser ? 10 : 0),
    license: entitlement.license ? {
      product: entitlement.license.product,
      status: entitlement.license.status,
      createdAt: entitlement.license.created_at
    } : null
  });
}));

/* Dispositivos por chave/licença do usuário + remoção (libera seat). */
app.get('/api/machines', requireAuth, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const userId = req.session.user.id;
  const email = req.session.user.username;
  const myKeys = await getDb().dbAll('SELECT key_hash, key_prefix, key_type FROM api_keys WHERE user_id = $1', [userId]);
  const myLicenses = await getDb().dbAll("SELECT license_key, product, status FROM licenses WHERE email = $1 AND status = 'active'", [email]);
  const refs = [
    ...myKeys.map(k => ({ ref: k.key_hash, label: (k.key_prefix || 'hb_') + '…', kind: 'key', detail: k.key_type || '' })),
    ...myLicenses.map(l => ({ ref: 'lic:' + l.license_key, label: l.license_key.slice(0, 11) + '…', kind: 'license', detail: l.product || '' })),
  ];
  const out = [];
  for (const r of refs) {
    const machines = await getDb().dbAll(
      'SELECT machine_id, hostname, platform, first_seen, last_seen FROM key_machines WHERE key_ref = $1 ORDER BY last_seen DESC',
      [r.ref]
    );
    out.push({ ...r, machines });
  }
  return res.json({ ok: true, devices: out });
}));

/* Admin: dispositivos recentes de todos os clientes (suporte). */
app.get('/api/admin/machines', requireAdmin, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const rows = await getDb().dbAll(
    `SELECT m.key_ref, m.machine_id, m.hostname, m.platform, m.first_seen, m.last_seen,
            u.username AS email
     FROM key_machines m
     LEFT JOIN api_keys k ON k.key_hash = m.key_ref
     LEFT JOIN users u ON u.id = k.user_id
     ORDER BY m.last_seen DESC LIMIT 200`
  );
  const out = await Promise.all(rows.map(async (r) => {
    let email = r.email || null;
    if (!email && String(r.key_ref).startsWith('lic:')) {
      const lic = await getDb().dbGet('SELECT email FROM licenses WHERE license_key = $1', [String(r.key_ref).slice(4)]);
      email = (lic && lic.email) || null;
    }
    return { ...r, email };
  }));
  return res.json({ ok: true, machines: out });
}));

app.delete('/api/machines', requireAuth, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const { keyRef, machineId } = req.body || {};
  if (!keyRef || !machineId) return res.status(400).json({ error: 'missing_fields' });
  const userId = req.session.user.id;
  const email = req.session.user.username;
  const isAdminUser = req.session.user.role === 'admin';
  let owned = !!isAdminUser;
  if (!owned) {
    if (String(keyRef).startsWith('lic:')) {
      const lic = await getDb().dbGet('SELECT email FROM licenses WHERE license_key = $1', [String(keyRef).slice(4)]);
      owned = !!lic && lic.email === email;
    } else {
      const k = await getDb().dbGet('SELECT user_id FROM api_keys WHERE key_hash = $1', [String(keyRef)]);
      owned = !!k && Number(k.user_id) === Number(userId);
    }
  }
  if (!owned) return res.status(403).json({ error: 'forbidden' });
  await getDb().dbRun('DELETE FROM key_machines WHERE key_ref = $1 AND machine_id = $2', [String(keyRef), String(machineId)]);
  await audit(req, 'machine.remove', { keyRef: String(keyRef).slice(0, 14) + '…', machineId: String(machineId).slice(0, 12) });
  return res.json({ ok: true });
}));

app.delete('/api/keys/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!dbReady) return res.json({ ok: true });
  
  const userId = req.session.user.id;
  await getDb().dbRun('UPDATE api_keys SET status = $1, revoked_at = $2 WHERE id = $3 AND user_id = $4', ['revoked', new Date().toISOString(), req.params.id, userId]);
  await audit(req, 'key.revoke', { keyId: req.params.id });
  return res.json({ ok: true });
}));

/* App auth */
/* Limite de máquinas do plano (seats). Registra o dispositivo na ativação;
 * máquinas novas além do limite são recusadas SEM gravar (evita lotar seats).
 * keyRef: api_keys.key_hash ou 'lic:' + licenses.license_key. */
async function checkMachineSlot({ keyRef, seats, deviceInfo }) {
  const machineId = String((deviceInfo && deviceInfo.machineId) || 'unknown').slice(0, 128);
  const hostname = String((deviceInfo && deviceInfo.hostname) || '').slice(0, 128);
  const platform = String((deviceInfo && deviceInfo.platform) || '').slice(0, 32);
  const now = new Date().toISOString();
  const known = await getDb().dbGet(
    'SELECT machine_id FROM key_machines WHERE key_ref = $1 AND machine_id = $2',
    [keyRef, machineId]
  );
  if (known) {
    await getDb().dbRun(
      'UPDATE key_machines SET last_seen = $3, hostname = $4, platform = $5 WHERE key_ref = $1 AND machine_id = $2',
      [keyRef, machineId, now, hostname, platform]
    );
    const used = await getDb().dbGet('SELECT COUNT(*)::int AS count FROM key_machines WHERE key_ref = $1', [keyRef]);
    return { over: false, used: Number(used && used.count) || 1, max: seats, machineId };
  }
  const counted = await getDb().dbGet('SELECT COUNT(*)::int AS count FROM key_machines WHERE key_ref = $1', [keyRef]);
  const used = Number(counted && counted.count) || 0;
  if (used >= seats) return { over: true, used, max: seats, machineId };
  await getDb().dbRun(
    'INSERT INTO key_machines (key_ref, machine_id, hostname, platform, first_seen, last_seen) VALUES ($1,$2,$3,$4,$5,$5)',
    [keyRef, machineId, hostname, platform, now]
  );
  return { over: false, used: used + 1, max: seats, machineId };
}

app.post('/api/app/auth', appAuthLimiter, asyncRoute(async (req, res) => {
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

  if (dbKey) {
    if (dbKey.status !== 'active') return res.status(401).json({ error: 'key_' + dbKey.status });
    if (new Date(dbKey.expires_at) < new Date()) return res.status(401).json({ error: 'key_expired' });

    await getDb().dbRun('UPDATE api_keys SET last_used_at = $1 WHERE id = $2', [new Date().toISOString(), dbKey.id]);

    const user = await getDb().dbGet('SELECT id, username, nickname, role FROM users WHERE id = $1', [dbKey.user_id]);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const entitlement = await accountEntitlement(user.username);
    // Sem licença, vale o tipo da key: premium (emitida pelo admin/suporte)
    // responde como Pro com 3 seats; trial responde Trial com 1.
    const isPremiumKey = dbKey.key_type === 'premium';
    const tier = entitlement.tier !== 'trial' ? entitlement.tier : (isPremiumKey ? 'pro' : 'trial');
    const seats = entitlement.product
      ? Math.max(1, Number(entitlement.product.seats) || 1)
      : (isPremiumKey ? 3 : 1);
    const slot = await checkMachineSlot({ keyRef: keyHash, seats, deviceInfo });
    if (slot.over) {
      await audit(req, 'app.auth.denied', { keyId: dbKey.id, used: slot.used, max: slot.max });
      return res.status(403).json({ error: 'device_limit_reached', max: slot.max, used: slot.used });
    }
    await audit(req, 'app.auth', { keyId: dbKey.id, tier });

    return res.json({
      ok: true,
      token: key,
      user: { id: user.id, username: user.username, nickname: user.nickname || null, role: user.role, tier },
      expiresAt: dbKey.expires_at,
      lifetime: false,
      tier,
      machines: { used: slot.used, max: slot.max }
    });
  }

  // Ponte HB-: a chave entregue na compra (licenses.license_key, vitalícia)
  // também ativa o app direto, sem exigir conta/dashboard. Chaves têm 128 bits
  // de entropia + este endpoint tem rate limit dedicado.
  const license = await getDb().dbGet(
    'SELECT license_key, email, product, status FROM licenses WHERE license_key = $1',
    [String(key).trim()]
  );
  if (!license || license.status !== 'active') return res.status(401).json({ error: 'key_not_found' });

  const { getProduct } = require('./src/products');
  const product = getProduct(license.product);
  const tier = product ? product.id : 'pro';
  const seats = Math.max(1, Number(product && product.seats) || 1);
  const slot = await checkMachineSlot({ keyRef: 'lic:' + license.license_key, seats, deviceInfo: deviceInfo });
  if (slot.over) {
    await audit(req, 'app.auth.denied', { license: license.license_key.slice(0, 12) + '…', used: slot.used, max: slot.max });
    return res.status(403).json({ error: 'device_limit_reached', max: slot.max, used: slot.used });
  }
  const linked = await getDb().dbGet('SELECT id, username, nickname, role FROM users WHERE username = $1', [license.email]);
  await audit(req, 'app.auth', { license: license.license_key.slice(0, 12) + '…', tier });

  return res.json({
    ok: true,
    token: key,
    user: linked
      ? { id: linked.id, username: linked.username, nickname: linked.nickname || null, role: linked.role, tier }
      : { id: null, username: license.email, nickname: null, role: 'user', tier },
    expiresAt: null,
    lifetime: true,
    tier,
    machines: { used: slot.used, max: slot.max }
  });
}));

/* Commerce. Creates a Stripe Checkout session; the post-payment webhook
 * attaches the Stripe transaction to our order id and activates the license.
 * One-time (lifetime) plan: customers are linked to a Stripe Customer so the
 * account, receipts and Stripe Tax stay coherent for the same user. */
app.post('/api/create-checkout-session', asyncRoute(async (req, res) => {
  const { getProduct } = require('./src/products');
  const email = normalizeEmail(req.body && req.body.email);
  const product = getProduct(req.body && req.body.product);
  if (!product) return res.status(400).json({ error: 'invalid_product' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  /* Two providers in parallel: Pix via InfinitePay, card via Stripe. */
  const provider = String((req.body && req.body.provider) || 'stripe').toLowerCase();
  if (provider === 'infinitepay' || provider === 'pix') {
    return createInfinitePayCheckout(req, res, { email, product });
  }

  if (!stripe) return res.status(503).json({
    error: 'checkout_not_configured',
    message: 'O checkout ainda não está configurado. Entre em contato com o suporte.'
  });

  const publicBase = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

  /* Link the logged-in user to a Stripe Customer (one per user, reused across
   * orders and future Billing/Invoicing). Guests pay with just the email. */
  let customer;
  if (req.user && req.user.id) {
    await ensureDbReady();
    const row = await getDb().dbGet('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    customer = row && row.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create({
        email,
        metadata: { userId: String(req.user.id), email }
      });
      customer = created.id;
      await getDb().dbRun(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customer, req.user.id]
      );
    }
  }

  const catalogPrice = product.stripePriceId;
  const enableTax = process.env.ENABLE_STRIPE_TAX === '1';
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(customer ? { customer } : { customer_email: email }),
      line_items: [{
        quantity: 1,
        ...(catalogPrice
          ? { price: catalogPrice }
          : {
              price_data: {
                currency: 'brl',
                unit_amount: product.amount,
                product_data: {
                  name: `Honest Boost — ${product.name}`,
                  description: product.tagline || undefined
                }
              }
            })
      }],
      metadata: { email, product: product.id, ...(req.user ? { userId: String(req.user.id) } : {}) },
      /* Brazilian digital goods need a billing address + tax id (CPF/CNPJ)
       * for receipts and Stripe Tax; automatic_tax stays opt-in until the
       * registrations are done in the Dashboard. */
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      ...(enableTax ? { automatic_tax: { enabled: true } } : {}),
      locale: 'pt-BR',
      // Stripe replaces {CHECKOUT_SESSION_ID} with the real session id.
      success_url: `${publicBase}/checkout/success/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicBase}/checkout.html?plan=${product.id}&cancelled=1`
    });
  } catch (err) {
    console.error('Stripe checkout failed:', err && err.message ? err.message : err);
    return res.status(502).json({ error: 'checkout_failed' });
  }

  return res.json({ ok: true, checkoutUrl: session.url, orderId: session.id });
}));

/* Which payment providers are configured, so the checkout page can disable
 * unavailable methods instead of surfacing a 503 after the customer clicks. */
app.get('/api/payment-methods', (req, res) => {
  res.json({ stripe: Boolean(stripe), infinitepay: Boolean(INFINITEPAY_HANDLE) });
});

/* InfinitePay checkout: record a pending order, then ask InfinitePay for a
 * hosted payment link and hand its URL to the browser. The webhook below
 * marks the order as paid and activates the license. */
async function createInfinitePayCheckout(req, res, { email, product }) {
  if (!INFINITEPAY_HANDLE) return res.status(503).json({
    error: 'pix_not_configured',
    message: 'O pagamento via Pix ainda não está configurado. Entre em contato com o suporte.'
  });

  const publicBase = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  const orderId = 'hb_' + crypto.randomBytes(12).toString('hex');
  const now = new Date().toISOString();

  await ensureDbReady();
  await getDb().dbRun(
    `INSERT INTO orders (order_id, email, product, amount, status, provider, paid_at, created_at)
     VALUES ($1, $2, $3, $4, 'pending', 'infinitepay', NULL, $5)`,
    [orderId, email, product.id, product.amount, now]
  );

  let link;
  try {
    const { createCheckoutLink } = require('./src/infinitepay');
    link = await createCheckoutLink({
      handle: INFINITEPAY_HANDLE,
      items: [{
        quantity: 1,
        price: product.amount,
        description: `Honest Boost — ${product.name}`
      }],
      orderNsu: orderId,
      redirectUrl: `${publicBase}/checkout/success/${orderId}`,
      webhookUrl: `${publicBase}/webhook/infinitepay`
    });
  } catch (err) {
    console.error('InfinitePay link failed:', err && err.message ? err.message : err);
    return res.status(502).json({ error: 'checkout_failed' });
  }

  if (!link.url) return res.status(502).json({ error: 'checkout_failed' });
  return res.json({ ok: true, checkoutUrl: link.url, orderId, provider: 'infinitepay' });
}

/* InfinitePay webhook. It carries no signature, so before granting a license
 * we always re-confirm the payment through payment_check and match the amount
 * against the stored pending order. Respond 2xx only after taking ownership;
 * respond 4xx so InfinitePay retries otherwise. */
app.post('/webhook/infinitepay', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const orderNsu = String(body.order_nsu || '');
  const transactionNsu = String(body.transaction_nsu || '');
  const slug = String(body.invoice_slug || '');
  if (!orderNsu || !transactionNsu || !slug || !INFINITEPAY_HANDLE) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  try {
    await ensureDbReady();
  } catch (err) {
    return res.status(400).json({ error: 'database_not_ready' });
  }

  const order = await getDb().dbGet('SELECT * FROM orders WHERE order_id = $1', [orderNsu]);
  if (!order) return res.status(400).json({ error: 'order_not_found' });
  if (order.status === 'paid') return res.json({ received: true });

  let check;
  try {
    const { checkPayment } = require('./src/infinitepay');
    check = await checkPayment({ handle: INFINITEPAY_HANDLE, orderNsu, transactionNsu, slug });
  } catch (err) {
    console.error('InfinitePay payment_check failed:', err && err.message ? err.message : err);
    return res.status(400).json({ error: 'check_failed' });
  }
  if (!check.success || check.paid !== true || Number(check.amount) !== Number(order.amount)) {
    return res.status(400).json({ error: 'payment_not_confirmed' });
  }

  const paidAt = new Date().toISOString();
  await getDb().dbRun(
    `UPDATE orders SET status = 'paid', paid_at = $2 WHERE order_id = $1`,
    [orderNsu, paidAt]
  );

  const existing = await getDb().dbGet('SELECT id FROM licenses WHERE order_id = $1', [orderNsu]);
  if (!existing) {
    const license = newLicenseKey();
    await getDb().dbRun(
      `INSERT INTO licenses (license_key, email, product, status, order_id, activated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [license, order.email, order.product, 'active', orderNsu, paidAt, paidAt]
    );
    await audit(req, 'payment.completed', {
      orderId: orderNsu, email: order.email, product: order.product,
      amount: order.amount, captureMethod: body.capture_method, provider: 'infinitepay'
    });
    sendLicenseEmail(order.email, license, require('./src/products').getProduct(order.product)).catch(() => {});
  }

  return res.json({ received: true });
}));

/* After a payment the buyer lands here with ?order={CHECKOUT_SESSION_ID}.
 * Brands a short-lived signed receipt cookie so /api/orders/:orderId can be
 * polled without requiring an account, then forwards to the success page. */
app.get('/checkout/success/:orderId', (req, res) => {
  const orderId = String(req.params.orderId || '').trim();
  res.cookie('hb_order', orderAccessToken(orderId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    path: '/',
    maxAge: 15 * 60 * 1000
  });
  return res.redirect('/success.html?order=' + encodeURIComponent(orderId));
});

app.get('/api/orders/:orderId', asyncRoute(async (req, res) => {
  try {
    await ensureDbReady();
  } catch {
    return res.status(503).json({ error: 'database_not_ready' });
  }
  const order = await getDb().dbGet('SELECT * FROM orders WHERE order_id = $1', [req.params.orderId]);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  const isAdmin = req.session && req.session.user && req.session.user.role === 'admin';
  const isOwner = req.session && req.session.user && order.email === req.session.user.username;
  const hasReceipt = readCookie(req, 'hb_order') === orderAccessToken(order.order_id);
  if (!isAdmin && !isOwner && !hasReceipt) return res.status(403).json({ error: 'forbidden' });
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
  await audit(req, 'license.issue', { email, product: product.id });
  return res.status(201).json({ ok: true, license });
}));

/* Admin: lista usuários (para selecionar o destinatário da key). */
app.get('/api/admin/users', requireAdmin, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const users = await getDb().dbAll(
    'SELECT id, username, nickname, role, created_at FROM users ORDER BY created_at DESC LIMIT 200'
  );
  return res.json({ ok: true, users });
}));

/* Admin: emite hb_ para qualquer usuário, com validade configurável.
 * TTLs permitidos: 4h, 24h, 7d, 30d, 1 ano. Respeita o teto de keys ativas
 * do plano do destinatário (admin revoga antes se precisar exceder). */
const ADMIN_KEY_TTLS = { '4h': 4, '24h': 24, '7d': 168, '30d': 720, '1y': 8760 };
app.post('/api/admin/keys', requireAdmin, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const email = normalizeEmail(req.body && req.body.email);
  const ttlHours = ADMIN_KEY_TTLS[req.body && req.body.ttl];
  if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!ttlHours) return res.status(400).json({ error: 'invalid_ttl' });
  const target = await getDb().dbGet('SELECT id, username FROM users WHERE username = $1', [email]);
  if (!target) return res.status(404).json({ error: 'user_not_found' });
  const entitlement = await accountEntitlement(email);
  const maxActive = Math.max(1, Number(entitlement.maxActiveKeys) || 1);
  const activeKeys = await getDb().dbGet(
    "SELECT COUNT(*)::int AS count FROM api_keys WHERE user_id = $1 AND status = 'active' AND expires_at > $2",
    [target.id, new Date().toISOString()]
  );
  if (Number(activeKeys && activeKeys.count) >= maxActive) {
    return res.status(409).json({ error: 'device_limit_reached', max: maxActive });
  }
  const rawKey = 'hb_' + crypto.randomBytes(24).toString('hex');
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  await getDb().dbRun(
    'INSERT INTO api_keys (id, user_id, key_hash, key_prefix, created_at, expires_at, status, ip_address, key_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, target.id, crypto.createHash('sha256').update(rawKey).digest('hex'), rawKey.slice(0, 8), createdAt, expiresAt, 'active', req.ip, 'premium']
  );
  await audit(req, 'key.admin-create', { userId: target.id, email, ttlHours });
  return res.status(201).json({ ok: true, id, key: rawKey, expiresAt, ttlHours });
}));

/* Admin: lista hb_ (api_keys) com dono + revogação. */
app.get('/api/admin/keys', requireAdmin, asyncRoute(async (req, res) => {
  await ensureDbReady();
  const keys = await getDb().dbAll(
    `SELECT k.id, k.key_prefix, k.status, k.key_type, k.created_at, k.expires_at, k.last_used_at, u.username AS email
     FROM api_keys k LEFT JOIN users u ON u.id = k.user_id
     ORDER BY k.created_at DESC LIMIT 200`
  );
  return res.json({ ok: true, keys });
}));

app.delete('/api/admin/keys/:id', requireAdmin, asyncRoute(async (req, res) => {
  await ensureDbReady();
  await getDb().dbRun(
    "UPDATE api_keys SET status = 'revoked', revoked_at = $1, revoke_reason = 'admin' WHERE id = $2",
    [new Date().toISOString(), req.params.id]
  );
  await audit(req, 'key.admin-revoke', { keyId: req.params.id });
  return res.json({ ok: true });
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
