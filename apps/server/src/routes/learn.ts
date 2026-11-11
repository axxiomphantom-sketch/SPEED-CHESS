import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { requireAuth, requireRole, type AuthedRequest } from '../lib/auth.js';
import { bumpAchievement, notify } from '../lib/service.js';
import { id, slugify } from '../lib/ids.js';

export const learnRouter = Router();

/** Courses with lesson counts and the viewer's progress. */
learnRouter.get('/courses', (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT c.*, COUNT(l.id) AS lesson_count, COALESCE(SUM(l.minutes),0) AS total_minutes,
       (SELECT COUNT(*) FROM lesson_progress p JOIN lessons l2 ON l2.id = p.lesson_id
         WHERE l2.course_id = c.id AND p.user_id = ? AND p.status = 'completed') AS completed_lessons
     FROM courses c LEFT JOIN lessons l ON l.course_id = c.id AND l.published = 1
     WHERE c.published = 1
     GROUP BY c.id ORDER BY CASE c.level WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END, c.title`
  ).all(req.user?.id ?? '') as any[];
  res.json({
    courses: rows.map(r => ({
      id: r.id, slug: r.slug, title: r.title, level: r.level, summary: r.summary, description: r.description,
      icon: r.icon, minutes: r.total_minutes || r.minutes, lessonCount: r.lesson_count,
      completedLessons: r.completed_lessons, progress: r.lesson_count ? Math.round((r.completed_lessons / r.lesson_count) * 100) : 0,
    })),
  });
});

learnRouter.get('/courses/:slug', (req: AuthedRequest, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE slug = ? AND published = 1').get(req.params.slug) as any;
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lessons = db.prepare('SELECT id, slug, title, level, minutes, order_index FROM lessons WHERE course_id = ? AND published = 1 ORDER BY order_index')
    .all(course.id) as any[];
  const progressRows = req.user
    ? db.prepare('SELECT lesson_id, status, quiz_score, quiz_total FROM lesson_progress WHERE user_id = ?').all(req.user.id) as any[]
    : [];
  const progressMap = new Map(progressRows.map(p => [p.lesson_id, p]));
  res.json({
    course: { ...course, lessons: lessons.map(l => ({ ...l, progress: progressMap.get(l.id) ?? null })) },
  });
});

learnRouter.get('/lessons/:slug', (req: AuthedRequest, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE slug = ? AND published = 1').get(req.params.slug) as any;
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  const siblings = db.prepare('SELECT id, slug, title, order_index FROM lessons WHERE course_id = ? AND published = 1 ORDER BY order_index')
    .all(lesson.course_id) as any[];
  const idx = siblings.findIndex(s => s.id === lesson.id);
  const progress = req.user
    ? db.prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(req.user.id, lesson.id) ?? null
    : null;
  res.json({
    lesson: {
      ...lesson,
      highlights: lesson.highlights ? JSON.parse(lesson.highlights) : [],
      quiz: lesson.quiz ? JSON.parse(lesson.quiz) : [],
    },
    prev: idx > 0 ? siblings[idx - 1] : null,
    next: idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null,
    progress,
    totalInCourse: siblings.length,
    indexInCourse: idx + 1,
  });
});

learnRouter.post('/lessons/:slug/start', requireAuth, (req: AuthedRequest, res) => {
  const lesson = db.prepare('SELECT id FROM lessons WHERE slug = ?').get(req.params.slug) as any;
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  db.prepare(
    `INSERT INTO lesson_progress (user_id, lesson_id, status) VALUES (?,?, 'started')
     ON CONFLICT(user_id, lesson_id) DO NOTHING`
  ).run(req.user!.id, lesson.id);
  res.json({ ok: true });
});

const completeSchema = z.object({ score: z.number().int().min(0).optional(), total: z.number().int().min(0).optional() });

learnRouter.post('/lessons/:slug/complete', requireAuth, (req: AuthedRequest, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE slug = ?').get(req.params.slug) as any;
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  const parsed = completeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  db.prepare(
    `INSERT INTO lesson_progress (user_id, lesson_id, status, quiz_score, quiz_total, completed_at, updated_at)
     VALUES (?,?, 'completed', ?, ?, ?, ?)
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = 'completed',
       quiz_score = COALESCE(excluded.quiz_score, lesson_progress.quiz_score),
       quiz_total = COALESCE(excluded.quiz_total, lesson_progress.quiz_total),
       completed_at = COALESCE(lesson_progress.completed_at, excluded.completed_at), updated_at = excluded.updated_at`
  ).run(req.user!.id, lesson.id, parsed.data.score ?? null, parsed.data.total ?? null, nowIso(), nowIso());
  bumpAchievement(req.user!.id, 'lesson_1');
  bumpAchievement(req.user!.id, 'lessons_10');

  // Course completion achievement
  const stats = db.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) AS done
       FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
      WHERE l.course_id = ? AND l.published = 1`
  ).get(req.user!.id, lesson.course_id) as { total: number; done: number };
  const courseCompleted = stats.total > 0 && stats.done === stats.total;
  if (courseCompleted) {
    bumpAchievement(req.user!.id, 'course_1');
    notify(req.user!.id, 'learning', 'Course complete', 'You finished every lesson in this course.', '/learn');
  }
  res.json({ ok: true, courseCompleted, courseProgress: stats.total ? Math.round(stats.done / stats.total * 100) : 0 });
});

learnRouter.get('/progress', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT p.*, l.title, l.slug, c.title AS course_title, c.slug AS course_slug
       FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN courses c ON c.id = l.course_id
      WHERE p.user_id = ? ORDER BY p.updated_at DESC`
  ).all(req.user!.id) as any[];
  const totals = db.prepare('SELECT COUNT(*) AS n FROM lessons WHERE published = 1').get() as { n: number };
  res.json({
    progress: rows,
    completed: rows.filter(r => r.status === 'completed').length,
    totalLessons: totals.n,
  });
});

/** Continue-learning widget for the dashboard. */
learnRouter.get('/continue', requireAuth, (req: AuthedRequest, res) => {
  const started = db.prepare(
    `SELECT l.slug, l.title, c.title AS courseTitle, c.slug AS courseSlug, p.status,
       (SELECT COUNT(*) FROM lessons l2 WHERE l2.course_id = c.id AND l2.published = 1) AS total,
       (SELECT COUNT(*) FROM lesson_progress p2 JOIN lessons l3 ON l3.id = p2.lesson_id
         WHERE l3.course_id = c.id AND p2.user_id = ? AND p2.status = 'completed') AS done
     FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN courses c ON c.id = l.course_id
     WHERE p.user_id = ? AND p.status = 'started'
     ORDER BY p.updated_at DESC LIMIT 1`
  ).get(req.user!.id, req.user!.id) as any;
  if (started) {
    return res.json({
      lesson: {
        slug: started.slug, title: started.title, courseTitle: started.courseTitle, courseSlug: started.courseSlug,
        courseProgress: started.total ? Math.round((started.done / started.total) * 100) : 0,
      },
    });
  }
  const next = db.prepare(
    `SELECT l.slug, l.title, c.title AS courseTitle, c.slug AS courseSlug
       FROM lessons l JOIN courses c ON c.id = l.course_id
      WHERE l.published = 1 AND l.id NOT IN (SELECT lesson_id FROM lesson_progress WHERE user_id = ? AND status = 'completed')
      ORDER BY CASE c.level WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END, l.order_index LIMIT 1`
  ).get(req.user!.id) as any;
  res.json({ lesson: next ? { ...next, courseProgress: 0, recommended: true } : null });
});

/** Instructor content management. */
learnRouter.post('/courses', requireRole('coach', 'admin'), (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().min(3).max(120), level: z.enum(['beginner', 'intermediate', 'advanced']),
    summary: z.string().min(10).max(300), description: z.string().min(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const courseId = id('crs_');
  db.prepare('INSERT INTO courses (id, slug, title, level, summary, description, author_id) VALUES (?,?,?,?,?,?,?)')
    .run(courseId, slugify(parsed.data.title) + '-' + short(), parsed.data.title, parsed.data.level,
      parsed.data.summary, parsed.data.description, req.user!.id);
  res.status(201).json({ ok: true, courseId });
});

learnRouter.post('/lessons', requireRole('coach', 'admin'), (req: AuthedRequest, res) => {
  const schema = z.object({
    courseId: z.string().min(1), title: z.string().min(3).max(140), body: z.string().min(10),
    fen: z.string().optional(), minutes: z.number().int().min(1).max(120).optional(),
    order: z.number().int().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const course = db.prepare('SELECT id FROM courses WHERE id = ?').get(parsed.data.courseId);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lessonId = id('lsn_');
  db.prepare('INSERT INTO lessons (id, course_id, slug, order_index, title, body, fen, minutes) VALUES (?,?,?,?,?,?,?,?)')
    .run(lessonId, parsed.data.courseId, slugify(parsed.data.title) + '-' + short(), parsed.data.order ?? 99,
      parsed.data.title, parsed.data.body, parsed.data.fen ?? null, parsed.data.minutes ?? 6);
  res.status(201).json({ ok: true, lessonId });
});

function short() { return Math.random().toString(36).slice(2, 7); }
