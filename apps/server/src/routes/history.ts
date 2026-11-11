import { Router } from 'express';
import { z } from 'zod';
import { Chess } from 'chess.js';
import { db } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { id } from '../lib/ids.js';
import { createGame, gameById, gamePayload } from '../services/games.js';

export const historyRouter = Router();

historyRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const outcome = typeof req.query.outcome === 'string' ? req.query.outcome : undefined;
  const mode = typeof req.query.mode === 'string' ? req.query.mode : undefined;
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  let where = `(white_id = ? OR black_id = ? OR owner_id = ?) AND status = 'finished'`;
  const params: unknown[] = [uid, uid, uid];
  if (category && ['bullet', 'blitz', 'rapid', 'classical'].includes(category)) { where += ' AND category = ?'; params.push(category); }
  if (mode && ['computer', 'online', 'local', 'tournament'].includes(mode)) { where += ' AND mode = ?'; params.push(mode); }
  if (outcome === 'win') where += ` AND ((white_id = ? AND result = 'white') OR (black_id = ? AND result = 'black'))`;
  if (outcome === 'loss') where += ` AND ((white_id = ? AND result = 'black') OR (black_id = ? AND result = 'white'))`;
  if (outcome === 'draw') where += ` AND result = 'draw'`;
  const outcomeParams = outcome === 'win' || outcome === 'loss' ? [uid, uid] : [];
  params.push(...outcomeParams);

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM games WHERE ${where}`).get(...params) as { n: number }).n;
  const rows = db.prepare(`SELECT * FROM games WHERE ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as any[];
  res.json({
    total,
    games: rows.map(g => {
      const isWhite = g.white_id === uid;
      const result = g.result === 'draw' ? 'draw'
        : ((isWhite && g.result === 'white') || (!isWhite && g.result === 'black')) ? 'win' : 'loss';
      const durationMs = g.finished_at && g.started_at
        ? new Date(g.finished_at.replace(' ', 'T') + 'Z').getTime() - new Date(g.started_at.replace(' ', 'T') + 'Z').getTime()
        : null;
      return {
        id: g.id,
        opponent: isWhite ? g.black_name : g.white_name,
        opponentRating: isWhite ? g.black_rating : g.white_rating,
        color: isWhite ? 'white' : 'black',
        result,
        termination: g.termination,
        category: g.category,
        mode: g.mode,
        rated: Boolean(g.rated),
        opening: g.opening_name,
        playedAt: g.started_at,
        durationSeconds: durationMs ? Math.max(0, Math.round(durationMs / 1000)) : null,
        accuracy: isWhite ? g.accuracy_white : g.accuracy_black,
      };
    }),
  });
});

/** PGN import: creates a reviewable game record from pasted PGN. */
historyRouter.post('/import', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ pgn: z.string().min(10).max(60_000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Paste a PGN game to import' });
  const chess = new Chess();
  try {
    chess.loadPgn(parsed.data.pgn);
  } catch (err) {
    return res.status(400).json({ error: 'That PGN could not be parsed. Check the move list and try again.' });
  }
  const history = chess.history({ verbose: true });
  if (history.length === 0) return res.status(400).json({ error: 'That PGN contains no moves' });
  const headers = chess.header();
  const gameId = id('gm_');
  // PGN results use 1-0 / 0-1 / 1/2-1/2 / *; the games table stores who won.
  const resultTag = String(headers.Result ?? '*');
  const result = resultTag === '1-0' ? 'white' : resultTag === '0-1' ? 'black'
    : resultTag === '1/2-1/2' || resultTag === '½-½' ? 'draw' : null;
  const seconds = 600;
  db.prepare(
    `INSERT INTO games (id, white_id, black_id, owner_id, white_name, black_name, mode, rated, category, initial_seconds, increment,
      fen, status, result, termination, white_clock_ms, black_clock_ms, turn, pgn, started_at, finished_at, is_private)
     VALUES (?,?,?,?,?,?, 'local', 0, 'rapid', ?, 0, ?, 'finished', ?, 'imported', ?, ?, ?, ?, datetime('now'), datetime('now'), 1)`
  ).run(gameId, req.user!.id, null, req.user!.id, String(headers.White ?? 'White'), String(headers.Black ?? 'Black'), seconds,
    new Chess().fen(), result, seconds * 1000, seconds * 1000, 'w', buildPgnFromHistory(history, { White: String(headers.White ?? 'White'), Black: String(headers.Black ?? 'Black'), Result: String(headers.Result ?? '*'), Event: String(headers.Event ?? 'Imported') }));
  const insertMove = db.prepare(
    'INSERT INTO moves (game_id, ply, san, uci, fen_after, clock_white_ms, clock_black_ms, is_check, is_capture) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  const replay = new Chess();
  history.forEach((m, i) => {
    replay.move(m.san);
    insertMove.run(gameId, i + 1, m.san, `${m.from}${m.to}${m.promotion ?? ''}`, replay.fen(), seconds * 1000, seconds * 1000,
      replay.isCheck() ? 1 : 0, m.captured ? 1 : 0);
  });
  res.status(201).json({ ok: true, gameId, moves: history.length });
});

function buildPgnFromHistory(history: any[], headers: Record<string, string>) {
  const body: string[] = [];
  history.forEach((m, i) => {
    if (i % 2 === 0) body.push(`${i / 2 + 1}. ${m.san}`); else body.push(m.san);
  });
  return `${Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`).join('\n')}\n\n${body.join(' ')} ${headers.Result ?? '*'}\n`;
}
