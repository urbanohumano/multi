'use strict';

const path = require('path');

const env = process.env;

const list = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

/*
 * Direcciones Territoriales de Educación: punto de encuentro por defecto cuando
 * en la provincia no hay ningún acto institucional ese día.
 */
const PROVINCIAS = {
  alacant: {
    nombre: 'Alacant',
    dt: {
      titulo: "Direcció Territorial d'Educació d'Alacant",
      lugar: env.DT_ALACANT || 'C/ Carratalà, 47, 03007 Alacant',
    },
  },
  castello: {
    nombre: 'Castelló',
    dt: {
      titulo: "Direcció Territorial d'Educació de Castelló",
      lugar: env.DT_CASTELLO || 'Av. del Mar, 23, 12003 Castelló de la Plana',
    },
  },
  valencia: {
    nombre: 'València',
    dt: {
      titulo: "Direcció Territorial d'Educació de València",
      lugar: env.DT_VALENCIA || 'C/ Gregorio Gea, 14, 46009 València',
    },
  },
};

const DATA_DIR = env.DATA_DIR || path.join(__dirname, '..', 'data');

const config = {
  port: int(env.PORT, 3000),
  // En el VPS escucha solo en 127.0.0.1: el tráfico entra por Caddy (HTTPS).
  host: env.HOST || '0.0.0.0',
  publicUrl: (env.PUBLIC_URL || `http://localhost:${int(env.PORT, 3000)}`).replace(/\/$/, ''),
  dataDir: DATA_DIR,
  uploadsDir: path.join(DATA_DIR, 'autorizaciones'),
  outboxDir: path.join(DATA_DIR, 'outbox'),

  // Solo se puede reservar con el correo corporativo de la Conselleria.
  allowedDomain: (env.ALLOWED_EMAIL_DOMAIN || 'edu.gva.es').toLowerCase(),
  // Organización: pueden entrar aunque su correo no sea del dominio.
  adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  contactEmail: env.CONTACT_EMAIL || '',

  seatsPerJornada: int(env.SEATS_PER_JORNADA, 100),
  // Días de la semana con jornada (1 = lunes … 5 = viernes). Empezamos por los miércoles.
  weekdays: list(env.WEEKDAYS || '3').map(Number).filter((d) => d >= 1 && d <= 5),
  weeksAhead: int(env.WEEKS_AHEAD, 4),

  // Si a esta hora del día anterior no hay acto publicado, se convoca en la Dirección Territorial.
  fallbackHour: int(env.FALLBACK_HOUR, 18),
  defaultMeetingTime: env.DEFAULT_MEETING_TIME || '11:00',

  // Las autorizaciones se borran estos días después de la jornada.
  retentionDays: int(env.RETENTION_DAYS, 30),
  maxUploadBytes: int(env.MAX_UPLOAD_MB, 5) * 1024 * 1024,

  // Resend por su API HTTPS (recomendado). Si no hay clave, se usa SMTP; si tampoco, modo de prueba.
  resend: {
    apiKey: env.RESEND_API_KEY || '',
    apiUrl: (env.RESEND_API_URL || 'https://api.resend.com').replace(/\/$/, ''),
    // La cuenta admite 10 peticiones por segundo, compartidas con otros proyectos: vamos con margen.
    perSecond: int(env.RESEND_MAX_PER_SECOND, 4),
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: int(env.SMTP_PORT, 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
  },
  mailFrom: env.MAIL_FROM || 'Docents en Lluita <no-reply@localhost>',
  // Las respuestas a los correos llegan a la organización.
  replyTo: env.REPLY_TO || env.CONTACT_EMAIL || '',

  // Detrás de un proxy inverso (nginx, Render, Railway…) pon TRUST_PROXY=1 para ver la IP real.
  trustProxy: env.TRUST_PROXY ? (Number.isFinite(Number(env.TRUST_PROXY)) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY) : false,

  timeZone: 'Europe/Madrid',
};

module.exports = { config, PROVINCIAS };
