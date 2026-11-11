import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config, WEB_DIST, UPLOAD_DIR } from './config.js';
import { db, migrate } from './db/index.js';
import { attachUser, requireAuth, type AuthedRequest } from './lib/auth.js';
import { authRouter } from './routes/auth.js';
import { supabaseAuthRouter } from './routes/supabaseAuth.js';
import { gamesRouter, playRouter } from './routes/games.js';
import { matchmakingRouter } from './routes/play.js';
import { learnRouter } from './routes/learn.js';
import { puzzlesRouter } from './routes/puzzles.js';
import { openingsRouter } from './routes/openings.js';
import { tournamentsRouter } from './routes/tournaments.js';
import { leaderboardsRouter } from './routes/leaderboards.js';
import { historyRouter } from './routes/history.js';
import { meRouter, playersRouter } from './routes/players.js';
import { challengesRouter, friendsRouter, messagesRouter } from './routes/social.js';
import { clubsRouter } from './routes/clubs.js';
import { coachRouter, coachingRouter } from './routes/coach.js';
import { contentRouter } from './routes/content.js';
import { achievementsRouter, notificationsRouter } from './routes/achievements.js';
import { billingRouter } from './routes/billing.js';
import { adminRouter } from './routes/admin.js';
import { metaRouter, reportsRouter, supportRouter } from './routes/misc.js';
import { attachRealtime } from './realtime/ws.js';
import { sweepTimeouts } from './services/games.js';

migrate();
// First-run convenience: reference content (courses, puzzles, openings, plans, achievements) is
// idempotent, so a fresh database is immediately usable. Demo accounts stay behind `npm run seed`.
try {
  const { seedReferenceContent } = await import('./db/reference.js');
  seedReferenceContent();
} catch (err) {
  console.error('[seed] reference content not applied:', err);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: config.isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      // The app embeds itself in preview frames; deny framing of arbitrary third parties instead.
      frameAncestors: ["'self'", 'https:'],
    },
  } : {
    directives: { frameAncestors: ["'self'", 'https:'], objectSrc: ["'none'"] },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Framing is governed by the CSP frame-ancestors directive below (the app is embedded in
  // preview frames during development, and X-Frame-Options: SAMEORIGIN would break that).
  xFrameOptions: false,
}));
app.use(cors({ origin: config.isProd ? true : [config.appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });
const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Slow down for a moment.' } });
const writeLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });

app.use('/api/auth', authLimiter, authRouter);
// Supabase session sync/link: same limiter, mounted before the generic /api limiter.
app.use('/api/auth/supabase', authLimiter, supabaseAuthRouter);
app.use('/api', apiLimiter);

app.get('/api/meta', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api/meta', metaRouter);
app.use('/api/play', writeLimiter, playRouter);
app.use('/api/matchmaking', matchmakingRouter);
app.use('/api/games', gamesRouter);
app.use('/api/learn', learnRouter);
app.use('/api/puzzles', puzzlesRouter);
app.use('/api/openings', openingsRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/leaderboards', leaderboardsRouter);
app.use('/api/history', historyRouter);
app.use('/api/me', meRouter);
app.use('/api/players', playersRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/clubs', clubsRouter);
app.use('/api/coach', coachRouter);
app.use('/api/coaching', coachingRouter);
app.use('/api/content', contentRouter);
app.use('/api/achievements', achievementsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/support', supportRouter);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: true }));

app.get('/api/meta/status', (req, res) => {
  res.json({ ok: true, signedIn: Boolean((req as AuthedRequest).user) });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// Serve the built client in production.
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: config.isProd ? 'Something went wrong on our side.' : err.message });
});

const server = http.createServer(app);
attachRealtime(server);

const timeoutSweep = setInterval(() => {
  try { sweepTimeouts(); } catch (err) { console.error('[timeouts]', err); }
}, 5000);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] SPEED CHESS API listening on http://0.0.0.0:${config.port} (${config.nodeEnv})`);
  const counts = {
    users: (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n,
    lessons: (db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as { n: number }).n,
    puzzles: (db.prepare('SELECT COUNT(*) AS n FROM puzzles').get() as { n: number }).n,
  };
  console.log('[server] data:', counts);
});

function shutdown() {
  clearInterval(timeoutSweep);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server };
