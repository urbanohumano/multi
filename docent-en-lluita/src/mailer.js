'use strict';

/*
 * Envío de correo. Con SMTP_HOST configurado usa SMTP (Brevo, Resend, Gmail,
 * el servidor del sindicato…). Sin SMTP, modo desarrollo: cada correo se guarda
 * como JSON en data/outbox/ y se muestra en consola.
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { config } = require('./config');
const { db } = require('./db');

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      pool: true,
      maxConnections: 3,
    })
  : null;

const devMode = !transport;
let outboxSeq = 0;

function writeOutbox(message) {
  const name = `${Date.now()}-${String(++outboxSeq).padStart(6, '0')}.json`;
  fs.writeFileSync(path.join(config.outboxDir, name), JSON.stringify(message, null, 2));
  if (process.env.NODE_ENV !== 'test') {
    console.log(`\n✉️  [sin SMTP] Para: ${message.to}\n   Asunto: ${message.subject}\n${message.text.replace(/^/gm, '   ')}\n`);
  }
}

/**
 * Envía un correo de texto y lo deja anotado en la tabla `correos`.
 * Nunca lanza: devuelve true/false para poder seguir con el resto de envíos.
 */
async function sendMail({ to, subject, text, tipo, jornadaId = null, reservaId = null }) {
  const message = { from: config.mailFrom, to, subject, text };
  let error = null;
  try {
    if (transport) await transport.sendMail(message);
    else writeOutbox(message);
  } catch (err) {
    error = String(err.message || err);
    console.error(`No se pudo enviar el correo a ${to}:`, error);
  }
  db.prepare(
    `INSERT INTO correos (tipo, para, asunto, jornada_id, reserva_id, estado, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(tipo, to, subject, jornadaId, reservaId, error ? 'error' : 'enviado', error);
  return !error;
}

/** Solo en modo desarrollo/pruebas: correos guardados en data/outbox, del más antiguo al más nuevo. */
function readOutbox() {
  return fs
    .readdirSync(config.outboxDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(config.outboxDir, f), 'utf8')));
}

module.exports = { sendMail, readOutbox, devMode };
