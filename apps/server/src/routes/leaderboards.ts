import { Router } from 'express';
import { db } from '../db/index.js';
import type { AuthedRequest } from '../lib/auth.js';
import { CATEGORIES, divisionFor, type Category } from '../lib/ratings.js';

export const leaderboardsRouter = Router();

/** Rankings use only stored rating records. Filters: scope, category, country. */
leaderboardsRouter.get('/', (req: AuthedRequest, res) => {
  const category = (typeof req.query.category === 'string' && CATEGORIES.includes(req.query.category as Category)
    ? req.query.category : 'blitz') as Category;
  const scope = typeof req.query.scope === 'string' ? req.query.scope : 'global';
  const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : undefined;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  let where = `u.status = 'active' AND r.games > 0`;
  const params: unknown[] = [];
  if (country && scope !== 'friends') { where += ' AND u.country = ?'; params.push(country); }
  if (scope === 'friends' && req.user) {
    where += ` AND (u.id = ? OR u.id IN (
      SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END FROM friendships
      WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'))`;
    params.push(req.user.id, req.user.id, req.user.id, req.user.id);
  }

  const ranked = db.prepare(
    `SELECT u.id, u.username, u.country, u.avatar_url, u.title, u.show_country, r.rating, r.games, r.peak,
       (SELECT COUNT(*) FROM games g WHERE (g.white_id = u.id OR g.black_id = u.id) AND g.status = 'finished') AS total_games,
       (SELECT COUNT(*) FROM games g WHERE g.status = 'finished' AND ((g.white_id = u.id AND g.result = 'white') OR (g.black_id = u.id AND g.result = 'black'))) AS wins
     FROM ratings r JOIN users u ON u.id = r.user_id
     WHERE r.category = ? AND ${where}
     ORDER BY r.rating DESC, r.games DESC LIMIT ? OFFSET ?`
  ).all(category, ...params, limit, offset) as any[];

  res.json({
    category,
    scope,
    entries: ranked.map((r, i) => ({
      rank: offset + i + 1,
      id: r.id,
      username: r.username,
      country: r.show_country ? r.country : null,
      avatarUrl: r.avatar_url,
      title: r.title,
      rating: Math.round(r.rating),
      peak: Math.round(r.peak),
      games: r.total_games,
      winRate: r.total_games ? Math.round((r.wins / r.total_games) * 100) : 0,
      division: divisionFor(r.rating).name,
    })),
  });
});

/** Club rankings computed from member ratings. */
leaderboardsRouter.get('/clubs', (req, res) => {
  const category = (typeof req.query.category === 'string' ? req.query.category : 'blitz') as Category;
  const rows = db.prepare(
    `SELECT c.id, c.name, c.slug, c.country, COUNT(m.user_id) AS members, AVG(r.rating) AS average
       FROM clubs c JOIN club_members m ON m.club_id = c.id AND m.status = 'active'
       LEFT JOIN ratings r ON r.user_id = m.user_id AND r.category = ?
      GROUP BY c.id ORDER BY average DESC NULLS LAST LIMIT 50`
  ).all(category) as any[];
  res.json({
    clubs: rows.map((r, i) => ({
      rank: i + 1, id: r.id, name: r.name, slug: r.slug, country: r.country, members: r.members,
      averageRating: r.average ? Math.round(r.average) : null,
    })),
  });
});

leaderboardsRouter.get('/countries', (req, res) => {
  const rows = db.prepare(
    `SELECT u.country, COUNT(*) AS players, MAX(r.rating) AS top, AVG(r.rating) AS average
       FROM ratings r JOIN users u ON u.id = r.user_id
      WHERE r.category = 'blitz' AND u.country IS NOT NULL AND u.show_country = 1 AND u.status = 'active' AND r.games > 0
      GROUP BY u.country ORDER BY top DESC LIMIT 60`
  ).all() as any[];
  res.json({
    countries: rows.map((r, i) => ({
      rank: i + 1, country: r.country, players: r.players, topRating: Math.round(r.top), averageRating: Math.round(r.average),
    })),
  });
});
