import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { COOKIE_NAME, cookieOptions, createSession, requireAuth, resolveSession, toPublicUser, type AuthedRequest } from '../lib/auth.js';
import { hashPassword, passwordIssues, verifyPassword } from '../lib/password.js';
import { id, sha256, token } from '../lib/ids.js';
import { audit, getUserRating, notify } from '../lib/service.js';
import { CATEGORIES, divisionFor } from '../lib/ratings.js';
import { emailConfigured, sendPasswordResetEmail, sendVerificationEmail } from '../lib/mailer.js';

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_]+$/, 'Letters, numbers and underscores only'),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(200),
  ageConfirmed: z.boolean().refine(v => v, 'You must confirm you are 13 or older, or have guardian consent'),
  country: z.string().trim().length(2).optional().or(z.literal('')),
  acceptedTerms: z.boolean().refine(v => v, 'You must accept the Terms and Privacy Policy'),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message, issues: parsed.error.issues });
  const { username, email, password, country } = parsed.data;
  const pwIssues = passwordIssues(password);
  if (pwIssues.length) return res.status(400).json({ error: pwIssues[0], issues: pwIssues.map(i => ({ message: i })) });

  const clash = db.prepare('SELECT id FROM users WHERE username_lower = ? OR email_lower = ?')
    .get(username.toLowerCase(), email.toLowerCase());
  if (clash) return res.status(409).json({ error: 'That username or email is already registered' });

  const userId = id('usr_');
  const verifyToken = token(24);
  db.prepare(
    `INSERT INTO users (id, username, username_lower, email, email_lower, password_hash, country, verification_token, email_verified)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(userId, username, username.toLowerCase(), email.toLowerCase(), email.toLowerCase(),
    await hashPassword(password), country?.toUpperCase() || null, verifyToken, config.allowEmailVerificationBypass ? 1 : 0);
  for (const c of CATEGORIES) db.prepare('INSERT INTO ratings (user_id, category) VALUES (?,?)').run(userId, c);
  notify(userId, 'system', 'Welcome to SPEED CHESS', 'Finish onboarding to personalise your dashboard.', '/onboarding');
  audit(userId, 'auth.register', 'user', userId, { username }, req.ip);

  // Email verification: delivered through SMTP when configured, otherwise logged in console mode.
  const verificationUrl = `${config.appUrl}/verify-email?token=${verifyToken}`;
  const mail = await sendVerificationEmail(email, username, verificationUrl);

  const { token: signed } = createSession(userId, req);
  res.cookie(COOKIE_NAME, signed, cookieOptions());
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  res.status(201).json({
    user: toPublicUser(row),
    // Only expose the link directly when no email provider is configured — never as a shortcut
    // that bypasses verification in a real deployment.
    verificationUrl: emailConfigured() ? undefined : verificationUrl,
    emailDelivery: mail.delivered ? 'sent' : 'console',
  });
});

authRouter.post('/login', async (req, res) => {
  const schema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' });
  const identifier = parsed.data.email.toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email_lower = ? OR username_lower = ?').get(identifier, identifier) as any;
  if (!row || row.status === 'deleted') return res.status(401).json({ error: 'Invalid email or password' });
  const ok = await verifyPassword(parsed.data.password, row.password_hash);
  if (!ok) {
    audit(row.id, 'auth.login_failed', 'user', row.id, {}, req.ip);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (row.status === 'suspended') return res.status(403).json({ error: 'This account is suspended. Contact support.' });
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.id);
  const { token: signed } = createSession(row.id, req);
  res.cookie(COOKIE_NAME, signed, cookieOptions());
  audit(row.id, 'auth.login', 'user', row.id, {}, req.ip);
  res.json({ user: toPublicUser(row) });
});

authRouter.post('/logout', (req, res) => {
  const resolved = resolveSession(req.cookies?.[COOKIE_NAME]);
  if (resolved) db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowIso(), resolved.sessionId);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', (req: AuthedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const ratings = Object.fromEntries(
    CATEGORIES.map(c => {
      const r = getUserRating(req.user!.id, c);
      return [c, { ...r, division: divisionFor(r.rating) }];
    })
  );
  const unread = (db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(req.user.id) as { n: number }).n;
  res.json({
    user: { ...toPublicUser(req.user), email: req.user.email, emailVerified: Boolean(req.user.email_verified) },
    ratings,
    unreadNotifications: unread,
  });
});

authRouter.post('/verify-email', (req, res) => {
  const schema = z.object({ token: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A verification token is required' });
  const row = db.prepare('SELECT id FROM users WHERE verification_token = ?').get(parsed.data.token) as any;
  if (!row) return res.status(400).json({ error: 'This verification link is invalid or has already been used' });
  db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE id = ?').run(nowIso(), row.id);
  audit(row.id, 'auth.email_verified', 'user', row.id);
  res.json({ ok: true });
});

authRouter.post('/resend-verification', requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.email_verified) return res.status(400).json({ error: 'Email already verified' });
  const t = token(24);
  db.prepare('UPDATE users SET verification_token = ? WHERE id = ?').run(t, req.user!.id);
  const url = `${config.appUrl}/verify-email?token=${t}`;
  const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(req.user!.id) as { email: string; username: string };
  const mail = await sendVerificationEmail(user.email, user.username, url);
  res.json({ ok: true, verificationUrl: emailConfigured() ? undefined : url, emailDelivery: mail.delivered ? 'sent' : 'console' });
});

authRouter.post('/forgot-password', async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid email is required' });
  const row = db.prepare('SELECT id FROM users WHERE email_lower = ?').get(parsed.data.email.toLowerCase()) as any;
  let resetUrl: string | undefined;
  if (row) {
    const raw = token(24);
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)')
      .run(sha256(raw), row.id, new Date(Date.now() + 3600_000).toISOString());
    resetUrl = `${config.appUrl}/reset-password?token=${raw}`;
    const target = db.prepare('SELECT email FROM users WHERE id = ?').get(row.id) as { email: string };
    await sendPasswordResetEmail(target.email, resetUrl);
    audit(row.id, 'auth.password_reset_requested', 'user', row.id, {}, req.ip);
  }
  // Always the same response so the endpoint cannot be used to enumerate accounts. The link is
  // only returned when no mail provider is configured, so a real deployment never leaks it.
  res.json({
    ok: true,
    message: emailConfigured()
      ? 'If that email is registered, a reset link has been sent. Check your inbox and spam folder.'
      : 'No email provider is configured on this deployment, so the reset link is shown here instead.',
    resetUrl: emailConfigured() ? undefined : resetUrl,
  });
});

authRouter.post('/reset-password', async (req, res) => {
  const schema = z.object({ token: z.string().min(10), password: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A token and a password of at least 8 characters are required' });
  const issues = passwordIssues(parsed.data.password);
  if (issues.length) return res.status(400).json({ error: issues[0] });
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL')
    .get(sha256(parsed.data.token)) as any;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'This reset link is invalid or expired' });
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(await hashPassword(parsed.data.password), nowIso(), row.user_id);
  db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(nowIso(), row.token_hash);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(nowIso(), row.user_id);
  notify(row.user_id, 'security', 'Password changed', 'Your password was reset. All other sessions were signed out.', '/settings');
  audit(row.user_id, 'auth.password_reset', 'user', row.user_id, {}, req.ip);
  res.json({ ok: true });
});

authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Both current and new passwords are required' });
  const issues = passwordIssues(parsed.data.newPassword);
  if (issues.length) return res.status(400).json({ error: issues[0] });
  if (!(await verifyPassword(parsed.data.currentPassword, req.user!.password_hash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(await hashPassword(parsed.data.newPassword), nowIso(), req.user!.id);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ?').run(nowIso(), req.user!.id, req.user!.sessionId);
  notify(req.user!.id, 'security', 'Password changed', 'Your password was updated successfully.', '/settings');
  audit(req.user!.id, 'auth.password_changed', 'user', req.user!.id, {}, req.ip);
  res.json({ ok: true });
});

authRouter.get('/sessions', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT id, user_agent, ip, created_at, last_used_at, expires_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_used_at DESC')
    .all(req.user!.id) as any[];
  res.json({ sessions: rows.map(r => ({ ...r, current: r.id === req.user!.sessionId })) });
});

authRouter.delete('/sessions/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND id != ?')
    .run(nowIso(), req.params.id, req.user!.id, req.user!.sessionId);
  if (result.changes === 0) return res.status(400).json({ error: 'That session cannot be revoked' });
  res.json({ ok: true });
});

authRouter.delete('/account', requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password confirmation is required' });
  if (!(await verifyPassword(parsed.data.password, req.user!.password_hash))) return res.status(401).json({ error: 'Password is incorrect' });
  db.prepare('UPDATE users SET status = ?, email = ?, email_lower = ?, updated_at = ? WHERE id = ?')
    .run('deleted', `deleted+${req.user!.id}@speedchess.invalid`, `deleted+${req.user!.id}@speedchess.invalid`, nowIso(), req.user!.id);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(nowIso(), req.user!.id);
  audit(req.user!.id, 'account.deleted', 'user', req.user!.id, {}, req.ip);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/data-export', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const payload = {
    exportedAt: nowIso(),
    account: db.prepare('SELECT id, username, email, country, bio, title, plan, created_at FROM users WHERE id = ?').get(uid),
    ratings: db.prepare('SELECT category, rating, rd, games, peak FROM ratings WHERE user_id = ?').all(uid),
    games: db.prepare('SELECT id, white_name, black_name, result, termination, pgn, started_at, category FROM games WHERE white_id = ? OR black_id = ? ORDER BY started_at DESC LIMIT 500').all(uid, uid),
    achievements: db.prepare('SELECT achievement_id, progress, unlocked_at FROM user_achievements WHERE user_id = ?').all(uid),
    lessonProgress: db.prepare('SELECT * FROM lesson_progress WHERE user_id = ?').all(uid),
    notifications: db.prepare('SELECT type, title, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(uid),
  };
  res.setHeader('Content-Disposition', `attachment; filename="speed-chess-export-${uid}.json"`);
  res.json(payload);
});
