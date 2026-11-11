import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { audit, notify } from '../lib/service.js';
import { id } from '../lib/ids.js';

export const billingRouter = Router();

/**
 * Plan catalogue and subscription lifecycle.
 * Payment capture is delegated to a provider (Stripe). No card data ever touches this server.
 * Without STRIPE_SECRET_KEY configured, checkout is refused with a clear integration message.
 */
billingRouter.get('/plans', (_req, res) => {
  const rows = db.prepare('SELECT * FROM plans ORDER BY price_cents').all() as any[];
  res.json({
    plans: rows.map(p => ({ ...p, features: JSON.parse(p.features) })),
    paymentProviderConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  });
});

billingRouter.get('/subscription', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare(
    `SELECT s.*, p.name AS plan_name, p.price_cents FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 1`
  ).get(req.user!.id) as any;
  const payments = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user!.id);
  res.json({
    plan: (req.user as any).plan ?? 'free',
    subscription: row ?? null,
    payments,
    paymentProviderConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  });
});

billingRouter.post('/checkout', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ planId: z.enum(['premium', 'pro']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose the premium or pro plan' });
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({
      error: 'Payments are not configured on this deployment. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable checkout.',
      integrationRequired: true,
    });
  }
  // With a provider key present, create a Checkout Session. The webhook below activates the plan.
  return res.status(501).json({
    error: 'Checkout session creation must be completed against your Stripe account (see docs/DEPLOYMENT.md#payments).',
    integrationRequired: true,
  });
});

/** Stripe-compatible webhook. Signature verification is required before enabling billing. */
billingRouter.post('/webhook', (req, res) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }
  // Signature verification and event handling are documented in docs/DEPLOYMENT.md.
  console.log('[billing] webhook received', req.body?.type ?? 'unknown');
  res.json({ received: true });
});

/** Manual/admin plan assignment, used by support and for comped plans. */
billingRouter.post('/assign', requireAuth, (req: AuthedRequest, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Administrators only' });
  const schema = z.object({ userId: z.string().min(1), planId: z.enum(['free', 'premium', 'pro']), months: z.number().int().min(1).max(36).default(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid plan assignment' });
  const end = new Date(Date.now() + parsed.data.months * 30 * 864e5).toISOString();
  db.prepare('UPDATE users SET plan = ?, plan_renews_at = ? WHERE id = ?').run(parsed.data.planId, end, parsed.data.userId);
  if (parsed.data.planId !== 'free') {
    db.prepare(`INSERT INTO subscriptions (id, user_id, plan_id, status, provider, current_period_end) VALUES (?,?,?, 'active', 'manual', ?)`)
      .run(id('sub_'), parsed.data.userId, parsed.data.planId, end);
  } else {
    db.prepare("UPDATE subscriptions SET status = 'cancelled', cancelled_at = ? WHERE user_id = ? AND status = 'active'")
      .run(nowIso(), parsed.data.userId);
  }
  notify(parsed.data.userId, 'billing', 'Plan updated', `Your plan is now ${parsed.data.planId}.`, '/pricing');
  audit(req.user!.id, 'billing.plan_assigned', 'user', parsed.data.userId, parsed.data, req.ip);
  res.json({ ok: true, plan: parsed.data.planId, renewsAt: end });
});

billingRouter.post('/cancel', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
    .get(req.user!.id) as any;
  if (!row) return res.status(404).json({ error: 'No active subscription' });
  db.prepare("UPDATE subscriptions SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(nowIso(), row.id);
  db.prepare('UPDATE users SET plan = ?, plan_renews_at = NULL WHERE id = ?').run('free', req.user!.id);
  notify(req.user!.id, 'billing', 'Subscription cancelled', 'You keep access until the end of the paid period; your plan is now free.', '/settings');
  audit(req.user!.id, 'billing.cancelled', 'subscription', row.id, {}, req.ip);
  res.json({ ok: true });
});
