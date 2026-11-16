import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Must run before any process.env read below (and before lib/supabase.ts is imported).
import './lib/loadEnv.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** First value that is actually present and non-blank; empty string when none is. */
function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/**
 * Resolves the Supabase settings from an environment.
 *
 * Pure and exported so the precedence rule is directly testable: the server prefers its own names
 * and falls back to the `VITE_` pair the frontend build uses, and a blank value counts as unset.
 * Taking `env` as an argument (instead of reading `process.env`) is what lets a test assert all
 * four combinations without mutating the real environment.
 */
export function resolveSupabaseConfig(env: Record<string, string | undefined>): { url: string; key: string } {
  return {
    url: firstNonEmpty(env.SUPABASE_URL, env.VITE_SUPABASE_URL),
    key: firstNonEmpty(env.SUPABASE_PUBLISHABLE_KEY, env.VITE_SUPABASE_PUBLISHABLE_KEY),
  };
}
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
  /**
   * Supabase project URL (public). Empty string when unset so nothing invents a hostname.
   *
   * The server prefers its own names (`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`) and falls back
   * to the `VITE_` pair, so a single `.env.local` written for the frontend configures the API too.
   * Keep the fallback: removing it would break every deployment that only sets the `VITE_` values.
   * A blank string counts as unset, otherwise an empty assignment in a host's dashboard would
   * silently override a working `VITE_` value.
   */
  supabaseUrl: resolveSupabaseConfig(process.env).url,
  /** Publishable/anon key. Never a service-role key: this value is also shipped to the browser. */
  supabasePublishableKey: resolveSupabaseConfig(process.env).key,
};
