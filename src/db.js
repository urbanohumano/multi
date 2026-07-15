'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.VINCULO_DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const MAGAZINES_DIR = path.join(DATA_DIR, 'magazines');

for (const dir of [DATA_DIR, UPLOADS_DIR, MAGAZINES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'vinculo.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (requester_id, addressee_id),
    CHECK (requester_id <> addressee_id)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('message', 'photo', 'reference')),
    text       TEXT NOT NULL DEFAULT '',
    photo_path TEXT,
    ref_kind   TEXT,
    ref_title  TEXT,
    ref_detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts (user_id, created_at);

  CREATE TABLE IF NOT EXISTS magazines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year       INTEGER NOT NULL,
    month      INTEGER NOT NULL,
    file_path  TEXT NOT NULL,
    post_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, year, month)
  );
`);

/** IDs del usuario y de todos sus amigos aceptados. */
function friendCircleIds(userId) {
  const rows = db
    .prepare(
      `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS friend_id
         FROM friendships
        WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`
    )
    .all(userId, userId, userId);
  return [userId, ...rows.map((r) => r.friend_id)];
}

module.exports = { db, friendCircleIds, DATA_DIR, UPLOADS_DIR, MAGAZINES_DIR };
