import { db, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { id, token, sha256 } from '../lib/ids.js';
import type { Role } from '../lib/auth.js';

/**
 * The bridge between Supabase identity and SPEED CHESS data.
 *
 * Supabase owns credentials (password hashing, email verification, reset flows). Everything that
 * makes this a chess platform — ratings, games, puzzles, clubs, tournaments — lives in the existing
 * SQLite schema and references `users.id`. Rather than migrate 40 tables, each Supabase user is
 * linked to exactly one local `users` row:
 *
 *     users.supabase_user_id  ->  auth.users.id
 *
 * `password_hash` is stored as the literal `supabase:managed`, which can never match any password
 * hash verification — the local password path is dead for these accounts, so a Supabase-managed
 * player cannot be logged into through the legacy scrypt route by accident.
 */

export const SUPABASE_PASSWORD_SENTINEL = 'supabase:managed';

export interface LinkedUserRow {
  id: string;
  username: string;
  email: string;
  role: Role;
  status: string;
  country: string | null;
  avatar_url: string | null;
  bio: string | null;
  title: string | null;
  plan: string;
  onboarded: number;
  created_at: string;
  email_verified: number;
  supabase_user_id: string | null;
  password_hash: string;
}

export function findBySupabaseId(supabaseUserId: string): LinkedUserRow | null {
  return (db.prepare('SELECT * FROM users WHERE supabase_user_id = ?')
    .get(supabaseUserId) as LinkedUserRow | undefined) ?? null;
}

/**
 * Normalise a desired username into the same shape the sign-up form validates:
 * 3–24 characters, letters/numbers/underscore. Falls back to the email local-part and finally to a
 * generated suffix so provisioning never fails on a hostile display name.
 */
export function normaliseUsername(raw: string | null | undefined, fallbackSeed?: string): string {
  const source = (raw ?? '').trim() || (fallbackSeed ?? '').split('@')[0] || 'player';
  // Lower-case first, otherwise `raw.replace(/[^a-z0-9_]/)` turns capital letters into underscores
  // (the earlier version turned "ab" into "ab_XmI" and "✂✂✂" into "WCA").
  let candidate = source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!candidate) candidate = 'player';
  if (candidate.length < 3) {
    // Pad deterministically rather than randomly, so a given input always yields the same name.
    candidate = `${candidate}${(fallbackSeed ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 3) || 'plr'}`;
    candidate = candidate.replace(/^_+|_+$/g, '');
  }
  candidate = candidate.slice(0, 20).replace(/_+$/g, '');
  if (candidate.length < 3) candidate = `player_${candidate}`.slice(0, 20);
  return candidate;
}

/** Appends a numeric suffix until the username is free. */
function uniqueUsername(base: string): string {
  const taken = db.prepare('SELECT 1 FROM users WHERE username_lower = ?');
  let candidate = base;
  let attempt = 1;
  while (taken.get(candidate.toLowerCase())) {
    attempt += 1;
    candidate = `${base.slice(0, 20)}${attempt}`;
    if (attempt > 500) { candidate = `player_${token(4)}`; break; }
  }
  return candidate;
}

export interface EnsureLocalUserInput {
  supabaseUserId: string;
  email: string | null;
  username: string | null;
  emailVerified: boolean;
  country?: string | null;
}

/**
 * Idempotently returns the local `users` row for a verified Supabase user, creating it on first
 * sign-in. This mirrors the database trigger that creates the Supabase `profiles` row: the trigger
 * owns the Supabase side, this owns the chess side, and both are keyed on the same UUID.
 */
export function ensureLocalUser(input: EnsureLocalUserInput): LinkedUserRow {
  const existing = findBySupabaseId(input.supabaseUserId);
  if (existing) {
    // Keep the two systems in step if the address was confirmed after the row was created.
    if (input.emailVerified && !existing.email_verified) {
      db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
      existing.email_verified = 1;
    }
    return existing;
  }

  const email = (input.email ?? '').trim().toLowerCase();
  if (!email) throw new Error('A verified Supabase user must have an email address.');

  // A local account may already exist with the same email (for example a player who signed up
  // before Supabase was enabled). Link rather than duplicate, so no history is lost.
  const byEmail = db.prepare('SELECT * FROM users WHERE email_lower = ?').get(email) as LinkedUserRow | undefined;
  if (byEmail) {
    // Account-takeover guard. Linking is an identity merge, so the address must be *proven*.
    // Otherwise anyone could register a victim's email in Supabase and inherit their games.
    // The /sync route already refuses unverified sessions; this is defence in depth.
    if (!input.emailVerified) {
      throw new Error('Cannot link an unverified email address to an existing account.');
    }
    if (byEmail.supabase_user_id && byEmail.supabase_user_id !== input.supabaseUserId) {
      throw new Error('That account is already linked to a different Supabase user.');
    }
    db.prepare('UPDATE users SET supabase_user_id = ?, updated_at = ? WHERE id = ?')
      .run(input.supabaseUserId, nowIso(), byEmail.id);
    if (input.emailVerified && !byEmail.email_verified) {
      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(byEmail.id);
    }
    return findBySupabaseId(input.supabaseUserId)!;
  }

  const username = uniqueUsername(normaliseUsername(input.username, email));
  const userId = id('usr_');
  db.prepare(
    `INSERT INTO users (id, username, username_lower, email, email_lower, email_verified, password_hash,
       role, status, country, supabase_user_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?, 'player', 'active', ?, ?, ?, ?)`,
  ).run(
    userId, username, username.toLowerCase(), email, email, input.emailVerified ? 1 : 0,
    SUPABASE_PASSWORD_SENTINEL, input.country ?? null, input.supabaseUserId, nowIso(), nowIso(),
  );
  return findBySupabaseId(input.supabaseUserId)!;
}

/** Stores the Supabase UUID on an existing local row (used by the link endpoint). */
export function linkSupabaseUser(userId: string, supabaseUserId: string): void {
  db.prepare('UPDATE users SET supabase_user_id = ?, updated_at = ? WHERE id = ?')
    .run(supabaseUserId, nowIso(), userId);
}

/** Issues the same session the legacy login issues, so every existing route keeps working. */
export function issueLocalSession(userId: string, req: { get(name: string): string | undefined; ip?: string }) {
  const raw = token(32);
  const sessionId = id('ses_');
  const expires = new Date(Date.now() + config.sessionDays * 864e5).toISOString();
  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, expires_at) VALUES (?,?,?,?,?,?)',
  ).run(sessionId, userId, sha256(raw), req.get('user-agent')?.slice(0, 200) ?? null, req.ip ?? null, expires);
  return { raw, sessionId };
}
