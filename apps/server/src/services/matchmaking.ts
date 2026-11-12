import { db } from '../db/index.js';
import { getUserRating } from '../lib/service.js';
import type { Category } from '../lib/ratings.js';
import { createGame, gamePayload, type GameRow } from './games.js';
import { hub } from './hub.js';

export interface QueueEntry {
  userId: string;
  username: string;
  rating: number;
  category: Category;
  seconds: number;
  increment: number;
  rated: boolean;
  joinedAt: number;
  gameId?: string;
}

/**
 * Rating window opens at ±100 and widens by 60 every 3 seconds, capped at ±900.
 * After 20 seconds of waiting any rating is accepted, because a player who has waited that long
 * would rather play a mismatched opponent than not play at all. Unrated games always accept any
 * opponent — the player has explicitly opted out of rating stakes.
 */
export function windowFor(waitMs: number) {
  if (waitMs >= 20_000) return Number.POSITIVE_INFINITY;
  return Math.min(900, 100 + Math.floor(waitMs / 3000) * 60);
}

class Matchmaker {
  private queue: QueueEntry[] = [];

  enqueue(entry: Omit<QueueEntry, 'joinedAt'>): { matched?: GameRow; waiting: boolean } {
    this.queue = this.queue.filter(e => e.userId !== entry.userId);
    const now = Date.now();
    const candidates = this.queue.filter(e =>
      e.category === entry.category && e.seconds === entry.seconds && e.increment === entry.increment &&
      e.rated === entry.rated &&
      (!entry.rated || Math.abs(e.rating - entry.rating) <= Math.max(windowFor(now - e.joinedAt), windowFor(0))));
    if (candidates.length > 0) {
      candidates.sort((a, b) => Math.abs(a.rating - entry.rating) - Math.abs(b.rating - entry.rating));
      const opponent = candidates[0];
      this.queue = this.queue.filter(e => e.userId !== opponent.userId);
      const whiteFirst = Math.random() < 0.5;
      const game = createGame({
        whiteId: whiteFirst ? entry.userId : opponent.userId,
        blackId: whiteFirst ? opponent.userId : entry.userId,
        mode: 'online', seconds: entry.seconds, increment: entry.increment, rated: entry.rated,
        category: entry.category,
      });
      hub.toUser(opponent.userId, 'matchmaking:matched', { game: gamePayload(game) });
      return { matched: game, waiting: false };
    }
    this.queue.push({ ...entry, joinedAt: now });
    return { waiting: true };
  }

  cancel(userId: string) {
    this.queue = this.queue.filter(e => e.userId !== userId);
  }

  position(userId: string): number | null {
    const idx = this.queue.findIndex(e => e.userId === userId);
    return idx === -1 ? null : idx + 1;
  }

  size() {
    return this.queue.length;
  }
}

export const matchmaker = new Matchmaker();

export function queueStatus(userId: string) {
  const position = matchmaker.position(userId);
  if (position === null) return { queued: false };
  const entry = (matchmaker as any).queue.find((e: QueueEntry) => e.userId === userId) as QueueEntry | undefined;
  return {
    queued: true,
    position,
    inQueue: matchmaker.size(),
    waitedSeconds: entry ? Math.floor((Date.now() - entry.joinedAt) / 1000) : 0,
    // A JSON-safe representation: Infinity is not serialisable.
    window: entry ? (Number.isFinite(windowFor(Date.now() - entry.joinedAt)) ? windowFor(Date.now() - entry.joinedAt) : null) : 100,
  };
}

export function ratingFor(userId: string, category: Category) {
  return getUserRating(userId, category).rating;
}
