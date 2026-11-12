import { Router } from 'express';
import { z } from 'zod';
import { Chess } from 'chess.js';
import { analyseGame, chooseComputerMove, levelConfig, LEVELS } from '@speed-chess/engine';
import { db, nowIso } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { CATEGORIES, TIME_CONTROLS, categoryFor, divisionFor, type Category } from '../lib/ratings.js';
import {
  applyMove, createGame, declineDraw, finishGame, gameById, gamePayload, movesFor, offerDraw, resign, sideOf,
} from '../services/games.js';
import { getUserRating } from '../lib/service.js';
import { hub } from '../services/hub.js';
import { messagesFor, postMessage, MAX_MESSAGE_LENGTH } from '../services/gameChat.js';

export const gamesRouter = Router();
export const playRouter = Router();

/**
 * Who may read a game.
 * - Live games are watchable by anyone with the link, so a friend can spectate.
 * - Finished online games are public too, which is what makes a leaderboard result verifiable.
 * - A private game or a finished casual/local/computer game belongs to its players only.
 */
export function readable(
  game: { is_private: number; status: string; mode: string; white_id: string | null; black_id: string | null; owner_id?: string | null },
  userId?: string,
) {
  if (sideOf(game as never, userId) !== null) return true;
  if (game.owner_id && game.owner_id === userId) return true;
  if (game.is_private) return false;
  if (game.status === 'active') return true;
  return game.mode === 'online' || game.mode === 'tournament';
}

/** Premium/Pro (or staff) unlock the full per-move breakdown; computer games are always free. */
export function hasAnalysisEntitlement(userId: string): boolean {
  const row = db.prepare('SELECT plan, role FROM users WHERE id = ?').get(userId) as { plan: string; role: string } | undefined;
  if (!row) return false;
  return row.role === 'admin' || row.plan === 'premium' || row.plan === 'pro';
}

function readError(game: { is_private: number; status: string }) {
  return game.is_private || game.status !== 'active' ? 'This game is visible to its players only' : 'Game not found';
}

const createSchema = z.object({
  mode: z.enum(['computer', 'local', 'friend']),
  category: z.enum(CATEGORIES).optional(),
  seconds: z.number().int().min(30).max(10800).optional(),
  increment: z.number().int().min(0).max(180).optional(),
  difficulty: z.enum(['beginner', 'easy', 'intermediate', 'advanced', 'expert']).optional(),
  rated: z.boolean().optional(),
  private: z.boolean().optional(),
  color: z.enum(['white', 'black', 'random']).optional(),
});

playRouter.get('/levels', (_req, res) => {
  res.json({ levels: LEVELS, timeControls: TIME_CONTROLS });
});

/** Starts a game against the computer, local hot-seat, or generates a private online invite. */
playRouter.post('/games', requireAuth, (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const body = parsed.data;
  const category = (body.category ?? 'rapid') as Category;
  const seconds = body.seconds ?? TIME_CONTROLS[category].seconds;
  const increment = body.increment ?? TIME_CONTROLS[category].increment;
  const uid = req.user!.id;

  if (body.mode === 'computer') {
    const game = createGame({
      whiteId: uid, blackId: null, mode: 'computer', seconds, increment,
      difficulty: body.difficulty ?? 'easy', rated: false,
    });
    return res.status(201).json({ game: gamePayload(game) });
  }
  if (body.mode === 'local') {
    const game = createGame({
      whiteId: null, blackId: null, ownerId: uid, mode: 'local', seconds, increment,
      whiteName: 'White', blackName: 'Black',
    });
    return res.status(201).json({ game: gamePayload(game) });
  }
  // Private online game: the creator waits for an opponent to join with the invite code.
  const game = createGame({
    whiteId: uid, blackId: null, mode: 'online', seconds, increment,
    rated: body.rated ?? false, isPrivate: true,
  });
  res.status(201).json({ game: gamePayload(game) });
});

playRouter.post('/games/join', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ code: z.string().trim().min(4).max(12) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid invite code' });
  const game = db.prepare('SELECT * FROM games WHERE invite_code = ? AND status = ?')
    .get(parsed.data.code.toUpperCase(), 'active') as any;
  if (!game) return res.status(404).json({ error: 'No open game with that code' });
  if (game.white_id === req.user!.id || game.black_id === req.user!.id) {
    return res.status(200).json({ game: gamePayload(game), alreadyJoined: true });
  }
  if (game.black_id) return res.status(409).json({ error: 'That game already has two players' });
  const rating = Math.round(getUserRating(req.user!.id, game.category).rating);
  db.prepare('UPDATE games SET black_id = ?, black_name = ?, black_rating = ?, updated_at = ? WHERE id = ?')
    .run(req.user!.id, req.user!.username, rating, nowIso(), game.id);
  const updated = gameById(game.id)!;
  hub.toGame(game.id, 'game:joined', { game: gamePayload(updated) });
  if (updated.white_id) hub.toUser(updated.white_id, 'game:joined', { game: gamePayload(updated) });
  res.json({ game: gamePayload(updated) });
});

/**
 * In-game chat history. Players and spectators may read; only players may post (below).
 * A finished game still returns its history so it can be reviewed, but posting is closed.
 */
gamesRouter.get('/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const game = gameById(req.params.id);
  if (!game) return res.status(404).json({ error: 'That game does not exist.' });
  res.set('cache-control', 'no-store');
  res.json({ messages: messagesFor(game.id) });
});

/** Posts a chat message and pushes it to everyone watching the game. */
gamesRouter.post('/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const body = typeof req.body?.body === 'string' ? req.body.body : '';
  if (body.length > MAX_MESSAGE_LENGTH * 4) {
    // Cheap rejection before touching normalisation, for oversized payloads.
    return res.status(413).json({ error: 'That message is too long.' });
  }
  const result = postMessage(req.params.id, req.user!.id, body);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  // Spectators are subscribed to the same game room, so one broadcast reaches players and watchers.
  hub.toGame(req.params.id, 'game:message', { gameId: req.params.id, message: result.message });
  res.status(201).json({ message: result.message });
});

gamesRouter.get('/:id', (req: AuthedRequest, res) => {
  const game = gameById(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const isPlayer = sideOf(game, req.user?.id) !== null;
  if (!readable(game, req.user?.id)) return res.status(403).json({ error: readError(game) });
  res.json({ game: gamePayload(game), viewerSide: sideOf(game, req.user?.id) });
});

gamesRouter.post('/:id/move', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    from: z.string().length(2),
    to: z.string().length(2),
    promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid move payload' });
  const result = applyMove(req.params.id, req.user!.id, parsed.data.from, parsed.data.to, parsed.data.promotion);
  if (!result.ok) return res.status(400).json({ error: result.error, game: result.game, finished: result.finished });
  res.json({ game: result.game, finished: result.finished });
});

/** Lets the server engine answer in a computer game. The client never decides engine moves. */
gamesRouter.post('/:id/engine-move', requireAuth, (req: AuthedRequest, res) => {
  const game = gameById(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.mode !== 'computer') return res.status(400).json({ error: 'Not a computer game' });
  if (game.status !== 'active') return res.status(400).json({ error: 'Game is finished' });
  if (game.turn !== 'b') return res.status(400).json({ error: 'The engine only moves as Black' });
  if (game.white_id !== req.user!.id) return res.status(403).json({ error: 'Only the player may request engine moves' });
  const choice = chooseComputerMove(game.fen, game.difficulty ?? 'easy');
  if (!choice.move) return res.status(400).json({ error: 'No legal moves' });
  const result = applyMove(game.id, undefined, choice.move.from, choice.move.to, choice.move.promotion);
  if (!result.ok) return res.status(400).json({ error: result.error || 'Engine move rejected' });
  res.json({ game: result.game, engine: { move: choice.move.san, depth: levelConfig(game.difficulty ?? 'easy').depth, nodes: choice.nodes } });
});

gamesRouter.post('/:id/resign', requireAuth, (req: AuthedRequest, res) => {
  const result = resign(req.params.id, req.user!.id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ game: result.game });
});

gamesRouter.post('/:id/draw', requireAuth, (req: AuthedRequest, res) => {
  const result = offerDraw(req.params.id, req.user!.id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ agreed: result.agreed, game: result.game });
});

gamesRouter.post('/:id/draw/decline', requireAuth, (req: AuthedRequest, res) => {
  const result = declineDraw(req.params.id, req.user!.id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

/** Abandons a local/computer game without affecting ratings. */
gamesRouter.post('/:id/abort', requireAuth, (req: AuthedRequest, res) => {
  const game = gameById(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (sideOf(game, req.user!.id) === null && game.mode !== 'local') return res.status(403).json({ error: 'Not your game' });
  if (game.status !== 'active') return res.status(400).json({ error: 'Game already finished' });
  const moves = db.prepare('SELECT COUNT(*) AS n FROM moves WHERE game_id = ?').get(game.id) as { n: number };
  db.prepare("UPDATE games SET status = 'aborted', termination = 'abandoned', finished_at = ?, updated_at = ? WHERE id = ?")
    .run(nowIso(), nowIso(), game.id);
  if (moves.n >= 2 && game.rated) {
    db.prepare("UPDATE games SET status = 'finished', result = 'draw' WHERE id = ?").run(game.id);
  }
  res.json({ ok: true });
});

gamesRouter.get('/:id/pgn', (req: AuthedRequest, res) => {
  const game = gameById(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!readable(game, req.user?.id)) return res.status(403).json({ error: readError(game) });
  const pgn = game.pgn ?? buildLivePgn(game.id);
  res.type('application/x-chess-pgn').send(pgn);
});

function buildLivePgn(gameId: string) {
  const game = gameById(gameId)!;
  const tags = [`[Event "SPEED CHESS ${game.mode}"]`, `[White "${game.white_name}"]`, `[Black "${game.black_name}"]`,
    `[Result "*"]`, `[TimeControl "${game.initial_seconds}+${game.increment}"]`, `[FEN "${new Chess().fen()}"]`];
  const sans = (db.prepare('SELECT san FROM moves WHERE game_id = ? ORDER BY ply').all(gameId) as { san: string }[]).map(m => m.san);
  const body: string[] = [];
  sans.forEach((san, i) => {
    if (i % 2 === 0) body.push(`${i / 2 + 1}. ${san}`); else body.push(san);
  });
  return `${tags.join('\n')}\n\n${body.join(' ')} *\n`;
}

/** Post-game analysis. Runs the real engine over the stored game and caches the report. */
gamesRouter.get('/:id/analysis', (req: AuthedRequest, res) => {
  const game = gameById(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!readable(game, req.user?.id)) return res.status(403).json({ error: readError(game) });
  const isPlayer = sideOf(game, req.user?.id) !== null;
  if (game.status === 'active') return res.status(409).json({ error: 'Analysis is available after the game finishes (fair play)' });
  const cached = db.prepare('SELECT payload FROM game_analysis WHERE game_id = ?').get(game.id) as { payload: string } | undefined;
  if (cached && !req.query.refresh) return res.json({ analysis: JSON.parse(cached.payload), cached: true });
  const pgn = game.pgn ?? buildLivePgn(game.id);
  let analysis;
  try {
    analysis = analyseGame(pgn);
  } catch (err) {
    return res.status(422).json({ error: 'This game could not be analysed: ' + (err as Error).message });
  }
  // Full analysis is a Premium/Pro feature. Free players still get the honest headline numbers and
  // evaluation graph; the per-move breakdown, best moves and written insights are withheld, and the
  // response says so instead of pretending the data does not exist.
  if (game.mode !== 'computer' && !hasAnalysisEntitlement(req.user!.id)) {
    const { moves, ...headline } = analysis as Record<string, unknown> & { moves: unknown[] };
    void moves;
    return res.json({
      analysis: {
        ...headline, gameId: game.id, white: game.white_name, black: game.black_name,
        viewerIsPlayer: isPlayer, moves: [], locked: true,
        previewMoves: analysis.moves.slice(0, 2),
      },
      cached: false,
      upgradeRequired: true,
    });
  }
  const payload = { ...analysis, gameId: game.id, white: game.white_name, black: game.black_name, viewerIsPlayer: isPlayer };
  db.prepare('INSERT INTO game_analysis (game_id, payload) VALUES (?,?) ON CONFLICT(game_id) DO UPDATE SET payload = excluded.payload')
    .run(game.id, JSON.stringify(payload));
  db.prepare('UPDATE games SET accuracy_white = ?, accuracy_black = ? WHERE id = ?')
    .run(analysis.accuracyWhite, analysis.accuracyBlack, game.id);
  res.json({ analysis: payload, cached: false });
});

gamesRouter.get('/:id/moves', (req: AuthedRequest, res) => {
  const game = gameById(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!readable(game, req.user?.id)) return res.status(403).json({ error: readError(game) });
  res.json({ moves: movesFor(game.id), clocks: { white: game.white_clock_ms, black: game.black_clock_ms } });
});
