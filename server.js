'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { db, friendCircleIds, UPLOADS_DIR, MAGAZINES_DIR } = require('./src/db');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  requireAuth,
} = require('./src/auth');
const { rejectLinks } = require('./src/linkGuard');
const { generateMagazine, startMagazineScheduler } = require('./src/magazine');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PHOTO_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${PHOTO_TYPES[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (PHOTO_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error('Solo se admiten fotos JPEG o PNG.'));
  },
});

const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name });

// ---------------------------------------------------------------- Cuentas

app.post('/api/register', (req, res) => {
  const { username, displayName, password } = req.body || {};
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Faltan datos: usuario, nombre y contraseña.' });
  }
  if (!/^[a-z0-9_]{3,24}$/i.test(username)) {
    return res.status(400).json({ error: 'El usuario debe tener 3-24 letras, números o "_".' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  const linkError = rejectLinks(displayName);
  if (linkError) return res.status(422).json({ error: linkError });
  try {
    const info = db
      .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
      .run(username, displayName.trim(), hashPassword(password));
    const token = createSession(info.lastInsertRowid);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está ocupado.' });
    }
    throw err;
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  res.json({ token: createSession(user.id), user: publicUser(user) });
});

app.post('/api/logout', requireAuth, (req, res) => {
  destroySession(req.sessionToken);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// --------------------------------------------------------------- Amistades

app.get('/api/friends', requireAuth, (req, res) => {
  const me = req.user.id;
  const rows = db
    .prepare(
      `SELECT f.id, f.status, f.requester_id, u.id AS user_id, u.username, u.display_name
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
        WHERE f.requester_id = ? OR f.addressee_id = ?
        ORDER BY f.created_at DESC`
    )
    .all(me, me, me);
  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const r of rows) {
    const entry = {
      friendshipId: r.id,
      user: { id: r.user_id, username: r.username, displayName: r.display_name },
    };
    if (r.status === 'accepted') friends.push(entry);
    else if (r.requester_id === me) outgoing.push(entry);
    else incoming.push(entry);
  }
  res.json({ friends, incoming, outgoing });
});

app.post('/api/friends/request', requireAuth, (req, res) => {
  const { username } = req.body || {};
  const other = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!other) return res.status(404).json({ error: 'No existe nadie con ese nombre de usuario.' });
  if (other.id === req.user.id) {
    return res.status(400).json({ error: 'Contigo ya eres amigo. Busca a otra persona.' });
  }
  const existing = db
    .prepare(
      `SELECT * FROM friendships
        WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
    )
    .get(req.user.id, other.id, other.id, req.user.id);
  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(409).json({ error: 'Ya sois amigos.' });
    }
    if (existing.requester_id === req.user.id) {
      return res.status(409).json({ error: 'Ya le enviaste una solicitud; espera su respuesta.' });
    }
    // La otra persona ya nos había invitado: aceptamos directamente.
    db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id);
    return res.json({ ok: true, accepted: true });
  }
  db.prepare('INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)').run(
    req.user.id,
    other.id
  );
  res.status(201).json({ ok: true, accepted: false });
});

app.post('/api/friends/:id/accept', requireAuth, (req, res) => {
  const info = db
    .prepare(
      `UPDATE friendships SET status = 'accepted'
        WHERE id = ? AND addressee_id = ? AND status = 'pending'`
    )
    .run(req.params.id, req.user.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Esa solicitud no existe o no es para ti.' });
  }
  res.json({ ok: true });
});

app.delete('/api/friends/:id', requireAuth, (req, res) => {
  const info = db
    .prepare('DELETE FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)')
    .run(req.params.id, req.user.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrada.' });
  res.json({ ok: true });
});

// ------------------------------------------------------------ Publicaciones

const REF_KINDS = ['libro', 'pelicula', 'musica', 'lugar', 'otro'];

app.post('/api/posts', requireAuth, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  const type = req.body.type;
  const text = (req.body.text || '').trim();

  if (!['message', 'photo', 'reference'].includes(type)) {
    return res.status(400).json({ error: 'Tipo de publicación no válido.' });
  }

  let refKind = null;
  let refTitle = null;
  let refDetail = null;

  if (type === 'message') {
    if (!text) return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    if (text.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máx. 2000).' });
  } else if (type === 'photo') {
    if (!req.file) return res.status(400).json({ error: 'Falta la foto.' });
  } else {
    refKind = REF_KINDS.includes(req.body.refKind) ? req.body.refKind : 'otro';
    refTitle = (req.body.refTitle || '').trim();
    refDetail = (req.body.refDetail || '').trim();
    if (!refTitle) return res.status(400).json({ error: 'La referencia necesita un título.' });
  }

  const linkError = rejectLinks(text, refTitle, refDetail);
  if (linkError) return res.status(422).json({ error: linkError });

  const info = db
    .prepare(
      `INSERT INTO posts (user_id, type, text, photo_path, ref_kind, ref_title, ref_detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, type, text, req.file ? req.file.filename : null, refKind, refTitle, refDetail);
  const post = db
    .prepare(
      `SELECT p.*, u.username, u.display_name FROM posts p
         JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({ post });
});

app.get('/api/feed', requireAuth, (req, res) => {
  const circle = friendCircleIds(req.user.id);
  const placeholders = circle.map(() => '?').join(',');
  const posts = db
    .prepare(
      `SELECT p.*, u.username, u.display_name
         FROM posts p JOIN users u ON u.id = p.user_id
        WHERE p.user_id IN (${placeholders})
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 100`
    )
    .all(...circle);
  res.json({ posts });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const info = db
    .prepare('DELETE FROM posts WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrada.' });
  res.json({ ok: true });
});

// Las fotos solo son visibles para el círculo de quien las publicó.
app.get('/api/photos/:filename', requireAuth, (req, res) => {
  const post = db
    .prepare('SELECT user_id FROM posts WHERE photo_path = ?')
    .get(req.params.filename);
  if (!post || !friendCircleIds(req.user.id).includes(post.user_id)) {
    return res.status(404).json({ error: 'Foto no encontrada.' });
  }
  res.sendFile(path.join(UPLOADS_DIR, path.basename(req.params.filename)));
});

// ----------------------------------------------------------------- Revistas

app.get('/api/magazines', requireAuth, (req, res) => {
  const magazines = db
    .prepare('SELECT id, year, month, post_count, created_at FROM magazines WHERE user_id = ? ORDER BY year DESC, month DESC')
    .all(req.user.id);
  res.json({ magazines });
});

// Genera (o regenera) la revista de un mes concreto bajo demanda.
app.post('/api/magazines/generate', requireAuth, async (req, res) => {
  const now = new Date();
  const year = Number(req.body?.year) || now.getUTCFullYear();
  const month = Number(req.body?.month) || now.getUTCMonth() + 1;
  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'Mes o año no válidos.' });
  }
  const magazine = await generateMagazine(req.user.id, year, month, { force: true });
  if (!magazine) {
    return res.status(404).json({ error: 'Ese mes no tiene publicaciones en tu círculo.' });
  }
  res.json({ magazine });
});

app.get('/api/magazines/:id/pdf', requireAuth, (req, res) => {
  const mag = db
    .prepare('SELECT * FROM magazines WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!mag) return res.status(404).json({ error: 'Revista no encontrada.' });
  res.download(path.join(MAGAZINES_DIR, path.basename(mag.file_path)), mag.file_path);
});

// ------------------------------------------------------------------ Arranque

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error inesperado del servidor.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  startMagazineScheduler();
  app.listen(port, () => {
    console.log(`Vínculo escuchando en http://localhost:${port}`);
  });
}

module.exports = app;
