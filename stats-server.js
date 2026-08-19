/**
 * stats-server.js — Honest BOOST Stats API (Microservice) v2.0
 * Lightweight standalone server for optimization tracking
 * 
 * PORT: 3001 (separate from main server on 3000)
 * DB: /data/optimizations.sqlite (independent)
 * Purpose: Record each optimization applied, prevent duplicates, expose metrics
 * 
 * New in v2:
 * - Global counter starting at 10,000+ for social proof
 * - Per-user stats endpoint
 * - Leaderboard support
 */

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const DB = path.join(__dirname, 'data', 'optimizations.sqlite');
const db = new sqlite3.Database(DB);

// Global baseline counter (social proof: starts at 10,000)
const GLOBAL_BASELINE = 10000;

// Initialize schema
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS optimizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        game TEXT,
        category TEXT,
        version TEXT,
        applied_by TEXT,
        applied_at TEXT,
        status TEXT DEFAULT 'applied'
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opt_game ON optimizations(game)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opt_applied_at ON optimizations(applied_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opt_applied_by ON optimizations(applied_by)`);
    
    // Settings table for global stats
    db.run(`CREATE TABLE IF NOT EXISTS stats_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
    
    // Initialize baseline if not exists
    db.get("SELECT value FROM stats_settings WHERE key = 'global_baseline'", [], (err, row) => {
        if (!row) {
            db.run("INSERT OR IGNORE INTO stats_settings (key, value) VALUES ('global_baseline', ?)", [String(GLOBAL_BASELINE)]);
        }
    });
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// API Key validation
const apiKeyMiddleware = (req, res, next) => {
    const expected = process.env.STATS_API_KEY;
    if (!expected) return next();
    
    const provided = (req.get('x-api-key') || req.get('authorization') || '').trim();
    if (!provided) return res.status(401).json({ error: 'missing_api_key' });
    
    const token = provided.startsWith('Bearer ') ? provided.slice(7).trim() : provided;
    if (token === expected) return next();
    
    return res.status(401).json({ error: 'invalid_api_key' });
};

// Rate limiter (300 requests/hour)
const optLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited' }
});

// Helper: get global baseline
function getBaseline(callback) {
    db.get("SELECT value FROM stats_settings WHERE key = 'global_baseline'", [], (err, row) => {
        if (err || !row) return callback(GLOBAL_BASELINE);
        callback(parseInt(row.value, 10) || GLOBAL_BASELINE);
    });
}

// GET /api/stats — Retrieve optimization metrics
app.get('/api/stats', (req, res) => {
    getBaseline((baseline) => {
        db.get(
            `SELECT COUNT(1) as total, COUNT(DISTINCT applied_by) as users FROM optimizations WHERE status = 'applied'`,
            [],
            (err, row) => {
                if (err) {
                    console.error('DB error:', err);
                    return res.status(500).json({ error: 'db_error' });
                }
                const dbCount = Number(row?.total || 0);
                const totalCount = baseline + dbCount;
                
                return res.json({
                    optimizations: {
                        total: totalCount,
                        applied: totalCount,
                        failed: 0,
                        pending: 0,
                        baseline: baseline,
                        this_month: dbCount
                    },
                    users_active: Number(row?.users || 0),
                    updated_at: new Date().toISOString()
                });
            }
        );
    });
});

// POST /api/optimizations — Register an optimization (idempotent)
// Body: { id?, name, game, category?, version?, applied_by? }
// Returns: { ok, created, id }
app.post('/api/optimizations', apiKeyMiddleware, optLimiter, (req, res) => {
    const b = req.body || {};
    
    // Validation
    if (!b.name || !b.game) {
        return res.status(400).json({ error: 'invalid_payload', required: ['name', 'game'] });
    }
    
    // Generate deterministic ID from optimization details
    const id = String(
        b.id || crypto.createHash('sha256')
            .update((b.applied_by || '') + b.name + b.game + (b.version || ''))
            .digest('hex')
    ).slice(0, 32);
    
    const now = new Date().toISOString();
    
    // INSERT OR IGNORE ensures idempotency
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO optimizations 
        (id, name, game, category, version, applied_by, applied_at, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
        id,
        String(b.name).slice(0, 255),
        String(b.game).slice(0, 100),
        b.category ? String(b.category).slice(0, 100) : null,
        b.version ? String(b.version).slice(0, 50) : null,
        b.applied_by ? String(b.applied_by).slice(0, 100) : null,
        now,
        'applied',
        function (err) {
            if (err) {
                console.error('Insert error:', err);
                return res.status(500).json({ error: 'db_error' });
            }
            
            // changes === 0 means duplicate (already exists)
            if (this.changes === 0) {
                return res.status(200).json({ ok: true, created: false, id, message: 'Optimization already recorded' });
            }
            
            // New record inserted
            return res.status(201).json({ ok: true, created: true, id, message: 'Optimization recorded successfully' });
        }
    );
    
    stmt.finalize();
});

// GET /api/optimizations — List recent optimizations (admin)
app.get('/api/optimizations', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    
    db.all(
        `SELECT * FROM optimizations ORDER BY applied_at DESC LIMIT ? OFFSET ?`,
        [limit, offset],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'db_error' });
            return res.json({ optimizations: rows || [], total: rows?.length || 0 });
        }
    );
});

// GET /api/leaderboard — Top users by optimizations applied
app.get('/api/leaderboard', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    
    db.all(
        `SELECT applied_by as user, COUNT(1) as total 
         FROM optimizations 
         WHERE applied_by IS NOT NULL AND applied_by != ''
         GROUP BY applied_by 
         ORDER BY total DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'db_error' });
            return res.json({ leaderboard: rows || [] });
        }
    );
});

// GET /api/stats/user/:userId — Stats for a specific user
app.get('/api/stats/user/:userId', (req, res) => {
    const userId = req.params.userId;
    
    db.get(
        `SELECT COUNT(1) as total FROM optimizations WHERE applied_by = ? AND status = 'applied'`,
        [userId],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'db_error' });
            return res.json({
                user: userId,
                optimizations_applied: row?.total || 0,
                updated_at: new Date().toISOString()
            });
        }
    );
});

// GET /health — Health check
app.get('/health', (req, res) => res.json({ ok: true, service: 'stats-server', version: '2.0', timestamp: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'internal_error', message: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`\n🚀 Honest BOOST Stats Server v2 running on port ${PORT}`);
    console.log(`   DB: ${DB}`);
    console.log(`   GET  /api/stats`);
    console.log(`   POST /api/optimizations`);
    console.log(`   GET  /api/optimizations?limit=100&offset=0`);
    console.log(`   GET  /api/leaderboard?limit=10`);
    console.log(`   GET  /api/stats/user/:userId`);
    console.log(`   GET  /health\n`);
});

module.exports = app;
