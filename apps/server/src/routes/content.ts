import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { requireAuth, requireRole, type AuthedRequest } from '../lib/auth.js';
import { id, slugify } from '../lib/ids.js';
import { audit, notify } from '../lib/service.js';

export const contentRouter = Router();

contentRouter.get('/', (req: AuthedRequest, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  let sql = `SELECT a.id, a.slug, a.title, a.summary, a.category, a.views, a.created_at, u.username AS author
             FROM articles a LEFT JOIN users u ON u.id = a.author_id WHERE a.status = 'published'`;
  const params: unknown[] = [];
  if (category && category !== 'all') { sql += ' AND a.category = ?'; params.push(category); }
  if (q) { sql += ' AND (a.title LIKE ? OR a.summary LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY a.created_at DESC LIMIT 40';
  const rows = db.prepare(sql).all(...params);
  const categories = db.prepare("SELECT category, COUNT(*) AS count FROM articles WHERE status = 'published' GROUP BY category").all();
  res.json({ articles: rows, categories });
});

contentRouter.get('/:slug', (req: AuthedRequest, res) => {
  const row = db.prepare(
    `SELECT a.*, u.username AS author FROM articles a LEFT JOIN users u ON u.id = a.author_id WHERE a.slug = ?`
  ).get(req.params.slug) as any;
  if (!row) return res.status(404).json({ error: 'Article not found' });
  const isOwner = req.user?.id === row.author_id;
  const isStaff = req.user?.role === 'admin' || req.user?.role === 'moderator';
  if (row.status !== 'published' && !isOwner && !isStaff) return res.status(403).json({ error: 'This article is not published' });
  if (row.status === 'published') db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(row.id);
  res.json({ article: row, canEdit: isOwner || isStaff });
});

contentRouter.get('/mine/drafts', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM articles WHERE author_id = ? ORDER BY updated_at DESC').all(req.user!.id);
  res.json({ articles: rows });
});

contentRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  if (!['coach', 'admin', 'moderator'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only approved creator accounts can publish content. Request creator access from Settings.' });
  }
  const schema = z.object({
    title: z.string().min(5).max(140), summary: z.string().min(10).max(300),
    body: z.string().min(50).max(60_000), category: z.string().min(2).max(30).default('strategy'),
    publish: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const articleId = id('art_');
  db.prepare('INSERT INTO articles (id, slug, title, summary, body, category, author_id, status) VALUES (?,?,?,?,?,?,?,?)')
    .run(articleId, slugify(parsed.data.title) + '-' + Math.random().toString(36).slice(2, 6), parsed.data.title,
      parsed.data.summary, parsed.data.body, parsed.data.category, req.user!.id, parsed.data.publish ? 'published' : 'draft');
  audit(req.user!.id, 'content.created', 'article', articleId, { title: parsed.data.title }, req.ip);
  res.status(201).json({ ok: true, articleId });
});

contentRouter.patch('/:id', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Article not found' });
  if (row.author_id !== req.user!.id && req.user!.role !== 'admin') return res.status(403).json({ error: 'Not your article' });
  const schema = z.object({
    title: z.string().min(5).max(140).optional(), summary: z.string().min(10).max(300).optional(),
    body: z.string().min(50).max(60_000).optional(), category: z.string().max(30).optional(),
    publish: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ['title', 'summary', 'body', 'category'] as const) {
    if (parsed.data[key] !== undefined) { fields.push(`${key} = ?`); values.push(parsed.data[key]); }
  }
  if (parsed.data.publish !== undefined) { fields.push('status = ?'); values.push(parsed.data.publish ? 'published' : 'draft'); }
  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  values.push(nowIso(), row.id);
  db.prepare(`UPDATE articles SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

/** Moderation queue for admins and moderators. */
contentRouter.get('/queue/pending', requireRole('moderator', 'admin'), (_req, res) => {
  const rows = db.prepare("SELECT * FROM articles WHERE status IN ('in-review','rejected') ORDER BY updated_at DESC").all();
  res.json({ articles: rows });
});

contentRouter.post('/:id/moderate', requireRole('moderator', 'admin'), (req: AuthedRequest, res) => {
  const schema = z.object({ action: z.enum(['publish', 'reject']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Unknown moderation action' });
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Article not found' });
  db.prepare('UPDATE articles SET status = ?, updated_at = ? WHERE id = ?')
    .run(parsed.data.action === 'publish' ? 'published' : 'rejected', nowIso(), row.id);
  if (row.author_id) notify(row.author_id, 'content', `Article ${parsed.data.action === 'publish' ? 'published' : 'rejected'}`, row.title, `/content/${row.slug}`);
  audit(req.user!.id, `content.${parsed.data.action}`, 'article', row.id, {}, req.ip);
  res.json({ ok: true });
});
