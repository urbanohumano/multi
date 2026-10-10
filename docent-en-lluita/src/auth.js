'use strict';

/*
 * Acceso sin contraseña: se envía un código de 6 cifras al correo corporativo.
 * Quien lo introduce demuestra que el buzón @edu.gva.es es suyo.
 * La sesión viaja en una cookie HttpOnly + SameSite=Strict.
 */

const crypto = require('crypto');
const { config } = require('./config');
const { db } = require('./db');
const { sendMail } = require('./mailer');

const COOKIE = 'dl_sesion';
const SESSION_DAYS = 30;
const CODE_MINUTES = 15;
const CODE_COOLDOWN_SECONDS = 60;
const MAX_CODE_ATTEMPTS = 5;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isAdminEmail(email) {
  return config.adminEmails.includes(normalizeEmail(email));
}

/** Devuelve un mensaje de error si el correo no puede entrar, o null. */
function emailError(email) {
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) {
    return 'Ese correo no parece válido.';
  }
  if (!email.endsWith(`@${config.allowedDomain}`) && !isAdminEmail(email)) {
    return `Solo se puede entrar con el correo corporativo @${config.allowedDomain}.`;
  }
  return null;
}

// Límite sencillo por IP para que no se pueda bombardear de códigos.
const ipHits = new Map();
function ipAllowed(ip, max = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    ipHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return true;
}

async function requestCode(rawEmail, ip) {
  const email = normalizeEmail(rawEmail);
  const error = emailError(email);
  if (error) return { status: 400, error };

  const previous = db.prepare('SELECT enviado_at FROM codigos WHERE email = ?').get(email);
  if (previous && Date.now() - Date.parse(previous.enviado_at) < CODE_COOLDOWN_SECONDS * 1000) {
    return { status: 429, error: 'Ya te hemos enviado un código hace un momento. Revisa tu correo (y la carpeta de spam).' };
  }
  if (!ipAllowed(ip)) {
    return { status: 429, error: 'Demasiadas peticiones desde esta conexión. Prueba en unos minutos.' };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(
    `INSERT INTO codigos (email, code_hash, expires_at, intentos, enviado_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (email) DO UPDATE SET
       code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       intentos = 0, enviado_at = excluded.enviado_at`
  ).run(email, sha256(`${email}:${code}`), isoIn(CODE_MINUTES * 60 * 1000), new Date().toISOString());

  const sent = await sendMail({
    tipo: 'codigo',
    to: email,
    subject: `Tu código de acceso: ${code}`,
    text:
      `Hola,\n\n` +
      `Tu código para entrar en la plataforma de moscosos de Docent en Lluita es:\n\n` +
      `    ${code}\n\n` +
      `Caduca en ${CODE_MINUTES} minutos. Si no lo has pedido tú, ignora este correo.\n\n` +
      `${config.publicUrl}\n`,
  });
  if (!sent) return { status: 502, error: 'No hemos podido enviar el correo. Inténtalo más tarde.' };
  return { status: 200 };
}

function verifyCode(rawEmail, rawCode) {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || '').replace(/\D/g, '');
  const row = db.prepare('SELECT * FROM codigos WHERE email = ?').get(email);
  if (!row || row.expires_at < new Date().toISOString()) {
    return { status: 401, error: 'El código ha caducado. Pide uno nuevo.' };
  }
  if (row.intentos >= MAX_CODE_ATTEMPTS) {
    return { status: 429, error: 'Demasiados intentos. Pide un código nuevo.' };
  }
  const expected = Buffer.from(row.code_hash, 'hex');
  const given = Buffer.from(sha256(`${email}:${code}`), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    db.prepare('UPDATE codigos SET intentos = intentos + 1 WHERE email = ?').run(email);
    return { status: 401, error: 'Código incorrecto.' };
  }
  db.prepare('DELETE FROM codigos WHERE email = ?').run(email);

  db.prepare('INSERT INTO docentes (email) VALUES (?) ON CONFLICT (email) DO NOTHING').run(email);
  const docente = db.prepare('SELECT * FROM docentes WHERE email = ?').get(email);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sesiones (token_hash, docente_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    docente.id,
    isoIn(SESSION_DAYS * 24 * 60 * 60 * 1000)
  );
  return { status: 200, token, docente: publicDocente(docente) };
}

function publicDocente(d) {
  return { id: d.id, email: d.email, nombre: d.nombre, centro: d.centro, admin: isAdminEmail(d.email) };
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSessionCookie(res, token) {
  const secure = config.publicUrl.startsWith('https://') ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

/** Middleware: deja en req.docente a quien tenga sesión, o null. */
function loadSession(req, res, next) {
  req.docente = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const row = db
      .prepare(
        `SELECT d.* FROM sesiones s JOIN docentes d ON d.id = s.docente_id
          WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(sha256(token), new Date().toISOString());
    if (row) {
      req.docente = publicDocente(row);
      req.sessionTokenHash = sha256(token);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.docente) return res.status(401).json({ error: 'Necesitas entrar con tu correo corporativo.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.docente) return res.status(401).json({ error: 'Necesitas entrar con tu correo.' });
  if (!req.docente.admin) return res.status(403).json({ error: 'Solo para la organización.' });
  next();
}

function destroySession(tokenHash) {
  db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(tokenHash);
}

function purgeExpiredAuth() {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sesiones WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM codigos WHERE expires_at < ?').run(now);
}

module.exports = {
  requestCode,
  verifyCode,
  loadSession,
  requireAuth,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  purgeExpiredAuth,
  publicDocente,
  normalizeEmail,
};
