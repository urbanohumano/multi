'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { db, friendCircleIds, UPLOADS_DIR, MAGAZINES_DIR } = require('./db');

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const REF_KIND_LABELS = {
  libro: 'Libro',
  pelicula: 'Película',
  musica: 'Música',
  lugar: 'Lugar',
  otro: 'Recomendación',
};

// A4 en puntos, con márgenes generosos para impresión.
const PAGE = { size: 'A4', margin: 56 };
const INK = '#1f2430';
const ACCENT = '#b3541e';
const MUTED = '#6b7280';

function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const end = `${nextMonth.y}-${String(nextMonth.m).padStart(2, '0')}-01 00:00:00`;
  return { start, end };
}

function postsForMagazine(userId, year, month) {
  const circle = friendCircleIds(userId);
  const { start, end } = monthRange(year, month);
  const placeholders = circle.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT p.*, u.display_name, u.username
         FROM posts p JOIN users u ON u.id = p.user_id
        WHERE p.user_id IN (${placeholders})
          AND p.created_at >= ? AND p.created_at < ?
        ORDER BY p.created_at ASC`
    )
    .all(...circle, start, end);
}

function formatDay(createdAt) {
  const d = new Date(createdAt.replace(' ', 'T') + 'Z');
  return `${d.getUTCDate()} de ${MONTH_NAMES[d.getUTCMonth()].toLowerCase()}`;
}

function ensureRoom(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function drawDivider(doc) {
  ensureRoom(doc, 30);
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.moveTo(x, doc.y + 10).lineTo(x + width, doc.y + 10)
    .lineWidth(0.5).strokeColor('#d8d2c8').stroke();
  doc.y += 24;
}

function drawByline(doc, post) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT)
    .text(post.display_name, { continued: true })
    .font('Helvetica').fillColor(MUTED)
    .text(`  ·  ${formatDay(post.created_at)}`);
  doc.moveDown(0.4);
}

function drawMessage(doc, post) {
  ensureRoom(doc, 90);
  drawByline(doc, post);
  doc.font('Helvetica').fontSize(12).fillColor(INK)
    .text(post.text, { lineGap: 4 });
}

function drawPhoto(doc, post) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  ensureRoom(doc, 300);
  drawByline(doc, post);
  const photoFile = post.photo_path ? path.join(UPLOADS_DIR, post.photo_path) : null;
  if (photoFile && fs.existsSync(photoFile)) {
    try {
      doc.image(photoFile, doc.page.margins.left, doc.y, {
        fit: [width, 320],
        align: 'center',
      });
      doc.y += 330;
    } catch {
      doc.font('Helvetica-Oblique').fontSize(11).fillColor(MUTED)
        .text('[Foto no disponible]');
    }
  }
  if (post.text) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(INK)
      .text(post.text, { lineGap: 3 });
  }
}

function drawReference(doc, post) {
  ensureRoom(doc, 120);
  drawByline(doc, post);
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const label = REF_KIND_LABELS[post.ref_kind] || REF_KIND_LABELS.otro;

  const startY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
    .text(label.toUpperCase(), x + 14, startY + 12);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK)
    .text(post.ref_title || '', x + 14, doc.y + 4, { width: width - 28 });
  if (post.ref_detail) {
    doc.font('Helvetica').fontSize(11).fillColor(MUTED)
      .text(post.ref_detail, x + 14, doc.y + 2, { width: width - 28 });
  }
  if (post.text) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(INK)
      .text(`"${post.text}"`, x + 14, doc.y + 6, { width: width - 28, lineGap: 3 });
  }
  const endY = doc.y + 12;
  doc.rect(x, startY, width, endY - startY).lineWidth(0.75).strokeColor('#d8d2c8').stroke();
  doc.rect(x, startY, 4, endY - startY).fillColor(ACCENT).fill();
  doc.x = x;
  doc.y = endY;
}

function drawCover(doc, user, year, month, postCount) {
  const centerOpts = { align: 'center' };
  doc.rect(0, 0, doc.page.width, doc.page.height).fillColor('#faf6ef').fill();
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(14);
  doc.text('V Í N C U L O', 0, 160, centerOpts);
  doc.moveDown(2);
  doc.fillColor(INK).fontSize(42);
  doc.text(`${MONTH_NAMES[month - 1]} ${year}`, centerOpts);
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(14).fillColor(MUTED);
  doc.text(`La revista mensual de ${user.display_name} y sus amistades`, centerOpts);
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`${postCount} ${postCount === 1 ? 'recuerdo' : 'recuerdos'} de este mes`, centerOpts);

  const lineY = doc.page.height - 140;
  doc.moveTo(doc.page.width / 2 - 60, lineY).lineTo(doc.page.width / 2 + 60, lineY)
    .lineWidth(1).strokeColor(ACCENT).stroke();
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED);
  doc.text('Impresa para guardar, no para hacer scroll', 0, lineY + 12, centerOpts);
}

function addPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(String(i), 0, doc.page.height - 40, {
      width: doc.page.width,
      align: 'center',
      lineBreak: false,
    });
  }
}

/**
 * Genera la revista PDF de un usuario para (year, month) y la registra en la
 * base de datos. Devuelve la fila de la revista, o null si el mes no tiene
 * publicaciones. Si ya existía, la devuelve sin regenerar (salvo force).
 */
async function generateMagazine(userId, year, month, { force = false } = {}) {
  const existing = db
    .prepare('SELECT * FROM magazines WHERE user_id = ? AND year = ? AND month = ?')
    .get(userId, year, month);
  if (existing && !force) return existing;

  const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const posts = postsForMagazine(userId, year, month);
  if (posts.length === 0) return null;

  const fileName = `revista-${user.username}-${year}-${String(month).padStart(2, '0')}.pdf`;
  const filePath = path.join(MAGAZINES_DIR, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ ...PAGE, bufferPages: true, autoFirstPage: true });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    drawCover(doc, user, year, month, posts.length);
    doc.addPage();

    posts.forEach((post, i) => {
      if (i > 0) drawDivider(doc);
      if (post.type === 'photo') drawPhoto(doc, post);
      else if (post.type === 'reference') drawReference(doc, post);
      else drawMessage(doc, post);
    });

    addPageNumbers(doc);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  db.prepare(
    `INSERT INTO magazines (user_id, year, month, file_path, post_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, year, month)
     DO UPDATE SET file_path = excluded.file_path, post_count = excluded.post_count`
  ).run(userId, year, month, fileName, posts.length);

  return db
    .prepare('SELECT * FROM magazines WHERE user_id = ? AND year = ? AND month = ?')
    .get(userId, year, month);
}

/**
 * Al empezar un mes nuevo, genera automáticamente la revista del mes anterior
 * para todos los usuarios que aún no la tengan. Idempotente: se puede llamar
 * tantas veces como se quiera.
 */
async function generatePendingMagazines(now = new Date()) {
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = prev.getUTCFullYear();
  const month = prev.getUTCMonth() + 1;
  const users = db.prepare('SELECT id FROM users').all();
  const generated = [];
  for (const { id } of users) {
    const already = db
      .prepare('SELECT 1 FROM magazines WHERE user_id = ? AND year = ? AND month = ?')
      .get(id, year, month);
    if (already) continue;
    const mag = await generateMagazine(id, year, month);
    if (mag) generated.push(mag);
  }
  return { year, month, generated };
}

/** Comprueba cada hora si ha cambiado el mes y genera las revistas pendientes. */
function startMagazineScheduler(logger = console) {
  const run = () =>
    generatePendingMagazines().then(({ year, month, generated }) => {
      if (generated.length > 0) {
        logger.log(`[revista] Generadas ${generated.length} revistas de ${month}/${year}`);
      }
    }).catch((err) => logger.error('[revista] Error generando revistas:', err));
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return timer;
}

module.exports = { generateMagazine, generatePendingMagazines, startMagazineScheduler, MONTH_NAMES };
