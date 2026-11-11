import { Router } from 'express';
import { config } from '../config.js';
import { emailConfigured } from '../lib/mailer.js';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { id } from '../lib/ids.js';
import { notify, getSetting } from '../lib/service.js';
import { hub } from '../services/hub.js';

export const metaRouter = Router();
export const reportsRouter = Router();
export const supportRouter = Router();

/** Public platform meta: pricing, announcements, FAQ, stats used on the landing page. */
metaRouter.get('/', (_req, res) => {
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  res.json({
    brand: { name: 'SPEED CHESS', tagline: 'PLAY. LEARN. COMPETE. EVOLVE.' },
    stats: {
      players: one("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
      games: one("SELECT COUNT(*) AS n FROM games WHERE status = 'finished'"),
      lessons: one('SELECT COUNT(*) AS n FROM lessons WHERE published = 1'),
      puzzles: one('SELECT COUNT(*) AS n FROM puzzles'),
      tournaments: one('SELECT COUNT(*) AS n FROM tournaments'),
      clubs: one('SELECT COUNT(*) AS n FROM clubs'),
      online: hub.onlineUsers().length,
    },
    plans: (db.prepare('SELECT * FROM plans ORDER BY price_cents').all() as any[]).map(p => ({ ...p, features: JSON.parse(p.features) })),
    announcements: db.prepare("SELECT id, title, body, level, created_at FROM announcements WHERE active = 1 ORDER BY created_at DESC LIMIT 3").all(),
    registrationOpen: getSetting('registrationOpen', true),
    maintenanceMode: getSetting('maintenanceMode', false),
  });
});

metaRouter.get('/health', (_req, res) => {
  res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()), version: '1.0.0' });
});

/**
 * Public runtime configuration for the client.
 *
 * Only ever exposes booleans and *publishable* values. Keys stay on the server: the browser learns
 * whether Supabase is wired up, never the credentials the server uses.
 */
metaRouter.get('/config', (_req, res) => {
  res.json({
    supabase: {
      configured: Boolean(config.supabaseUrl && config.supabasePublishableKey),
      url: config.supabaseUrl || null,
    },
    emailConfigured: emailConfigured(),
    paymentsConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  });
});

metaRouter.get('/search', (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  if (q.length < 2) return res.json({ players: [], lessons: [], tournaments: [], clubs: [], openings: [] });
  const like = `%${q}%`;
  res.json({
    players: db.prepare("SELECT username, country, avatar_url FROM users WHERE username_lower LIKE ? AND status = 'active' LIMIT 5").all(like),
    lessons: db.prepare('SELECT slug, title FROM lessons WHERE published = 1 AND (title LIKE ? OR tags LIKE ?) LIMIT 5').all(like, like),
    tournaments: db.prepare("SELECT slug, name, status FROM tournaments WHERE name LIKE ? AND is_private = 0 LIMIT 5").all(like),
    clubs: db.prepare('SELECT slug, name FROM clubs WHERE name LIKE ? LIMIT 5').all(like),
    openings: db.prepare('SELECT id, name, eco FROM openings WHERE name LIKE ? LIMIT 5').all(like),
  });
});

reportsRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    targetType: z.enum(['user', 'game', 'club', 'article', 'message']),
    targetId: z.string().min(1).max(80),
    reason: z.enum(['cheating', 'abuse', 'harassment', 'spam', 'inappropriate-content', 'other']),
    details: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose what you are reporting and why' });
  const reportId = id('rpt_');
  db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details) VALUES (?,?,?,?,?,?)')
    .run(reportId, req.user!.id, parsed.data.targetType, parsed.data.targetId, parsed.data.reason, parsed.data.details ?? null);
  res.status(201).json({ ok: true, reportId, message: 'Thank you. Our moderation team reviews every report; cheating reports are reviewed manually, never auto-penalised.' });
});

supportRouter.post('/tickets', (req: AuthedRequest, res) => {
  const schema = z.object({
    email: z.string().email(), topic: z.enum(['account', 'gameplay', 'payment', 'tournament', 'bug', 'other']),
    subject: z.string().min(4).max(140), body: z.string().min(10).max(4000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const ticketId = id('tkt_');
  db.prepare('INSERT INTO support_tickets (id, user_id, email, topic, subject, body) VALUES (?,?,?,?,?,?)')
    .run(ticketId, req.user?.id ?? null, parsed.data.email, parsed.data.topic, parsed.data.subject, parsed.data.body);
  if (req.user) notify(req.user.id, 'support', 'Support ticket received', `We received "${parsed.data.subject}".`, '/help');
  res.status(201).json({ ok: true, ticketId });
});

supportRouter.get('/tickets', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.id);
  res.json({ tickets: rows });
});
