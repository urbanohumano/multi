'use strict';

/*
 * Autorizaciones firmadas: solo PDF, JPEG o PNG, comprobado por los primeros
 * bytes del archivo (no nos fiamos de la extensión ni del tipo que diga el navegador).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('./config');

const TYPES = [
  { ext: '.pdf', mime: 'application/pdf', magic: Buffer.from('%PDF-') },
  { ext: '.jpg', mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  { ext: '.png', mime: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
];

function detectType(buffer) {
  return TYPES.find((t) => buffer.length > t.magic.length && buffer.subarray(0, t.magic.length).equals(t.magic)) || null;
}

/** Guarda el archivo con un nombre aleatorio y devuelve { filename, mime }. */
function saveAuthorization(buffer) {
  const type = detectType(buffer);
  if (!type) return null;
  const filename = `${crypto.randomBytes(16).toString('hex')}${type.ext}`;
  fs.writeFileSync(path.join(config.uploadsDir, filename), buffer, { flag: 'wx' });
  return { filename, mime: type.mime };
}

function authorizationPath(filename) {
  return path.join(config.uploadsDir, path.basename(filename));
}

function deleteAuthorization(filename) {
  if (!filename) return;
  fs.rmSync(authorizationPath(filename), { force: true });
}

module.exports = { detectType, saveAuthorization, authorizationPath, deleteAuthorization };
