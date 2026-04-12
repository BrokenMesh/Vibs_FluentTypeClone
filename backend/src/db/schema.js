import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let db;

export function getDb() {
  return db;
}

// Helper: convert BigInt lastInsertRowid to number
export function rowid(result) {
  return Number(result.lastInsertRowid);
}

export function initDb(dbPath = './data/fluenttype.db') {
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);

  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");

  // Migrations
  const sentenceCols = db.prepare("PRAGMA table_info(sentences)").all();
  if (sentenceCols.length && !sentenceCols.some(c => c.name === 'batch_date')) {
    db.exec("ALTER TABLE sentences ADD COLUMN batch_date TEXT NOT NULL DEFAULT ''");
  }

  const reviewCols = db.prepare("PRAGMA table_info(sentence_reviews)").all();
  if (reviewCols.length && !reviewCols.some(c => c.name === 'track')) {
    db.exec("ALTER TABLE sentence_reviews ADD COLUMN track TEXT NOT NULL DEFAULT 'typing'");
    db.exec("UPDATE sentence_reviews SET track = 'dictation' WHERE mode IN ('dictation', 'dictation-practice')");
  }

  const profileCols = db.prepare("PRAGMA table_info(language_profiles)").all();
  if (profileCols.length && !profileCols.some(c => c.name === 'daily_new_limit')) {
    db.exec("ALTER TABLE language_profiles ADD COLUMN daily_new_limit INTEGER NOT NULL DEFAULT 10");
  }
  if (profileCols.length && !profileCols.some(c => c.name === 'daily_due_limit')) {
    db.exec("ALTER TABLE language_profiles ADD COLUMN daily_due_limit INTEGER NOT NULL DEFAULT 30");
  }
  if (profileCols.length && !profileCols.some(c => c.name === 'daily_batch_size')) {
    db.exec("ALTER TABLE language_profiles ADD COLUMN daily_batch_size INTEGER NOT NULL DEFAULT 10");
  }
  if (profileCols.length && !profileCols.some(c => c.name === 'srs_strength')) {
    db.exec("ALTER TABLE language_profiles ADD COLUMN srs_strength REAL NOT NULL DEFAULT 1.0");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS language_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_language TEXT NOT NULL,
      native_language TEXT NOT NULL,
      skill_score REAL NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      daily_new_limit INTEGER NOT NULL DEFAULT 10,
      daily_due_limit INTEGER NOT NULL DEFAULT 30,
      daily_batch_size INTEGER NOT NULL DEFAULT 10,
      srs_strength REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES language_profiles(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      translation TEXT NOT NULL,
      times_seen INTEGER NOT NULL DEFAULT 0,
      times_correct INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 1,
      next_review INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'ai',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sentences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES language_profiles(id) ON DELETE CASCADE,
      source_text TEXT NOT NULL,
      target_text TEXT NOT NULL,
      difficulty REAL NOT NULL DEFAULT 0,
      word_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sentence_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence_id INTEGER NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL REFERENCES language_profiles(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      wpm REAL NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 1,
      next_review INTEGER NOT NULL DEFAULT 0,
      track TEXT NOT NULL DEFAULT 'typing',
      reviewed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS daily_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES language_profiles(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      translation TEXT NOT NULL,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_whitelist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      added_by TEXT NOT NULL DEFAULT 'admin',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Seed admin email into whitelist
  const adminEmail = process.env.ADMIN_EMAIL || 'elkordhicham@gmail.com';
  db.prepare(
    'INSERT OR IGNORE INTO email_whitelist (email, added_by) VALUES (?, ?)'
  ).run(adminEmail, 'system');

  return db;
}
