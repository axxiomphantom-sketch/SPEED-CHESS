import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Must run before any process.env read below (and before lib/supabase.ts is imported).
import './lib/loadEnv.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../..');
export const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const WEB_DIST = path.join(ROOT, 'apps/web/dist');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Persist a generated JWT secret so sessions survive restarts in development. */
function loadSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  console.warn('[config] JWT_SECRET not set — generated a development secret in data/.jwt-secret. Set JWT_SECRET in production.');
  return secret;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: loadSecret(),
  sessionDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  smtpUrl: process.env.SMTP_URL,
  mailFrom: process.env.MAIL_FROM ?? 'SPEED CHESS <no-reply@speedchess.local>',
  dbFile: process.env.DATABASE_FILE
    ? (path.isAbsolute(process.env.DATABASE_FILE) ? process.env.DATABASE_FILE : path.resolve(ROOT, process.env.DATABASE_FILE))
    : path.join(DATA_DIR, 'speed-chess.db'),
  allowEmailVerificationBypass: process.env.EMAIL_VERIFICATION_REQUIRED !== 'true',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  /** Supabase project URL (public). Empty string when unset so nothing invents a hostname. */
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  /** Publishable/anon key. Never a service-role key: this value is also shipped to the browser. */
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
};
