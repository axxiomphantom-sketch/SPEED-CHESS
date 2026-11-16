import type { NextFunction, Response } from 'express';
import { db, nowIso } from '../db/index.js';
import { id, sha256, token } from './ids.js';
import type { AuthedRequest } from './auth.js';

/**
 * Guest identity.
 *
 * A guest is a *token*, deliberately not a row in `users`. Every social surface — leaderboards,
 * player search, clubs, ratings, friend requests — queries `users`, so keeping guests out of that
 * table makes them invisible to those queries by construction rather than by remembering to add
 * `WHERE ... != 'guest'` in twenty places. The cost is that guest games carry no `white_id`, which
 * the game routes already tolerate because `local` games store `white_id = NULL`.
 *
 * The token lives in an httpOnly cookie so the browser never has to manage it, and it is stored
 * hashed for the same reason session tokens are.
 */

export const GUEST_COOKIE = 'sc_guest';

/** Long enough for a long bot game or a puzzle session, short enough to be disposable. */
const GUEST_TTL_HOURS = 24;

export interface GuestRow {
  id: string;
  token_hash: string;
  display_name: string;
  avatar_icon: string | null;
  created_at: string;
  expires_at: string;
}

export interface GuestIdentity {
  id: string;
  displayName: string;
  avatarIcon: string | null;
}

/** Small, friendly, obviously-not-a-real-player display names. */
const GUEST_NAMES = [
  'Guest Knight', 'Guest Bishop', 'Guest Rook', 'Guest Pawn',
  'Guest Queen', 'Guest King', 'Guest Gambit', 'Guest Tempo',
];

/**
 * Resolves a raw guest token to an identity, or null.
 *
 * Expiry is checked in SQL so an expired token can never authenticate even if a cleanup run has
 * not happened yet — the sweep is a convenience, not the correctness guarantee.
 */
export function guestFromToken(raw: string | undefined): GuestIdentity | null {
  if (!raw) return null;
  const row = db.prepare(
    `SELECT * FROM guest_sessions WHERE token_hash = ? AND expires_at > ?`
  ).get(sha256(raw), nowIso().replace('T', ' ').slice(0, 19)) as GuestRow | undefined;
  if (!row) return null;
  return { id: row.id, displayName: row.display_name, avatarIcon: row.avatar_icon };
}

/** Creates a fresh guest session and returns the raw token plus its identity. */
export function createGuest(avatarIcon?: string | null): { token: string; guest: GuestIdentity; expiresAt: string } {
  const raw = token(32);
  const guestId = id('gst_');
  const displayName = GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
  const expiresAt = new Date(Date.now() + GUEST_TTL_HOURS * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare(
    `INSERT INTO guest_sessions (id, token_hash, display_name, avatar_icon, expires_at) VALUES (?,?,?,?,?)`
  ).run(guestId, sha256(raw), displayName, avatarIcon ?? null, expiresAt);
  return { token: raw, guest: { id: guestId, displayName, avatarIcon: avatarIcon ?? null }, expiresAt };
}

export function setGuestIcon(guestId: string, icon: string | null): void {
  db.prepare('UPDATE guest_sessions SET avatar_icon = ? WHERE id = ?').run(icon, guestId);
}

/**
 * Attaches `req.guest` when the request carries a valid guest cookie.
 *
 * Always calls `next()`: guests are optional context, never a gate. `requireAuth` still rejects a
 * guest-only request, so no account-level route can be reached with a guest token by accident.
 */
export function attachGuest(req: AuthedRequest, _res: Response, next: NextFunction) {
  const raw = req.cookies?.[GUEST_COOKIE];
  if (raw) {
    const guest = guestFromToken(raw);
    if (guest) req.guest = guest;
  }
  next();
}

/** Cookie options mirror the session cookie so both behave identically behind a proxy. */
export function guestCookieOptions() {
  const crossSite = (process.env.COOKIE_SAMESITE ?? '').toLowerCase() === 'none';
  return {
    httpOnly: true,
    sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
    secure: crossSite || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_TTL_HOURS * 3600_000,
  };
}

export function clearGuestCookieOptions() {
  const { maxAge: _maxAge, ...rest } = guestCookieOptions();
  return rest;
}

/**
 * Deletes expired guests and the unfinished games they owned.
 *
 * Runs on boot and hourly. Only *active* guest games are removed: a finished game is harmless, and
 * keeping it means a guest who later signs up can still find their result if it was linked.
 */
export function sweepExpiredGuests(): { guests: number; games: number } {
  const cutoff = nowIso();
  const expired = db.prepare('SELECT id FROM guest_sessions WHERE expires_at <= ?').all(cutoff) as { id: string }[];
  if (expired.length === 0) return { guests: 0, games: 0 };
  let games = 0;
  const tx = db.transaction(() => {
    for (const g of expired) {
      // Only unfinished games are removed. A finished game is a record of something the guest did;
      // deleting it would also destroy the move list other players may have seen.
      const res = db.prepare(
        `DELETE FROM games WHERE guest_owner_id = ? AND status = 'active' AND mode IN ('computer','local')`
      ).run(g.id);
      games += res.changes;
    }
    db.prepare('DELETE FROM guest_sessions WHERE expires_at <= ?').run(cutoff);
  });
  tx();
  return { guests: expired.length, games };
}

/**
 * True when this guest created the game.
 *
 * Kept in one place because three routes need the same answer (read, move, engine-move) and a
 * mismatch between them would be a silent privilege bug rather than an obvious crash.
 */
export function guestOwnsGame(
  game: { guest_owner_id?: string | null },
  guest: GuestIdentity | null | undefined,
): boolean {
  return Boolean(guest && game.guest_owner_id && game.guest_owner_id === guest.id);
}

