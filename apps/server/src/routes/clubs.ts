import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { id, slugify } from '../lib/ids.js';
import { audit, notify } from '../lib/service.js';
import { hub } from '../services/hub.js';

export const clubsRouter = Router();

clubsRouter.get('/', (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rows = db.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id AND m.status = 'active') AS members,
       (SELECT AVG(r.rating) FROM club_members m JOIN ratings r ON r.user_id = m.user_id AND r.category = 'blitz'
         WHERE m.club_id = c.id AND m.status = 'active') AS average
     FROM clubs c WHERE c.is_private = 0 AND (? = '' OR c.name LIKE ?) ORDER BY members DESC LIMIT 40`
  ).all(q, `%${q}%`) as any[];
  const mine = req.user
    ? new Set((db.prepare("SELECT club_id FROM club_members WHERE user_id = ? AND status = 'active'").all(req.user.id) as any[]).map(r => r.club_id))
    : new Set<string>();
  res.json({
    clubs: rows.map(c => ({
      id: c.id, name: c.name, slug: c.slug, description: c.description, country: c.country, avatarUrl: c.avatar_url,
      members: c.members, averageRating: c.average ? Math.round(c.average) : null, joined: mine.has(c.id),
    })),
  });
});

clubsRouter.get('/mine', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT c.*, m.role, m.status AS membership_status,
       (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id AND x.status = 'active') AS members
     FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.user_id = ? ORDER BY c.name`
  ).all(req.user!.id);
  res.json({ clubs: rows });
});

clubsRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().trim().min(3).max(60),
    description: z.string().trim().min(10).max(1000),
    country: z.string().length(2).optional(),
    isPrivate: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const clash = db.prepare('SELECT id FROM clubs WHERE name = ?').get(parsed.data.name);
  if (clash) return res.status(409).json({ error: 'A club with that name already exists' });
  const clubId = id('clb_');
  db.prepare('INSERT INTO clubs (id, name, slug, description, country, owner_id, is_private) VALUES (?,?,?,?,?,?,?)')
    .run(clubId, parsed.data.name, slugify(parsed.data.name) + '-' + Math.random().toString(36).slice(2, 6),
      parsed.data.description, parsed.data.country?.toUpperCase() ?? null, req.user!.id, parsed.data.isPrivate ? 1 : 0);
  db.prepare("INSERT INTO club_members (club_id, user_id, role) VALUES (?,?, 'owner')").run(clubId, req.user!.id);
  audit(req.user!.id, 'club.created', 'club', clubId, { name: parsed.data.name }, req.ip);
  res.status(201).json({ ok: true, clubId });
});

clubsRouter.get('/:slug', (req: AuthedRequest, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE slug = ? OR id = ?').get(req.params.slug, req.params.slug) as any;
  if (!club) return res.status(404).json({ error: 'Club not found' });
  const members = db.prepare(
    `SELECT u.id, u.username, u.country, u.avatar_url, m.role, m.joined_at,
       (SELECT rating FROM ratings WHERE user_id = u.id AND category = 'blitz') AS blitz
     FROM club_members m JOIN users u ON u.id = m.user_id WHERE m.club_id = ? AND m.status = 'active'
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, blitz DESC`
  ).all(club.id) as any[];
  const membership = db.prepare('SELECT role, status FROM club_members WHERE club_id = ? AND user_id = ?')
    .get(club.id, req.user?.id ?? '') as any;
  const announcements = db.prepare(
    `SELECT a.*, u.username AS author FROM club_announcements a LEFT JOIN users u ON u.id = a.author_id
      WHERE a.club_id = ? ORDER BY a.created_at DESC LIMIT 10`
  ).all(club.id);
  const events = db.prepare(
    `SELECT t.id, t.name, t.slug, t.starts_at, t.status FROM tournaments t WHERE t.organizer_id IN
      (SELECT user_id FROM club_members WHERE club_id = ?) AND t.status IN ('upcoming','ongoing') ORDER BY t.starts_at LIMIT 5`
  ).all(club.id);
  res.json({
    club: { ...club, isPrivate: Boolean(club.is_private) },
    members: members.map(m => ({
      id: m.id, username: m.username, country: m.country, avatarUrl: m.avatar_url, role: m.role,
      rating: Math.round(m.blitz ?? 1200), online: hub.isOnline(m.id), joinedAt: m.joined_at,
    })),
    membership: membership ?? null,
    announcements,
    events,
    canManage: membership?.role === 'owner' || membership?.role === 'moderator' || req.user?.role === 'admin',
  });
});

clubsRouter.post('/:slug/join', requireAuth, (req: AuthedRequest, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE slug = ? OR id = ?').get(req.params.slug, req.params.slug) as any;
  if (!club) return res.status(404).json({ error: 'Club not found' });
  const status = club.is_private ? 'pending' : 'active';
  db.prepare(`INSERT INTO club_members (club_id, user_id, status) VALUES (?,?,?)
    ON CONFLICT(club_id, user_id) DO UPDATE SET status = excluded.status`).run(club.id, req.user!.id, status);
  if (status === 'pending' && club.owner_id) {
    notify(club.owner_id, 'club', 'New membership request', `${req.user!.username} asked to join ${club.name}.`, `/clubs/${club.slug}`);
  }
  res.json({ ok: true, status });
});

clubsRouter.post('/:slug/leave', requireAuth, (req: AuthedRequest, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE slug = ?').get(req.params.slug) as any;
  if (!club) return res.status(404).json({ error: 'Club not found' });
  if (club.owner_id === req.user!.id) return res.status(400).json({ error: 'The owner cannot leave their own club' });
  db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(club.id, req.user!.id);
  res.json({ ok: true });
});

clubsRouter.post('/:slug/members/:userId', requireAuth, (req: AuthedRequest, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE slug = ?').get(req.params.slug) as any;
  if (!club) return res.status(404).json({ error: 'Club not found' });
  const me = db.prepare('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?').get(club.id, req.user!.id) as any;
  if (!me || (me.role !== 'owner' && me.role !== 'moderator' && req.user!.role !== 'admin')) {
    return res.status(403).json({ error: 'Only club managers can change memberships' });
  }
  const schema = z.object({ action: z.enum(['approve', 'remove', 'promote', 'demote', 'ban']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Unknown action' });
  const targetId = req.params.userId;
  if (targetId === club.owner_id && parsed.data.action !== 'approve') return res.status(400).json({ error: 'The owner cannot be removed' });
  switch (parsed.data.action) {
    case 'approve': db.prepare("UPDATE club_members SET status = 'active' WHERE club_id = ? AND user_id = ?").run(club.id, targetId); break;
    case 'remove': db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(club.id, targetId); break;
    case 'promote': db.prepare("UPDATE club_members SET role = 'moderator' WHERE club_id = ? AND user_id = ?").run(club.id, targetId); break;
    case 'demote': db.prepare("UPDATE club_members SET role = 'member' WHERE club_id = ? AND user_id = ?").run(club.id, targetId); break;
    case 'ban': db.prepare("UPDATE club_members SET status = 'banned' WHERE club_id = ? AND user_id = ?").run(club.id, targetId); break;
  }
  audit(req.user!.id, `club.member_${parsed.data.action}`, 'club', club.id, { targetId }, req.ip);
  res.json({ ok: true });
});

clubsRouter.post('/:slug/announcements', requireAuth, (req: AuthedRequest, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE slug = ?').get(req.params.slug) as any;
  if (!club) return res.status(404).json({ error: 'Club not found' });
  const me = db.prepare('SELECT role FROM club_members WHERE club_id = ? AND user_id = ? AND status = ?').get(club.id, req.user!.id, 'active') as any;
  if (!me || !['owner', 'moderator'].includes(me.role)) return res.status(403).json({ error: 'Only club managers can post announcements' });
  const schema = z.object({ title: z.string().min(3).max(120), body: z.string().min(3).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const announcementId = id('ann_');
  db.prepare('INSERT INTO club_announcements (id, club_id, author_id, title, body) VALUES (?,?,?,?,?)')
    .run(announcementId, club.id, req.user!.id, parsed.data.title, parsed.data.body);
  const members = db.prepare("SELECT user_id FROM club_members WHERE club_id = ? AND status = 'active' AND user_id != ?")
    .all(club.id, req.user!.id) as { user_id: string }[];
  for (const m of members) notify(m.user_id, 'club', `${club.name}: announcement`, parsed.data.title, `/clubs/${club.slug}`);
  res.status(201).json({ ok: true, announcementId });
});
