'use strict';

/*
 * Prueba de humo de extremo a extremo:
 * registro → amistad → publicaciones (mensaje, foto, referencia) →
 * bloqueo de enlaces → muro compartido → revista PDF.
 *
 * Uso: npm test  (usa una base de datos temporal, no toca ./data)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.VINCULO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vinculo-test-'));

const app = require('../server');
const { containsLink } = require('../src/linkGuard');

// PNG de 1x1 píxel para probar la subida de fotos.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let baseUrl;

async function api(pathName, { method = 'GET', token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data };
}

async function main() {
  // --- Guardián de enlaces (unitario) ---
  const blocked = [
    'mira https://ejemplo.com',
    'entra en www.ejemplo.com',
    'visita ejemplo.com ya',
    'está en ejemplo (punto) com',
    'w w w . ejemplo . es',
    'escríbeme a mailto:yo@sitio.com',
    'servidor 192.168.1.1:8080/panel',
  ];
  for (const text of blocked) {
    assert.ok(containsLink(text), `Debería bloquear: "${text}"`);
  }
  const allowed = [
    'Hoy comimos paella. ¡Qué rica!',
    'Te recomiendo el libro Cien años de soledad, de García Márquez.',
    'Quedamos a las 19.30 en la plaza',
    'Mi nota fue un 9.5 sobre 10',
  ];
  for (const text of allowed) {
    assert.ok(!containsLink(text), `No debería bloquear: "${text}"`);
  }
  console.log('✔ Guardián de enlaces');

  // --- Registro de dos usuarias ---
  const ana = (await api('/api/register', {
    method: 'POST',
    body: { username: 'ana', displayName: 'Ana', password: 'secreto1' },
  })).data;
  const luis = (await api('/api/register', {
    method: 'POST',
    body: { username: 'luis', displayName: 'Luis', password: 'secreto2' },
  })).data;
  assert.ok(ana.token && luis.token, 'El registro devuelve tokens');
  console.log('✔ Registro');

  // --- Amistad ---
  let r = await api('/api/friends/request', {
    method: 'POST', token: ana.token, body: { username: 'luis' },
  });
  assert.strictEqual(r.status, 201);
  r = await api('/api/friends', { token: luis.token });
  const requestId = r.data.incoming[0].friendshipId;
  r = await api(`/api/friends/${requestId}/accept`, { method: 'POST', token: luis.token });
  assert.strictEqual(r.status, 200);
  console.log('✔ Amistad');

  // --- Publicaciones ---
  const msgForm = new FormData();
  msgForm.append('type', 'message');
  msgForm.append('text', 'Hoy hicimos una excursión preciosa a la sierra.');
  r = await api('/api/posts', { method: 'POST', token: ana.token, formData: msgForm });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));

  const photoForm = new FormData();
  photoForm.append('type', 'photo');
  photoForm.append('text', 'El atardecer desde la cima');
  photoForm.append('photo', new Blob([TINY_PNG], { type: 'image/png' }), 'foto.png');
  r = await api('/api/posts', { method: 'POST', token: ana.token, formData: photoForm });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const photoPath = r.data.post.photo_path;

  const refForm = new FormData();
  refForm.append('type', 'reference');
  refForm.append('refKind', 'libro');
  refForm.append('refTitle', 'El infinito en un junco');
  refForm.append('refDetail', 'Irene Vallejo');
  refForm.append('text', 'Me ha encantado, te va a gustar seguro.');
  r = await api('/api/posts', { method: 'POST', token: luis.token, formData: refForm });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  console.log('✔ Publicaciones (mensaje, foto, referencia)');

  // --- El servidor rechaza enlaces ---
  const badForm = new FormData();
  badForm.append('type', 'message');
  badForm.append('text', 'Míralo en https://spam.example.com/oferta');
  r = await api('/api/posts', { method: 'POST', token: ana.token, formData: badForm });
  assert.strictEqual(r.status, 422, 'Un mensaje con enlace debe rechazarse');

  const badRef = new FormData();
  badRef.append('type', 'reference');
  badRef.append('refKind', 'otro');
  badRef.append('refTitle', 'Oferta');
  badRef.append('refDetail', 'tienda (punto) com');
  r = await api('/api/posts', { method: 'POST', token: ana.token, formData: badRef });
  assert.strictEqual(r.status, 422, 'Una referencia con dominio disimulado debe rechazarse');
  console.log('✔ Bloqueo de enlaces en el servidor');

  // --- Muro compartido ---
  r = await api('/api/feed', { token: luis.token });
  assert.strictEqual(r.data.posts.length, 3, 'Luis ve sus posts y los de Ana');

  // La foto es visible para el círculo…
  r = await api(`/api/photos/${photoPath}`, { token: luis.token });
  assert.strictEqual(r.status, 200);
  // …pero no para desconocidos.
  const eva = (await api('/api/register', {
    method: 'POST',
    body: { username: 'eva', displayName: 'Eva', password: 'secreto3' },
  })).data;
  r = await api(`/api/photos/${photoPath}`, { token: eva.token });
  assert.strictEqual(r.status, 404, 'Una desconocida no puede ver la foto');
  r = await api('/api/feed', { token: eva.token });
  assert.strictEqual(r.data.posts.length, 0, 'Eva no ve el muro de otras personas');
  console.log('✔ Privacidad del círculo');

  // --- Revista PDF ---
  r = await api('/api/magazines/generate', { method: 'POST', token: ana.token, body: {} });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.magazine.post_count, 3);
  const magId = r.data.magazine.id;
  r = await api(`/api/magazines/${magId}/pdf`, { token: ana.token });
  assert.strictEqual(r.status, 200);
  const pdfBytes = Buffer.from(r.data);
  assert.ok(pdfBytes.subarray(0, 5).toString() === '%PDF-', 'El archivo es un PDF válido');
  assert.ok(pdfBytes.length > 2000, 'El PDF tiene contenido');

  // Eva no puede descargar la revista de Ana.
  r = await api(`/api/magazines/${magId}/pdf`, { token: eva.token });
  assert.strictEqual(r.status, 404);

  // Un mes vacío no genera revista.
  r = await api('/api/magazines/generate', {
    method: 'POST', token: ana.token, body: { year: 2020, month: 1 },
  });
  assert.strictEqual(r.status, 404);
  console.log('✔ Revista PDF mensual');

  console.log('\nTodo en orden ✅');
}

const server = app.listen(0, async () => {
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await main();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Fallo en la prueba:', err.message);
    process.exit(1);
  }
});
