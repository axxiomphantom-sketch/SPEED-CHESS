import { Router } from 'express';
import { z } from 'zod';
import { Chess } from 'chess.js';
import { db, nowIso } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { bumpAchievement } from '../lib/service.js';
import { id } from '../lib/ids.js';

export const puzzlesRouter = Router();

interface PuzzleRow {
  id: string; fen: string; solution: string; rating: number; themes: string; title: string | null;
  difficulty: string; side_to_move: string; explanation: string | null;
}

function shape(row: PuzzleRow, includeSolution = false) {
  return {
    id: row.id,
    fen: row.fen,
    rating: row.rating,
    themes: row.themes ? row.themes.split(',').map(t => t.trim()).filter(Boolean) : [],
    title: row.title,
    difficulty: row.difficulty,
    sideToMove: row.side_to_move,
    explanation: row.explanation,
    ...(includeSolution ? { solution: JSON.parse(row.solution) } : {}),
  };
}

/** Daily puzzle: deterministic from the date, so every player gets the same one. */
puzzlesRouter.get('/daily', (req: AuthedRequest, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const count = (db.prepare('SELECT COUNT(*) AS n FROM puzzles').get() as { n: number }).n;
  if (count === 0) return res.json({ puzzle: null });
  const seed = Number(today.replace(/-/g, '')) % count;
  const row = db.prepare('SELECT * FROM puzzles ORDER BY id LIMIT 1 OFFSET ?').get(seed) as PuzzleRow;
  const attempt = req.user
    ? db.prepare('SELECT solved, hints_used FROM puzzle_attempts WHERE user_id = ? AND puzzle_id = ? AND substr(created_at,1,10) = ?')
        .get(req.user.id, row.id, today)
    : undefined;
  const streak = req.user ? dailyStreak(req.user.id) : 0;
  res.json({ puzzle: shape(row), date: today, attemptedToday: Boolean(attempt), solvedToday: Boolean((attempt as any)?.solved), streak });
});

function dailyStreak(userId: string): number {
  const rows = db.prepare(
    `SELECT DISTINCT substr(created_at,1,10) AS day FROM puzzle_attempts WHERE user_id = ? AND solved = 1 ORDER BY day DESC LIMIT 60`
  ).all(userId) as { day: string }[];
  if (rows.length === 0) return 0;
  let streak = 0;
  let cursor = new Date();
  const days = new Set(rows.map(r => r.day));
  for (let i = 0; i < 60; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
    else if (i === 0) { cursor.setUTCDate(cursor.getUTCDate() - 1); }
    else break;
  }
  return streak;
}

puzzlesRouter.get('/', (req, res) => {
  const difficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty : undefined;
  const theme = typeof req.query.theme === 'string' ? req.query.theme : undefined;
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  let sql = 'SELECT * FROM puzzles WHERE 1=1';
  const params: unknown[] = [];
  if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) { sql += ' AND difficulty = ?'; params.push(difficulty); }
  if (theme) { sql += ' AND themes LIKE ?'; params.push(`%${theme}%`); }
  const total = (db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) AS n')).get(...params) as { n: number }).n;
  sql += ' ORDER BY rating ASC LIMIT ? OFFSET ?';
  const rows = db.prepare(sql).all(...params, limit, offset) as PuzzleRow[];
  res.json({ puzzles: rows.map(r => shape(r)), total, limit, offset });
});

puzzlesRouter.get('/themes', (_req, res) => {
  const rows = db.prepare('SELECT themes FROM puzzles').all() as { themes: string }[];
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const theme of row.themes.split(',').map(t => t.trim()).filter(Boolean)) {
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }
  res.json({ themes: [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) });
});

puzzlesRouter.get('/stats', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM puzzle_attempts WHERE user_id = ?').all(req.user!.id) as any[];
  const solved = rows.filter(r => r.solved).length;
  const attemptCount = rows.length;
  res.json({
    attempted: attemptCount,
    solved,
    accuracy: attemptCount ? Math.round((solved / attemptCount) * 100) : 0,
    averageSeconds: attemptCount ? Math.round(rows.reduce((a, r) => a + (r.ms ?? 0), 0) / attemptCount / 1000) : 0,
    streak: dailyStreak(req.user!.id),
    puzzleRating: puzzleRating(rows),
  });
});

function puzzleRating(rows: any[]): number {
  if (rows.length === 0) return 1000;
  let rating = 1000;
  for (const row of rows) rating += row.solved ? 12 : -8;
  return Math.max(600, Math.round(rating));
}

/** Server-side solution validation. The client never receives the answer up front. */
puzzlesRouter.post('/:id/check', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    from: z.string().length(2), to: z.string().length(2),
    promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
    ply: z.number().int().min(0).default(0),
    hintsUsed: z.number().int().min(0).max(10).default(0),
    ms: z.number().int().min(0).max(3_600_000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid move payload' });
  const puzzle = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(req.params.id) as PuzzleRow | undefined;
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });
  const solution: string[] = JSON.parse(puzzle.solution);
  const chess = new Chess(puzzle.fen);
  // Replay the solver's preceding correct moves in this attempt.
  const expectedBefore = solution.slice(0, parsed.data.ply);
  for (const san of expectedBefore) chess.move(san);
  const expected = solution[parsed.data.ply];
  let played;
  try {
    played = chess.move({ from: parsed.data.from, to: parsed.data.to, promotion: parsed.data.promotion ?? 'q' });
  } catch {
    return res.json({ correct: false, error: 'That move is not legal' });
  }
  if (!expected) return res.status(400).json({ error: 'The puzzle is already complete' });
  if (played.san !== expected) {
    return res.json({ correct: false, expected: undefined, hint: hintFor(puzzle, expected) });
  }
  const nextPly = parsed.data.ply + 1;
  const isComplete = nextPly >= solution.length;
  let reply: string | null = null;
  let fenAfter = chess.fen();
  if (!isComplete) {
    reply = solution[nextPly];
    chess.move(reply);
    fenAfter = chess.fen();
  } else {
    recordAttempt(req.user!.id, puzzle, parsed.data.hintsUsed, parsed.data.ms);
  }
  res.json({
    correct: true,
    complete: isComplete,
    reply,
    fen: fenAfter,
    nextPly: reply ? nextPly + 1 : nextPly,
    explanation: isComplete ? puzzle.explanation : undefined,
  });
});

function hintFor(puzzle: PuzzleRow, expected: string): string {
  const piece = expected[0];
  const names: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
  if (names[piece]) return `Look for a move with your ${names[piece]}.`;
  return 'Look for a forcing move — a check or a capture.';
}

puzzlesRouter.post('/:id/hint', requireAuth, (req: AuthedRequest, res) => {
  const puzzle = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(req.params.id) as PuzzleRow | undefined;
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });
  const solution: string[] = JSON.parse(puzzle.solution);
  const ply = Math.max(Number(req.body?.ply ?? 0), 0);
  const expected = solution[ply];
  if (!expected) return res.status(400).json({ error: 'No hint available here' });
  res.json({ hint: hintFor(puzzle, expected), theme: puzzle.themes.split(',')[0] });
});

puzzlesRouter.get('/:id/solution', requireAuth, (req: AuthedRequest, res) => {
  const puzzle = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(req.params.id) as PuzzleRow | undefined;
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });
  res.json({ solution: JSON.parse(puzzle.solution), explanation: puzzle.explanation });
});

/** Records a solve; also used when a puzzle is answered via the next-puzzle flow. */
puzzlesRouter.post('/:id/solve', requireAuth, (req: AuthedRequest, res) => {
  const puzzle = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(req.params.id) as PuzzleRow | undefined;
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });
  recordAttempt(req.user!.id, puzzle, Number(req.body?.hintsUsed ?? 0), Number(req.body?.ms ?? 0));
  res.json({ ok: true });
});

function recordAttempt(userId: string, puzzle: PuzzleRow, hints: number, ms?: number) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare('SELECT id FROM puzzle_attempts WHERE user_id = ? AND puzzle_id = ? AND substr(created_at,1,10) = ?')
    .get(userId, puzzle.id, today) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE puzzle_attempts SET solved = 1, hints_used = ?, ms = ? WHERE id = ?').run(hints, ms ?? null, existing.id);
  } else {
    db.prepare('INSERT INTO puzzle_attempts (user_id, puzzle_id, solved, hints_used, ms) VALUES (?,?,1,?,?)')
      .run(userId, puzzle.id, hints, ms ?? null);
  }
  bumpAchievement(userId, 'puzzle_1');
  bumpAchievement(userId, 'puzzles_25');
}
