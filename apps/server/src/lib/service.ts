import { db, nowIso } from '../db/index.js';
import { id } from './ids.js';
import { divisionFor, type Category } from './ratings.js';

export function getUserRating(userId: string, category: Category) {
  let row = db.prepare('SELECT * FROM ratings WHERE user_id = ? AND category = ?').get(userId, category) as
    | { rating: number; rd: number; games: number; peak: number; volatility: number }
    | undefined;
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO ratings (user_id, category) VALUES (?,?)').run(userId, category);
    row = db.prepare('SELECT * FROM ratings WHERE user_id = ? AND category = ?').get(userId, category) as typeof row;
  }
  return { ...row!, division: divisionFor(row!.rating) };
}

export function allRatings(userId: string) {
  const categories: Category[] = ['bullet', 'blitz', 'rapid', 'classical'];
  return Object.fromEntries(categories.map(c => [c, getUserRating(userId, c)]));
}

export function notify(userId: string, type: string, title: string, body?: string, link?: string) {
  db.prepare('INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?,?,?,?,?,?)')
    .run(id('ntf_'), userId, type, title, body ?? null, link ?? null);
}

export function logActivity(userId: string, type: string, summary: string, link?: string) {
  db.prepare('INSERT INTO activity (user_id, type, summary, link) VALUES (?,?,?,?)').run(userId, type, summary, link ?? null);
}

export function audit(actorId: string | null, action: string, targetType?: string, targetId?: string, meta?: unknown, ip?: string) {
  db.prepare('INSERT INTO audit_logs (actor_id, action, target_type, target_id, meta, ip) VALUES (?,?,?,?,?,?)')
    .run(actorId, action, targetType ?? null, targetId ?? null, meta ? JSON.stringify(meta) : null, ip ?? null);
}

export function bumpAchievement(userId: string, achievementId: string, amount = 1) {
  const achievement = db.prepare('SELECT * FROM achievements WHERE id = ?').get(achievementId) as
    | { id: string; target: number; name: string }
    | undefined;
  if (!achievement) return;
  const existing = db.prepare('SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?').get(userId, achievementId) as
    | { progress: number; unlocked_at: string | null }
    | undefined;
  if (existing?.unlocked_at) return;
  const progress = Math.min(achievement.target, (existing?.progress ?? 0) + amount);
  const unlocked = progress >= achievement.target ? nowIso() : null;
  db.prepare(
    `INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked_at) VALUES (?,?,?,?)
     ON CONFLICT(user_id, achievement_id) DO UPDATE SET progress = excluded.progress, unlocked_at = excluded.unlocked_at`
  ).run(userId, achievementId, progress, unlocked);
  if (unlocked) notify(userId, 'achievement', 'Achievement unlocked', achievement.name, '/achievements');
}

export function getSetting<T = unknown>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export function setSetting(key: string, value: unknown) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export function publicPlayer(row: any) {
  if (!row) return null;
  const ratings = ['bullet', 'blitz', 'rapid', 'classical'].map(c => {
    const r = db.prepare('SELECT rating, games, peak FROM ratings WHERE user_id = ? AND category = ?').get(row.id, c) as any;
    return { category: c, rating: r ? Math.round(r.rating) : 1200, games: r?.games ?? 0, peak: r ? Math.round(r.peak) : 1200 };
  });
  return {
    id: row.id,
    username: row.username,
    country: row.show_country === 0 ? null : row.country,
    avatarUrl: row.avatar_url,
    title: row.title,
    bio: row.bio,
    plan: row.plan,
    role: row.role,
    online: Boolean(row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() < 120000),
    ratings,
    division: divisionFor(ratings[1].rating).name,
    createdAt: row.created_at,
  };
}
