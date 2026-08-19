/* src/middleware/auth.js — Authentication and authorization middleware */

const crypto = require('crypto');
const { validateAndGetKey } = require('../keys');

/**
 * Require authenticated session
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ 
    error: 'not_authenticated', 
    loginUrl: '/login.html' 
  });
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  if (req.session && req.session.user) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return res.status(401).json({ 
    error: 'not_authenticated', 
    loginUrl: '/login.html' 
  });
}

/**
 * Require API key authentication (for app)
 * Validates the key and attaches user info to request
 */
async function requireApiKey(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const key = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!key) {
    return res.status(401).json({ error: 'missing_api_key' });
  }

  try {
    const db = req.app.locals.db || global.db;
    if (!db) {
      return res.status(500).json({ error: 'database_not_available' });
    }
    const result = await validateAndGetKey(db, key);
    
    if (!result.valid) {
      const status = result.reason === 'key_expired' ? 401 : 401;
      return res.status(status).json({ 
        error: result.reason,
        message: getErrorMessage(result.reason)
      });
    }

    // Update last used timestamp
    const { updateLastUsed } = require('../keys');
    await updateLastUsed(req.app.locals.db, result.key.id);

    // Attach user info to request
    req.apiKey = result.key;
    req.user = { id: result.key.user_id };
    
    next();
  } catch (err) {
    console.error('API key validation error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

/**
 * Get human-readable error message
 */
function getErrorMessage(reason) {
  const messages = {
    'key_not_found': 'Chave não encontrada.',
    'key_revoked': 'Chave revogada. Gere uma nova.',
    'key_expired': 'Chave expirada. Gere uma nova.',
    'invalid_key': 'Chave inválida.'
  };
  return messages[reason] || 'Erro de autenticação.';
}

/**
 * CSRF protection middleware
 * Validates the CSRF token from the request
 */
function csrfProtection(req, res, next) {
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API key authenticated requests
  if (req.headers.authorization) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body?._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || !crypto.timingSafeEqual(
    Buffer.from(token, 'utf8'),
    Buffer.from(sessionToken, 'utf8')
  )) {
    return res.status(403).json({ error: 'invalid_csrf_token' });
  }

  next();
}

/**
 * Generate a CSRF token and store in session
 */
function generateCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

/**
 * Rate limiter for key generation
 * Limits to 5 keys per hour per user
 */
function keyGenerationLimiter(req, res, next) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 5;

  if (!req.session.keyGenAttempts) {
    req.session.keyGenAttempts = [];
  }

  // Remove old attempts outside the window
  req.session.keyGenAttempts = req.session.keyGenAttempts.filter(
    time => now - time < windowMs
  );

  if (req.session.keyGenAttempts.length >= maxRequests) {
    const oldestAttempt = req.session.keyGenAttempts[0];
    const retryAfter = Math.ceil((windowMs - (now - oldestAttempt)) / 1000);
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Muitas chaves geradas. Tente novamente em alguns minutos.',
      retryAfter
    });
  }

  req.session.keyGenAttempts.push(now);
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireApiKey,
  csrfProtection,
  generateCsrfToken,
  keyGenerationLimiter
};
