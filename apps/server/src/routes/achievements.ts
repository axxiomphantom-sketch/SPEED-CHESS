import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';

export const achievementsRouter = Router();
export const notificationsRouter = Router();

achievementsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT a.*, ua.progress, ua.unlocked_at FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
      ORDER BY (ua.unlocked_at IS NOT NULL) DESC, a.category, a.target`
  ).all(req.user!.id) as any[];
  const unlocked = rows.filter(r => r.unlocked_at).length;
  res.json({
    achievements: rows.map(r => ({
      id: r.id, name: r.name, description: r.description, icon: r.icon, tier: r.tier, category: r.category,
      target: r.target, progress: r.progress ?? 0, unlocked: Boolean(r.unlocked_at), unlockedAt: r.unlocked_at,
      percentage: Math.min(100, Math.round(((r.progress ?? 0) / r.target) * 100)),
    })),
    unlocked,
    total: rows.length,
  });
});

notificationsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60')
    .all(req.user!.id) as any[];
  res.json({
    notifications: rows.map(n => ({
      id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: Boolean(n.read_at), createdAt: n.created_at,
    })),
    unread: rows.filter(n => !n.read_at).length,
  });
});

notificationsRouter.post('/:id/read', requireAuth, (req: AuthedRequest, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

notificationsRouter.post('/read-all', requireAuth, (req: AuthedRequest, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user!.id);
  res.json({ ok: true });
});

notificationsRouter.delete('/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});
