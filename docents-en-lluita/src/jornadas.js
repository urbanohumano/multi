'use strict';

/*
 * Lógica de las jornadas: entradas (localidades), reservas, punto de encuentro,
 * convocatoria por correo y tareas programadas.
 */

const crypto = require('crypto');
const { config, PROVINCIAS } = require('./config');
const { db, ACTIVE } = require('./db');
const { sendMail } = require('./mailer');
const { madridNow, addDays, isoWeekday, isValidDate, formatFecha } = require('./dates');
const { saveAuthorization, deleteAuthorization } = require('./archivos');
const { purgeExpiredAuth } = require('./auth');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const nowIso = () => new Date().toISOString();
const provinciaNombre = (p) => PROVINCIAS[p]?.nombre || p;

function getJornada(id) {
  const j = db.prepare('SELECT * FROM jornadas WHERE id = ?').get(id);
  if (!j) throw new HttpError(404, 'Esa jornada no existe.');
  return j;
}

function occupiedSeats(jornadaId) {
  return db
    .prepare(`SELECT localidad FROM reservas WHERE jornada_id = ? AND estado IN ${ACTIVE} ORDER BY localidad`)
    .all(jornadaId)
    .map((r) => r.localidad);
}

/** Se puede reservar hasta el día anterior (hora peninsular). */
function isOpen(j, today = madridNow().fecha) {
  return j.estado === 'abierta' && j.fecha > today;
}

function publicJornada(j, today) {
  const ocupadas = occupiedSeats(j.id);
  return {
    id: j.id,
    fecha: j.fecha,
    fechaTexto: formatFecha(j.fecha),
    provincia: j.provincia,
    provinciaNombre: provinciaNombre(j.provincia),
    plazas: j.plazas,
    ocupadas,
    libres: Math.max(0, j.plazas - ocupadas.length),
    estado: j.estado,
    abierta: isOpen(j, today),
    puntoPublicado: Boolean(j.punto_publicado_at),
  };
}

function listPublicJornadas() {
  const today = madridNow().fecha;
  return db
    .prepare(
      `SELECT * FROM jornadas WHERE fecha >= ? AND estado <> 'cancelada'
        ORDER BY fecha, provincia`
    )
    .all(today)
    .map((j) => publicJornada(j, today));
}

function punto(j) {
  if (!j.punto_publicado_at) return null;
  return {
    tipo: j.punto_tipo,
    titulo: j.punto_titulo,
    lugar: j.punto_lugar,
    hora: j.punto_hora,
    notas: j.punto_notas || '',
    publicadoAt: j.punto_publicado_at,
  };
}

function puntoTexto(j) {
  const p = punto(j);
  if (!p) return '';
  return [
    `    ${p.titulo}`,
    `    Lugar: ${p.lugar}`,
    `    Hora: ${p.hora}`,
    p.notas ? `    ${p.notas.replace(/\n/g, '\n    ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

// ------------------------------------------------------------------ Reservas

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function ticketCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Reserva la primera localidad libre. La autorización (PDF/JPG/PNG) es obligatoria.
 * better-sqlite3 es síncrono, así que la transacción no puede intercalarse con otra
 * petición: dos personas nunca se llevan la misma localidad.
 */
async function reservar(jornadaId, docente, { nombre, centro, acepto, archivo }) {
  const j = getJornada(jornadaId);
  if (!isOpen(j)) throw new HttpError(409, 'Las reservas para esta jornada están cerradas.');

  nombre = clean(nombre, 120);
  centro = clean(centro, 160);
  if (nombre.length < 3) throw new HttpError(400, 'Escribe tu nombre y apellidos.');
  if (centro.length < 3) throw new HttpError(400, 'Indica tu centro educativo (nombre y localidad).');
  if (!['true', 'on', '1'].includes(String(acepto))) {
    throw new HttpError(400, 'Tienes que aceptar el tratamiento de datos para reservar.');
  }
  if (!archivo) {
    throw new HttpError(400, 'Falta la autorización del día de permiso firmada por la dirección del centro.');
  }

  const saved = saveAuthorization(archivo);
  if (!saved) throw new HttpError(400, 'La autorización tiene que ser un PDF o una foto (JPG o PNG).');

  let reservaId;
  try {
    reservaId = db.transaction(() => {
      const mismoDia = db
        .prepare(
          `SELECT j.provincia FROM reservas r JOIN jornadas j ON j.id = r.jornada_id
            WHERE r.docente_id = ? AND j.fecha = ? AND r.estado IN ${ACTIVE}`
        )
        .get(docente.id, j.fecha);
      if (mismoDia) {
        throw new HttpError(
          409,
          mismoDia.provincia === j.provincia
            ? 'Ya tienes una entrada para esta jornada.'
            : `Ya tienes entrada para ese día en ${provinciaNombre(mismoDia.provincia)}.`
        );
      }
      const taken = new Set(occupiedSeats(j.id));
      let localidad = 1;
      while (taken.has(localidad)) localidad++;
      if (localidad > j.plazas) throw new HttpError(409, 'Entradas agotadas para esta jornada.');

      let codigo = ticketCode();
      while (db.prepare('SELECT 1 FROM reservas WHERE codigo = ?').get(codigo)) codigo = ticketCode();

      const info = db
        .prepare(
          `INSERT INTO reservas (jornada_id, docente_id, localidad, codigo, nombre, centro, autorizacion_path, autorizacion_tipo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(j.id, docente.id, localidad, codigo, nombre, centro, saved.filename, saved.mime);
      db.prepare('UPDATE docentes SET nombre = ?, centro = ? WHERE id = ?').run(nombre, centro, docente.id);
      return info.lastInsertRowid;
    })();
  } catch (err) {
    deleteAuthorization(saved.filename);
    throw err;
  }

  const reserva = getReserva(reservaId);
  await sendConfirmation(reserva, j);
  return reserva;
}

function getReserva(id) {
  const r = db
    .prepare(
      `SELECT r.*, d.email FROM reservas r JOIN docentes d ON d.id = r.docente_id WHERE r.id = ?`
    )
    .get(id);
  if (!r) throw new HttpError(404, 'Esa reserva no existe.');
  return r;
}

function sendConfirmation(r, j) {
  const p = puntoTexto(j);
  const text =
    `Hola, ${r.nombre}:\n\n` +
    `Tienes la entrada nº ${r.localidad} de ${j.plazas} para la jornada de moscosos del ` +
    `${formatFecha(j.fecha)} en ${provinciaNombre(j.provincia)}.\n` +
    `Código de entrada: ${r.codigo}\n\n` +
    (p
      ? `PUNTO DE ENCUENTRO\n${p}\n\n`
      : `¿Y ahora qué?\n` +
        `- La organización revisará la autorización que has subido.\n` +
        `- Entre 24 y 48 horas antes te enviaremos por correo el punto de encuentro: el acto\n` +
        `  institucional del President o de la Consellera en tu provincia o, si no hay ninguno,\n` +
        `  la Direcció Territorial d'Educació.\n\n`) +
    `Si al final no puedes venir, libera tu entrada para que la aproveche otra persona:\n` +
    `${config.publicUrl}/#mis-entradas\n\n` +
    `Docents en Lluita\n`;
  return sendMail({
    tipo: 'confirmacion',
    to: r.email,
    subject: `Entrada nº ${r.localidad} · ${provinciaNombre(j.provincia)} · ${formatFecha(j.fecha)}`,
    text,
    jornadaId: j.id,
    reservaId: r.id,
  });
}

function misReservas(docenteId) {
  const today = madridNow().fecha;
  return db
    .prepare(
      `SELECT r.*, j.fecha, j.provincia, j.plazas, j.estado AS jornada_estado,
              j.punto_tipo, j.punto_titulo, j.punto_lugar, j.punto_hora, j.punto_notas, j.punto_publicado_at
         FROM reservas r JOIN jornadas j ON j.id = r.jornada_id
        WHERE r.docente_id = ? AND r.estado <> 'cancelada'
        ORDER BY j.fecha DESC, r.id DESC`
    )
    .all(docenteId)
    .map((r) => ({
      id: r.id,
      jornadaId: r.jornada_id,
      fecha: r.fecha,
      fechaTexto: formatFecha(r.fecha),
      provincia: r.provincia,
      provinciaNombre: provinciaNombre(r.provincia),
      plazas: r.plazas,
      localidad: r.localidad,
      codigo: r.codigo,
      nombre: r.nombre,
      centro: r.centro,
      estado: r.estado,
      motivoRechazo: r.motivo_rechazo,
      jornadaEstado: r.jornada_estado,
      pasada: r.fecha < today,
      cancelable: ['pendiente', 'validada'].includes(r.estado) && r.fecha >= today,
      punto: r.estado === 'rechazada' ? null : punto(r),
    }));
}

function cancelarReserva(id, docenteId) {
  const r = getReserva(id);
  if (r.docente_id !== docenteId) throw new HttpError(404, 'Esa reserva no existe.');
  if (!['pendiente', 'validada'].includes(r.estado)) throw new HttpError(409, 'Esa entrada ya no está activa.');
  db.prepare("UPDATE reservas SET estado = 'cancelada', updated_at = ? WHERE id = ?").run(nowIso(), id);
  deleteAuthorization(r.autorizacion_path);
  db.prepare('UPDATE reservas SET autorizacion_path = NULL WHERE id = ?').run(id);
}

// ------------------------------------------------------------ Organización

function adminJornadas() {
  const desde = addDays(madridNow().fecha, -14);
  const today = madridNow().fecha;
  return db
    .prepare(
      `SELECT j.*,
              (SELECT COUNT(*) FROM reservas r WHERE r.jornada_id = j.id AND r.estado = 'pendiente') AS pendientes,
              (SELECT COUNT(*) FROM reservas r WHERE r.jornada_id = j.id AND r.estado = 'validada') AS validadas,
              (SELECT COUNT(*) FROM reservas r WHERE r.jornada_id = j.id AND r.estado = 'rechazada') AS rechazadas,
              (SELECT COUNT(*) FROM reservas r WHERE r.jornada_id = j.id AND r.asistio = 1) AS asistentes
         FROM jornadas j WHERE j.fecha >= ?
        ORDER BY j.fecha, j.provincia`
    )
    .all(desde)
    .map((j) => adminJornada(j, today));
}

function adminJornada(j, today = madridNow().fecha) {
  const envios = db
    .prepare(
      `SELECT estado, COUNT(*) AS n FROM correos
        WHERE jornada_id = ? AND tipo = 'convocatoria' GROUP BY estado`
    )
    .all(j.id);
  const count = (estado) => envios.find((e) => e.estado === estado)?.n || 0;
  return {
    ...publicJornada(j, today),
    pendientes: j.pendientes,
    validadas: j.validadas,
    rechazadas: j.rechazadas,
    asistentes: j.asistentes,
    punto: punto(j),
    puntoDt: PROVINCIAS[j.provincia].dt,
    convocatoriaEnviadaAt: j.convocatoria_enviada_at,
    convocatoriaEnviando: sending.has(j.id),
    correosConvocatoria: { enviados: count('enviado'), errores: count('error') },
  };
}

function adminJornadaById(id) {
  const j = db
    .prepare(
      `SELECT j.*,
              (SELECT COUNT(*) FROM reservas r WHERE r.jornada_id = j.id AND r.estado = 'pendiente') AS pendientes,
              (SELECT COUNT(*) FROM reservas r WHERE r.jornada_id = j.id AND r.estado = 'validada') AS validadas,
              (SELECT COUNT(*) FROM reservas r WHERE r.jornada_id = j.id AND r.estado = 'rechazada') AS rechazadas,
              (SELECT COUNT(*) FROM reservas r WHERE r.jornada_id = j.id AND r.asistio = 1) AS asistentes
         FROM jornadas j WHERE j.id = ?`
    )
    .get(id);
  if (!j) throw new HttpError(404, 'Esa jornada no existe.');
  return adminJornada(j);
}

function adminReservas(jornadaId) {
  getJornada(jornadaId);
  return db
    .prepare(
      `SELECT r.id, r.localidad, r.codigo, r.nombre, r.centro, d.email, r.estado, r.motivo_rechazo,
              r.asistio, r.created_at, r.autorizacion_path IS NOT NULL AS tiene_autorizacion
         FROM reservas r JOIN docentes d ON d.id = r.docente_id
        WHERE r.jornada_id = ?
        ORDER BY r.estado IN ${ACTIVE} DESC, r.localidad`
    )
    .all(jornadaId);
}

function crearJornada({ fecha, provincia, plazas }) {
  if (!isValidDate(fecha)) throw new HttpError(400, 'Fecha no válida.');
  if (fecha < madridNow().fecha) throw new HttpError(400, 'No se pueden crear jornadas en el pasado.');
  if (!PROVINCIAS[provincia]) throw new HttpError(400, 'Provincia no válida.');
  plazas = Number.parseInt(plazas, 10) || config.seatsPerJornada;
  if (plazas < 1 || plazas > 5000) throw new HttpError(400, 'Número de entradas no válido.');
  try {
    const info = db
      .prepare('INSERT INTO jornadas (fecha, provincia, plazas) VALUES (?, ?, ?)')
      .run(fecha, provincia, plazas);
    return adminJornadaById(info.lastInsertRowid);
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Ya existe una jornada ese día en esa provincia.');
    throw err;
  }
}

/** Crea las jornadas de los próximos días configurados (por defecto, miércoles) en las 3 provincias. */
function ensureUpcomingJornadas(now = new Date()) {
  const today = madridNow(now).fecha;
  const insert = db.prepare(
    'INSERT INTO jornadas (fecha, provincia, plazas) VALUES (?, ?, ?) ON CONFLICT (fecha, provincia) DO NOTHING'
  );
  let created = 0;
  db.transaction(() => {
    for (let i = 1; i <= config.weeksAhead * 7; i++) {
      const fecha = addDays(today, i);
      if (!config.weekdays.includes(isoWeekday(fecha))) continue;
      for (const provincia of Object.keys(PROVINCIAS)) {
        created += insert.run(fecha, provincia, config.seatsPerJornada).changes;
      }
    }
  })();
  return created;
}

function actualizarJornada(id, { plazas, estado }) {
  const j = getJornada(id);
  if (plazas !== undefined) {
    plazas = Number.parseInt(plazas, 10);
    if (!(plazas >= 1 && plazas <= 5000)) throw new HttpError(400, 'Número de entradas no válido.');
    const maxSeat = Math.max(0, ...occupiedSeats(id));
    if (plazas < maxSeat) {
      throw new HttpError(409, `La localidad nº ${maxSeat} está ocupada: no puedes bajar de ${maxSeat} entradas.`);
    }
    db.prepare('UPDATE jornadas SET plazas = ? WHERE id = ?').run(plazas, id);
  }
  if (estado !== undefined) {
    if (!['abierta', 'cerrada', 'cancelada'].includes(estado)) throw new HttpError(400, 'Estado no válido.');
    db.prepare('UPDATE jornadas SET estado = ? WHERE id = ?').run(estado, id);
    if (estado === 'cancelada' && j.estado !== 'cancelada') notifyCancellation(getJornada(id));
  }
  return adminJornadaById(id);
}

async function notifyCancellation(j) {
  for (const r of activeReservas(j.id)) {
    await sendMail({
      tipo: 'cancelacion',
      to: r.email,
      subject: `Jornada cancelada · ${provinciaNombre(j.provincia)} · ${formatFecha(j.fecha)}`,
      text:
        `Hola, ${r.nombre}:\n\n` +
        `La organización ha cancelado la jornada de moscosos del ${formatFecha(j.fecha)} en ` +
        `${provinciaNombre(j.provincia)}. Tu entrada nº ${r.localidad} queda sin efecto.\n\n` +
        `Consulta las próximas jornadas en ${config.publicUrl}\n\nDocents en Lluita\n`,
      jornadaId: j.id,
      reservaId: r.id,
    });
  }
}

function activeReservas(jornadaId) {
  return db
    .prepare(
      `SELECT r.*, d.email FROM reservas r JOIN docentes d ON d.id = r.docente_id
        WHERE r.jornada_id = ? AND r.estado IN ${ACTIVE} ORDER BY r.localidad`
    )
    .all(jornadaId);
}

function validarReserva(id) {
  const r = getReserva(id);
  if (!['pendiente', 'validada'].includes(r.estado)) throw new HttpError(409, 'Esa entrada ya no está activa.');
  db.prepare("UPDATE reservas SET estado = 'validada', updated_at = ? WHERE id = ?").run(nowIso(), id);
  return getReserva(id);
}

/** Rechazar libera la localidad y avisa a la persona con el motivo. */
async function rechazarReserva(id, motivo) {
  const r = getReserva(id);
  if (!['pendiente', 'validada'].includes(r.estado)) throw new HttpError(409, 'Esa entrada ya no está activa.');
  motivo = clean(motivo, 300);
  if (!motivo) throw new HttpError(400, 'Indica el motivo del rechazo (la persona lo recibirá por correo).');
  db.prepare("UPDATE reservas SET estado = 'rechazada', motivo_rechazo = ?, updated_at = ? WHERE id = ?").run(
    motivo,
    nowIso(),
    id
  );
  const j = getJornada(r.jornada_id);
  await sendMail({
    tipo: 'rechazo',
    to: r.email,
    subject: `Entrada anulada · ${provinciaNombre(j.provincia)} · ${formatFecha(j.fecha)}`,
    text:
      `Hola, ${r.nombre}:\n\n` +
      `La organización ha revisado tu reserva para la jornada del ${formatFecha(j.fecha)} en ` +
      `${provinciaNombre(j.provincia)} y la ha anulado por este motivo:\n\n    ${motivo}\n\n` +
      `Si es un error (por ejemplo, subiste un documento equivocado), puedes volver a reservar ` +
      `con la autorización correcta mientras queden entradas: ${config.publicUrl}\n\nDocents en Lluita\n`,
    jornadaId: j.id,
    reservaId: r.id,
  });
  return getReserva(id);
}

function marcarAsistencia(id, asistio) {
  getReserva(id);
  db.prepare('UPDATE reservas SET asistio = ?, updated_at = ? WHERE id = ?').run(
    asistio === null ? null : asistio ? 1 : 0,
    nowIso(),
    id
  );
  return getReserva(id);
}

// ---------------------------------------------------------- Punto de encuentro

function setPunto(id, { tipo, titulo, lugar, hora, notas }) {
  const j = getJornada(id);
  if (!['acto', 'dt'].includes(tipo)) throw new HttpError(400, 'Tipo de punto de encuentro no válido.');
  const dt = PROVINCIAS[j.provincia].dt;
  titulo = clean(titulo, 200) || (tipo === 'dt' ? dt.titulo : '');
  lugar = clean(lugar, 200) || (tipo === 'dt' ? dt.lugar : '');
  hora = clean(hora, 5) || config.defaultMeetingTime;
  notas = String(notas || '').trim().slice(0, 1000);
  if (!titulo) throw new HttpError(400, 'Describe el acto (quién, qué y dónde).');
  if (!lugar) throw new HttpError(400, 'Indica el lugar del punto de encuentro.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new HttpError(400, 'La hora debe tener el formato HH:MM.');
  db.prepare(
    `UPDATE jornadas SET punto_tipo = ?, punto_titulo = ?, punto_lugar = ?, punto_hora = ?,
            punto_notas = ?, punto_publicado_at = ? WHERE id = ?`
  ).run(tipo, titulo, lugar, hora, notas, nowIso(), id);
  return adminJornadaById(id);
}

// Jornadas cuya convocatoria se está enviando ahora mismo.
const sending = new Set();

/**
 * Envía el punto de encuentro a todas las entradas activas. Si ya se había
 * enviado antes, el asunto avisa de que es una actualización.
 */
async function enviarConvocatoria(id) {
  const j = getJornada(id);
  if (!j.punto_publicado_at) throw new HttpError(409, 'Primero guarda el punto de encuentro.');
  if (j.estado === 'cancelada') throw new HttpError(409, 'La jornada está cancelada.');
  if (sending.has(j.id)) throw new HttpError(409, 'La convocatoria ya se está enviando.');

  const reservas = activeReservas(j.id);
  const actualizacion = Boolean(j.convocatoria_enviada_at);
  db.prepare('UPDATE jornadas SET convocatoria_enviada_at = ? WHERE id = ?').run(nowIso(), j.id);
  sending.add(j.id);

  const done = (async () => {
    let enviados = 0;
    try {
      for (const r of reservas) {
        const ok = await sendMail({
          tipo: 'convocatoria',
          to: r.email,
          subject:
            `${actualizacion ? '[ACTUALIZACIÓN] ' : ''}Punto de encuentro · ` +
            `${provinciaNombre(j.provincia)} · ${formatFecha(j.fecha)}`,
          text:
            `Hola, ${r.nombre}:\n\n` +
            (actualizacion ? 'Hay cambios en la convocatoria. ' : '') +
            `Este es el punto de encuentro de la jornada de moscosos del ${formatFecha(j.fecha)} ` +
            `en ${provinciaNombre(j.provincia)}:\n\n` +
            `${puntoTexto(j)}\n\n` +
            `Tu entrada: nº ${r.localidad} · código ${r.codigo}\n` +
            `Lleva contigo la autorización del día de permiso.\n\n` +
            `Si ya no puedes venir, libera tu entrada: ${config.publicUrl}/#mis-entradas\n\n` +
            `Docents en Lluita\n`,
          jornadaId: j.id,
          reservaId: r.id,
        });
        if (ok) enviados++;
      }
    } finally {
      sending.delete(j.id);
    }
    return { destinatarios: reservas.length, enviados };
  })();

  return { destinatarios: reservas.length, actualizacion, done };
}

// ------------------------------------------------------------ Tareas programadas

/**
 * Si el día anterior a la hora FALLBACK_HOUR nadie ha publicado un acto
 * institucional, la convocatoria es en la Direcció Territorial d'Educació.
 * (Si el servidor estuvo parado, se recupera la misma mañana, antes de la hora de la cita.)
 */
async function autoFallback(now = new Date()) {
  const { fecha: today, hora } = madridNow(now);
  const tomorrow = addDays(today, 1);
  const meetingHour = Number.parseInt(config.defaultMeetingTime, 10);
  const pending = db
    .prepare(
      `SELECT * FROM jornadas
        WHERE estado <> 'cancelada' AND punto_publicado_at IS NULL
          AND ((fecha = ? AND ? >= ?) OR (fecha = ? AND ? < ?))`
    )
    .all(tomorrow, hora, config.fallbackHour, today, hora, meetingHour);
  const results = [];
  for (const j of pending) {
    setPunto(j.id, { tipo: 'dt' });
    const { done } = await enviarConvocatoria(j.id);
    results.push({ jornadaId: j.id, ...(await done) });
  }
  return results;
}

/** Borra las autorizaciones de jornadas pasadas hace más de RETENTION_DAYS días. */
function purgeOldAuthorizations(now = new Date()) {
  const limite = addDays(madridNow(now).fecha, -config.retentionDays);
  const rows = db
    .prepare(
      `SELECT r.id, r.autorizacion_path FROM reservas r JOIN jornadas j ON j.id = r.jornada_id
        WHERE j.fecha < ? AND r.autorizacion_path IS NOT NULL`
    )
    .all(limite);
  for (const r of rows) {
    deleteAuthorization(r.autorizacion_path);
    db.prepare('UPDATE reservas SET autorizacion_path = NULL WHERE id = ?').run(r.id);
  }
  return rows.length;
}

async function runScheduledTasks(now = new Date()) {
  ensureUpcomingJornadas(now);
  purgeOldAuthorizations(now);
  purgeExpiredAuth();
  await autoFallback(now);
}

function startScheduler() {
  const tick = () => runScheduledTasks().catch((err) => console.error('Error en tareas programadas:', err));
  tick();
  return setInterval(tick, 10 * 60 * 1000);
}

module.exports = {
  HttpError,
  listPublicJornadas,
  publicJornada,
  getJornada,
  reservar,
  getReserva,
  misReservas,
  cancelarReserva,
  adminJornadas,
  adminJornadaById,
  adminReservas,
  crearJornada,
  ensureUpcomingJornadas,
  actualizarJornada,
  validarReserva,
  rechazarReserva,
  marcarAsistencia,
  setPunto,
  enviarConvocatoria,
  autoFallback,
  purgeOldAuthorizations,
  runScheduledTasks,
  startScheduler,
  provinciaNombre,
};
