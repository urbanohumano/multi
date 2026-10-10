'use strict';

/* Docent en Lluita — cliente ligero sin dependencias. */

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  config: null,
  me: null,
  jornadas: [],
  misReservas: [],
  provincia: readStored('dl_provincia') || 'todas',
  returnTo: '#jornadas',
  pendingEmail: '',
  currentJornadaId: null,
  reserveBoxMode: null,
};

const ESTADOS = {
  pendiente: 'Pendiente de revisión',
  validada: 'Autorización validada',
  rechazada: 'Anulada por la organización',
  cancelada: 'Cancelada',
};

function readStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
}

async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Error de conexión.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showError(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}
function clearError(el) {
  el.classList.add('hidden');
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/* ---------------- Navegación ---------------- */

const VIEWS = {
  jornadas: { view: 'jornadas', render: renderJornadas },
  jornada: { view: 'jornada', render: renderJornadaDetail },
  acceso: { view: 'acceso', render: renderAcceso },
  'mis-entradas': { view: 'mis-entradas', render: renderMisEntradas, auth: true },
  organizacion: { view: 'organizacion', render: renderAdmin, admin: true },
};

function route() {
  const [name, arg] = location.hash.replace(/^#/, '').split('/');
  const entry = VIEWS[name] || VIEWS.jornadas;
  if ((entry.auth || entry.admin) && !state.me) {
    state.returnTo = location.hash;
    location.hash = '#acceso';
    return;
  }
  if (entry.admin && !state.me.admin) {
    location.hash = '#jornadas';
    return;
  }
  let viewId = entry.view;
  if (name === 'organizacion' && arg) viewId = 'organizacion-jornada';
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${viewId}`));
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === entry.view));
  state.currentJornadaId = name === 'jornada' ? Number(arg) : null;
  window.scrollTo(0, 0);
  entry.render(arg);
}

window.addEventListener('hashchange', route);
// Pulsar el enlace de la sección en la que ya estás también la refresca.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (link && link.getAttribute('href') === location.hash) route();
});

function renderSession() {
  const me = state.me;
  $('#me-email').textContent = me ? me.email : '';
  $('#login-link').classList.toggle('hidden', Boolean(me));
  $('#logout-btn').classList.toggle('hidden', !me);
  $('#nav-admin').classList.toggle('hidden', !me?.admin);
}

$('#logout-btn').addEventListener('click', async () => {
  try { await api('/acceso/salir', { method: 'POST' }); } catch { /* da igual */ }
  state.me = null;
  state.misReservas = [];
  renderSession();
  location.hash = '#jornadas';
  route();
});

/* ---------------- Datos ---------------- */

async function loadJornadas() {
  const data = await api('/jornadas');
  state.jornadas = data.jornadas;
}

async function loadMisReservas() {
  if (!state.me) {
    state.misReservas = [];
    return;
  }
  const data = await api('/mis-entradas');
  state.misReservas = data.reservas;
}

const myReservationFor = (jornadaId) =>
  state.misReservas.find((r) => r.jornadaId === jornadaId && ['pendiente', 'validada'].includes(r.estado));

/* ---------------- Jornadas ---------------- */

function renderProvinceFilter() {
  const options = [['todas', 'Todas'], ...Object.entries(state.config.provincias).map(([k, p]) => [k, p.nombre])];
  $('#province-filter').innerHTML = options
    .map(([k, label]) =>
      `<button class="chip ${state.provincia === k ? 'active' : ''}" data-provincia="${k}">${escapeHtml(label)}</button>`)
    .join('');
}

$('#province-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-provincia]');
  if (!btn) return;
  state.provincia = btn.dataset.provincia;
  store('dl_provincia', state.provincia);
  renderProvinceFilter();
  drawJornadasList();
});

async function renderJornadas() {
  renderProvinceFilter();
  try {
    await Promise.all([loadJornadas(), loadMisReservas()]);
  } catch (err) {
    $('#jornadas-list').innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }
  drawJornadasList();
}

function availabilityLabel(j) {
  if (j.estado === 'cerrada') return 'Reservas cerradas';
  if (!j.abierta) return 'Reservas cerradas (es hoy)';
  if (j.libres === 0) return 'Agotadas';
  return null;
}

function drawJornadasList() {
  const list = state.jornadas.filter((j) => state.provincia === 'todas' || j.provincia === state.provincia);
  if (!list.length) {
    $('#jornadas-list').innerHTML = '<p class="muted">Todavía no hay jornadas convocadas. ¡Vuelve pronto!</p>';
    return;
  }
  const byDate = new Map();
  for (const j of list) {
    if (!byDate.has(j.fecha)) byDate.set(j.fecha, []);
    byDate.get(j.fecha).push(j);
  }
  $('#jornadas-list').innerHTML = [...byDate.values()]
    .map((group) => `
      <div class="date-group">
        <h3>${escapeHtml(capitalize(group[0].fechaTexto))}</h3>
        <div class="cards">${group.map(jornadaCard).join('')}</div>
      </div>`)
    .join('');
}

function jornadaCard(j) {
  const mine = myReservationFor(j.id);
  const pct = Math.round(((j.plazas - j.libres) / j.plazas) * 100);
  const blocked = availabilityLabel(j);
  let action;
  if (mine) action = `<span class="badge ok">✔ Tienes la entrada nº ${mine.localidad}</span>`;
  else if (blocked) action = `<span class="badge off">${blocked}</span>`;
  else action = '<span class="btn primary small">Reservar entrada</span>';
  return `
    <a class="card jornada-card ${blocked && !mine ? 'is-off' : ''}" href="#jornada/${j.id}">
      <div class="jc-head">
        <span class="provincia">${escapeHtml(j.provinciaNombre)}</span>
        ${j.puntoPublicado ? '<span class="badge info">📍 Punto publicado</span>' : ''}
      </div>
      <div class="jc-count"><strong>${j.libres}</strong> <span>libres de ${j.plazas}</span></div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="jc-action">${action}</div>
    </a>`;
}

/* ---------------- Detalle de jornada ---------------- */

async function renderJornadaDetail(id) {
  const container = $('#jornada-detail');
  container.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    await Promise.all([loadJornadas(), loadMisReservas()]);
  } catch (err) {
    container.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }
  const j = state.jornadas.find((x) => x.id === Number(id));
  if (!j) {
    container.innerHTML = '<p class="error">Esta jornada no existe o ya ha pasado.</p>';
    return;
  }
  container.innerHTML = `
    <div class="detail-head">
      <h2>${escapeHtml(j.provinciaNombre)} · ${escapeHtml(capitalize(j.fechaTexto))}</h2>
      <p class="muted">Punto de encuentro: ${j.puntoPublicado
        ? 'ya publicado — lo recibirás por correo al reservar.'
        : 'se comunicará por correo a las personas inscritas 24–48 h antes.'}</p>
    </div>
    <div class="detail-grid">
      <div class="card">
        <div id="seat-counter" class="seat-counter"></div>
        <div id="seat-map"></div>
        <div class="legend">
          <span><i class="seat free"></i> Libre</span>
          <span><i class="seat taken"></i> Reservada</span>
          <span><i class="seat mine"></i> La tuya</span>
        </div>
      </div>
      <div class="card" id="reserve-box"></div>
    </div>`;
  drawSeatMap(j);
  drawReserveBox(j);
}

function drawSeatMap(j) {
  const mine = myReservationFor(j.id);
  const taken = new Set(j.ocupadas);
  let seats = '';
  for (let n = 1; n <= j.plazas; n++) {
    const cls = mine && mine.localidad === n ? 'mine' : taken.has(n) ? 'taken' : 'free';
    seats += `<span class="seat ${cls}" title="Localidad ${n}">${n}</span>`;
  }
  $('#seat-counter').innerHTML = `<strong>${j.libres}</strong> entradas libres de ${j.plazas}`;
  $('#seat-map').innerHTML = `<div class="stage">PANCARTA</div><div class="seats">${seats}</div>`;
}

function reserveBoxMode(j) {
  if (myReservationFor(j.id)) return 'mine';
  if (availabilityLabel(j)) return 'blocked';
  return state.me ? 'form' : 'login';
}

function drawReserveBox(j) {
  const box = $('#reserve-box');
  const mine = myReservationFor(j.id);
  const cfg = state.config;
  state.reserveBoxMode = reserveBoxMode(j);

  if (mine) {
    box.innerHTML = `
      <h3>Ya tienes tu entrada</h3>
      ${ticketHtml(mine)}
      <a href="#mis-entradas" class="btn">Ver mis entradas</a>`;
    return;
  }
  const blocked = availabilityLabel(j);
  if (blocked) {
    box.innerHTML = `<h3>${blocked}</h3><p class="muted">${j.libres === 0 && j.abierta
      ? 'Si alguien libera su entrada volverá a aparecer aquí. Esta página se actualiza sola.'
      : 'Ya no se admiten reservas para esta jornada.'}</p>`;
    return;
  }
  if (!state.me) {
    box.innerHTML = `
      <h3>Reserva tu entrada</h3>
      <p>Para reservar necesitas entrar con tu correo corporativo <span class="domain">@${escapeHtml(cfg.dominio)}</span>.</p>
      <a href="#acceso" class="btn primary" id="go-login">Entrar con mi correo</a>`;
    $('#go-login').addEventListener('click', () => { state.returnTo = `#jornada/${j.id}`; });
    return;
  }

  box.innerHTML = `
    <h3>Reserva tu entrada</h3>
    <form id="reserve-form">
      <label for="r-nombre">Nombre y apellidos</label>
      <input id="r-nombre" required maxlength="120" autocomplete="name" value="${escapeHtml(state.me.nombre)}" />

      <label for="r-centro">Centro educativo (nombre y localidad)</label>
      <input id="r-centro" required maxlength="160" placeholder="IES … (Localidad)" value="${escapeHtml(state.me.centro)}" />

      <label for="r-archivo">Autorización del día de permiso firmada por la dirección</label>
      <input id="r-archivo" type="file" accept="application/pdf,image/jpeg,image/png" required />
      <p class="hint">PDF o foto (JPG/PNG), máx. ${cfg.maxArchivoMb} MB. Puedes tapar los datos que no hagan falta (DNI, etc.): solo necesitamos ver tu nombre, la fecha y la firma de la dirección.</p>

      <label class="check">
        <input type="checkbox" id="r-acepto" required />
        <span>Acepto que la organización use mis datos para gestionar esta jornada (ver «Protección de datos» al pie de la página). La autorización se borra ${cfg.diasConservacion} días después de la jornada.</span>
      </label>

      <button type="submit" class="btn primary">Reservar entrada</button>
      <p id="reserve-error" class="error hidden"></p>
    </form>`;

  $('#reserve-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const errorEl = $('#reserve-error');
    clearError(errorEl);
    const file = $('#r-archivo').files[0];
    if (file && file.size > cfg.maxArchivoMb * 1024 * 1024) {
      showError(errorEl, `El archivo pesa demasiado (máx. ${cfg.maxArchivoMb} MB).`);
      return;
    }
    const form = new FormData();
    form.append('nombre', $('#r-nombre').value.trim());
    form.append('centro', $('#r-centro').value.trim());
    form.append('acepto', $('#r-acepto').checked ? 'true' : 'false');
    if (file) form.append('autorizacion', file);
    btn.disabled = true;
    btn.textContent = 'Reservando…';
    try {
      await api(`/jornadas/${j.id}/reservar`, { method: 'POST', formData: form });
      state.me.nombre = $('#r-nombre').value.trim();
      state.me.centro = $('#r-centro').value.trim();
      await renderJornadaDetail(j.id);
      $('#reserve-box').insertAdjacentHTML('afterbegin',
        '<p class="success">¡Hecho! Te hemos enviado la confirmación por correo.</p>');
    } catch (err) {
      showError(errorEl, err.message);
      btn.disabled = false;
      btn.textContent = 'Reservar entrada';
      if (err.status === 409) refreshLive();
    }
  });
}

function ticketHtml(r) {
  return `
    <div class="ticket ${r.estado}">
      <div class="ticket-seat"><small>Entrada</small><strong>${r.localidad}</strong><small>de ${r.plazas}</small></div>
      <div class="ticket-body">
        <div class="ticket-title">${escapeHtml(r.provinciaNombre)} · ${escapeHtml(capitalize(r.fechaTexto))}</div>
        <div class="muted small">Código <strong>${escapeHtml(r.codigo)}</strong> · ${escapeHtml(r.nombre)}</div>
        <div><span class="badge ${r.estado}">${ESTADOS[r.estado]}</span>
          ${r.jornadaEstado === 'cancelada' ? '<span class="badge off">Jornada cancelada</span>' : ''}</div>
      </div>
    </div>`;
}

/* Actualización en vivo de las entradas disponibles. */
async function refreshLive() {
  const hash = location.hash.replace(/^#/, '') || 'jornadas';
  const onList = hash === 'jornadas';
  const onDetail = state.currentJornadaId !== null && hash.startsWith('jornada/');
  if (!onList && !onDetail) return;
  try {
    await loadJornadas();
  } catch {
    return;
  }
  if (onList) drawJornadasList();
  if (onDetail) {
    const j = state.jornadas.find((x) => x.id === state.currentJornadaId);
    if (!j || !$('#seat-map')) return;
    drawSeatMap(j);
    // El formulario solo se redibuja si cambia de situación (p. ej. se agotan o se libera una entrada).
    if (reserveBoxMode(j) !== state.reserveBoxMode) drawReserveBox(j);
  }
}
setInterval(() => { if (!document.hidden) refreshLive(); }, 12000);

/* ---------------- Acceso ---------------- */

function renderAcceso() {
  if (state.me) {
    location.hash = state.returnTo || '#jornadas';
    return;
  }
  clearError($('#acceso-error'));
  $('#email-form').classList.toggle('hidden', Boolean(state.pendingEmail));
  $('#code-form').classList.toggle('hidden', !state.pendingEmail);
  $('#login-email').placeholder = `nom.cognom@${state.config.dominio}`;
}

$('#email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const email = $('#login-email').value.trim().toLowerCase();
  clearError($('#acceso-error'));
  btn.disabled = true;
  try {
    await api('/acceso/codigo', { method: 'POST', body: { email } });
    state.pendingEmail = email;
  } catch (err) {
    // Si ya se había enviado un código hace poco, dejamos introducirlo igualmente.
    if (err.status === 429 && /código/.test(err.message)) state.pendingEmail = email;
    showError($('#acceso-error'), err.message);
  } finally {
    btn.disabled = false;
  }
  if (state.pendingEmail) {
    $('#code-email').textContent = state.pendingEmail;
    $('#email-form').classList.add('hidden');
    $('#code-form').classList.remove('hidden');
    $('#login-code').value = '';
    $('#login-code').focus();
  }
});

$('#code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError($('#acceso-error'));
  try {
    const data = await api('/acceso/verificar', {
      method: 'POST',
      body: { email: state.pendingEmail, codigo: $('#login-code').value.trim() },
    });
    state.me = data.docente;
    state.pendingEmail = '';
    renderSession();
    const target = state.returnTo && state.returnTo !== '#acceso' ? state.returnTo : '#jornadas';
    state.returnTo = '#jornadas';
    location.hash = target;
  } catch (err) {
    showError($('#acceso-error'), err.message);
  }
});

$('#code-back').addEventListener('click', () => {
  state.pendingEmail = '';
  renderAcceso();
});

/* ---------------- Mis entradas ---------------- */

async function renderMisEntradas() {
  const container = $('#mis-entradas-list');
  container.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    await loadMisReservas();
  } catch (err) {
    container.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }
  if (!state.misReservas.length) {
    container.innerHTML = '<p class="muted">Todavía no tienes ninguna entrada. <a href="#jornadas">Mira las jornadas</a>.</p>';
    return;
  }
  container.innerHTML = state.misReservas.map((r) => `
    <div class="card entrada ${r.pasada ? 'is-off' : ''}">
      ${ticketHtml(r)}
      ${r.estado === 'rechazada' ? `<p class="error">Motivo: ${escapeHtml(r.motivoRechazo)}</p>` : ''}
      ${r.punto ? puntoHtml(r.punto) : ['pendiente', 'validada'].includes(r.estado) && !r.pasada
        ? '<p class="muted small">📍 El punto de encuentro te llegará por correo 24–48 h antes.</p>' : ''}
      ${r.cancelable ? `<button class="btn ghost small" data-cancelar="${r.id}">Liberar mi entrada</button>` : ''}
    </div>`).join('');
}

function puntoHtml(p) {
  return `
    <div class="punto">
      <div class="punto-label">📍 Punto de encuentro</div>
      <strong>${escapeHtml(p.titulo)}</strong>
      <div>${escapeHtml(p.lugar)} · <strong>${escapeHtml(p.hora)} h</strong></div>
      ${p.notas ? `<div class="muted small pre">${escapeHtml(p.notas)}</div>` : ''}
    </div>`;
}

$('#mis-entradas-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cancelar]');
  if (!btn) return;
  if (!confirm('¿Seguro que quieres liberar tu entrada? Otra persona podrá reservarla.')) return;
  try {
    await api(`/mis-entradas/${btn.dataset.cancelar}`, { method: 'DELETE' });
    renderMisEntradas();
  } catch (err) {
    alert(err.message);
  }
});

/* ---------------- Organización ---------------- */

async function renderAdmin(id) {
  if (id) return renderAdminJornada(id);
  const sel = $('#nj-provincia');
  if (!sel.options.length) {
    sel.innerHTML = Object.entries(state.config.provincias)
      .map(([k, p]) => `<option value="${k}">${escapeHtml(p.nombre)}</option>`).join('');
    $('#nj-plazas').value = state.config.plazasPorDefecto;
  }
  const container = $('#admin-list');
  try {
    const { jornadas } = await api('/admin/jornadas');
    if (!jornadas.length) {
      container.innerHTML = '<p class="muted">No hay jornadas. Pulsa «Generar próximas jornadas».</p>';
      return;
    }
    container.innerHTML = `
      <div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Fecha</th><th>Provincia</th><th>Entradas</th><th>Por revisar</th><th>Punto</th><th>Convocatoria</th><th>Estado</th></tr></thead>
        <tbody>${jornadas.map((j) => `
          <tr class="${j.estado !== 'abierta' ? 'is-off' : ''}" data-href="#organizacion/${j.id}">
            <td><a href="#organizacion/${j.id}">${escapeHtml(capitalize(j.fechaTexto))}</a></td>
            <td>${escapeHtml(j.provinciaNombre)}</td>
            <td>${j.plazas - j.libres} / ${j.plazas}</td>
            <td>${j.pendientes ? `<span class="badge pendiente">${j.pendientes}</span>` : '—'}</td>
            <td>${j.punto ? (j.punto.tipo === 'acto' ? '🎤 Acto' : '🏛️ DT') : '—'}</td>
            <td>${j.convocatoriaEnviadaAt ? `✔ ${formatDateTime(j.convocatoriaEnviadaAt)}` : '—'}</td>
            <td>${escapeHtml(j.estado)}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;
  } catch (err) {
    container.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

$('#admin-list').addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a')) location.hash = row.dataset.href;
});

$('#generar-btn').addEventListener('click', async () => {
  try {
    const { creadas } = await api('/admin/jornadas/generar', { method: 'POST' });
    $('#admin-msg').textContent = creadas ? `Creadas ${creadas} jornadas nuevas.` : 'Ya estaban todas creadas.';
    renderAdmin();
  } catch (err) {
    $('#admin-msg').textContent = err.message;
  }
});

$('#nueva-jornada-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/admin/jornadas', {
      method: 'POST',
      body: { fecha: $('#nj-fecha').value, provincia: $('#nj-provincia').value, plazas: $('#nj-plazas').value },
    });
    $('#admin-msg').textContent = 'Jornada creada.';
    renderAdmin();
  } catch (err) {
    $('#admin-msg').textContent = err.message;
  }
});

async function renderAdminJornada(id) {
  const container = $('#admin-detail');
  let data;
  try {
    data = await api(`/admin/jornadas/${id}`);
  } catch (err) {
    container.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }
  const { jornada: j, reservas } = data;
  const activas = reservas.filter((r) => ['pendiente', 'validada'].includes(r.estado)).length;
  const p = j.punto || { tipo: 'dt', titulo: '', lugar: '', hora: '', notas: '' };
  const envios = j.correosConvocatoria;

  container.innerHTML = `
    <h2>${escapeHtml(j.provinciaNombre)} · ${escapeHtml(capitalize(j.fechaTexto))}</h2>
    <div class="stats">
      <div><strong>${j.plazas - j.libres}</strong><span>de ${j.plazas} entradas</span></div>
      <div><strong>${j.pendientes}</strong><span>por revisar</span></div>
      <div><strong>${j.validadas}</strong><span>validadas</span></div>
      <div><strong>${j.rechazadas}</strong><span>anuladas</span></div>
      <div><strong>${j.asistentes}</strong><span>asistieron</span></div>
    </div>

    <div class="detail-grid">
      <form class="card" id="punto-form">
        <h3>📍 Punto de encuentro</h3>
        <p class="muted small">Revisa la agenda del President y de la Consellera (se publica 24–48 h antes). Si no hay acto en esta provincia, a las ${state.config.horaAvisoDt}:00 del día anterior se convoca automáticamente en la Direcció Territorial.</p>
        <div class="radio-row">
          <label><input type="radio" name="tipo" value="acto" ${p.tipo === 'acto' ? 'checked' : ''}/> Acto institucional</label>
          <label><input type="radio" name="tipo" value="dt" ${p.tipo === 'dt' ? 'checked' : ''}/> Direcció Territorial</label>
        </div>
        <label for="p-titulo">Qué / quién</label>
        <input id="p-titulo" maxlength="200" value="${escapeHtml(p.titulo)}" placeholder="${escapeHtml(j.puntoDt.titulo)}" />
        <label for="p-lugar">Lugar</label>
        <input id="p-lugar" maxlength="200" value="${escapeHtml(p.lugar)}" placeholder="${escapeHtml(j.puntoDt.lugar)}" />
        <label for="p-hora">Hora</label>
        <input id="p-hora" type="time" value="${escapeHtml(p.hora)}" />
        <label for="p-notas">Notas (opcional)</label>
        <textarea id="p-notas" rows="3" maxlength="1000" placeholder="Traed camisetas verdes, pancartas…">${escapeHtml(p.notas)}</textarea>
        <div class="row">
          <button type="submit" class="btn">Guardar punto</button>
          <button type="button" id="convocatoria-btn" class="btn primary" ${j.punto ? '' : 'disabled'}>
            ${j.convocatoriaEnviadaAt ? 'Reenviar (actualización)' : 'Enviar convocatoria'} a ${plural(activas, 'persona', 'personas')}
          </button>
        </div>
        <p class="muted small" id="punto-msg">${j.convocatoriaEnviadaAt
          ? `Convocatoria enviada el ${formatDateTime(j.convocatoriaEnviadaAt)} · ${plural(envios.enviados, 'correo enviado', 'correos enviados')}${envios.errores ? `, <span class="error-inline">${envios.errores} con error</span>` : ''}${j.convocatoriaEnviando ? ' · enviando…' : ''}`
          : j.punto ? 'Punto guardado, convocatoria todavía sin enviar.' : 'Todavía sin punto de encuentro.'}</p>
      </form>

      <div class="card">
        <h3>⚙️ Jornada</h3>
        <form id="plazas-form" class="inline-form">
          <label for="j-plazas">Entradas</label>
          <input id="j-plazas" type="number" min="1" max="5000" value="${j.plazas}" />
          <button class="btn small" type="submit">Guardar</button>
        </form>
        <form id="estado-form" class="inline-form">
          <label for="j-estado">Estado</label>
          <select id="j-estado">
            ${['abierta', 'cerrada', 'cancelada'].map((s) => `<option ${s === j.estado ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <button class="btn small" type="submit">Guardar</button>
        </form>
        <p class="muted small">«Cerrada» deja de admitir reservas. «Cancelada» la oculta y avisa por correo a quien tenga entrada.</p>
        <a class="btn small" href="/api/admin/jornadas/${j.id}/reservas.csv">⬇️ Descargar CSV</a>
        <p id="jornada-msg" class="muted small"></p>
      </div>
    </div>

    <h3>Entradas (${reservas.length})</h3>
    <div class="table-wrap"><table class="admin-table reservas-table">
      <thead><tr><th>Nº</th><th>Docente</th><th>Autorización</th><th>Estado</th><th>Asistió</th><th></th></tr></thead>
      <tbody>${reservas.map((r) => {
        const activa = ['pendiente', 'validada'].includes(r.estado);
        return `
        <tr class="${activa ? '' : 'is-off'}">
          <td><strong>${r.localidad}</strong><br/><span class="muted small">${escapeHtml(r.codigo)}</span></td>
          <td>${escapeHtml(r.nombre)}<br/><span class="muted small">${escapeHtml(r.email)}<br/>${escapeHtml(r.centro)}</span></td>
          <td>${r.tiene_autorizacion ? `<a href="/api/admin/reservas/${r.id}/autorizacion" target="_blank" rel="noopener">Ver documento</a>` : '<span class="muted">—</span>'}</td>
          <td><span class="badge ${r.estado}">${r.estado}</span>${r.motivo_rechazo ? `<br/><span class="muted small">${escapeHtml(r.motivo_rechazo)}</span>` : ''}</td>
          <td>${activa || r.asistio !== null ? `<input type="checkbox" data-asistio="${r.id}" ${r.asistio ? 'checked' : ''} aria-label="Asistió"/>` : ''}</td>
          <td class="actions">${activa ? `
            ${r.estado === 'pendiente' ? `<button class="btn small" data-validar="${r.id}">Validar</button>` : ''}
            <button class="btn small danger" data-rechazar="${r.id}">Anular</button>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="muted">Todavía no hay reservas.</td></tr>'}</tbody>
    </table></div>`;

  const radios = container.querySelectorAll('input[name=tipo]');
  radios.forEach((radio) => radio.addEventListener('change', () => {
    if (radio.checked && radio.value === 'dt') {
      $('#p-titulo').value = j.puntoDt.titulo;
      $('#p-lugar').value = j.puntoDt.lugar;
    }
  }));

  $('#punto-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/jornadas/${j.id}/punto`, {
        method: 'PUT',
        body: {
          tipo: container.querySelector('input[name=tipo]:checked')?.value,
          titulo: $('#p-titulo').value,
          lugar: $('#p-lugar').value,
          hora: $('#p-hora').value,
          notas: $('#p-notas').value,
        },
      });
      await renderAdminJornada(j.id);
      $('#punto-msg').textContent = 'Punto de encuentro guardado. Ahora puedes enviar la convocatoria.';
    } catch (err) {
      $('#punto-msg').textContent = err.message;
    }
  });

  $('#convocatoria-btn').addEventListener('click', async () => {
    if (!confirm(`Se enviará el punto de encuentro por correo a ${plural(activas, 'persona', 'personas')}. ¿Continuar?`)) return;
    try {
      const res = await api(`/admin/jornadas/${j.id}/convocatoria`, { method: 'POST' });
      $('#punto-msg').textContent = `Enviando a ${plural(res.destinatarios, 'persona', 'personas')}…`;
      setTimeout(() => renderAdminJornada(j.id), 3000);
    } catch (err) {
      $('#punto-msg').textContent = err.message;
    }
  });

  const patch = async (body) => {
    try {
      await api(`/admin/jornadas/${j.id}`, { method: 'PATCH', body });
      await renderAdminJornada(j.id);
      $('#jornada-msg').textContent = 'Guardado.';
    } catch (err) {
      $('#jornada-msg').textContent = err.message;
    }
  };
  $('#plazas-form').addEventListener('submit', (e) => { e.preventDefault(); patch({ plazas: $('#j-plazas').value }); });
  $('#estado-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const estado = $('#j-estado').value;
    if (estado === 'cancelada' && !confirm(`Se avisará por correo a ${plural(activas, 'persona', 'personas')} de que la jornada se cancela. ¿Seguro?`)) return;
    patch({ estado });
  });

  container.querySelector('.reservas-table').addEventListener('click', async (e) => {
    const validar = e.target.closest('[data-validar]');
    const rechazar = e.target.closest('[data-rechazar]');
    try {
      if (validar) {
        await api(`/admin/reservas/${validar.dataset.validar}/validar`, { method: 'POST' });
      } else if (rechazar) {
        const motivo = prompt('Motivo de la anulación (se enviará por correo a la persona). Su entrada quedará libre.',
          'La autorización no es válida o no corresponde a esta fecha.');
        if (!motivo) return;
        await api(`/admin/reservas/${rechazar.dataset.rechazar}/rechazar`, { method: 'POST', body: { motivo } });
      } else {
        return;
      }
      renderAdminJornada(j.id);
    } catch (err) {
      alert(err.message);
    }
  });

  container.querySelector('.reservas-table').addEventListener('change', async (e) => {
    const box = e.target.closest('[data-asistio]');
    if (!box) return;
    try {
      await api(`/admin/reservas/${box.dataset.asistio}/asistencia`, { method: 'POST', body: { asistio: box.checked } });
    } catch (err) {
      box.checked = !box.checked;
      alert(err.message);
    }
  });
}

/* ---------------- Arranque ---------------- */

function renderPrivacy() {
  const c = state.config;
  $('#privacy-text').innerHTML = `
    <p><strong>Quién:</strong> la organización de Docent en Lluita${c.contacto ? ` (<a href="mailto:${escapeHtml(c.contacto)}">${escapeHtml(c.contacto)}</a>)` : ''}.</p>
    <p><strong>Para qué:</strong> gestionar las entradas de cada jornada, comprobar que quien reserva es docente y tiene el día de permiso, y enviar el punto de encuentro.</p>
    <p><strong>Qué datos:</strong> correo corporativo, nombre, centro y la autorización que subes. Solo la organización puede ver las autorizaciones; nadie más ve quién se ha inscrito.</p>
    <p><strong>Cuánto tiempo:</strong> las autorizaciones se borran ${c.diasConservacion} días después de cada jornada (o al liberar tu entrada).</p>
    <p><strong>Tus derechos:</strong> puedes pedir el acceso, la rectificación o el borrado de tus datos escribiendo a la organización.</p>`;
}

async function init() {
  try {
    const [config, yo] = await Promise.all([api('/config'), api('/yo')]);
    state.config = config;
    state.me = yo.docente;
  } catch (err) {
    document.querySelector('main').innerHTML = `<p class="error">No se puede conectar con el servidor: ${escapeHtml(err.message)}</p>`;
    return;
  }
  $('#hero-plazas').textContent = state.config.plazasPorDefecto;
  document.querySelectorAll('.domain').forEach((el) => { el.textContent = `@${state.config.dominio}`; });
  $('#dev-banner').classList.toggle('hidden', !state.config.modoDesarrollo);
  renderPrivacy();
  renderSession();
  route();
}

init();
