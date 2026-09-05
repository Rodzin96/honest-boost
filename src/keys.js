/* src/keys.js — API Key management for PostgreSQL */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('./db');

function generateKey() {
  return 'hb_' + crypto.randomBytes(24).toString('hex');
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function getKeyPrefix(key) {
  return key.slice(0, 8);
}

function calculateExpiry(isPremium = false) {
  const now = new Date();
  // Premium: 1 year. Trial: 4 hours.
  const ttlMs = isPremium ? 365 * 24 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
  return new Date(now.getTime() + ttlMs);
}

function isExpired(expiresAt) {
  return new Date(expiresAt) < new Date();
}

function validateKey(key, storedKey) {
  if (!storedKey) return { valid: false, reason: 'key_not_found' };
  if (storedKey.status === 'revoked') return { valid: false, reason: 'key_revoked' };
  if (isExpired(storedKey.expires_at)) return { valid: false, reason: 'key_expired' };
  
  const keyHash = hashKey(key);
  if (keyHash !== storedKey.key_hash) return { valid: false, reason: 'invalid_key' };
  
  return { valid: true, reason: null };
}

async function createKey(userId, options = {}) {
  const rawKey = generateKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const isPremium = options.keyType === 'premium';
  const expiresAt = calculateExpiry(isPremium).toISOString();

  await run(
    'INSERT INTO api_keys (id, user_id, key_hash, key_prefix, created_at, expires_at, status, device_info, ip_address, key_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [id, userId, keyHash, keyPrefix, createdAt, expiresAt, 'active', options.deviceInfo || null, options.ipAddress || null, options.keyType || 'trial']
  );

  return { id, key: rawKey, prefix: keyPrefix, createdAt, expiresAt, status: 'active', keyType: options.keyType || 'trial' };
}

async function validateAndGetKey(rawKey) {
  const keyHash = hashKey(rawKey);
  const row = await get('SELECT * FROM api_keys WHERE key_hash = $1', [keyHash]);
  if (!row) return { valid: false, reason: 'key_not_found' };
  
  const validation = validateKey(rawKey, row);
  if (!validation.valid) return validation;
  
  return { valid: true, key: row };
}

async function revokeKey(keyId, reason = null) {
  await run('UPDATE api_keys SET status = $1, revoked_at = $2, revoke_reason = $3 WHERE id = $4', ['revoked', new Date().toISOString(), reason, keyId]);
  return true;
}

async function revokeAllUserKeys(userId) {
  await run('UPDATE api_keys SET status = $1, revoked_at = $2 WHERE user_id = $3 AND status = $4', ['revoked', new Date().toISOString(), userId, 'active']);
  return true;
}

async function updateLastUsed(keyId) {
  await run('UPDATE api_keys SET last_used_at = $1 WHERE id = $2', [new Date().toISOString(), keyId]);
}

async function getUserKeys(userId, options = {}) {
  let sql = 'SELECT id, key_prefix, created_at, expires_at, last_used_at, status, device_info, key_type FROM api_keys WHERE user_id = $1';
  const params = [userId];
  
  if (options.status) {
    sql += ' AND status = $2';
    params.push(options.status);
  }
  
  sql += ' ORDER BY created_at DESC';
  
  if (options.limit) {
    sql += ' LIMIT $' + (params.length + 1);
    params.push(options.limit);
  }
  
  return all(sql, params);
}

async function countActiveKeys(userId) {
  const row = await get('SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1 AND status = $2', [userId, 'active']);
  return parseInt(row?.count || 0);
}

async function cleanupExpiredKeys() {
  await run('UPDATE api_keys SET status = $1 WHERE status = $2 AND expires_at < $3', ['expired', 'active', new Date().toISOString()]);
}

async function getKeyById(keyId, userId) {
  return get('SELECT id, key_prefix, created_at, expires_at, last_used_at, status, device_info FROM api_keys WHERE id = $1 AND user_id = $2', [keyId, userId]);
}

module.exports = {
  generateKey, hashKey, getKeyPrefix, calculateExpiry, isExpired, validateKey,
  createKey, validateAndGetKey, revokeKey, revokeAllUserKeys, updateLastUsed,
  getUserKeys, countActiveKeys, cleanupExpiredKeys, getKeyById
};
