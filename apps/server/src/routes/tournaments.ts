import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { requireAuth, requireRole, type AuthedRequest } from '../lib/auth.js';
import { audit, bumpAchievement, logActivity, notify } from '../lib/service.js';
import { id, slugify } from '../lib/ids.js';
import { gameById, gamePayload } from '../services/games.js';
import { advanceTournamentIfComplete, generateEliminationRound, generateSwissRound, startRoundGames, tournamentStandings } from '../services/tournaments.js';

export const tournamentsRouter = Router();

const FORMATS = ['swiss', 'single-elimination', 'double-elimination', 'round-robin', 'arena'] as const;

function shapeTournament(row: any) {
  const players = (db.prepare("SELECT COUNT(*) AS n FROM registrations WHERE tournament_id = ? AND status = 'registered'")
    .get(row.id) as { n: number }).n;
  return {
    id: row.id, name: row.name, slug: row.slug, description: row.description, organizer: row.organizer,
    format: row.format, category: row.category, rounds: row.rounds,
    timeControl: `${Math.round(row.initial_seconds / 60)}+${row.increment}`,
    initialSeconds: row.initial_seconds, increment: row.increment,
    maxPlayers: row.max_players, players,
    startsAt: row.starts_at, registrationDeadline: row.registration_deadline, status: row.status,
    isPrivate: Boolean(row.is_private), rules: row.rules, prize: row.prize, createdAt: row.created_at,
  };
}

tournamentsRouter.get('/', (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  let sql = `SELECT t.*, u.username AS organizer FROM tournaments t LEFT JOIN users u ON u.id = t.organizer_id
             WHERE t.is_private = 0 AND t.status != 'draft'`;
  const params: unknown[] = [];
  if (status && ['upcoming', 'ongoing', 'completed', 'cancelled'].includes(status)) { sql += ' AND t.status = ?'; params.push(status); }
  sql += ` ORDER BY CASE t.status WHEN 'ongoing' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END, t.starts_at ASC`;
  const rows = db.prepare(sql).all(...params) as any[];
  const registrations = req.user
    ? new Set((db.prepare("SELECT tournament_id FROM registrations WHERE user_id = ? AND status = 'registered'").all(req.user.id) as any[]).map(r => r.tournament_id))
    : new Set<string>();
  res.json({
    tournaments: rows.map(r => ({
      ...shapeTournament(r),
      registered: registrations.has(r.id),
      canRegister: new Date(r.registration_deadline).getTime() > Date.now() && r.status === 'upcoming',
      full: (db.prepare("SELECT COUNT(*) AS n FROM registrations WHERE tournament_id = ? AND status = 'registered'").get(r.id) as any).n >= r.max_players,
    })),
  });
});

tournamentsRouter.get('/mine', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT t.*, u.username AS organizer, r.points, r.status AS registration_status
       FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
       LEFT JOIN users u ON u.id = t.organizer_id
      WHERE r.user_id = ? ORDER BY t.starts_at DESC`
  ).all(req.user!.id) as any[];
  res.json({ tournaments: rows.map(r => ({ ...shapeTournament(r), points: r.points, registrationStatus: r.registration_status })) });
});

tournamentsRouter.get('/organised', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT t.*, u.username AS organizer FROM tournaments t LEFT JOIN users u ON u.id = t.organizer_id
      WHERE t.organizer_id = ? ORDER BY t.starts_at DESC`
  ).all(req.user!.id) as any[];
  res.json({ tournaments: rows.map(shapeTournament) });
});

tournamentsRouter.get('/:slug', (req: AuthedRequest, res) => {
  const row = db.prepare(
    `SELECT t.*, u.username AS organizer FROM tournaments t LEFT JOIN users u ON u.id = t.organizer_id WHERE t.slug = ? OR t.id = ?`
  ).get(req.params.slug, req.params.slug) as any;
  if (!row) return res.status(404).json({ error: 'Tournament not found' });
  const registered = req.user
    ? Boolean(db.prepare("SELECT 1 FROM registrations WHERE tournament_id = ? AND user_id = ? AND status = 'registered'").get(row.id, req.user.id))
    : false;
  const pairings = db.prepare(
    `SELECT p.*, w.username AS white_name, b.username AS black_name FROM pairings p
       LEFT JOIN users w ON w.id = p.white_id LEFT JOIN users b ON b.id = p.black_id
      WHERE p.tournament_id = ? ORDER BY p.round ASC, p.board ASC`
  ).all(row.id) as any[];
  const maxRound = pairings.reduce((m, p) => Math.max(m, p.round), 0);
  res.json({
    tournament: { ...shapeTournament(row), registered, isOrganizer: req.user?.id === row.organizer_id },
    standings: tournamentStandings(row.id),
    pairings: pairings.map(p => ({
      id: p.id, round: p.round, board: p.board,
      white: p.white_id ? { id: p.white_id, name: p.white_name } : null,
      black: p.black_id ? { id: p.black_id, name: p.black_name } : null,
      result: p.result, gameId: p.game_id,
    })),
    currentRound: maxRound,
  });
});

tournamentsRouter.post('/', requireRole('organizer', 'admin'), (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().min(4).max(80),
    description: z.string().min(10).max(2000),
    format: z.enum(FORMATS),
    category: z.enum(['bullet', 'blitz', 'rapid', 'classical']).default('blitz'),
    rounds: z.number().int().min(1).max(15).default(5),
    initialSeconds: z.number().int().min(60).max(3600).default(180),
    increment: z.number().int().min(0).max(60).default(2),
    maxPlayers: z.number().int().min(2).max(512).default(32),
    startsAt: z.string().min(8),
    registrationDeadline: z.string().min(8),
    rules: z.string().max(3000).optional(),
    prize: z.string().max(200).optional(),
    isPrivate: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const b = parsed.data;
  if (new Date(b.registrationDeadline) > new Date(b.startsAt)) {
    return res.status(400).json({ error: 'Registration must close before the tournament starts' });
  }
  const tournamentId = id('trn_');
  const slug = slugify(b.name) + '-' + Math.random().toString(36).slice(2, 6);
  db.prepare(
    `INSERT INTO tournaments (id, name, slug, description, organizer_id, format, category, rounds, initial_seconds, increment,
       max_players, starts_at, registration_deadline, status, is_private, rules, prize)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(tournamentId, b.name, slug, b.description, req.user!.id, b.format, b.category, b.rounds, b.initialSeconds,
    b.increment, b.maxPlayers, new Date(b.startsAt).toISOString(), new Date(b.registrationDeadline).toISOString(),
    'upcoming', b.isPrivate ? 1 : 0, b.rules ?? null, b.prize ?? null);
  audit(req.user!.id, 'tournament.created', 'tournament', tournamentId, { name: b.name }, req.ip);
  res.status(201).json({ ok: true, tournamentId, slug });
});

tournamentsRouter.post('/:id/register', requireAuth, (req: AuthedRequest, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id) as any;
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.status !== 'upcoming') return res.status(400).json({ error: 'Registration is closed for this tournament' });
  if (new Date(t.registration_deadline).getTime() < Date.now()) return res.status(400).json({ error: 'The registration deadline has passed' });
  const count = (db.prepare("SELECT COUNT(*) AS n FROM registrations WHERE tournament_id = ? AND status = 'registered'").get(t.id) as any).n;
  if (count >= t.max_players) return res.status(409).json({ error: 'This tournament is full' });
  const existing = db.prepare('SELECT * FROM registrations WHERE tournament_id = ? AND user_id = ?').get(t.id, req.user!.id) as any;
  if (existing?.status === 'registered') return res.status(200).json({ ok: true, alreadyRegistered: true });
  const seed = count + 1;
  db.prepare(
    `INSERT INTO registrations (tournament_id, user_id, status, seed) VALUES (?,?, 'registered', ?)
     ON CONFLICT(tournament_id, user_id) DO UPDATE SET status = 'registered', seed = excluded.seed`
  ).run(t.id, req.user!.id, seed);
  bumpAchievement(req.user!.id, 'tournament_join');
  logActivity(req.user!.id, 'tournament', `Registered for ${t.name}`, `/tournaments/${t.slug}`);
  notify(req.user!.id, 'tournament', 'Registration confirmed', `You are registered for ${t.name}.`, `/tournaments/${t.slug}`);
  res.json({ ok: true, seed });
});

tournamentsRouter.post('/:id/withdraw', requireAuth, (req: AuthedRequest, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id) as any;
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.status !== 'upcoming') return res.status(400).json({ error: 'Withdrawal is only possible before the tournament starts' });
  const result = db.prepare("UPDATE registrations SET status = 'withdrawn' WHERE tournament_id = ? AND user_id = ?")
    .run(t.id, req.user!.id);
  if (result.changes === 0) return res.status(400).json({ error: 'You are not registered' });
  res.json({ ok: true });
});

/** Organiser: generate pairings for a round and open the games. */
tournamentsRouter.post('/:id/rounds', requireRole('organizer', 'admin'), (req: AuthedRequest, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id) as any;
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.organizer_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'Only the organiser can manage rounds' });
  const schema = z.object({ round: z.number().int().min(1).max(20).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  const nextRound = (db.prepare('SELECT MAX(round) AS r FROM pairings WHERE tournament_id = ?').get(t.id) as { r: number | null }).r ?? 0;
  const round = parsed.success && parsed.data.round ? parsed.data.round : nextRound + 1;
  if (round !== nextRound + 1) return res.status(400).json({ error: `The next round must be ${nextRound + 1}` });
  if (t.format === 'swiss' || t.format === 'round-robin' || t.format === 'arena') generateSwissRound(t.id, round);
  else generateEliminationRound(t.id, round);
  const created = startRoundGames(t.id, round);
  audit(req.user!.id, 'tournament.round_started', 'tournament', t.id, { round }, req.ip);
  res.json({ ok: true, round, gamesCreated: created });
});

tournamentsRouter.post('/:id/advance', requireRole('organizer', 'admin'), (req: AuthedRequest, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id) as any;
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.organizer_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'Only the organiser can advance the tournament' });
  advanceTournamentIfComplete(t.id);
  const fresh = db.prepare('SELECT status FROM tournaments WHERE id = ?').get(t.id) as { status: string };
  res.json({ ok: true, status: fresh.status });
});

tournamentsRouter.post('/:id/close', requireRole('organizer', 'admin'), (req: AuthedRequest, res) => {
  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id) as any;
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.organizer_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'Only the organiser can close this tournament' });
  db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(t.id);
  audit(req.user!.id, 'tournament.closed', 'tournament', t.id, {}, req.ip);
  res.json({ ok: true });
});

/** Manual result entry for offline boards. */
tournamentsRouter.post('/:id/result', requireRole('organizer', 'admin'), (req: AuthedRequest, res) => {
  const schema = z.object({ pairingId: z.string().min(1), result: z.enum(['white', 'black', 'draw']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid result payload' });
  const pairing = db.prepare('SELECT * FROM pairings WHERE id = ? AND tournament_id = ?').get(parsed.data.pairingId, req.params.id) as any;
  if (!pairing) return res.status(404).json({ error: 'Pairing not found' });
  db.prepare('UPDATE pairings SET result = ? WHERE id = ?').run(parsed.data.result, pairing.id);
  const points = (userId: string, value: number) =>
    db.prepare('UPDATE registrations SET points = points + ? WHERE tournament_id = ? AND user_id = ?').run(value, req.params.id, userId);
  if (parsed.data.result === 'white') points(pairing.white_id, 1);
  else if (parsed.data.result === 'black') points(pairing.black_id, 1);
  else { points(pairing.white_id, 0.5); points(pairing.black_id, 0.5); }
  audit(req.user!.id, 'tournament.result_recorded', 'pairing', pairing.id, parsed.data, req.ip);
  res.json({ ok: true });
});

tournamentsRouter.get('/:id/games', (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT game_id FROM pairings WHERE tournament_id = ? AND game_id IS NOT NULL').all(req.params.id) as { game_id: string }[];
  const games = rows.map(r => gameById(r.game_id)).filter(Boolean).map(g => ({
    id: g!.id, white: g!.white_name, black: g!.black_name, result: g!.result, status: g!.status,
  }));
  res.json({ games });
});
