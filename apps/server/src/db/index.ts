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
  db.prepare("INSERT OR IGNORE INTO schema_migrations (id) VALUES ('001_init')").run();
}

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
