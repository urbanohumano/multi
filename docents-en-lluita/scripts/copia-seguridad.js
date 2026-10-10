'use strict';

/*
 * Copia de seguridad en caliente de la base de datos en DATA_DIR/copias/.
 * En el VPS la lanza cada noche un temporizador de systemd. Guarda las últimas
 * BACKUP_KEEP copias (14 por defecto). Las autorizaciones no se copian: se
 * borran solas tras cada jornada y no deben acumularse en más sitios.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { config } = require('../src/config');

const keep = Number.parseInt(process.env.BACKUP_KEEP, 10) || 14;
const dir = path.join(config.dataDir, 'copias');
fs.mkdirSync(dir, { recursive: true, mode: 0o750 });

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const target = path.join(dir, `docents-en-lluita-${stamp}.db`);
const db = new Database(path.join(config.dataDir, 'docents-en-lluita.db'), { fileMustExist: true });

db.backup(target)
  .then(() => {
    db.close();
    const copias = fs.readdirSync(dir).filter((f) => /^docents-en-lluita-.*\.db$/.test(f)).sort();
    for (const old of copias.slice(0, Math.max(0, copias.length - keep))) fs.rmSync(path.join(dir, old));
    console.log(`Copia guardada en ${target} (${Math.min(copias.length, keep)} copias en total).`);
  })
  .catch((err) => {
    console.error('No se pudo hacer la copia de seguridad:', err.message);
    process.exit(1);
  });
