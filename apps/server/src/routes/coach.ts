import { Router } from 'express';
import { z } from 'zod';
import { Chess } from 'chess.js';
import { db } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { askCoach, gameReview } from '../services/coach.js';
import { gameById, sideOf } from '../services/games.js';
import { analyseGame } from '@speed-chess/engine';

export const coachRouter = Router();

coachRouter.post('/ask', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ question: z.string().trim().min(3).max(600), fen: z.string().max(120).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ask a question of at least 3 characters' });
  // Fair play: never assist a player inside their own active rated game.
  if (parsed.data.fen) {
    const active = db.prepare(
      "SELECT id, fen FROM games WHERE status = 'active' AND rated = 1 AND (white_id = ? OR black_id = ?)"
    ).get(req.user!.id, req.user!.id) as { id: string; fen: string } | undefined;
    if (active && active.fen === parsed.data.fen) {
      return res.status(403).json({
        error: 'The coach cannot analyse positions from your own active rated game. Finish the game first — analysis is unlocked immediately afterwards.',
      });
    }
  }
  res.json(askCoach(parsed.data.question, parsed.data.fen));
});

/** Personalised review of a finished game, built from the engine analysis. */
coachRouter.get('/review/:gameId', requireAuth, (req: AuthedRequest, res) => {
  const game = gameById(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (sideOf(game, req.user!.id) === null && game.mode !== 'local' && game.mode !== 'computer') {
    return res.status(403).json({ error: 'You can only review your own games' });
  }
  if (game.status !== 'finished') return res.status(409).json({ error: 'Finish the game before requesting a review' });
  const cached = db.prepare('SELECT payload FROM game_analysis WHERE game_id = ?').get(game.id) as { payload: string } | undefined;
  let analysis;
  if (cached) analysis = JSON.parse(cached.payload);
  else {
    analysis = analyseGame(game.pgn ?? '');
    db.prepare('INSERT INTO game_analysis (game_id, payload) VALUES (?,?) ON CONFLICT(game_id) DO UPDATE SET payload = excluded.payload')
      .run(game.id, JSON.stringify(analysis));
  }
  const review = gameReview(game.pgn ?? '');
  res.json({ review, opening: analysis.opening, viewerSide: sideOf(game, req.user!.id) });
});

/** Learning path suggestions derived from the player's actual record. */
coachRouter.get('/plan', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const games = db.prepare(
    "SELECT accuracy_white, accuracy_black, white_id, black_id FROM games WHERE status = 'finished' AND (white_id = ? OR black_id = ?)"
  ).all(uid, uid) as any[];
  const accuracies = games.map(g => (g.white_id === uid ? g.accuracy_white : g.accuracy_black)).filter((v): v is number => typeof v === 'number');
  const puzzleStats = db.prepare('SELECT COUNT(*) AS n, SUM(solved) AS solved FROM puzzle_attempts WHERE user_id = ?').get(uid) as any;
  const lessonsDone = db.prepare("SELECT COUNT(*) AS n FROM lesson_progress WHERE user_id = ? AND status = 'completed'").get(uid) as any;
  const avgAccuracy = accuracies.length ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : null;
  const steps: { title: string; detail: string; link: string }[] = [];
  if (lessonsDone.n === 0) steps.push({ title: 'Start How to Play', detail: 'Cover the rules and all six pieces before playing rated games.', link: '/how-to-play' });
  if (avgAccuracy !== null && avgAccuracy < 65) steps.push({ title: 'Fix blunders first', detail: 'Your recent accuracy is below 65%. Do 10 fork/pin puzzles daily and use the CCT scan.', link: '/training' });
  if ((puzzleStats.solved ?? 0) < 25) steps.push({ title: 'Build tactical pattern recognition', detail: 'Solve at least 25 puzzles so mates-in-one and forks become automatic.', link: '/training' });
  if (lessonsDone.n >= 3) steps.push({ title: 'Learn one opening per colour', detail: 'Pick an opening you enjoy and study its plans, not just its moves.', link: '/openings' });
  steps.push({ title: 'Review every loss', detail: 'Run Game Analysis after each loss and name the single move that changed the game.', link: '/history' });
  res.json({
    averageAccuracy: avgAccuracy,
    gamesAnalysed: accuracies.length,
    puzzles: { attempted: puzzleStats.n ?? 0, solved: puzzleStats.solved ?? 0 },
    lessonsCompleted: lessonsDone.n,
    steps: steps.slice(0, 5),
  });
});

/** Coaching centre: profiles, discovery, assignments. */
export const coachingRouter = Router();

coachingRouter.get('/coaches', (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT c.*, u.username, u.country, u.avatar_url, u.title,
       (SELECT rating FROM ratings WHERE user_id = c.user_id AND category = 'classical') AS classical
     FROM coach_profiles c JOIN users u ON u.id = c.user_id WHERE c.accepting = 1 ORDER BY c.verified DESC, classical DESC`
  ).all() as any[];
  res.json({
    coaches: rows.map(c => ({
      username: c.username, headline: c.headline, expertise: c.expertise.split(',').map((s: string) => s.trim()).filter(Boolean),
      languages: (c.languages ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
      rate: c.hourly_rate, currency: c.currency, accepting: Boolean(c.accepting), verified: Boolean(c.verified),
      country: c.country, avatarUrl: c.avatar_url, rating: Math.round(c.classical ?? 0), title: c.title,
    })),
  });
});

coachingRouter.get('/profile', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM coach_profiles WHERE user_id = ?').get(req.user!.id) as any;
  res.json({ profile: row ?? null, canPublish: ['coach', 'admin'].includes(req.user!.role) });
});

coachingRouter.put('/profile', requireAuth, (req: AuthedRequest, res) => {
  if (!['coach', 'admin'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only an approved coach account can publish a coaching profile. Apply from Settings → Account.' });
  }
  const schema = z.object({
    headline: z.string().min(6).max(120),
    expertise: z.string().min(3).max(300),
    languages: z.string().max(120).optional(),
    hourlyRate: z.number().int().min(0).max(100000).optional(),
    accepting: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare(
    `INSERT INTO coach_profiles (user_id, headline, expertise, languages, hourly_rate, accepting) VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET headline = excluded.headline, expertise = excluded.expertise,
       languages = excluded.languages, hourly_rate = excluded.hourly_rate, accepting = excluded.accepting`
  ).run(req.user!.id, parsed.data.headline, parsed.data.expertise, parsed.data.languages ?? null,
    parsed.data.hourlyRate ?? null, parsed.data.accepting === false ? 0 : 1);
  res.json({ ok: true });
});

coachingRouter.get('/assignments', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT a.*, c.username AS coach_name, s.username AS student_name FROM assignments a
      JOIN users c ON c.id = a.coach_id JOIN users s ON s.id = a.student_id
      WHERE a.coach_id = ? OR a.student_id = ? ORDER BY a.created_at DESC`
  ).all(req.user!.id, req.user!.id) as any[];
  res.json({
    assignments: rows.map(a => ({
      id: a.id, coach: a.coach_name, student: a.student_name, title: a.title, instructions: a.instructions,
      puzzleIds: a.puzzle_ids ? JSON.parse(a.puzzle_ids) : [], dueAt: a.due_at, status: a.status,
      submission: a.submission, feedback: a.feedback, createdAt: a.created_at, mine: a.student_id === req.user!.id,
    })),
  });
});

coachingRouter.post('/assignments', requireAuth, (req: AuthedRequest, res) => {
  if (!['coach', 'admin'].includes(req.user!.role)) return res.status(403).json({ error: 'Only coaches can create assignments' });
  const schema = z.object({
    studentUsername: z.string().min(2), title: z.string().min(3).max(120),
    instructions: z.string().min(5).max(2000), puzzleIds: z.array(z.string()).max(20).optional(),
    dueAt: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const student = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(parsed.data.studentUsername.toLowerCase()) as any;
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const assignmentId = `asg_${Math.random().toString(36).slice(2, 12)}`;
  db.prepare('INSERT INTO assignments (id, coach_id, student_id, title, instructions, puzzle_ids, due_at) VALUES (?,?,?,?,?,?,?)')
    .run(assignmentId, req.user!.id, student.id, parsed.data.title, parsed.data.instructions,
      JSON.stringify(parsed.data.puzzleIds ?? []), parsed.data.dueAt ?? null);
  res.status(201).json({ ok: true, assignmentId });
});

coachingRouter.post('/assignments/:id/submit', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ submission: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Describe what you completed' });
  const row = db.prepare("SELECT * FROM assignments WHERE id = ? AND student_id = ? AND status = 'open'")
    .get(req.params.id, req.user!.id) as any;
  if (!row) return res.status(404).json({ error: 'Assignment not found or already submitted' });
  db.prepare("UPDATE assignments SET status = 'submitted', submission = ? WHERE id = ?").run(parsed.data.submission, row.id);
  res.json({ ok: true });
});

coachingRouter.post('/assignments/:id/review', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ feedback: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide feedback' });
  const row = db.prepare("SELECT * FROM assignments WHERE id = ? AND coach_id = ?").get(req.params.id, req.user!.id) as any;
  if (!row) return res.status(404).json({ error: 'Assignment not found' });
  db.prepare("UPDATE assignments SET status = 'reviewed', feedback = ? WHERE id = ?").run(parsed.data.feedback, row.id);
  res.json({ ok: true });
});

coachingRouter.get('/students', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT DISTINCT u.id, u.username, u.avatar_url,
       (SELECT COUNT(*) FROM assignments a2 WHERE a2.coach_id = ? AND a2.student_id = u.id) AS assignments,
       (SELECT COUNT(*) FROM assignments a3 WHERE a3.coach_id = ? AND a3.student_id = u.id AND a3.status = 'reviewed') AS reviewed
     FROM assignments a JOIN users u ON u.id = a.student_id WHERE a.coach_id = ?`
  ).all(req.user!.id, req.user!.id, req.user!.id) as any[];
  res.json({ students: rows });
});
