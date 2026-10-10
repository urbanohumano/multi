'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('./config');

for (const dir of [config.dataDir, config.uploadsDir, config.outboxDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(path.join(config.dataDir, 'docent-en-lluita.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

db.exec(`
  CREATE TABLE IF NOT EXISTS docentes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nombre     TEXT NOT NULL DEFAULT '',
    centro     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Códigos de acceso de un solo uso enviados al correo corporativo.
  CREATE TABLE IF NOT EXISTS codigos (
    email      TEXT PRIMARY KEY COLLATE NOCASE,
    code_hash  TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    intentos   INTEGER NOT NULL DEFAULT 0,
    enviado_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    token_hash TEXT PRIMARY KEY,
    docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  -- Una jornada = un día de moscosos en una provincia, con N entradas.
  CREATE TABLE IF NOT EXISTS jornadas (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha                   TEXT NOT NULL,
    provincia               TEXT NOT NULL CHECK (provincia IN ('alacant', 'castello', 'valencia')),
    plazas                  INTEGER NOT NULL CHECK (plazas > 0),
    estado                  TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada', 'cancelada')),
    punto_tipo              TEXT CHECK (punto_tipo IN ('acto', 'dt')),
    punto_titulo            TEXT,
    punto_lugar             TEXT,
    punto_hora              TEXT,
    punto_notas             TEXT,
    punto_publicado_at      TEXT,
    convocatoria_enviada_at TEXT,
    created_at              TEXT NOT NULL DEFAULT ${NOW},
    UNIQUE (fecha, provincia)
  );

  CREATE TABLE IF NOT EXISTS reservas (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    jornada_id        INTEGER NOT NULL REFERENCES jornadas(id) ON DELETE CASCADE,
    docente_id        INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
    localidad         INTEGER NOT NULL,
    codigo            TEXT NOT NULL UNIQUE,
    nombre            TEXT NOT NULL,
    centro            TEXT NOT NULL,
    autorizacion_path TEXT,
    autorizacion_tipo TEXT,
    estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'validada', 'rechazada', 'cancelada')),
    motivo_rechazo    TEXT,
    asistio           INTEGER,
    created_at        TEXT NOT NULL DEFAULT ${NOW},
    updated_at        TEXT NOT NULL DEFAULT ${NOW}
  );

  -- Una localidad no puede estar ocupada dos veces, ni una persona tener dos
  -- entradas activas en la misma jornada. Las canceladas/rechazadas liberan sitio.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_localidad
    ON reservas (jornada_id, localidad) WHERE estado IN ('pendiente', 'validada');
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_docente
    ON reservas (jornada_id, docente_id) WHERE estado IN ('pendiente', 'validada');

  -- Registro de todos los correos enviados (o fallidos).
  CREATE TABLE IF NOT EXISTS correos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo       TEXT NOT NULL,
    para       TEXT NOT NULL,
    asunto     TEXT NOT NULL,
    jornada_id INTEGER REFERENCES jornadas(id) ON DELETE CASCADE,
    reserva_id INTEGER REFERENCES reservas(id) ON DELETE CASCADE,
    estado     TEXT NOT NULL CHECK (estado IN ('enviado', 'error')),
    error      TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
`);

const ACTIVE = "('pendiente', 'validada')";

module.exports = { db, ACTIVE };
