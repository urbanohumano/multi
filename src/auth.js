'use strict';

const crypto = require('crypto');
const { db } = require('./db');

const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expires
  );
  return token;
}

function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Middleware Express: exige un token válido y deja el usuario en req.user. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Necesitas iniciar sesión.' });
  }
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, s.token
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token);
  if (!row) {
    return res.status(401).json({ error: 'La sesión ha caducado. Vuelve a entrar.' });
  }
  req.user = { id: row.id, username: row.username, displayName: row.display_name };
  req.sessionToken = row.token;
  next();
}

module.exports = { hashPassword, verifyPassword, createSession, destroySession, requireAuth };
