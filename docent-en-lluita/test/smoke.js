'use strict';

/*
 * Prueba de humo de extremo a extremo:
 * jornadas de los miércoles → acceso con código al correo @edu.gva.es →
 * reserva con autorización → aforo de 100 (y agotadas) → panel de organización →
 * anulación y liberación de la localidad → punto de encuentro y convocatoria →
 * aviso automático en la Direcció Territorial → borrado de autorizaciones.
 *
 * Uso: npm test  (usa una carpeta de datos temporal y no envía correos de verdad)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'docent-en-lluita-test-'));
process.env.ADMIN_EMAILS = 'organitzacio@docentenlluita.org';
process.env.SMTP_HOST = '';
process.env.WEEKDAYS = '3';
process.env.WEEKS_AHEAD = '4';

const { app } = require('../server');
const J = require('../src/jornadas');
const { readOutbox } = require('../src/mailer');
const { madridNow, addDays, isoWeekday } = require('../src/dates');
const { config } = require('../src/config');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let baseUrl;

/** Cliente con su propia "cookie jar", como un navegador distinto por persona. */
function client() {
  let cookie = '';
  return async function api(pathName, { method = 'GET', body, formData, headers = {} } = {}) {
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${pathName}`, {
      method,
      headers,
      body: formData || (body ? JSON.stringify(body) : undefined),
    });
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(';')[0];
      cookie = pair.endsWith('=') ? '' : pair;
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };
}

const mailsTo = (email) => readOutbox().filter((m) => m.to === email);

async function login(api, email) {
  let r = await api('/api/acceso/codigo', { method: 'POST', body: { email } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const mail = mailsTo(email).at(-1);
  const code = mail.subject.match(/(\d{6})/)[1];
  r = await api('/api/acceso/verificar', { method: 'POST', body: { email, codigo: code } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  return r.data.docente;
}

function reservaForm({ nombre = 'Docente de prueba', centro = 'IES Prueba (València)', acepto = true, file = PDF, filename = 'autoritzacio.pdf', type = 'application/pdf' } = {}) {
  const form = new FormData();
  form.append('nombre', nombre);
  form.append('centro', centro);
  if (acepto) form.append('acepto', 'true');
  if (file) form.append('autorizacion', new Blob([file], { type }), filename);
  return form;
}

async function waitFor(check, what) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Tiempo agotado esperando: ${what}`);
}

async function main() {
  const anon = client();
  const ana = client();
  const luis = client();
  const eva = client();
  const org = client();

  // --- Jornadas automáticas: miércoles de las próximas 4 semanas × 3 provincias ---
  J.ensureUpcomingJornadas();
  let r = await anon('/api/jornadas');
  const jornadas = r.data.jornadas;
  assert.strictEqual(jornadas.length, 12, `Deberían ser 12 jornadas, hay ${jornadas.length}`);
  assert.ok(jornadas.every((j) => isoWeekday(j.fecha) === 3), 'Todas las jornadas caen en miércoles');
  assert.ok(jornadas.every((j) => j.plazas === 100 && j.libres === 100), '100 entradas libres por jornada');
  assert.strictEqual(J.ensureUpcomingJornadas(), 0, 'Generar dos veces no duplica jornadas');
  const primerMiercoles = jornadas[0].fecha;
  const vlc = jornadas.find((j) => j.fecha === primerMiercoles && j.provincia === 'valencia');
  const ali = jornadas.find((j) => j.fecha === primerMiercoles && j.provincia === 'alacant');
  const cas = jornadas.find((j) => j.fecha === primerMiercoles && j.provincia === 'castello');
  console.log('✔ Jornadas de los miércoles en las tres provincias');

  // --- Acceso solo con correo corporativo ---
  r = await anon('/api/acceso/codigo', { method: 'POST', body: { email: 'troll@gmail.com' } });
  assert.strictEqual(r.status, 400, 'Un correo de fuera no puede entrar');
  r = await anon('/api/acceso/codigo', { method: 'POST', body: { email: 'alumne@alu.edu.gva.es' } });
  assert.strictEqual(r.status, 400, 'Un subdominio (alumnado) tampoco');
  r = await anon('/api/jornadas/1/reservar', { method: 'POST', formData: reservaForm() });
  assert.strictEqual(r.status, 401, 'Sin sesión no se reserva');

  r = await ana('/api/acceso/codigo', { method: 'POST', body: { email: 'Ana.Garcia@EDU.gva.es' } });
  assert.strictEqual(r.status, 200);
  r = await ana('/api/acceso/codigo', { method: 'POST', body: { email: 'ana.garcia@edu.gva.es' } });
  assert.strictEqual(r.status, 429, 'No se puede pedir otro código al momento');
  r = await ana('/api/acceso/verificar', { method: 'POST', body: { email: 'ana.garcia@edu.gva.es', codigo: '000000' } });
  assert.strictEqual(r.status, 401, 'Un código incorrecto no entra');
  const code = mailsTo('ana.garcia@edu.gva.es').at(-1).text.match(/\b(\d{6})\b/)[1];
  r = await ana('/api/acceso/verificar', { method: 'POST', body: { email: 'ana.garcia@edu.gva.es', codigo: code } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.docente.admin, false);
  r = await ana('/api/acceso/verificar', { method: 'POST', body: { email: 'ana.garcia@edu.gva.es', codigo: code } });
  assert.strictEqual(r.status, 401, 'El código es de un solo uso');
  r = await ana('/api/yo');
  assert.strictEqual(r.data.docente.email, 'ana.garcia@edu.gva.es');
  console.log('✔ Acceso con código al correo @edu.gva.es');

  // --- Reserva con autorización obligatoria ---
  r = await ana(`/api/jornadas/${vlc.id}/reservar`, { method: 'POST', formData: reservaForm({ file: null }) });
  assert.strictEqual(r.status, 400, 'Sin autorización no hay entrada');
  r = await ana(`/api/jornadas/${vlc.id}/reservar`, {
    method: 'POST',
    formData: reservaForm({ file: Buffer.from('no soy un pdf'), filename: 'falso.pdf' }),
  });
  assert.strictEqual(r.status, 400, 'Un archivo que no es PDF/JPG/PNG se rechaza aunque se llame .pdf');
  r = await ana(`/api/jornadas/${vlc.id}/reservar`, { method: 'POST', formData: reservaForm({ acepto: false }) });
  assert.strictEqual(r.status, 400, 'Hay que aceptar el tratamiento de datos');
  r = await ana(`/api/jornadas/${vlc.id}/reservar`, {
    method: 'POST',
    formData: reservaForm({ nombre: 'Ana García', centro: 'IES Lluís Vives (València)' }),
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  assert.strictEqual(r.data.reserva.localidad, 1, 'La primera persona tiene la localidad 1');
  const anaVlc = r.data.reserva;
  assert.ok(mailsTo('ana.garcia@edu.gva.es').some((m) => m.subject.startsWith('Entrada nº 1')), 'Correo de confirmación');
  assert.strictEqual(fs.readdirSync(config.uploadsDir).length, 1, 'Los intentos fallidos no dejan archivos');

  r = await ana(`/api/jornadas/${vlc.id}/reservar`, { method: 'POST', formData: reservaForm() });
  assert.strictEqual(r.status, 409, 'Una sola entrada por persona y jornada');
  r = await ana(`/api/jornadas/${ali.id}/reservar`, { method: 'POST', formData: reservaForm() });
  assert.strictEqual(r.status, 409, 'No se puede estar en dos provincias el mismo día');

  await login(luis, 'luis.marti@edu.gva.es');
  r = await luis(`/api/jornadas/${vlc.id}/reservar`, {
    method: 'POST',
    formData: reservaForm({ nombre: 'Luis Martí', file: TINY_PNG, filename: 'foto.png', type: 'image/png' }),
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  assert.strictEqual(r.data.reserva.localidad, 2);

  r = await anon('/api/jornadas');
  const vlcNow = r.data.jornadas.find((j) => j.id === vlc.id);
  assert.strictEqual(vlcNow.libres, 98, 'Se ven las entradas disponibles');
  assert.deepStrictEqual(vlcNow.ocupadas, [1, 2]);
  assert.ok(!JSON.stringify(r.data).includes('Ana'), 'El listado público no muestra quién se ha inscrito');
  console.log('✔ Reservas con autorización y entradas disponibles');

  // --- Panel de organización ---
  r = await anon('/api/admin/jornadas');
  assert.strictEqual(r.status, 401);
  r = await ana('/api/admin/jornadas');
  assert.strictEqual(r.status, 403, 'Una docente no entra al panel');
  const orgDocente = await login(org, 'organitzacio@docentenlluita.org');
  assert.strictEqual(orgDocente.admin, true, 'La organización puede entrar aunque su correo no sea @edu.gva.es');
  r = await org('/api/admin/jornadas');
  assert.strictEqual(r.status, 200);

  // Jornada pequeña (2 entradas) un jueves, para probar las agotadas.
  let jueves = addDays(madridNow().fecha, 8);
  while (isoWeekday(jueves) !== 4) jueves = addDays(jueves, 1);
  r = await org('/api/admin/jornadas', { method: 'POST', body: { fecha: jueves, provincia: 'castello', plazas: 2 } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const mini = r.data.jornada;
  r = await org('/api/admin/jornadas', { method: 'POST', body: { fecha: jueves, provincia: 'castello', plazas: 2 } });
  assert.strictEqual(r.status, 409, 'No hay dos jornadas iguales');
  r = await org('/api/admin/jornadas', { method: 'POST', body: { fecha: '2020-01-01', provincia: 'castello' } });
  assert.strictEqual(r.status, 400, 'No se crean jornadas en el pasado');

  await login(eva, 'eva.soler@edu.gva.es');
  r = await ana(`/api/jornadas/${mini.id}/reservar`, { method: 'POST', formData: reservaForm({ nombre: 'Ana García' }) });
  assert.strictEqual(r.status, 201);
  r = await luis(`/api/jornadas/${mini.id}/reservar`, { method: 'POST', formData: reservaForm({ nombre: '=HYPERLINK("x")' }) });
  assert.strictEqual(r.status, 201);
  const luisMini = r.data.reserva;
  r = await eva(`/api/jornadas/${mini.id}/reservar`, { method: 'POST', formData: reservaForm({ nombre: 'Eva Soler' }) });
  assert.strictEqual(r.status, 409, 'Entradas agotadas');
  assert.match(r.data.error, /agotadas/i);
  console.log('✔ Aforo completo: entradas agotadas');

  // Ver la autorización, anular y que la localidad quede libre.
  r = await org(`/api/admin/jornadas/${mini.id}`);
  assert.strictEqual(r.data.reservas.length, 2);
  r = await org(`/api/admin/reservas/${luisMini.id}/autorizacion`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.subarray(0, 5).toString(), '%PDF-');
  r = await luis(`/api/admin/reservas/${luisMini.id}/autorizacion`);
  assert.strictEqual(r.status, 403, 'Solo la organización ve las autorizaciones');

  r = await org(`/api/admin/reservas/${luisMini.id}/rechazar`, { method: 'POST', body: {} });
  assert.strictEqual(r.status, 400, 'Anular exige un motivo');
  r = await org(`/api/admin/reservas/${luisMini.id}/rechazar`, {
    method: 'POST',
    body: { motivo: 'La autorización es de otra fecha.' },
  });
  assert.strictEqual(r.status, 200);
  assert.ok(mailsTo('luis.marti@edu.gva.es').some((m) => m.text.includes('La autorización es de otra fecha.')));
  r = await eva(`/api/jornadas/${mini.id}/reservar`, { method: 'POST', formData: reservaForm({ nombre: 'Eva Soler' }) });
  assert.strictEqual(r.status, 201, 'La localidad anulada vuelve a estar libre');
  assert.strictEqual(r.data.reserva.localidad, 2);

  r = await org(`/api/admin/jornadas/${mini.id}`, { method: 'PATCH', body: { plazas: 1 } });
  assert.strictEqual(r.status, 409, 'No se puede bajar el aforo por debajo de una localidad ocupada');
  r = await org(`/api/admin/jornadas/${mini.id}`, { method: 'PATCH', body: { plazas: 3 } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.jornada.libres, 1);

  r = await org(`/api/admin/jornadas/${mini.id}/reservas.csv`);
  const csv = r.data.toString('utf8');
  assert.ok(csv.includes('Eva Soler') && csv.includes('eva.soler@edu.gva.es'));
  assert.ok(csv.includes(`"'=HYPERLINK`), 'El CSV neutraliza fórmulas');
  console.log('✔ Panel: ver autorización, anular, liberar localidad, aforo y CSV');

  // --- Punto de encuentro y convocatoria ---
  r = await org(`/api/admin/jornadas/${vlc.id}/convocatoria`, { method: 'POST' });
  assert.strictEqual(r.status, 409, 'Sin punto de encuentro no hay convocatoria');
  r = await org(`/api/admin/jornadas/${vlc.id}/punto`, {
    method: 'PUT',
    body: { tipo: 'acto', titulo: 'Acto del President en el Palau de la Generalitat', lugar: 'Plaça de Manises, València', hora: '10:30' },
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  r = await org(`/api/admin/jornadas/${vlc.id}/convocatoria`, { method: 'POST' });
  assert.strictEqual(r.status, 202);
  assert.strictEqual(r.data.destinatarios, 2);
  await waitFor(() => readOutbox().filter((m) => m.subject.startsWith('Punto de encuentro · València')).length === 2, 'convocatoria');
  const conv = mailsTo('luis.marti@edu.gva.es').find((m) => m.subject.startsWith('Punto de encuentro'));
  assert.ok(conv.text.includes('Plaça de Manises') && conv.text.includes('10:30') && conv.text.includes('nº 2'));

  r = await ana('/api/mis-entradas');
  const anaEntrada = r.data.reservas.find((x) => x.id === anaVlc.id);
  assert.strictEqual(anaEntrada.punto.lugar, 'Plaça de Manises, València', 'El punto aparece en «Mis entradas»');

  // Reenviar tras un cambio avisa de que es una actualización.
  await org(`/api/admin/jornadas/${vlc.id}/punto`, {
    method: 'PUT',
    body: { tipo: 'acto', titulo: 'Acto del President en el Palau de la Generalitat', lugar: 'Plaça de Manises, València', hora: '11:00' },
  });
  r = await org(`/api/admin/jornadas/${vlc.id}/convocatoria`, { method: 'POST' });
  assert.ok(r.data.actualizacion);
  await waitFor(() => mailsTo('ana.garcia@edu.gva.es').some((m) => m.subject.startsWith('[ACTUALIZACIÓN]')), 'actualización');

  // Quien reserva tarde recibe el punto directamente en la confirmación.
  const pau = client();
  await login(pau, 'pau.ferrer@edu.gva.es');
  r = await pau(`/api/jornadas/${vlc.id}/reservar`, { method: 'POST', formData: reservaForm({ nombre: 'Pau Ferrer' }) });
  assert.strictEqual(r.status, 201);
  const late = mailsTo('pau.ferrer@edu.gva.es').find((m) => m.subject.startsWith('Entrada nº 3'));
  assert.ok(late.text.includes('PUNTO DE ENCUENTRO') && late.text.includes('11:00'));
  console.log('✔ Punto de encuentro y convocatoria por correo');

  // --- Liberar la entrada ---
  r = await ana(`/api/mis-entradas/${anaVlc.id}`, { method: 'DELETE' });
  assert.strictEqual(r.status, 200);
  r = await anon('/api/jornadas');
  assert.strictEqual(r.data.jornadas.find((j) => j.id === vlc.id).libres, 98, "La localidad de Ana queda libre");
  r = await org(`/api/admin/reservas/${anaVlc.id}/autorizacion`);
  assert.strictEqual(r.status, 404, 'Al liberar la entrada se borra la autorización');
  console.log('✔ Liberar la entrada');

  // --- Sin acto institucional: Direcció Territorial automáticamente ---
  r = await eva(`/api/jornadas/${cas.id}/reservar`, { method: 'POST', formData: reservaForm({ nombre: 'Eva Soler' }) });
  assert.strictEqual(r.status, 201);
  const vispera = addDays(primerMiercoles, -1);
  let results = await J.autoFallback(new Date(`${vispera}T08:00:00Z`));
  assert.strictEqual(results.length, 0, 'Por la mañana del día anterior todavía se espera al acto');
  results = await J.autoFallback(new Date(`${vispera}T17:30:00Z`));
  assert.deepStrictEqual(results.map((x) => x.jornadaId).sort(), [ali.id, cas.id].sort(),
    'A partir de las 18 h se convoca en la DT donde no hay acto (no en València, que ya lo tiene)');
  const dtMail = mailsTo('eva.soler@edu.gva.es').find((m) => m.subject.startsWith('Punto de encuentro · Castelló'));
  assert.ok(dtMail.text.includes("Direcció Territorial d'Educació de Castelló"));
  assert.ok(dtMail.text.includes('Av. del Mar'));
  results = await J.autoFallback(new Date(`${vispera}T19:00:00Z`));
  assert.strictEqual(results.length, 0, 'No se repite la convocatoria');
  console.log('✔ Sin acto: convocatoria automática en la Direcció Territorial');

  // --- Borrado de autorizaciones antiguas ---
  const filesBefore = fs.readdirSync(config.uploadsDir).length;
  const purged = J.purgeOldAuthorizations(new Date(`${addDays(primerMiercoles, config.retentionDays + 1)}T12:00:00Z`));
  assert.ok(purged >= 2, 'Se borran las autorizaciones de jornadas antiguas');
  assert.strictEqual(fs.readdirSync(config.uploadsDir).length, filesBefore - purged);
  console.log('✔ Borrado de autorizaciones tras la jornada');

  // --- Seguridad básica ---
  r = await ana('/api/acceso/salir', { method: 'POST', headers: { Origin: 'https://otra-web.example' } });
  assert.strictEqual(r.status, 403, 'Peticiones desde otra web se rechazan');
  r = await ana('/api/acceso/salir', { method: 'POST' });
  assert.strictEqual(r.status, 200);
  r = await ana('/api/yo');
  assert.strictEqual(r.data.docente, null, 'Tras salir ya no hay sesión');
  console.log('✔ Cierre de sesión y protección CSRF');

  console.log('\nTodo en orden ✅');
}

const server = app.listen(0, async () => {
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await main();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Fallo en la prueba:', err.stack || err.message);
    process.exit(1);
  }
});
