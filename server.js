/* server.js — Honest Boost backend (PostgreSQL for Railway) */
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const { initSchema, get: dbGet, all: dbAll, run: dbRun } = require('./src/db');
const { PRODUCTS, isValidProduct, getProduct, publicCatalog } = require('./src/products');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/* Initialize schema on boot */
initSchema().catch(err => console.error('Schema init error:', err.message));

/* Middleware */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (IS_PRODUCTION) app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
            'img-src': ["'self'", 'data:', 'blob:'],
            'connect-src': ["'self'"],
            'form-action': ["'self'"],
            'base-uri': ["'self'"],
            'object-src': ["'none'"],
            'frame-ancestors': ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in production');
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'devsecret-not-for-production';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

app.use(session({
    store: new PgSession({
        pool: undefined, // Will use DATABASE_URL
        tableName: 'sessions',
        createTableIfMissing: true
    }),
    name: 'hb.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: SESSION_TTL_MS
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

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
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

/* Validation */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials({ username, password }) {
    const errors = [];
    if (typeof username !== 'string' || !username.trim()) errors.push('username_required');
    else if (username.length > 254) errors.push('username_too_long');
    else if (!EMAIL_RE.test(username.trim())) errors.push('username_must_be_email');
    if (typeof password !== 'string' || password.length < 8) errors.push('password_too_short');
    else if (password.length > 200) errors.push('password_too_long');
    return errors;
}

function newLicenseKey() {
    return uuidv4().replace(/-/g, '').toUpperCase();
}

function baseUrl(req) {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
    if (req) return `${req.protocol}://${req.get('host')}`;
    return `http://localhost:${PORT}`;
}

/* Routes */
app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({ authenticated: true, user: req.session.user });
    }
    return res.json({ authenticated: false });
});

app.get('/api/products', (req, res) => res.json(publicCatalog()));

app.post('/api/register', registerLimiter, asyncRoute(async (req, res) => {
    const { username, password } = req.body;
    const errors = validateCredentials({ username, password });
    if (errors.length) return res.status(400).json({ error: errors[0] });
    
    const email = username.trim().toLowerCase();
    const existing = await dbGet('SELECT id FROM users WHERE username = $1', [email]);
    if (existing) return res.status(409).json({ error: 'user_already_exists' });
    
    const hash = await bcrypt.hash(password, 12);
    await dbRun(
        'INSERT INTO users (username, password_hash, role, created_at) VALUES ($1, $2, $3, $4)',
        [email, hash, 'user', new Date().toISOString()]
    );
    
    return res.status(201).json({ ok: true, email });
}));

app.post('/api/login', loginLimiter, asyncRoute(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
    
    const email = username.trim().toLowerCase();
    const user = await dbGet('SELECT * FROM users WHERE username = $1', [email]);
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
    
    req.session.user = { id: user.id, username: user.username, role: user.role };
    
    const redirectTo = user.role === 'admin' ? '/admin' : '/dashboard';
    return res.json({ ok: true, user: req.session.user, redirectTo });
}));

app.post('/api/logout', (req, res) => {
    if (req.session) req.session.destroy();
    return res.json({ ok: true });
});

app.get('/api/account', requireAuth, asyncRoute(async (req, res) => {
    const userId = req.session.user.id;
    const user = await dbGet('SELECT id, username, role, created_at FROM users WHERE id = $1', [userId]);
    const keyCount = await dbGet('SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1 AND status = $2', [userId, 'active']);
    const optCount = await dbGet('SELECT COUNT(*) as count FROM optimizations WHERE applied_by = $1', [userId]);
    
    return res.json({
        ok: true,
        user,
        activeKeys: parseInt(keyCount?.count || 0),
        optimizationsApplied: parseInt(optCount?.count || 0)
    });
}));

/* API Keys */
app.post('/api/keys', requireAuth, asyncRoute(async (req, res) => {
    const userId = req.session.user.id;
    
    const activeCount = await dbGet('SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1 AND status = $2', [userId, 'active']);
    if (parseInt(activeCount?.count || 0) >= 3) {
        return res.status(429).json({ error: 'too_many_keys' });
    }
    
    const rawKey = 'hb_' + crypto.randomBytes(24).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 8);
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    
    await dbRun(
        'INSERT INTO api_keys (id, user_id, key_hash, key_prefix, created_at, expires_at, status, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, userId, keyHash, keyPrefix, createdAt, expiresAt, 'active', req.ip]
    );
    
    return res.status(201).json({ ok: true, id, key: rawKey, expiresAt });
}));

app.get('/api/keys', requireAuth, asyncRoute(async (req, res) => {
    const userId = req.session.user.id;
    const keys = await dbAll(
        'SELECT id, key_prefix, created_at, expires_at, last_used_at, status FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [userId]
    );
    return res.json({ ok: true, keys });
}));

app.delete('/api/keys/:id', requireAuth, asyncRoute(async (req, res) => {
    const userId = req.session.user.id;
    await dbRun('UPDATE api_keys SET status = $1, revoked_at = $2 WHERE id = $3 AND user_id = $4', ['revoked', new Date().toISOString(), req.params.id, userId]);
    return res.json({ ok: true });
}));

/* App auth with key */
app.post('/api/app/auth', asyncRoute(async (req, res) => {
    const { key, deviceInfo } = req.body;
    if (!key) return res.status(400).json({ error: 'missing_key' });
    
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const dbKey = await dbGet('SELECT * FROM api_keys WHERE key_hash = $1', [keyHash]);
    
    if (!dbKey) return res.status(401).json({ error: 'key_not_found' });
    if (dbKey.status !== 'active') return res.status(401).json({ error: 'key_' + dbKey.status });
    if (new Date(dbKey.expires_at) < new Date()) return res.status(401).json({ error: 'key_expired' });
    
    await dbRun('UPDATE api_keys SET last_used_at = $1 WHERE id = $2', [new Date().toISOString(), dbKey.id]);
    
    const user = await dbGet('SELECT id, username, role FROM users WHERE id = $1', [dbKey.user_id]);
    if (!user) return res.status(404).json({ error: 'user_not_found' });
    
    return res.json({
        ok: true,
        token: key,
        user: { id: user.id, username: user.username, role: user.role },
        expiresAt: dbKey.expires_at
    });
}));

/* Dashboard route */
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

/* Boot */
let server;
async function start() {
    await initSchema();
    server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

function shutdown(signal) {
    console.log(`\n${signal} received, shutting down...`);
    const done = () => process.exit(0);
    if (server) server.close(done);
    else done();
    setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
});
