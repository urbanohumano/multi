'use strict';

/*
 * Envío de correo, por orden de preferencia:
 *  1. Resend por su API HTTPS (RESEND_API_KEY): no depende de puertos SMTP del VPS.
 *  2. SMTP (SMTP_HOST): cualquier otro proveedor.
 *  3. Modo de prueba: cada correo se guarda como JSON en data/outbox/ y se muestra en consola.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { config } = require('./config');
const { db } = require('./db');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cliente mínimo de la API de Resend. Los envíos pasan de uno en uno por una cola
 * que respeta el límite de peticiones por segundo; los 429 y 5xx se reintentan con
 * la misma Idempotency-Key, así que un reintento nunca duplica un correo.
 */
function createResendTransport({ apiKey, apiUrl, perSecond }) {
  const interval = Math.ceil(1000 / Math.max(1, perSecond));
  let queue = Promise.resolve();
  let lastAt = 0;

  function nextSlot() {
    const slot = queue.then(async () => {
      const wait = lastAt + interval - Date.now();
      if (wait > 0) await sleep(wait);
      lastAt = Date.now();
    });
    queue = slot;
    return slot;
  }

  async function sendMail({ from, to, subject, text, replyTo }) {
    const idempotencyKey = crypto.randomUUID();
    const body = JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) });
    for (let attempt = 1; ; attempt++) {
      await nextSlot();
      let res;
      let data = {};
      try {
        res = await fetch(`${apiUrl}/emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'User-Agent': 'docents-en-lluita/1.0',
          },
          body,
          signal: AbortSignal.timeout(15000),
        });
        data = await res.json().catch(() => ({}));
      } catch (err) {
        if (attempt < 4) {
          await sleep(1000 * attempt);
          continue;
        }
        throw new Error(`Resend no responde: ${err.message}`);
      }
      if (res.ok) return data;

      // Superar la cuota diaria/mensual no se arregla reintentando.
      const quota = /quota/.test(data.name || '');
      if ((res.status === 429 && !quota) || res.status >= 500) {
        if (attempt < 4) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 1000 * attempt);
          continue;
        }
      }
      throw new Error(`Resend ${res.status} ${data.name || ''}: ${data.message || res.statusText}`.trim());
    }
  }

  return { sendMail };
}

let transport = null;
let mode = 'prueba';
if (config.resend.apiKey) {
  transport = createResendTransport(config.resend);
  mode = 'resend';
} else if (config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    pool: true,
    maxConnections: 3,
  });
  mode = 'smtp';
}

const devMode = !transport;
let outboxSeq = 0;

function writeOutbox(message) {
  const name = `${Date.now()}-${String(++outboxSeq).padStart(6, '0')}.json`;
  fs.writeFileSync(path.join(config.outboxDir, name), JSON.stringify(message, null, 2));
  if (process.env.NODE_ENV !== 'test') {
    console.log(`\n✉️  [sin servidor de correo] Para: ${message.to}\n   Asunto: ${message.subject}\n${message.text.replace(/^/gm, '   ')}\n`);
  }
}

/**
 * Envía un correo de texto y lo deja anotado en la tabla `correos`.
 * Nunca lanza: devuelve true/false para poder seguir con el resto de envíos.
 */
async function sendMail({ to, subject, text, tipo, jornadaId = null, reservaId = null }) {
  const message = { from: config.mailFrom, to, subject, text };
  if (config.replyTo) message.replyTo = config.replyTo;
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

module.exports = { sendMail, readOutbox, devMode, mode, createResendTransport };
