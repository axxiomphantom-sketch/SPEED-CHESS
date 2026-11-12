/**
 * In-game chat.
 *
 * Rules, all enforced server-side:
 *   - only the two players in the game may post (spectators can read);
 *   - messages are plain text, length-capped, and stripped of control characters;
 *   - a finished game is read-only, so chat cannot be used to harass someone after the result;
 *   - the same message sent repeatedly in quick succession is rejected as flooding.
 *
 * Chat is deliberately *not* tied into the private `messages` table: that one is a two-party
 * inbox with its own unread tracking, while this is scoped to a single game and readable by
 * anyone watching it.
 */
import { db, nowIso } from '../db/index.js';
import { id } from '../lib/ids.js';

/** Chat line as sent to clients. */
export interface GameMessage {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  /** True when the author is one of the two players rather than a spectator. */
  fromPlayer: boolean;
}

export const MAX_MESSAGE_LENGTH = 400;
const FLOOD_WINDOW_MS = 5_000;
const FLOOD_MAX_MESSAGES = 5;

/**
 * Removes control characters and collapses runs of whitespace. This keeps a message on one line
 * and stops a "message" that is really a wall of newlines from breaking the layout of the chat
 * panel for the other player.
 */
export function normaliseBody(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

/** True when `userId` is one of the two players. Spectators get `false`. */
export function isParticipant(gameId: string, userId: string): boolean {
  const row = db.prepare('SELECT white_id, black_id FROM games WHERE id = ?').get(gameId) as
    | { white_id: string | null; black_id: string | null }
    | undefined;
  if (!row) return false;
  return row.white_id === userId || row.black_id === userId;
}

/** A game that has not finished. Chat on a finished game is read-only. */
export function isGameOpen(gameId: string): boolean {
  const row = db.prepare('SELECT status FROM games WHERE id = ?').get(gameId) as { status: string } | undefined;
  return row !== undefined && row.status !== 'finished';
}

/**
 * Rejects exact repeats inside a short window. Trivially cheap, and it stops the common abuse of
 * holding Enter on the same line.
 */
function isFlooding(gameId: string, userId: string, body: string): boolean {
  const recent = db.prepare(
    `SELECT body FROM game_messages
      WHERE game_id = ? AND user_id = ?
        AND created_at >= datetime('now', ?)
      ORDER BY created_at DESC LIMIT ?`,
  ).all(gameId, userId, `-${FLOOD_WINDOW_MS / 1000} seconds`, FLOOD_MAX_MESSAGES) as { body: string }[];
  if (recent.length < FLOOD_MAX_MESSAGES) return false;
  return recent.every(r => r.body === body);
}

export type PostResult =
  | { ok: true; message: GameMessage }
  | { ok: false; status: number; error: string };

/** Validates and stores a message. Returns the stored row so it can be broadcast. */
export function postMessage(gameId: string, userId: string, rawBody: string): PostResult {
  const game = db.prepare('SELECT id, status, white_id, black_id FROM games WHERE id = ?').get(gameId) as
    | { id: string; status: string; white_id: string | null; black_id: string | null }
    | undefined;
  if (!game) return { ok: false, status: 404, error: 'That game does not exist.' };
  if (game.white_id !== userId && game.black_id !== userId) {
    return { ok: false, status: 403, error: 'Only the two players can send messages in this game.' };
  }
  if (game.status === 'finished') {
    return { ok: false, status: 409, error: 'This game has finished, so chat is closed.' };
  }

  const body = normaliseBody(rawBody);
  if (!body) return { ok: false, status: 400, error: 'Enter a message first.' };
  if (isFlooding(gameId, userId, body)) {
    return { ok: false, status: 429, error: 'Repeated message. Wait a moment before sending again.' };
  }

  const messageId = id('gmsg_');
  const createdAt = nowIso();
  db.prepare('INSERT INTO game_messages (id, game_id, user_id, body, created_at) VALUES (?,?,?,?,?)')
    .run(messageId, gameId, userId, body, createdAt);

  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string };
  return {
    ok: true,
    message: {
      id: messageId,
      userId,
      username: user.username,
      body,
      createdAt,
      fromPlayer: true,
    },
  };
}

/** Full history for a game, oldest first. Readable by players and spectators alike. */
export function messagesFor(gameId: string, limit = 200): GameMessage[] {
  const rows = db.prepare(
    `SELECT m.id, m.user_id, m.body, m.created_at, u.username, g.white_id, g.black_id
       FROM game_messages m
       JOIN users u ON u.id = m.user_id
       JOIN games g ON g.id = m.game_id
      WHERE m.game_id = ?
      ORDER BY m.created_at ASC
      LIMIT ?`,
  ).all(gameId, limit) as Array<{
    id: string; user_id: string; body: string; created_at: string; username: string;
    white_id: string | null; black_id: string | null;
  }>;

  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    body: r.body,
    createdAt: r.created_at,
    fromPlayer: r.user_id === r.white_id || r.user_id === r.black_id,
  }));
}
