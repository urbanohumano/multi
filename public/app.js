'use strict';

/* Vínculo — cliente ligero sin dependencias. */

const $ = (sel) => document.querySelector(sel);

const state = {
  token: localStorage.getItem('vinculo_token'),
  user: null,
  composerType: 'message',
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const REF_LABELS = { libro: '📖 Libro', pelicula: '🎬 Película', musica: '🎵 Música', lugar: '📍 Lugar', otro: '💡 Recomendación' };

async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de conexión.');
  return data;
}

function showError(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}
function clearError(el) {
  el.classList.add('hidden');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(createdAt) {
  const d = new Date(createdAt.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/* ---------------- Navegación ---------------- */

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  $(`#view-${name}`).classList.remove('hidden');
  if (name === 'feed') loadFeed();
  if (name === 'friends') loadFriends();
  if (name === 'magazines') loadMagazines();
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.nav));
});

/* ---------------- Autenticación ---------------- */

function setAuthTab(which) {
  $('#tab-login').classList.toggle('active', which === 'login');
  $('#tab-register').classList.toggle('active', which === 'register');
  $('#login-form').classList.toggle('hidden', which !== 'login');
  $('#register-form').classList.toggle('hidden', which !== 'register');
  clearError($('#auth-error'));
}
$('#tab-login').addEventListener('click', () => setAuthTab('login'));
$('#tab-register').addEventListener('click', () => setAuthTab('register'));

async function enterApp(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('vinculo_token', token);
  $('#me-name').textContent = user.displayName;
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  showView('feed');
  refreshFriendBadge();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/login', {
      method: 'POST',
      body: { username: $('#login-username').value.trim(), password: $('#login-password').value },
    });
    enterApp(data.token, data.user);
  } catch (err) {
    showError($('#auth-error'), err.message);
  }
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/register', {
      method: 'POST',
      body: {
        displayName: $('#reg-displayname').value.trim(),
        username: $('#reg-username').value.trim(),
        password: $('#reg-password').value,
      },
    });
    enterApp(data.token, data.user);
  } catch (err) {
    showError($('#auth-error'), err.message);
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch { /* da igual */ }
  localStorage.removeItem('vinculo_token');
  location.reload();
});

/* ---------------- Composer ---------------- */

document.querySelectorAll('.ctab').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.composerType = tab.dataset.ctype;
    document.querySelectorAll('.ctab').forEach((t) => t.classList.toggle('active', t === tab));
    $('#photo-fields').classList.toggle('hidden', state.composerType !== 'photo');
    $('#reference-fields').classList.toggle('hidden', state.composerType !== 'reference');
    $('#post-text').placeholder = {
      message: '¿Qué quieres contar a tus amigos?',
      photo: 'Añade un pie de foto (opcional)…',
      reference: '¿Por qué lo recomiendas? (opcional)',
    }[state.composerType];
  });
});

$('#post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError($('#post-error'));
  const formData = new FormData();
  formData.append('type', state.composerType);
  formData.append('text', $('#post-text').value.trim());
  if (state.composerType === 'photo') {
    const file = $('#post-photo').files[0];
    if (!file) return showError($('#post-error'), 'Elige una foto primero.');
    formData.append('photo', file);
  }
  if (state.composerType === 'reference') {
    formData.append('refKind', $('#ref-kind').value);
    formData.append('refTitle', $('#ref-title').value.trim());
    formData.append('refDetail', $('#ref-detail').value.trim());
  }
  try {
    await api('/posts', { method: 'POST', formData });
    $('#post-form').reset();
    loadFeed();
  } catch (err) {
    showError($('#post-error'), err.message);
  }
});

/* ---------------- Muro ---------------- */

async function loadPhotoInto(img, filename) {
  try {
    const res = await fetch(`/api/photos/${filename}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) return;
    img.src = URL.createObjectURL(await res.blob());
  } catch { /* la foto queda vacía */ }
}

function renderPost(post) {
  const div = document.createElement('div');
  div.className = 'post card';
  const own = post.user_id === state.user.id;
  let body = '';
  if (post.type === 'photo') {
    body = `<img class="post-photo" alt="Foto de ${escapeHtml(post.display_name)}" />` +
      (post.text ? `<p class="post-text caption">${escapeHtml(post.text)}</p>` : '');
  } else if (post.type === 'reference') {
    body = `<div class="ref-card">
        <div class="ref-kind">${REF_LABELS[post.ref_kind] || REF_LABELS.otro}</div>
        <div class="ref-title">${escapeHtml(post.ref_title)}</div>
        ${post.ref_detail ? `<div class="ref-detail">${escapeHtml(post.ref_detail)}</div>` : ''}
        ${post.text ? `<p class="post-text caption">«${escapeHtml(post.text)}»</p>` : ''}
      </div>`;
  } else {
    body = `<p class="post-text">${escapeHtml(post.text)}</p>`;
  }
  div.innerHTML = `
    <div class="post-head">
      <span><span class="post-author">${escapeHtml(post.display_name)}</span>
        <span class="post-meta">@${escapeHtml(post.username)}</span></span>
      <span class="post-meta">${formatDate(post.created_at)}
        ${own ? `<button class="post-delete" title="Eliminar">✕</button>` : ''}</span>
    </div>
    ${body}`;
  if (post.type === 'photo' && post.photo_path) {
    loadPhotoInto(div.querySelector('img.post-photo'), post.photo_path);
  }
  if (own) {
    div.querySelector('.post-delete').addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta publicación?')) return;
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      loadFeed();
    });
  }
  return div;
}

async function loadFeed() {
  const { posts } = await api('/feed');
  const list = $('#feed-list');
  list.innerHTML = '';
  posts.forEach((p) => list.appendChild(renderPost(p)));
  $('#feed-empty').classList.toggle('hidden', posts.length > 0);
}

/* ---------------- Amistades ---------------- */

async function refreshFriendBadge() {
  try {
    const { incoming } = await api('/friends');
    const badge = $('#friend-badge');
    badge.textContent = incoming.length;
    badge.classList.toggle('hidden', incoming.length === 0);
  } catch { /* sin badge */ }
}

function personLi(entry, actionsHtml) {
  const li = document.createElement('li');
  li.innerHTML = `
    <span><span class="person-name">${escapeHtml(entry.user.displayName)}</span>
      <span class="person-username">@${escapeHtml(entry.user.username)}</span></span>
    <span class="person-actions">${actionsHtml}</span>`;
  return li;
}

async function loadFriends() {
  const { friends, incoming, outgoing } = await api('/friends');

  const incomingList = $('#incoming-list');
  incomingList.innerHTML = '';
  incoming.forEach((entry) => {
    const li = personLi(entry,
      `<button class="btn primary tiny" data-accept>Aceptar</button>
       <button class="btn ghost tiny" data-reject>Rechazar</button>`);
    li.querySelector('[data-accept]').addEventListener('click', async () => {
      await api(`/friends/${entry.friendshipId}/accept`, { method: 'POST' });
      loadFriends(); refreshFriendBadge();
    });
    li.querySelector('[data-reject]').addEventListener('click', async () => {
      await api(`/friends/${entry.friendshipId}`, { method: 'DELETE' });
      loadFriends(); refreshFriendBadge();
    });
    incomingList.appendChild(li);
  });
  $('#incoming-empty').classList.toggle('hidden', incoming.length > 0);

  const friendsList = $('#friends-list');
  friendsList.innerHTML = '';
  friends.forEach((entry) => {
    const li = personLi(entry, `<button class="btn ghost tiny" data-remove>Quitar</button>`);
    li.querySelector('[data-remove]').addEventListener('click', async () => {
      if (!confirm(`¿Quitar a ${entry.user.displayName} de tus amistades?`)) return;
      await api(`/friends/${entry.friendshipId}`, { method: 'DELETE' });
      loadFriends();
    });
    friendsList.appendChild(li);
  });
  $('#friends-empty').classList.toggle('hidden', friends.length > 0);

  const outgoingList = $('#outgoing-list');
  outgoingList.innerHTML = '';
  outgoing.forEach((entry) => {
    const li = personLi(entry, `<button class="btn ghost tiny" data-cancel>Cancelar</button>`);
    li.querySelector('[data-cancel]').addEventListener('click', async () => {
      await api(`/friends/${entry.friendshipId}`, { method: 'DELETE' });
      loadFriends();
    });
    outgoingList.appendChild(li);
  });
  $('#outgoing-empty').classList.toggle('hidden', outgoing.length > 0);
}

$('#friend-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError($('#friend-error'));
  try {
    await api('/friends/request', {
      method: 'POST',
      body: { username: $('#friend-username').value.trim() },
    });
    $('#friend-form').reset();
    loadFriends();
  } catch (err) {
    showError($('#friend-error'), err.message);
  }
});

/* ---------------- Revistas ---------------- */

async function downloadMagazine(mag) {
  const res = await fetch(`/api/magazines/${mag.id}/pdf`, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vinculo-${MONTHS[mag.month - 1].toLowerCase()}-${mag.year}.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadMagazines() {
  const { magazines } = await api('/magazines');
  const list = $('#magazine-list');
  list.innerHTML = '';
  magazines.forEach((mag) => {
    const div = document.createElement('div');
    div.className = 'magazine-item';
    div.innerHTML = `
      <span>
        <div class="magazine-title">🗞️ ${MONTHS[mag.month - 1]} ${mag.year}</div>
        <div class="magazine-meta">${mag.post_count} recuerdos · PDF listo para imprimir</div>
      </span>
      <button class="btn primary tiny">Descargar PDF</button>`;
    div.querySelector('button').addEventListener('click', () => downloadMagazine(mag));
    list.appendChild(div);
  });
  $('#magazines-empty').classList.toggle('hidden', magazines.length > 0);
}

$('#generate-magazine').addEventListener('click', async () => {
  clearError($('#magazine-error'));
  try {
    await api('/magazines/generate', { method: 'POST', body: {} });
    loadMagazines();
  } catch (err) {
    showError($('#magazine-error'), err.message);
  }
});

/* ---------------- Arranque ---------------- */

(async function init() {
  if (state.token) {
    try {
      const { user } = await api('/me');
      return enterApp(state.token, user);
    } catch {
      localStorage.removeItem('vinculo_token');
      state.token = null;
    }
  }
  $('#auth-view').classList.remove('hidden');
})();
