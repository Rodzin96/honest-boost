/* src/audit.js — Audit logging for PostgreSQL */
const { run, all, get } = require('./db');

async function log(db, { userId, action, details, ipAddress, userAgent }) {
  const createdAt = new Date().toISOString();
  await run(
    'INSERT INTO audit_logs (user_id, action, details, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId || null, action, details || null, ipAddress || null, userAgent || null, createdAt]
  );
  return { action, createdAt };
}

async function getLogs(options = {}) {
  let sql = `SELECT audit_logs.*, users.username as user_name
             FROM audit_logs
             LEFT JOIN users ON audit_logs.user_id = users.id`;
  const params = [];
  const conditions = [];

  if (options.userId) {
    conditions.push(`audit_logs.user_id = $${params.length + 1}`);
    params.push(options.userId);
  }

  if (options.action) {
    conditions.push(`audit_logs.action = $${params.length + 1}`);
    params.push(options.action);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }

  sql += ` ORDER BY audit_logs.created_at DESC`;

  if (options.limit) {
    sql += ` LIMIT $${params.length + 1}`;
    params.push(options.limit);
  }

  return all(sql, params);
}

async function getUserLogs(userId, limit = 50) {
  return all(
    `SELECT action, details, ip_address, created_at
     FROM audit_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
}

async function getStats(options = {}) {
  let sql = `SELECT
               COUNT(*) as total,
               COUNT(DISTINCT user_id) as unique_users,
               COUNT(CASE WHEN action = 'login' THEN 1 END) as logins,
               COUNT(CASE WHEN action LIKE 'key.%' THEN 1 END) as key_actions
             FROM audit_logs`;
  const params = [];
  const conditions = [];

  if (options.startDate) {
    conditions.push(`created_at >= $${params.length + 1}`);
    params.push(options.startDate);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }

  const row = await get(sql, params);
  return {
    total: parseInt(row?.total || 0),
    uniqueUsers: parseInt(row?.unique_users || 0),
    logins: parseInt(row?.logins || 0),
    keyActions: parseInt(row?.key_actions || 0)
  };
}

module.exports = { log, getLogs, getUserLogs, getStats };
