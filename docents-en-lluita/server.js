'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');

const { config, PROVINCIAS } = require('./src/config');
const { db } = require('./src/db');
const auth = require('./src/auth');
const J = require('./src/jornadas');
const { authorizationPath } = require('./src/archivos');
const { devMode, mode: mailMode } = require('./src/mailer');

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(auth.loadSession);

// Defensa extra contra CSRF (además de la cookie SameSite=Strict).
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* origen inválido */ }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido.' });
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10 },
});

/** Envuelve un manejador (síncrono o async) y traduce HttpError a JSON. */
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof J.HttpError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// ---------------------------------------------------------------- Público

app.get('/api/config', (req, res) => {
  res.json({
    provincias: Object.fromEntries(Object.entries(PROVINCIAS).map(([k, p]) => [k, { nombre: p.nombre, dt: p.dt }])),
    dominio: config.allowedDomain,
    diasSemana: config.weekdays,
    plazasPorDefecto: config.seatsPerJornada,
    contacto: config.contactEmail,
    diasConservacion: config.retentionDays,
    maxArchivoMb: Math.round(config.maxUploadBytes / 1024 / 1024),
    horaAvisoDt: config.fallbackHour,
    modoDesarrollo: devMode,
  });
});

// Comprobación de que el servicio está vivo (la usa el instalador).
app.get('/api/salud', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true, correo: mailMode });
});

app.get('/api/jornadas', (req, res) => {
  res.json({ jornadas: J.listPublicJornadas() });
});

// ----------------------------------------------------------------- Acceso

app.post('/api/acceso/codigo', wrap(async (req, res) => {
  const result = await auth.requestCode(req.body?.email, req.ip);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
}));

app.post('/api/acceso/verificar', (req, res) => {
  const result = auth.verifyCode(req.body?.email, req.body?.codigo);
  if (result.error) return res.status(result.status).json({ error: result.error });
  auth.setSessionCookie(res, result.token);
  res.json({ docente: result.docente });
});

app.post('/api/acceso/salir', (req, res) => {
  if (req.sessionTokenHash) auth.destroySession(req.sessionTokenHash);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/yo', (req, res) => {
  res.json({ docente: req.docente });
});

// ------------------------------------------------------------ Mis entradas

app.get('/api/mis-entradas', auth.requireAuth, (req, res) => {
  res.json({ reservas: J.misReservas(req.docente.id) });
});

app.post(
  '/api/jornadas/:id/reservar',
  auth.requireAuth,
  (req, res, next) => {
    upload.single('autorizacion')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `La autorización no puede superar ${config.maxUploadBytes / 1024 / 1024} MB.` });
      }
      res.status(400).json({ error: 'No se ha podido leer el formulario.' });
    });
  },
  wrap(async (req, res) => {
    const reserva = await J.reservar(req.params.id, req.docente, {
      nombre: req.body.nombre,
      centro: req.body.centro,
      acepto: req.body.acepto,
      archivo: req.file?.buffer,
    });
    res.status(201).json({ reserva: { id: reserva.id, localidad: reserva.localidad, codigo: reserva.codigo } });
  })
);

app.delete('/api/mis-entradas/:id', auth.requireAuth, wrap((req, res) => {
  J.cancelarReserva(Number(req.params.id), req.docente.id);
  res.json({ ok: true });
}));

// ------------------------------------------------------------ Organización

const admin = express.Router();
admin.use(auth.requireAdmin);

admin.get('/jornadas', (req, res) => {
  res.json({ jornadas: J.adminJornadas() });
});

admin.post('/jornadas', wrap((req, res) => {
  res.status(201).json({ jornada: J.crearJornada(req.body || {}) });
}));

admin.post('/jornadas/generar', (req, res) => {
  res.json({ creadas: J.ensureUpcomingJornadas() });
});

admin.get('/jornadas/:id', wrap((req, res) => {
  res.json({ jornada: J.adminJornadaById(req.params.id), reservas: J.adminReservas(req.params.id) });
}));

admin.patch('/jornadas/:id', wrap((req, res) => {
  const { plazas, estado } = req.body || {};
  res.json({ jornada: J.actualizarJornada(req.params.id, { plazas, estado }) });
}));

admin.put('/jornadas/:id/punto', wrap((req, res) => {
  res.json({ jornada: J.setPunto(req.params.id, req.body || {}) });
}));

admin.post('/jornadas/:id/convocatoria', wrap(async (req, res) => {
  const { destinatarios, actualizacion, done } = await J.enviarConvocatoria(req.params.id);
  done.catch((err) => console.error('Error enviando la convocatoria:', err));
  res.status(202).json({ destinatarios, actualizacion });
}));

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita fórmulas al abrirlo en una hoja de cálculo
  return `"${s.replace(/"/g, '""')}"`;
};

admin.get('/jornadas/:id/reservas.csv', wrap((req, res) => {
  const j = J.getJornada(req.params.id);
  const rows = J.adminReservas(j.id);
  const header = ['localidad', 'codigo', 'nombre', 'email', 'centro', 'estado', 'motivo_rechazo', 'asistio', 'reservada'];
  const lines = [header.join(',')].concat(
    rows.map((r) =>
      [r.localidad, r.codigo, r.nombre, r.email, r.centro, r.estado, r.motivo_rechazo,
        r.asistio === null ? '' : r.asistio ? 'si' : 'no', r.created_at].map(csvCell).join(',')
    )
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="entradas-${j.provincia}-${j.fecha}.csv"`);
  res.send(`﻿${lines.join('\r\n')}\r\n`);
}));

admin.post('/reservas/:id/validar', wrap((req, res) => {
  J.validarReserva(req.params.id);
  res.json({ ok: true });
}));

admin.post('/reservas/:id/rechazar', wrap(async (req, res) => {
  await J.rechazarReserva(req.params.id, req.body?.motivo);
  res.json({ ok: true });
}));

admin.post('/reservas/:id/asistencia', wrap((req, res) => {
  const value = req.body?.asistio;
  J.marcarAsistencia(req.params.id, value === null || value === undefined ? null : Boolean(value));
  res.json({ ok: true });
}));

admin.get('/reservas/:id/autorizacion', wrap((req, res) => {
  const r = J.getReserva(req.params.id);
  if (!r.autorizacion_path) {
    return res.status(404).json({ error: 'La autorización ya no está disponible (cancelada o borrada por antigüedad).' });
  }
  const ext = path.extname(r.autorizacion_path);
  res.setHeader('Content-Type', r.autorizacion_tipo);
  res.setHeader('Content-Disposition', `inline; filename="autorizacion-${r.localidad}-${r.codigo}${ext}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(authorizationPath(r.autorizacion_path));
}));

app.use('/api/admin', admin);

// ------------------------------------------------------------------ Arranque

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error inesperado del servidor.' });
});

if (require.main === module) {
  J.startScheduler();
  app.listen(config.port, config.host, () => {
    console.log(`Docents en Lluita escuchando en ${config.host}:${config.port} · ${config.publicUrl} · correo: ${mailMode}`);
    if (devMode) console.log('⚠️  Sin RESEND_API_KEY ni SMTP_HOST: los correos se guardan en data/outbox/ y se muestran aquí.');
    if (!config.adminEmails.length) console.log('⚠️  ADMIN_EMAILS está vacío: nadie puede entrar al panel de organización.');
  });
}

module.exports = { app, db };
