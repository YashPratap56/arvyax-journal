const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'journal.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      ambience    TEXT NOT NULL,
      text        TEXT NOT NULL,
      emotion     TEXT,
      keywords    TEXT,   -- JSON array stored as string
      summary     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_journal_user_id   ON journal_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_journal_created   ON journal_entries(created_at);
    CREATE INDEX IF NOT EXISTS idx_journal_ambience  ON journal_entries(ambience);
    CREATE INDEX IF NOT EXISTS idx_journal_emotion   ON journal_entries(emotion);
  `);
}

module.exports = { getDb };
