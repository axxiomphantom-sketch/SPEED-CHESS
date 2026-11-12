import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { requireAuth, requireRole, type AuthedRequest } from '../lib/auth.js';
import { audit, notify, setSetting, getSetting } from '../lib/service.js';
import { id } from '../lib/ids.js';
import { emailConfigured } from '../lib/mailer.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin', 'moderator'));

adminRouter.get('/overview', (req: AuthedRequest, res) => {
  const one = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as { n: number }).n;
  const daily = db.prepare(
    `SELECT substr(started_at,1,10) AS day, COUNT(*) AS games FROM games WHERE started_at >= datetime('now','-14 days')
     GROUP BY day ORDER BY day`
  ).all();
  const signups = db.prepare(
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS users FROM users WHERE created_at >= datetime('now','-14 days')
     GROUP BY day ORDER BY day`
  ).all();
  res.json({
    users: {
      total: one('SELECT COUNT(*) AS n FROM users'),
      active: one("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
      onlineRecently: one("SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= datetime('now','-15 minutes')"),
      suspended: one("SELECT COUNT(*) AS n FROM users WHERE status IN ('suspended','restricted')"),
    },
    games: {
      total: one('SELECT COUNT(*) AS n FROM games'),
      active: one("SELECT COUNT(*) AS n FROM games WHERE status = 'active'"),
      finished: one("SELECT COUNT(*) AS n FROM games WHERE status = 'finished'"),
      today: one("SELECT COUNT(*) AS n FROM games WHERE started_at >= datetime('now','-1 day')"),
    },
    tournaments: {
      upcoming: one("SELECT COUNT(*) AS n FROM tournaments WHERE status = 'upcoming'"),
      ongoing: one("SELECT COUNT(*) AS n FROM tournaments WHERE status = 'ongoing'"),
      completed: one("SELECT COUNT(*) AS n FROM tournaments WHERE status = 'completed'"),
    },
    content: {
      lessons: one('SELECT COUNT(*) AS n FROM lessons'),
      courses: one('SELECT COUNT(*) AS n FROM courses'),
      puzzles: one('SELECT COUNT(*) AS n FROM puzzles'),
      articles: one("SELECT COUNT(*) AS n FROM articles WHERE status = 'published'"),
    },
    subscriptions: {
      premium: one("SELECT COUNT(*) AS n FROM users WHERE plan = 'premium'"),
      pro: one("SELECT COUNT(*) AS n FROM users WHERE plan = 'pro'"),
      free: one("SELECT COUNT(*) AS n FROM users WHERE plan = 'free'"),
    },
    safety: {
      openReports: one("SELECT COUNT(*) AS n FROM reports WHERE status IN ('open','reviewing')"),
      auditEvents: one('SELECT COUNT(*) AS n FROM audit_logs'),
    },
    charts: { games: daily, signups },
    health: { uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576) },
    system: { emailConfigured: emailConfigured(), paymentsConfigured: Boolean(process.env.STRIPE_SECRET_KEY) },
    isAdmin: req.user!.role === 'admin',
  });
});

adminRouter.get('/users', (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const rows = db.prepare(
    `SELECT u.id, u.username, u.email, u.role, u.status, u.plan, u.country, u.created_at, u.last_seen_at,
       (SELECT COUNT(*) FROM games g WHERE g.white_id = u.id OR g.black_id = u.id) AS games
     FROM users u WHERE (? = '' OR u.username_lower LIKE ? OR u.email_lower LIKE ?)
     ORDER BY u.created_at DESC LIMIT 50`
  ).all(q, `%${q}%`, `%${q}%`);
  res.json({ users: rows });
});

adminRouter.post('/users/:id/status', requireRole('admin'), (req: AuthedRequest, res) => {
  const schema = z.object({ status: z.enum(['active', 'restricted', 'suspended']), reason: z.string().max(300).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid status' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin' && target.id !== req.user!.id) return res.status(403).json({ error: 'Administrator accounts cannot be modified here' });
  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(parsed.data.status, nowIso(), target.id);
  if (parsed.data.status === 'suspended') db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(nowIso(), target.id);
  notify(target.id, 'moderation', 'Account status updated', `An administrator set your account to ${parsed.data.status}.`, '/help');
  audit(req.user!.id, 'admin.user_status', 'user', target.id, parsed.data, req.ip);
  res.json({ ok: true });
});

adminRouter.post('/users/:id/role', requireRole('admin'), (req: AuthedRequest, res) => {
  const schema = z.object({ role: z.enum(['player', 'coach', 'organizer', 'moderator', 'admin']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role' });
  const result = db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(parsed.data.role, nowIso(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  audit(req.user!.id, 'admin.user_role', 'user', req.params.id, parsed.data, req.ip);
  res.json({ ok: true });
});

adminRouter.get('/reports', (req: AuthedRequest, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  const rows = db.prepare(
    `SELECT r.*, u.username AS reporter, t.username AS target_name FROM reports r
      LEFT JOIN users u ON u.id = r.reporter_id LEFT JOIN users t ON t.id = r.target_id_ref
      WHERE (? = 'all' OR r.status = ?) ORDER BY r.created_at DESC LIMIT 100`
  ).all(status, status === 'all' ? 'open' : status);
  res.json({ reports: rows });
});

adminRouter.post('/reports/:id/resolve', (req: AuthedRequest, res) => {
  const schema = z.object({ status: z.enum(['reviewing', 'actioned', 'dismissed']), resolution: z.string().min(3).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide a status and a written resolution' });
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Report not found' });
  db.prepare('UPDATE reports SET status = ?, resolution = ?, resolved_by = ?, updated_at = ? WHERE id = ?')
    .run(parsed.data.status, parsed.data.resolution, req.user!.id, nowIso(), row.id);
  if (row.reporter_id) notify(row.reporter_id, 'moderation', 'Report reviewed', parsed.data.resolution, '/help');
  audit(req.user!.id, 'admin.report_resolved', 'report', row.id, parsed.data, req.ip);
  res.json({ ok: true });
});

adminRouter.get('/audit', requireRole('admin'), (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT a.*, u.username AS actor FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC LIMIT 200`
  ).all();
  res.json({ logs: rows });
});

adminRouter.get('/settings', requireRole('admin'), (_req, res) => {
  res.json({
    settings: {
      registrationOpen: getSetting('registrationOpen', true),
      maintenanceMode: getSetting('maintenanceMode', false),
      announcementBanner: getSetting('announcementBanner', ''),
      supportedFormats: getSetting('supportedFormats', ['bullet', 'blitz', 'rapid', 'classical']),
    },
    paymentProviderConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  });
});

adminRouter.patch('/settings', requireRole('admin'), (req: AuthedRequest, res) => {
  const schema = z.object({
    registrationOpen: z.boolean().optional(),
    maintenanceMode: z.boolean().optional(),
    announcementBanner: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid settings payload' });
  for (const [key, value] of Object.entries(parsed.data)) setSetting(key, value);
  audit(req.user!.id, 'admin.settings_updated', 'settings', 'platform', parsed.data, req.ip);
  res.json({ ok: true });
});

adminRouter.post('/announcements', requireRole('admin'), (req: AuthedRequest, res) => {
  const schema = z.object({ title: z.string().min(3).max(120), body: z.string().min(3).max(1000), level: z.enum(['info', 'success', 'warning']).default('info') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const announcementId = id('anc_');
  db.prepare('INSERT INTO announcements (id, title, body, level, author_id) VALUES (?,?,?,?,?)')
    .run(announcementId, parsed.data.title, parsed.data.body, parsed.data.level, req.user!.id);
  audit(req.user!.id, 'admin.announcement', 'announcement', announcementId, parsed.data, req.ip);
  res.status(201).json({ ok: true, announcementId });
});

adminRouter.get('/tournaments', (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT t.*, u.username AS organizer,
       (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status = 'registered') AS players
     FROM tournaments t LEFT JOIN users u ON u.id = t.organizer_id ORDER BY t.starts_at DESC LIMIT 60`
  ).all();
  res.json({ tournaments: rows });
});

adminRouter.post('/tournaments/:id/cancel', requireRole('admin'), (req: AuthedRequest, res) => {
  const result = db.prepare("UPDATE tournaments SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tournament not found' });
  const players = db.prepare("SELECT user_id FROM registrations WHERE tournament_id = ? AND status = 'registered'").all(req.params.id) as { user_id: string }[];
  for (const p of players) notify(p.user_id, 'tournament', 'Tournament cancelled', 'The organiser or an administrator cancelled this event.', '/tournaments');
  audit(req.user!.id, 'admin.tournament_cancelled', 'tournament', req.params.id, {}, req.ip);
  res.json({ ok: true });
});

adminRouter.get('/lessons', (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT l.*, c.title AS course_title FROM lessons l LEFT JOIN courses c ON c.id = l.course_id ORDER BY c.title, l.order_index`
  ).all();
  res.json({ lessons: rows });
});

adminRouter.post('/lessons/:id/publish', requireRole('admin'), (req: AuthedRequest, res) => {
  const schema = z.object({ published: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  db.prepare('UPDATE lessons SET published = ? WHERE id = ?').run(parsed.data.published ? 1 : 0, req.params.id);
  audit(req.user!.id, 'admin.lesson_published', 'lesson', req.params.id, parsed.data, req.ip);
  res.json({ ok: true });
});

adminRouter.get('/financials', requireRole('admin'), (_req, res) => {
  const payments = db.prepare(
    `SELECT p.*, u.username FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 100`
  ).all();
  const totals = db.prepare(
    `SELECT status, COUNT(*) AS count, COALESCE(SUM(amount_cents),0) AS cents FROM payments GROUP BY status`
  ).all();
  res.json({ payments, totals });
});
