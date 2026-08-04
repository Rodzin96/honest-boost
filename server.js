let dotenv;
try { dotenv = require('dotenv'); dotenv.config(); } catch (e) { console.warn('dotenv not installed or unavailable'); }
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = process.env.PORT || 3000;

// If MP_ACCESS_TOKEN not in environment, try loading env.env (project-specific)
if(!process.env.MP_ACCESS_TOKEN){
    const altEnv = path.join(__dirname, 'env.env');
    if(fs.existsSync(altEnv)){
        if (dotenv && typeof dotenv.config === 'function') {
            dotenv.config({ path: altEnv });
            console.log('Loaded environment from env.env');
        }
    }
}

// Ensure data directory exists and open DB
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// --- SQLite reliability settings ---
// Enable WAL journal mode for better concurrency (readers don't block writers)
// and a small safety net against corruption on crash. busy_timeout makes
// writes wait briefly for locks instead of failing immediately.
db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA foreign_keys = ON');
    db.run(`PRAGMA busy_timeout = 5000`);
});

// --- Simple startup-time backup hook ---
// Creates a timestamped copy of the DB file at boot. Honors BACKUP_DIR env var
// (defaults to <dataDir>/backups). This is a minimal safeguard; for
// production, run an external cron / systemd timer for real backups.
function createStartupBackup() {
    try {
        const backupDir = process.env.BACKUP_DIR || path.join(dataDir, 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const dest = path.join(backupDir, `database-${ts}.sqlite`);
        fs.copyFile(dbPath, dest, (err) => {
            if (err) console.error('Startup backup failed:', err);
            else console.log(`Startup backup created: ${dest}`);
        });
    } catch (err) {
        console.error('Backup hook error:', err);
    }
}
if (process.env.SKIP_STARTUP_BACKUP !== '1') createStartupBackup();

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
// Security headers (CSP allows the third-party assets used by the landing page)
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "https://cdnjs.cloudflare.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            "font-src": ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "data:"],
            "img-src": ["'self'", "data:", "blob:"],
            "connect-src": ["'self'"],
            "frame-ancestors": ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in production. Refusing to boot with an insecure default.');
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'devsecret-not-for-production';
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

// Passport init
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    db.get('SELECT id, username, role FROM users WHERE id = ?', [id], (err, row) => {
        if(err) return done(err);
        done(null, row);
    });
});

// Google OAuth strategy
const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
if (hasGoogle) {
passport.use(new GoogleStrategy({
        // Mark this strategy as registered only when config is complete

        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
    }, (accessToken, refreshToken, profile, done) => {
        const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || (`google_${profile.id}`);
        db.get('SELECT id, username, role FROM users WHERE username = ?', [email], (err, row) => {
            if (err) return done(err);
            if (row) return done(null, row);
            const createdAt = new Date().toISOString();
            const stmt = db.prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)');
            stmt.run(email, null, 'user', createdAt, function (err3) {
                if (err3) return done(err3);
                db.get('SELECT id, username, role FROM users WHERE id = ?', [this.lastID], (err4, newRow) => done(err4, newRow));
            });
            stmt.finalize();
        });
    }));
}


// Simple health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Session-based auth helpers
function requireAuth(req, res, next){
    if(req.session && req.session.user) return next();
    return res.status(401).json({ error: 'not_authenticated' });
}
function requireAdmin(req, res, next){
    if(req.session && req.session.user && req.session.user.role === 'admin') return next();
    return res.status(403).json({ error: 'forbidden' });
}

// --- Rate limiters (brute-force protection) ---
const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,              // 5 attempts per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_attempts', retryAfter: 60 }
});
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,                   // 3 reset requests per hour per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_attempts', retryAfter: 3600 }
});
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_attempts', retryAfter: 3600 }
});

// --- Input validation helpers (lightweight, no extra dep) ---
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRODUCT_ENUM = new Set(['starter', 'pro']);
function validateCredentials({ username, password }) {
    const errors = [];
    if (typeof username !== 'string' || !username.trim()) errors.push('username_required');
    else if (username.length > 254) errors.push('username_too_long');
    if (typeof password !== 'string' || password.length < 8) errors.push('password_too_short');
    else if (password.length > 200) errors.push('password_too_long');
    return errors;
}
function validateEmailField(email) {
    if (email === undefined || email === null || email === '') return null; // optional
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) return 'invalid_email';
    return null;
}
function validateProductField(product) {
    if (product === undefined || product === null || product === '') return 'pro';
    if (typeof product !== 'string' || !PRODUCT_ENUM.has(product)) return null;
    return product;
}

// Serve admin panel
app.get('/admin', (req, res) => {
    if(req.session && req.session.user && req.session.user.role === 'admin'){
        return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    }
    return res.redirect('/login.html');
});

// Download info (somente logado)
app.get('/api/download', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            error: 'not_authenticated',
            loginUrl: '/login.html'
        });
    }

    // Serve the real installer if it has been placed in public/downloads/.
    // Fall back to the placeholder README so the download flow can still be
    // smoke-tested end-to-end before the signed binary ships.
    const downloadsDir = path.join(__dirname, 'public', 'downloads');
    const installerCandidates = [
        'honest-boost-installer.exe',
        'HonestBoost-setup.exe',
        'honest-boost-setup.exe'
    ];
    for (const name of installerCandidates) {
        if (fs.existsSync(path.join(downloadsDir, name))) {
            return res.json({
                url: `/downloads/${name}`,
                filename: name,
                size: 'installer',
                note: 'Instalador oficial Honest Boost.'
            });
        }
    }

    return res.json({
        url: '/downloads/README.txt',
        filename: 'HonestBoost-README.txt',
        size: 'placeholder',
        note: 'Real installer not yet published. See README.txt for instructions.'
    });
});


// --- INTEGRAÃ‡ÃƒO CAKTO ---

const CAKTO_CHECKOUT_URL = 'https://pay.cakto.com.br/4rya5gd_968804';

function createLocalOrderAndLicense(product, email, req) {
    return new Promise((resolve, reject) => {
        const orderId = 'LOCAL-' + uuidv4().split('-')[0].toUpperCase();
        const createdAt = new Date().toISOString();
        const amount = (product === 'starter') ? 4700 : 9700;
        const stmtO = db.prepare('INSERT INTO orders (order_id, email, product, amount, created_at) VALUES (?,?,?,?,?)');
        stmtO.run(orderId, email, product, amount, createdAt, function(err) {
            if (err) return reject(err);
            const licenseKey = uuidv4().toUpperCase().replace(/-/g, '').slice(0, 20);
            const stmtL = db.prepare('INSERT INTO licenses (license_key, email, product, status, created_at) VALUES (?,?,?,?,?)');
            stmtL.run(licenseKey, email, product, 'active', createdAt, function(err2) {
                if (err2) return reject(err2);
                const successUrl = `${req.headers.origin || `http://localhost:${PORT}`}/success.html?order=${encodeURIComponent(orderId)}&license=${encodeURIComponent(licenseKey)}`;
                resolve({ orderId, licenseKey, successUrl });
            });
            stmtL.finalize();
        });
        stmtO.finalize();
    });
}

async function createPreferenceHandler(req, res) {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const rawProduct = body.product || 'pro';
        const product = PRODUCT_ENUM.has(rawProduct) ? rawProduct : 'pro';
        const email = body.email || '';
        const emailErr = email ? validateEmailField(email) : null;
        if (emailErr) return res.status(400).json({ error: emailErr });
        // Create a pending local order + license (status 'active' for now; in a
        // production setup this would be 'pending' and activated via webhook).
        const local = await createLocalOrderAndLicense(product, email, req);
        return res.json({
            checkoutUrl: CAKTO_CHECKOUT_URL,
            paymentProvider: 'cakto',
            product,
            email,
            orderId: local.orderId,
            license: local.licenseKey,
            successUrl: local.successUrl
        });
    } catch (error) {
        console.error('Erro Cakto:', error);
        return res.status(500).json({ error: 'Erro ao iniciar checkout Cakto' });
    }
}

// Rota para criar preferÃªncia de pagamento
app.post('/api/create-checkout-session', createPreferenceHandler);
app.post('/api/create-preference', createPreferenceHandler);

// Rota de sucesso (Simula webhook/processamento pÃ³s-pagamento)
app.get('/api/order-success', (req, res) => {
    const { product, email } = req.query;
    const orderId = 'MP-' + uuidv4().split('-')[0].toUpperCase();
    const createdAt = new Date().toISOString();
    const amount = (product === 'starter') ? 4700 : 9700;

    // Salva ordem no banco
    const stmtO = db.prepare('INSERT INTO orders (order_id, email, product, amount, created_at) VALUES (?,?,?,?,?)');
    stmtO.run(orderId, email, product, amount, createdAt, function(err){
        if(err){
            console.error(err);
            return res.redirect('/checkout.html?error=db');
        }

        // Gera licenÃ§a
        const licenseKey = uuidv4().toUpperCase().replace(/-/g, '').slice(0,20);
        const stmtL = db.prepare('INSERT INTO licenses (license_key, email, product, status, created_at) VALUES (?,?,?,?,?)');
        stmtL.run(licenseKey, email, product, 'active', createdAt, function(err2){
            if(err2){
                console.error(err2);
                return res.redirect('/checkout.html?error=db');
            }
            // Redireciona para pÃ¡gina de sucesso local com a licenÃ§a
            res.redirect(`/success.html?order=${orderId}&license=${licenseKey}`);
        });
        stmtL.finalize();
    });
    stmtO.finalize();
});

// Fake payment processor (mantido para fallback ou testes manuais sem MP)
app.post('/api/fake-pay', (req, res) => {
    const { product = 'pro', email = '' } = req.body;
    const orderId = 'FAKE-' + uuidv4().split('-')[0].toUpperCase();
    const createdAt = new Date().toISOString();
    const amount = (product === 'starter') ? 4700 : 9700;
    const stmtO = db.prepare('INSERT INTO orders (order_id, email, product, amount, created_at) VALUES (?,?,?,?,?)');
    stmtO.run(orderId, email, product, amount, createdAt, function(err){
        if(err){
            console.error(err);
            return res.status(500).json({ error: 'db_error' });
        }
        const licenseKey = uuidv4().toUpperCase().replace(/-/g, '').slice(0,20);
        const stmtL = db.prepare('INSERT INTO licenses (license_key, email, product, status, created_at) VALUES (?,?,?,?,?)');
        stmtL.run(licenseKey, email, product, 'active', createdAt, function(err2){
            if(err2){
                console.error(err2);
                return res.status(500).json({ error: 'db_error' });
            }
            const successUrl = `${req.headers.origin}/success.html?order=${encodeURIComponent(orderId)}&license=${encodeURIComponent(licenseKey)}`;
            return res.json({ ok: true, orderId, license: licenseKey, successUrl });
        });
        stmtL.finalize();
    });
    stmtO.finalize();
});

// Webhook placeholder (para receber notificaÃ§Ãµes reais do MP no futuro)
app.post('/webhook', (req, res) => {
    console.log('Webhook received', req.body);
    res.status(200).send('ok');
});

// Generate license (admin/manual) â€” generates a UUID-derived license key and
// inserts a new row in the licenses table with status 'active'.
app.post('/api/licenses', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { email = '', product = 'pro' } = body;

    // Validate email (optional field, but if present must be well-formed)
    if (email) {
        const emailErr = validateEmailField(email);
        if (emailErr) return res.status(400).json({ error: emailErr });
    }

    // Validate product against the allowed enum
    if (product && !PRODUCT_ENUM.has(product)) {
        return res.status(400).json({ error: 'invalid_product', allowed: Array.from(PRODUCT_ENUM) });
    }

    // Use UUIDv4 (no slicing) â€” full 32-hex-char key for stronger entropy.
    const licenseKey = uuidv4().replace(/-/g, '').toUpperCase();
    const createdAt = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO licenses (license_key, email, product, status, created_at) VALUES (?,?,?,?,?)');
    stmt.run(licenseKey, email, product, 'active', createdAt, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'db_error' });
        }
        res.json({ license: licenseKey, email, product, status: 'active', created_at: createdAt });
    });
    stmt.finalize();
});

// User registration (public signups are always created as 'user')
app.post('/api/register', registerLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    const credErrors = validateCredentials({ username, password });
    if (credErrors.length) return res.status(400).json({ error: 'validation_error', fields: credErrors });
    const createdAt = new Date().toISOString();
    const hash = await bcrypt.hash(password, 10);
    // Force role 'user' for all public signups. Admin accounts are
    // provisioned only via env (see end of file) or directly in DB.
    const stmt = db.prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)');
    stmt.run(username, hash, 'user', createdAt, function(err){
        if(err){
            console.error(err);
            return res.status(500).json({ error: 'db_error' });
        }
        res.json({ username, role: 'user', created_at: createdAt });
    });
    stmt.finalize();
});

// Password reset request
app.post('/api/password-reset-request', (req, res) => {
    const { username } = req.body;
    if(!username) return res.status(400).json({ error: 'missing_username' });
    db.get('SELECT id, username FROM users WHERE username = ?', [username], (err, row) => {
        if(err) return res.status(500).json({ error: 'db_error' });
        if(!row) return res.status(404).json({ error: 'user_not_found' });
        const token = uuidv4().replace(/-/g,'');
        const expires = Date.now() + (1000 * 60 * 60);
        db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, row.id], (err2) => {
            if(err2) return res.status(500).json({ error: 'db_error' });
            const resetLink = `${req.headers.origin}/reset.html?token=${token}`;
            const smtpHost = process.env.SMTP_HOST;
            if(smtpHost && process.env.SMTP_USER && process.env.SMTP_PASS){
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT) || 587,
                    secure: Number(process.env.SMTP_PORT) === 465,
                    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                });
                const from = process.env.SMTP_FROM || 'noreply@localhost';
                const mailOpts = {
                    from,
                    to: row.username,
                    subject: 'Recuperação de senha - Honest Boost',
                    text: `Link: ${resetLink}`,
                    html: `<p><a href="${resetLink}">${resetLink}</a></p>`
                };
                transporter.sendMail(mailOpts, (errMail) => {
                    if(errMail){
                        console.error('Error sending reset email', errMail);
                        return res.json({ ok: true, token, note: 'email_error' });
                    }
                    return res.json({ ok: true, message: 'email_sent' });
                });
            } else {
                console.log(`Password reset token for ${row.username}: ${token}`);
                return res.json({ ok: true, token });
            }
        });
    });
});

// Password reset confirm
app.post('/api/password-reset-confirm', async (req, res) => {
    const { token, newPassword } = req.body;
    if(!token || !newPassword) return res.status(400).json({ error: 'missing_fields' });
    // Enforce the same minimum password length as registration
    const pwErrors = validateCredentials({ username: 'reset-user', password: newPassword });
    if (pwErrors.includes('password_too_short') || pwErrors.includes('password_too_long')) {
        return res.status(400).json({ error: 'invalid_password', hint: 'A senha deve ter entre 8 e 200 caracteres.' });
    }
    db.get('SELECT id, reset_expires FROM users WHERE reset_token = ?', [token], async (err, row) => {
        if(err) return res.status(500).json({ error: 'db_error' });
        if(!row) return res.status(404).json({ error: 'invalid_token' });
        if(!row.reset_expires || Number(row.reset_expires) < Date.now()) return res.status(400).json({ error: 'token_expired' });
        const hash = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hash, row.id], (err2) => {
            if(err2) return res.status(500).json({ error: 'db_error' });
            res.json({ ok: true });
        });
    });
});

// Login
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ error: 'missing_fields' });
    }
    db.get('SELECT id, username, password_hash, role FROM users WHERE username = ?', [username], async (err, row) => {
        if(err) {
            console.error(err);
            return res.status(500).json({ error: 'db_error' });
        }
        if(!row) return res.status(401).json({ error: 'invalid_credentials' });
        const ok = await bcrypt.compare(password, row.password_hash);
        if(!ok) return res.status(401).json({ error: 'invalid_credentials' });
        req.session.user = { id: row.id, username: row.username, role: row.role };
        res.json({ ok: true, user: req.session.user });
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(()=> res.json({ ok: true }));
});

// List licenses (admin)
app.get('/api/licenses', requireAdmin, (req, res) => {
    db.all('SELECT id, license_key, email, product, status, created_at FROM licenses ORDER BY id DESC LIMIT 200', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'db_error' });
        res.json(rows);
    });
});

// Google OAuth routes (only when Google strategy is configured)
app.get('/auth/google', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(503).json({ error: 'google_not_configured' });
    }
    return passport.authenticate('google', { scope: ['profile','email'] })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.redirect('/login.html');
    }
    return passport.authenticate('google', { failureRedirect: '/login.html' }, (err, user) => {
        if (err) return next(err);
        if (!user) return res.redirect('/login.html');
        req.logIn(user, (loginErr) => {
            if (loginErr) return next(loginErr);
            if (req.user && req.user.role === 'admin') return res.redirect('/admin');
            return res.redirect('/');
        });
    })(req, res, next);
});


// Simple order creation for testing
app.post('/api/orders', (req, res) => {
    const { email = '', product = 'pro', amount = 9700 } = req.body;
    const orderId = 'ORD-' + uuidv4().split('-')[0].toUpperCase();
    const createdAt = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO orders (order_id, email, product, amount, created_at) VALUES (?,?,?,?,?)');
    stmt.run(orderId, email, product, amount, createdAt, function(err){
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'db_error' });
        }
        res.json({ orderId, email, product, amount, createdAt });
    });
    stmt.finalize();
});

app.listen(PORT, () => console.log('Server running on port', PORT));

// Ensure admin user exists
if(process.env.ADMIN_USER && process.env.ADMIN_PASS){
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    db.get('SELECT id FROM users WHERE username = ?', [adminUser], async (err, row) => {
        if(err) return console.error('Error checking admin user', err);
        if(row) return console.log('Admin user exists');
        const hash = await bcrypt.hash(adminPass, 10);
        const createdAt = new Date().toISOString();
        db.run('INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)', [adminUser, hash, 'admin', createdAt], (err2) => {
            if(err2) return console.error('Error creating admin user', err2);
            console.log(`Admin user ${adminUser} created`);
        });
    });
}
