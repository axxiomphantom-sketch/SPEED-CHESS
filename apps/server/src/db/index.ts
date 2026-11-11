import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from '../config.js';

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Applies db/schema.sql. All statements are idempotent (CREATE ... IF NOT EXISTS). */
export function migrate(): void {
  const schema = fs.readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8');
  db.exec(schema);
  // Additive migrations for databases created before a column existed (CREATE TABLE IF NOT EXISTS
  // never alters an existing table).
  const gameColumns = (db.prepare('PRAGMA table_info(games)').all() as { name: string }[]).map(c => c.name);
  if (!gameColumns.includes('owner_id')) {
    db.exec('ALTER TABLE games ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL');
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations (id) VALUES ('001_init')").run();
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
