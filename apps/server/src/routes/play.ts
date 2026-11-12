import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { CATEGORIES, TIME_CONTROLS, divisionFor, type Category } from '../lib/ratings.js';
import { db } from '../db/index.js';
import { gamePayload, gameById, sideOf } from '../services/games.js';
import { matchmaker, queueStatus, ratingFor } from '../services/matchmaking.js';
import { hub } from '../services/hub.js';
import { getUserRating } from '../lib/service.js';

export const matchmakingRouter = Router();

const queueSchema = z.object({
  category: z.enum(CATEGORIES),
  seconds: z.number().int().min(30).max(10800).optional(),
  increment: z.number().int().min(0).max(180).optional(),
  rated: z.boolean().default(true),
});

matchmakingRouter.get('/status', requireAuth, (req: AuthedRequest, res) => {
  res.json(queueStatus(req.user!.id));
});

matchmakingRouter.post('/join', requireAuth, (req: AuthedRequest, res) => {
  const parsed = queueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { category, rated } = parsed.data;
  const seconds = parsed.data.seconds ?? TIME_CONTROLS[category as Category].seconds;
  const increment = parsed.data.increment ?? TIME_CONTROLS[category as Category].increment;
  const existing = db.prepare(
    "SELECT id FROM games WHERE status = 'active' AND mode IN ('online','tournament') AND (white_id = ? OR black_id = ?)"
  ).get(req.user!.id, req.user!.id) as { id: string } | undefined;
  if (existing) {
    const game = gameById(existing.id)!;
    return res.status(200).json({ alreadyPlaying: true, game: gamePayload(game) });
  }
  const uid = req.user!.id;
  const result = matchmaker.enqueue({
    userId: uid,
    username: req.user!.username,
    rating: ratingFor(uid, category as Category),
    category: category as Category,
    seconds,
    increment,
    rated,
  });
  if (result.matched) {
    hub.toUser(uid, 'matchmaking:matched', { game: gamePayload(result.matched) });
    return res.json({ matched: true, game: gamePayload(result.matched) });
  }
  res.json({ matched: false, ...queueStatus(uid) });
});

/** Long-poll style wait so the client gets a match without websockets. */
matchmakingRouter.post('/wait', requireAuth, async (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const existing = db.prepare(
      "SELECT id FROM games WHERE status = 'active' AND mode IN ('online','tournament') AND (white_id = ? OR black_id = ?) ORDER BY started_at DESC LIMIT 1"
    ).get(uid, uid) as { id: string } | undefined;
    if (existing) {
      const game = gameById(existing.id)!;
      if (game.started_at && Date.now() - new Date(game.started_at.replace(' ', 'T') + 'Z').getTime() < 60_000) {
        return res.json({ matched: true, game: gamePayload(game) });
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  res.json({ matched: false, ...queueStatus(uid) });
});

matchmakingRouter.post('/cancel', requireAuth, (req: AuthedRequest, res) => {
  matchmaker.cancel(req.user!.id);
  res.json({ ok: true });
});

matchmakingRouter.get('/opponents', requireAuth, (req: AuthedRequest, res) => {
  const category = (typeof req.query.category === 'string' ? req.query.category : 'rapid') as Category;
  const me = getUserRating(req.user!.id, category).rating;
  const rows = db.prepare(
    `SELECT u.id, u.username, u.country, u.avatar_url, r.rating, r.games FROM ratings r
       JOIN users u ON u.id = r.user_id
      WHERE r.category = ? AND u.id != ? AND u.status = 'active'
      ORDER BY ABS(r.rating - ?) ASC LIMIT 12`
  ).all(category, req.user!.id, me) as any[];
  res.json({
    opponents: rows.map(r => ({
      id: r.id, username: r.username, country: r.country, avatarUrl: r.avatar_url,
      rating: Math.round(r.rating), games: r.games, online: hub.isOnline(r.id), division: divisionFor(r.rating),
    })),
  });
});
