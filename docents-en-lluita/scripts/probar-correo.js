'use strict';

/*
 * Envía un correo de prueba con la configuración actual.
 * Uso: node scripts/probar-correo.js destinatario@correo
 * (en el VPS: docents-en-lluita probar-correo destinatario@correo)
 */

const { config } = require('../src/config');
const { sendMail, mode } = require('../src/mailer');

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Uso: node scripts/probar-correo.js destinatario@correo');
  process.exit(2);
}

(async () => {
  console.log(`Enviando por «${mode}» desde ${config.mailFrom} a ${to}…`);
  const ok = await sendMail({
    tipo: 'prueba',
    to,
    subject: 'Prueba de correo · Docents en Lluita',
    text:
      `Si lees esto, la plataforma de moscosos ya puede enviar correos.\n\n` +
      `Remitente: ${config.mailFrom}\n` +
      `Respuestas a: ${config.replyTo || '(el remitente)'}\n` +
      `Web: ${config.publicUrl}\n`,
  });
  if (ok && mode === 'prueba') {
    console.log('⚠️  No hay RESEND_API_KEY ni SMTP_HOST: el correo solo se ha guardado en data/outbox/.');
  } else if (ok) {
    console.log('✔ Enviado. Revisa la bandeja de entrada (y la carpeta de spam).');
  } else {
    console.error('✘ No se pudo enviar. Comprueba RESEND_API_KEY y que el dominio de MAIL_FROM esté verificado en Resend.');
  }
  process.exit(ok ? 0 : 1);
})();
