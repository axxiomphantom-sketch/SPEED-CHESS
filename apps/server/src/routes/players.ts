import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { allRatings } from '../lib/service.js';
import { CATEGORIES, DIVISIONS, divisionFor } from '../lib/ratings.js';
import { hub } from '../services/hub.js';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from '../config.js';

export const playersRouter = Router();
export const meRouter = Router();

const EDITABLE = {
  bio: z.string().max(400).optional(),
  country: z.string().length(2).optional().or(z.literal('')),
  title: z.string().max(12).optional(),
  avatarUrl: z.string().max(500).optional(),
  boardTheme: z.enum(['violet', 'classic', 'emerald', 'slate', 'midnight']).optional(),
  pieceSet: z.enum(['classic', 'outline', 'solid']).optional(),
  showCoordinates: z.boolean().optional(),
  showLegalMoves: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  language: z.string().max(8).optional(),
  allowFriendRequests: z.boolean().optional(),
  allowMessages: z.boolean().optional(),
  showCountry: z.boolean().optional(),
  showActivity: z.boolean().optional(),
  notifyGames: z.boolean().optional(),
  notifySocial: z.boolean().optional(),
  notifyLearning: z.boolean().optional(),
  notifyTournaments: z.boolean().optional(),
};

const COLUMN_MAP: Record<string, string> = {
  bio: 'bio', country: 'country', title: 'title', avatarUrl: 'avatar_url', boardTheme: 'board_theme',
  pieceSet: 'piece_set', showCoordinates: 'show_coordinates', showLegalMoves: 'show_legal_moves',
  soundEnabled: 'sound_enabled', reducedMotion: 'reduced_motion', language: 'language',
  allowFriendRequests: 'allow_friend_requests', allowMessages: 'allow_messages', showCountry: 'show_country',
  showActivity: 'show_activity', notifyGames: 'notify_games', notifySocial: 'notify_social',
  notifyLearning: 'notify_learning', notifyTournaments: 'notify_tournaments',
};

const BOOLEAN_COLUMNS = new Set([
  'show_coordinates', 'show_legal_moves', 'sound_enabled', 'reduced_motion', 'allow_friend_requests',
  'allow_messages', 'show_country', 'show_activity', 'notify_games', 'notify_social', 'notify_learning', 'notify_tournaments',
]);

/** Current user's full settings payload. */
meRouter.get('/settings', requireAuth, (req: AuthedRequest, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  res.json({
    settings: {
      bio: u.bio ?? '', country: u.country ?? '', title: u.title ?? '', avatarUrl: u.avatar_url ?? '',
      boardTheme: u.board_theme, pieceSet: u.piece_set, showCoordinates: !!u.show_coordinates,
      showLegalMoves: !!u.show_legal_moves, soundEnabled: !!u.sound_enabled, reducedMotion: !!u.reduced_motion,
      language: u.language, allowFriendRequests: !!u.allow_friend_requests, allowMessages: !!u.allow_messages,
      showCountry: !!u.show_country, showActivity: !!u.show_activity, notifyGames: !!u.notify_games,
      notifySocial: !!u.notify_social, notifyLearning: !!u.notify_learning, notifyTournaments: !!u.notify_tournaments,
      plan: u.plan, planRenewsAt: u.plan_renews_at, email: u.email, username: u.username,
      emailVerified: !!u.email_verified, role: u.role,
    },
  });
});

meRouter.patch('/settings', requireAuth, (req: AuthedRequest, res) => {
  const parsed = z.object(EDITABLE).partial().safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    const column = COLUMN_MAP[key];
    if (!column) continue;
    fields.push(`${column} = ?`);
    if (BOOLEAN_COLUMNS.has(column)) values.push(value ? 1 : 0);
    else if (column === 'country') values.push(String(value ?? '').toUpperCase() || null);
    else values.push(value ?? null);
  }
  if (fields.length === 0) return res.status(400).json({ error: 'No supported settings supplied' });
  values.push(nowIso(), req.user!.id);
  db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

/**
 * Avatar upload. Accepts a small image as a data URL (the browser resizes it first), validates the
 * real file signature and stores it under /uploads. Keeps POST /uploads off the API surface entirely.
 */
meRouter.post('/avatar', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ dataUrl: z.string().min(40).max(2_800_000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Send the image as a data URL' });
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(parsed.data.dataUrl);
  if (!match) return res.status(400).json({ error: 'Only PNG, JPEG or WebP images are supported' });
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength > 2 * 1024 * 1024) return res.status(413).json({ error: 'The image must be smaller than 2 MB' });
  const signatureOk =
    (match[1] === 'png' && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (match[1] === 'jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8) ||
    (match[1] === 'webp' && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP');
  if (!signatureOk) return res.status(400).json({ error: 'That file is not a valid image' });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `avatar-${req.user!.id}-${Date.now()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  const url = `/uploads/${filename}`;
  db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?').run(url, nowIso(), req.user!.id);
  // Remove the previous avatar file if we generated it.
  const previous = req.user!.avatar_url;
  if (previous?.startsWith('/uploads/avatar-')) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(previous))); } catch { /* already gone */ }
  }
  res.json({ ok: true, avatarUrl: url });
});

meRouter.patch('/onboarding', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    experience: z.enum(['new', 'beginner', 'casual', 'club', 'advanced']),
    categories: z.array(z.enum(CATEGORIES)).min(1).max(4),
    interests: z.array(z.string().max(40)).max(8).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare('UPDATE users SET onboarded = 1, updated_at = ? WHERE id = ?').run(nowIso(), req.user!.id);
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(`onboarding:${req.user!.id}`, JSON.stringify(parsed.data));
  // Seed a sensible starting rating band from the self-assessment, marked provisional (high RD).
  const start = { new: 900, beginner: 1000, casual: 1150, club: 1400, advanced: 1650 }[parsed.data.experience];
  for (const c of parsed.data.categories) {
    const hasGames = db.prepare('SELECT games FROM ratings WHERE user_id = ? AND category = ?').get(req.user!.id, c) as { games: number };
    if (hasGames && hasGames.games === 0) {
      db.prepare('UPDATE ratings SET rating = ?, peak = ?, rd = 350 WHERE user_id = ? AND category = ?').run(start, start, req.user!.id, c);
    }
  }
  res.json({ ok: true });
});

/** Dashboard payload: only real records, never simulated numbers. */
meRouter.get('/dashboard', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const ratings = allRatings(uid);
  const games = db.prepare(
    `SELECT * FROM games WHERE (white_id = ? OR black_id = ?) AND status IN ('finished','aborted') ORDER BY started_at DESC`
  ).all(uid, uid) as any[];
  const finished = games.filter(g => g.status === 'finished');
  const wins = finished.filter(g => (g.white_id === uid && g.result === 'white') || (g.black_id === uid && g.result === 'black')).length;
  const draws = finished.filter(g => g.result === 'draw').length;
  const losses = finished.length - wins - draws;
  const activeGame = db.prepare(
    `SELECT id FROM games WHERE status = 'active' AND mode IN ('online','tournament') AND (white_id = ? OR black_id = ?) ORDER BY started_at DESC LIMIT 1`
  ).get(uid, uid) as { id: string } | undefined;

  const toPlay = db.prepare(
    `SELECT p.*, w.username AS white_name, b.username AS black_name FROM pairings p
       LEFT JOIN users w ON w.id = p.white_id LEFT JOIN users b ON b.id = p.black_id
       JOIN tournaments t ON t.id = p.tournament_id
      WHERE (p.white_id = ? OR p.black_id = ?) AND p.result IS NULL AND p.black_id IS NOT NULL AND p.game_id IS NOT NULL
      ORDER BY p.round ASC LIMIT 3`
  ).all(uid, uid) as any[];

  const recentGames = finished.slice(0, 5).map(g => ({
    id: g.id,
    opponent: g.white_id === uid ? g.black_name : g.white_name,
    color: g.white_id === uid ? 'white' : 'black',
    result: g.result === 'draw' ? 'draw' : ((g.white_id === uid && g.result === 'white') || (g.black_id === uid && g.result === 'black')) ? 'win' : 'loss',
    category: g.category, termination: g.termination, playedAt: g.started_at,
  }));

  const ratingHistory = db.prepare(
    `SELECT category, rating, delta, created_at FROM rating_history WHERE user_id = ? ORDER BY created_at ASC LIMIT 200`
  ).all(uid) as any[];

  const daily = db.prepare(
    `SELECT COUNT(*) AS solved FROM puzzle_attempts WHERE user_id = ? AND solved = 1 AND created_at >= datetime('now','-7 days')`
  ).get(uid) as { solved: number };

  const achievements = db.prepare(
    `SELECT a.id, a.name, a.description, a.icon, a.tier, ua.progress, a.target, ua.unlocked_at
       FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
      ORDER BY (ua.unlocked_at IS NOT NULL) DESC, a.target ASC LIMIT 6`
  ).all(uid) as any[];

  const upcoming = db.prepare(
    `SELECT t.id, t.name, t.slug, t.starts_at, t.format, t.category, r.points FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.user_id = ? AND r.status = 'registered' AND t.status IN ('upcoming','ongoing') ORDER BY t.starts_at ASC LIMIT 3`
  ).all(uid) as any[];

  const continueLesson = db.prepare(
    `SELECT l.slug, l.title, c.title AS course_title FROM lesson_progress p
       JOIN lessons l ON l.id = p.lesson_id JOIN courses c ON c.id = l.course_id
      WHERE p.user_id = ? AND p.status = 'started' ORDER BY p.updated_at DESC LIMIT 1`
  ).get(uid) as any;

  const friends = db.prepare(
    `SELECT u.id, u.username, u.last_seen_at, u.avatar_url FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
      WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted' LIMIT 6`
  ).all(uid, uid, uid) as any[];

  res.json({
    stats: {
      total: finished.length, wins, losses, draws,
      winRate: finished.length ? Math.round((wins / finished.length) * 100) : 0,
      byCategory: Object.fromEntries(CATEGORIES.map(c => {
        const subset = finished.filter(g => g.category === c);
        return [c, { games: subset.length, wins: subset.filter(g => (g.white_id === uid && g.result === 'white') || (g.black_id === uid && g.result === 'black')).length }];
      })),
    },
    ratings,
    division: divisionFor(ratings.blitz.rating),
    activeGameId: activeGame?.id ?? null,
    toPlay: toPlay.map(p => ({
      tournamentId: p.tournament_id, round: p.round, board: p.board,
      opponent: p.white_id === uid ? p.black_name : p.white_name, color: p.white_id === uid ? 'white' : 'black',
      gameId: p.game_id,
    })),
    recentGames,
    ratingHistory,
    dailyPuzzles: daily.solved,
    achievements: achievements.map(a => ({ ...a, unlocked: Boolean(a.unlocked_at) })),
    upcomingTournaments: upcoming,
    continueLesson: continueLesson ? { slug: continueLesson.slug, title: continueLesson.title, courseTitle: continueLesson.course_title } : null,
    friends: friends.map(f => ({ id: f.id, username: f.username, avatarUrl: f.avatar_url, online: hub.isOnline(f.id) })),
  });
});

/** Public player profile with privacy controls applied. */
playersRouter.get('/:username', (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM users WHERE username_lower = ? AND status != ?').get(req.params.username.toLowerCase(), 'deleted') as any;
  if (!row) return res.status(404).json({ error: 'Player not found' });
  const ratings = allRatings(row.id);
  const games = db.prepare(
    `SELECT * FROM games WHERE (white_id = ? OR black_id = ?) AND status = 'finished' ORDER BY started_at DESC LIMIT 20`
  ).all(row.id, row.id) as any[];
  const totals = db.prepare(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN (white_id = ? AND result = 'white') OR (black_id = ? AND result = 'black') THEN 1 ELSE 0 END) AS wins,
       SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) AS draws
     FROM games WHERE (white_id = ? OR black_id = ?) AND status = 'finished'`
  ).get(row.id, row.id, row.id, row.id) as { total: number; wins: number | null; draws: number | null };
  const achievements = db.prepare(
    `SELECT a.id, a.name, a.description, a.icon, a.tier, ua.unlocked_at FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? AND ua.unlocked_at IS NOT NULL ORDER BY ua.unlocked_at DESC`
  ).all(row.id);
  const clubs = db.prepare(
    `SELECT c.id, c.name, c.slug, m.role FROM club_members m JOIN clubs c ON c.id = m.club_id
      WHERE m.user_id = ? AND m.status = 'active'`
  ).all(row.id);
  const tournaments = db.prepare(
    `SELECT t.id, t.name, t.slug, t.starts_at, r.points FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.user_id = ? AND r.status = 'registered' ORDER BY t.starts_at DESC LIMIT 10`
  ).all(row.id);
  const friendRow = req.user
    ? db.prepare(`SELECT status, requester_id FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
        .get(req.user.id, row.id, row.id, req.user.id) as any
    : undefined;
  const activity = row.show_activity && (req.user?.id === row.id || true)
    ? db.prepare('SELECT type, summary, link, created_at FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(row.id)
    : [];
  res.json({
    player: {
      id: row.id, username: row.username, bio: row.bio, title: row.title, avatarUrl: row.avatar_url,
      country: row.show_country ? row.country : null, plan: row.plan, role: row.role,
      joinedAt: row.created_at, online: hub.isOnline(row.id), division: divisionFor(ratings.blitz.rating),
      isSelf: req.user?.id === row.id,
      isCoach: Boolean(db.prepare('SELECT 1 FROM coach_profiles WHERE user_id = ?').get(row.id)),
    },
    ratings,
    stats: {
      total: totals.total, wins: totals.wins ?? 0, draws: totals.draws ?? 0,
      losses: totals.total - (totals.wins ?? 0) - (totals.draws ?? 0),
      winRate: totals.total ? Math.round(((totals.wins ?? 0) / totals.total) * 100) : 0,
    },
    recentGames: games.map(g => ({
      id: g.id, white: g.white_name, black: g.black_name, result: g.result, category: g.category,
      playedAt: g.started_at, opponent: g.white_id === row.id ? g.black_name : g.white_name,
      outcome: g.result === 'draw' ? 'draw' : ((g.white_id === row.id && g.result === 'white') || (g.black_id === row.id && g.result === 'black')) ? 'win' : 'loss',
    })),
    achievements,
    clubs,
    tournaments,
    activity,
    friendship: friendRow ? { status: friendRow.status, incoming: friendRow.requester_id !== req.user?.id } : null,
  });
});

playersRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const rows = db.prepare(
    `SELECT u.id, u.username, u.country, u.avatar_url, u.title, u.last_seen_at, u.show_country,
       (SELECT rating FROM ratings WHERE user_id = u.id AND category = 'blitz') AS blitz
     FROM users u WHERE u.status = 'active' AND (? = '' OR u.username_lower LIKE ?)
     ORDER BY blitz DESC NULLS LAST LIMIT ?`
  ).all(q, `%${q.toLowerCase()}%`, limit) as any[];
  res.json({
    players: rows.map(r => ({
      id: r.id, username: r.username, country: r.show_country ? r.country : null, avatarUrl: r.avatar_url,
      title: r.title, rating: Math.round(r.blitz ?? 1200), online: hub.isOnline(r.id),
    })),
  });
});

/** Personal analytics: derived entirely from the player's stored games. */
meRouter.get('/analytics', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const games = db.prepare(
    `SELECT * FROM games WHERE (white_id = ? OR black_id = ?) AND status = 'finished' ORDER BY started_at ASC`
  ).all(uid, uid) as any[];
  const outcome = (g: any) => g.result === 'draw' ? 'draw'
    : ((g.white_id === uid && g.result === 'white') || (g.black_id === uid && g.result === 'black')) ? 'win' : 'loss';
  const byColor = { white: { games: 0, wins: 0 }, black: { games: 0, wins: 0 } };
  const byCategory = Object.fromEntries(CATEGORIES.map(c => [c, { games: 0, wins: 0, draws: 0, losses: 0 }]));
  const openings = new Map<string, { games: number; wins: number }>();
  let decisive = 0;
  for (const g of games) {
    const color = g.white_id === uid ? 'white' : 'black';
    const result = outcome(g);
    byColor[color].games++;
    if (result === 'win') byColor[color].wins++;
    const cat = byCategory[g.category];
    if (cat) { cat.games++; if (result === 'win') cat.wins++; else if (result === 'draw') cat.draws++; else cat.losses++; }
    if (g.opening_name) {
      const entry = openings.get(g.opening_name) ?? { games: 0, wins: 0 };
      entry.games++;
      if (result === 'win') entry.wins++;
      openings.set(g.opening_name, entry);
    }
    if ((g.result === 'white' || g.result === 'black') && g.white_id === uid || (g.result === 'white' || g.result === 'black') && g.black_id === uid) decisive++;
  }
  const terminations = db.prepare(
    `SELECT termination, COUNT(*) AS n FROM games WHERE (white_id = ? OR black_id = ?) AND status = 'finished' GROUP BY termination`
  ).all(uid, uid) as any[];
  const accuracyRows = db.prepare(
    `SELECT accuracy_white, accuracy_black, white_id, black_id FROM games WHERE (white_id = ? OR black_id = ?) AND accuracy_white IS NOT NULL`
  ).all(uid, uid) as any[];
  const accuracies = accuracyRows.map(r => (r.white_id === uid ? r.accuracy_white : r.accuracy_black)).filter((v): v is number => typeof v === 'number');
  const monthly = new Map<string, { games: number; wins: number }>();
  for (const g of games) {
    const key = String(g.started_at).slice(0, 7);
    const entry = monthly.get(key) ?? { games: 0, wins: 0 };
    entry.games++;
    if (outcome(g) === 'win') entry.wins++;
    monthly.set(key, entry);
  }
  const ratingHistory = db.prepare('SELECT category, rating, delta, created_at FROM rating_history WHERE user_id = ? ORDER BY created_at ASC').all(uid);
  res.json({
    totals: {
      games: games.length, decisive,
      wins: games.filter(g => outcome(g) === 'win').length,
      draws: games.filter(g => outcome(g) === 'draw').length,
    },
    byColor, byCategory,
    openings: [...openings.entries()].map(([name, v]) => ({ name, ...v, winRate: v.games ? Math.round((v.wins / v.games) * 100) : 0 }))
      .sort((a, b) => b.games - a.games).slice(0, 8),
    terminations,
    averageAccuracy: accuracies.length ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : null,
    monthly: [...monthly.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
    ratingHistory,
    divisions: DIVISIONS,
  });
});
