'use strict';

/*
 * Prueba del envío por Resend contra una API simulada en local:
 * cabeceras y cuerpo, límite de envíos por segundo, reintentos con la misma
 * Idempotency-Key, errores que no se reintentan y registro en la tabla `correos`.
 *
 * Uso: node test/resend.js  (incluida en npm test)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const requests = [];
const calls = new Map();

// Cada destinatario provoca una respuesta distinta de la «API de Resend».
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = JSON.parse(raw);
    const to = body.to[0];
    const n = (calls.get(to) || 0) + 1;
    calls.set(to, n);
    requests.push({ at: Date.now(), headers: req.headers, url: req.url, body });
    const reply = (status, data, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(data));
    };
    if (to.startsWith('limite@') && n === 1) {
      return reply(429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, { 'retry-after': '0' });
    }
    if (to.startsWith('caido@') && n <= 2) return reply(500, { name: 'internal_server_error', message: 'Boom' }, { 'retry-after': '0' });
    if (to.startsWith('cuota@')) return reply(429, { name: 'daily_quota_exceeded', message: 'Quota exceeded' });
    if (to.startsWith('malo@')) return reply(422, { name: 'validation_error', message: 'Invalid `to` field' });
    reply(200, { id: `email_${requests.length}` });
  });
});

mock.listen(0, '127.0.0.1', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'docents-en-lluita-resend-'));
  process.env.RESEND_API_KEY = 're_prueba_123';
  process.env.RESEND_API_URL = `http://127.0.0.1:${mock.address().port}`;
  process.env.RESEND_MAX_PER_SECOND = '10';
  process.env.MAIL_FROM = 'Docents en Lluita <moscosos@ejemplo.org>';
  process.env.CONTACT_EMAIL = 'organitzacio@ejemplo.org';
  process.env.SMTP_HOST = '';

  try {
    const { sendMail, mode } = require('../src/mailer');
    const { db } = require('../src/db');
    assert.strictEqual(mode, 'resend');

    // Petición bien formada.
    assert.ok(await sendMail({ tipo: 'prueba', to: 'ok@edu.gva.es', subject: 'Hola', text: 'Texto' }));
    const first = requests[0];
    assert.strictEqual(first.url, '/emails');
    assert.strictEqual(first.headers.authorization, 'Bearer re_prueba_123');
    assert.ok(first.headers['idempotency-key'], 'Lleva Idempotency-Key');
    assert.ok(first.headers['user-agent'].startsWith('docents-en-lluita'));
    assert.deepStrictEqual(first.body, {
      from: 'Docents en Lluita <moscosos@ejemplo.org>',
      to: ['ok@edu.gva.es'],
      subject: 'Hola',
      text: 'Texto',
      reply_to: 'organitzacio@ejemplo.org',
    });
    console.log('✔ Petición a la API de Resend');

    // No pasa del límite por segundo aunque se envíe todo a la vez.
    requests.length = 0;
    const many = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => sendMail({ tipo: 'prueba', to: `ok${i}@edu.gva.es`, subject: 'x', text: 'x' }))
    );
    assert.ok(many.every(Boolean));
    for (let i = 1; i < requests.length; i++) {
      const gap = requests[i].at - requests[i - 1].at;
      assert.ok(gap >= 90, `Separación entre envíos de ${gap} ms (mínimo 100 ms a 10/s)`);
    }
    console.log('✔ Respeta el límite de envíos por segundo');

    // 429 de ritmo y 5xx: se reintenta con la misma clave de idempotencia.
    requests.length = 0;
    assert.ok(await sendMail({ tipo: 'prueba', to: 'limite@edu.gva.es', subject: 'x', text: 'x' }));
    assert.strictEqual(requests.length, 2);
    assert.strictEqual(requests[0].headers['idempotency-key'], requests[1].headers['idempotency-key']);
    assert.ok(await sendMail({ tipo: 'prueba', to: 'caido@edu.gva.es', subject: 'x', text: 'x' }));
    assert.strictEqual(calls.get('caido@edu.gva.es'), 3);
    console.log('✔ Reintentos sin duplicar correos');

    // Cuota agotada o datos inválidos: no se reintenta y queda anotado el error.
    const originalError = console.error;
    console.error = () => {};
    const quota = await sendMail({ tipo: 'prueba', to: 'cuota@edu.gva.es', subject: 'x', text: 'x' });
    const invalid = await sendMail({ tipo: 'prueba', to: 'malo@edu.gva.es', subject: 'x', text: 'x' });
    console.error = originalError;
    assert.strictEqual(quota, false);
    assert.strictEqual(invalid, false);
    assert.strictEqual(calls.get('cuota@edu.gva.es'), 1, 'La cuota agotada no se reintenta');
    assert.strictEqual(calls.get('malo@edu.gva.es'), 1);
    const row = db.prepare("SELECT * FROM correos WHERE para = 'malo@edu.gva.es'").get();
    assert.strictEqual(row.estado, 'error');
    assert.match(row.error, /422 validation_error/);
    console.log('✔ Errores definitivos registrados sin reintentar');

    // La aplicación completa usa Resend: el código de acceso sale por la API.
    const { app } = require('../server');
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const salud = await (await fetch(`${base}/api/salud`)).json();
    assert.deepStrictEqual(salud, { ok: true, correo: 'resend' });
    const res = await fetch(`${base}/api/acceso/codigo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'profe@edu.gva.es' }),
    });
    assert.strictEqual(res.status, 200);
    const codeMail = requests.find((r) => r.body.to[0] === 'profe@edu.gva.es');
    assert.match(codeMail.body.subject, /código de acceso: \d{6}/);
    server.close();
    console.log('✔ El acceso por código envía por Resend');

    console.log('\nResend en orden ✅');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Fallo en la prueba de Resend:', err.stack || err.message);
    process.exit(1);
  }
});
