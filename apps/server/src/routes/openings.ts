import { Router } from 'express';
import { z } from 'zod';
import { Chess } from 'chess.js';
import { db } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';

export const openingsRouter = Router();

openingsRouter.get('/', (req, res) => {
  const family = typeof req.query.family === 'string' ? req.query.family : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  let sql = 'SELECT * FROM openings WHERE 1=1';
  const params: unknown[] = [];
  if (family && family !== 'all') { sql += ' AND family = ?'; params.push(family); }
  if (q) { sql += ' AND (name LIKE ? OR moves LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY name';
  const rows = db.prepare(sql).all(...params) as any[];
  const families = (db.prepare('SELECT family, COUNT(*) AS count FROM openings GROUP BY family ORDER BY family').all() as any[]);
  res.json({ openings: rows, families });
});

openingsRouter.get('/:id', (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM openings WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Opening not found' });
  // Build the position after the mainline so the client can render it directly.
  const chess = new Chess();
  const sanList = row.moves.split(' ').filter(Boolean);
  const steps: { san: string; fen: string }[] = [];
  for (const san of sanList) {
    try {
      chess.move(san);
      steps.push({ san, fen: chess.fen() });
    } catch { break; }
  }
  const saved = req.user
    ? Boolean(db.prepare('SELECT 1 FROM repertoire WHERE user_id = ? AND opening_id = ?').get(req.user.id, row.id))
    : false;
  res.json({ opening: { ...row, steps, saved } });
});

openingsRouter.get('/family/list', (_req, res) => {
  res.json({ families: db.prepare('SELECT family, COUNT(*) AS count FROM openings GROUP BY family ORDER BY family').all() });
});

openingsRouter.post('/:id/repertoire', requireAuth, (req: AuthedRequest, res) => {
  const existing = db.prepare('SELECT 1 FROM repertoire WHERE user_id = ? AND opening_id = ?').get(req.user!.id, req.params.id);
  if (existing) {
    db.prepare('DELETE FROM repertoire WHERE user_id = ? AND opening_id = ?').run(req.user!.id, req.params.id);
    return res.json({ saved: false });
  }
  const schema = z.object({ note: z.string().max(500).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  db.prepare('INSERT INTO repertoire (user_id, opening_id, note) VALUES (?,?,?)')
    .run(req.user!.id, req.params.id, parsed.success ? parsed.data.note ?? null : null);
  res.json({ saved: true });
});

openingsRouter.get('/repertoire/mine', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT o.*, r.note FROM repertoire r JOIN openings o ON o.id = r.opening_id WHERE r.user_id = ? ORDER BY o.name`
  ).all(req.user!.id);
  res.json({ repertoire: rows });
});

/** Practice board: validate a move the learner makes against the opening's mainline. */
openingsRouter.post('/practice', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ line: z.array(z.string()).max(40), from: z.string().length(2), to: z.string().length(2), promotion: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid practice payload' });
  const chess = new Chess();
  for (const san of parsed.data.line) {
    try { chess.move(san); } catch { return res.status(400).json({ error: 'The practice line is not a legal sequence' }); }
  }
  const matching = (db.prepare('SELECT moves, name FROM openings').all() as { moves: string; name: string }[])
    .filter(o => o.moves.startsWith([...parsed.data.line].join(' ')));
  const expectedSet = new Set(matching.map(o => (o.moves.split(' ')[parsed.data.line.length] ?? '')).filter(Boolean));
  let move;
  try {
    move = chess.move({ from: parsed.data.from, to: parsed.data.to, promotion: (parsed.data.promotion as any) ?? 'q' });
  } catch {
    return res.status(400).json({ error: 'Illegal move' });
  }
  const inBook = expectedSet.has(move.san);
  res.json({
    san: move.san,
    fen: chess.fen(),
    inBook,
    nextBookMoves: [...expectedSet],
    matchingOpenings: matching.slice(0, 5).map(o => ({ name: o.name, moves: o.moves })),
  });
});
