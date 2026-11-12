import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { requireAuth, type AuthedRequest } from '../lib/auth.js';
import { divisionFor } from '../lib/ratings.js';
import { hub } from '../services/hub.js';
import { id } from '../lib/ids.js';
import { createGame, gamePayload } from '../services/games.js';
import { notify } from '../lib/service.js';

export const friendsRouter = Router();
export const messagesRouter = Router();
export const challengesRouter = Router();

function friendIds(uid: string): string[] {
  return (db.prepare(
    `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS fid FROM friendships
      WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'`
  ).all(uid, uid, uid) as { fid: string }[]).map(r => r.fid);
}

export function areFriends(a: string, b: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`
  ).get(a, b, b, a);
  return Boolean(row);
}

friendsRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const rows = db.prepare(
    `SELECT f.id, f.status, f.requester_id, f.created_at, u.id AS user_id, u.username, u.country, u.avatar_url, u.last_seen_at,
       (SELECT rating FROM ratings WHERE user_id = u.id AND category = 'blitz') AS blitz
     FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
     WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status IN ('accepted','pending')
     ORDER BY f.created_at DESC`
  ).all(uid, uid, uid) as any[];
  const shape = (r: any) => ({
    id: r.user_id, username: r.username, country: r.country, avatarUrl: r.avatar_url,
    rating: Math.round(r.blitz ?? 1200), online: hub.isOnline(r.user_id), division: divisionFor(r.blitz ?? 1200).name,
  });
  res.json({
    friends: rows.filter(r => r.status === 'accepted').map(shape),
    incoming: rows.filter(r => r.status === 'pending' && r.requester_id !== uid).map(r => ({ requestId: r.id, ...shape(r) })),
    outgoing: rows.filter(r => r.status === 'pending' && r.requester_id === uid).map(r => ({ requestId: r.id, ...shape(r) })),
  });
});

friendsRouter.post('/request', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ username: z.string().trim().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a username' });
  const target = db.prepare('SELECT * FROM users WHERE username_lower = ? AND status = ?')
    .get(parsed.data.username.toLowerCase(), 'active') as any;
  if (!target) return res.status(404).json({ error: 'No player with that username' });
  if (target.id === req.user!.id) return res.status(400).json({ error: 'You cannot add yourself' });
  if (!target.allow_friend_requests) return res.status(403).json({ error: 'This player is not accepting friend requests' });
  if (areFriends(req.user!.id, target.id)) return res.status(409).json({ error: 'You are already friends' });
  const existing = db.prepare(
    `SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
  ).get(req.user!.id, target.id, target.id, req.user!.id) as any;
  if (existing?.status === 'blocked') return res.status(403).json({ error: 'This player cannot be contacted' });
  if (existing) {
    if (existing.addressee_id === req.user!.id) {
      db.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?").run(nowIso(), existing.id);
      return res.json({ ok: true, accepted: true });
    }
    return res.status(409).json({ error: 'A request is already pending' });
  }
  db.prepare('INSERT INTO friendships (requester_id, addressee_id) VALUES (?,?)').run(req.user!.id, target.id);
  notify(target.id, 'friend_request', 'New friend request', `${req.user!.username} wants to be friends.`, '/friends');
  hub.toUser(target.id, 'friend:request', { from: req.user!.username });
  res.status(201).json({ ok: true });
});

friendsRouter.post('/:id/accept', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM friendships WHERE id = ? AND addressee_id = ?').get(Number(req.params.id), req.user!.id) as any;
  if (!row) return res.status(404).json({ error: 'Request not found' });
  db.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  notify(row.requester_id, 'friend_request', 'Friend request accepted', `${req.user!.username} accepted your request.`, '/friends');
  hub.toUser(row.requester_id, 'friend:accepted', { username: req.user!.username });
  res.json({ ok: true });
});

friendsRouter.post('/:id/decline', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT * FROM friendships WHERE id = ? AND addressee_id = ?').get(Number(req.params.id), req.user!.id) as any;
  if (!row) return res.status(404).json({ error: 'Request not found' });
  db.prepare("UPDATE friendships SET status = 'declined', updated_at = ? WHERE id = ?").run(nowIso(), row.id);
  res.json({ ok: true });
});

friendsRouter.delete('/:username', requireAuth, (req: AuthedRequest, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(req.params.username.toLowerCase()) as any;
  if (!target) return res.status(404).json({ error: 'Player not found' });
  db.prepare(
    `DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
  ).run(req.user!.id, target.id, target.id, req.user!.id);
  res.json({ ok: true });
});

friendsRouter.post('/:username/block', requireAuth, (req: AuthedRequest, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(req.params.username.toLowerCase()) as any;
  if (!target) return res.status(404).json({ error: 'Player not found' });
  const existing = db.prepare(
    `SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
  ).get(req.user!.id, target.id, target.id, req.user!.id) as any;
  if (existing) db.prepare("UPDATE friendships SET status = 'blocked', requester_id = ?, addressee_id = ? WHERE id = ?")
    .run(req.user!.id, target.id, existing.id);
  else db.prepare("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?,?, 'blocked')").run(req.user!.id, target.id);
  res.json({ ok: true });
});

friendsRouter.get('/activity', requireAuth, (req: AuthedRequest, res) => {
  const ids = friendIds(req.user!.id);
  if (ids.length === 0) return res.json({ activity: [] });
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT a.*, u.username, u.avatar_url FROM activity a JOIN users u ON u.id = a.user_id
      WHERE a.user_id IN (${placeholders}) AND a.type != 'security' ORDER BY a.created_at DESC LIMIT 20`
  ).all(...ids) as any[];
  res.json({ activity: rows });
});

// ---------------- Messaging ----------------
messagesRouter.get('/threads', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const rows = db.prepare(
    `SELECT m.*, u.username, u.avatar_url FROM messages m
       JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END
      WHERE m.sender_id = ? OR m.recipient_id = ?
      ORDER BY m.created_at DESC`
  ).all(uid, uid, uid) as any[];
  const threads = new Map<string, any>();
  for (const m of rows) {
    const otherId = m.sender_id === uid ? m.recipient_id : m.sender_id;
    if (!threads.has(otherId)) {
      threads.set(otherId, {
        userId: otherId, username: m.username, avatarUrl: m.avatar_url,
        lastMessage: m.body, lastAt: m.created_at,
        unread: rows.filter(x => x.sender_id === otherId && !x.read_at).length,
      });
    }
  }
  res.json({ threads: [...threads.values()] });
});

messagesRouter.get('/with/:username', requireAuth, (req: AuthedRequest, res) => {
  const other = db.prepare('SELECT * FROM users WHERE username_lower = ?').get(req.params.username.toLowerCase()) as any;
  if (!other) return res.status(404).json({ error: 'Player not found' });
  if (!other.allow_messages && !areFriends(req.user!.id, other.id)) return res.status(403).json({ error: 'This player only accepts messages from friends' });
  const rows = db.prepare(
    `SELECT * FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY created_at ASC LIMIT 200`
  ).all(req.user!.id, other.id, other.id, req.user!.id) as any[];
  db.prepare('UPDATE messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL')
    .run(nowIso(), req.user!.id, other.id);
  res.json({
    with: { id: other.id, username: other.username, avatarUrl: other.avatar_url, online: hub.isOnline(other.id) },
    messages: rows.map(m => ({ id: m.id, mine: m.sender_id === req.user!.id, body: m.body, createdAt: m.created_at })),
  });
});

messagesRouter.post('/send', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ toUsername: z.string().min(2), body: z.string().trim().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a message of up to 2000 characters' });
  const other = db.prepare('SELECT * FROM users WHERE username_lower = ? AND status = ?').get(parsed.data.toUsername.toLowerCase(), 'active') as any;
  if (!other) return res.status(404).json({ error: 'Player not found' });
  if (other.id === req.user!.id) return res.status(400).json({ error: 'You cannot message yourself' });
  const blocked = db.prepare(
    `SELECT 1 FROM friendships WHERE status = 'blocked' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`
  ).get(other.id, req.user!.id, req.user!.id, other.id);
  if (blocked) return res.status(403).json({ error: 'You cannot message this player' });
  if (!other.allow_messages && !areFriends(req.user!.id, other.id)) {
    return res.status(403).json({ error: 'This player only accepts messages from friends' });
  }
  const messageId = id('msg_');
  db.prepare('INSERT INTO messages (id, sender_id, recipient_id, body) VALUES (?,?,?,?)')
    .run(messageId, req.user!.id, other.id, parsed.data.body);
  hub.toUser(other.id, 'message:new', { from: req.user!.username, body: parsed.data.body });
  notify(other.id, 'message', `New message from ${req.user!.username}`, parsed.data.body.slice(0, 80), '/messages');
  res.status(201).json({ ok: true, messageId });
});

// ---------------- Challenges ----------------
challengesRouter.get('/', requireAuth, (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const rows = db.prepare(
    `SELECT c.*, f.username AS from_name, t.username AS to_name FROM challenges c
      JOIN users f ON f.id = c.from_id JOIN users t ON t.id = c.to_id
      WHERE (c.from_id = ? OR c.to_id = ?) AND c.status = 'pending' ORDER BY c.created_at DESC`
  ).all(uid, uid) as any[];
  res.json({
    incoming: rows.filter(r => r.to_id === uid).map(r => ({ id: r.id, from: r.from_name, category: r.category, seconds: r.initial_seconds, increment: r.increment, rated: Boolean(r.rated) })),
    outgoing: rows.filter(r => r.from_id === uid).map(r => ({ id: r.id, to: r.to_name, category: r.category })),
  });
});

challengesRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    username: z.string().min(2),
    category: z.enum(['bullet', 'blitz', 'rapid', 'classical']).default('rapid'),
    seconds: z.number().int().min(30).max(3600).default(600),
    increment: z.number().int().min(0).max(60).default(5),
    rated: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const target = db.prepare('SELECT * FROM users WHERE username_lower = ? AND status = ?')
    .get(parsed.data.username.toLowerCase(), 'active') as any;
  if (!target) return res.status(404).json({ error: 'Player not found' });
  if (target.id === req.user!.id) return res.status(400).json({ error: 'You cannot challenge yourself' });
  const challengeId = id('chl_');
  db.prepare('INSERT INTO challenges (id, from_id, to_id, category, initial_seconds, increment, rated) VALUES (?,?,?,?,?,?,?)')
    .run(challengeId, req.user!.id, target.id, parsed.data.category, parsed.data.seconds, parsed.data.increment, parsed.data.rated ? 1 : 0);
  hub.toUser(target.id, 'challenge:received', { challengeId, from: req.user!.username, category: parsed.data.category });
  notify(target.id, 'challenge', `Challenge from ${req.user!.username}`, `${parsed.data.category} · rated: ${parsed.data.rated ? 'yes' : 'no'}`, '/play');
  res.status(201).json({ ok: true, challengeId });
});

challengesRouter.post('/:id/accept', requireAuth, (req: AuthedRequest, res) => {
  const challenge = db.prepare("SELECT * FROM challenges WHERE id = ? AND to_id = ? AND status = 'pending'")
    .get(req.params.id, req.user!.id) as any;
  if (!challenge) return res.status(404).json({ error: 'Challenge not found or already handled' });
  const game = createGame({
    whiteId: challenge.from_id, blackId: challenge.to_id, mode: 'online',
    seconds: challenge.initial_seconds, increment: challenge.increment, rated: Boolean(challenge.rated),
    category: challenge.category,
  });
  db.prepare("UPDATE challenges SET status = 'accepted', game_id = ? WHERE id = ?").run(game.id, challenge.id);
  hub.toUser(challenge.from_id, 'challenge:accepted', { game: gamePayload(game) });
  res.json({ ok: true, game: gamePayload(game) });
});

challengesRouter.post('/:id/decline', requireAuth, (req: AuthedRequest, res) => {
  const result = db.prepare("UPDATE challenges SET status = 'declined' WHERE id = ? AND to_id = ? AND status = 'pending'")
    .run(req.params.id, req.user!.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Challenge not found' });
  res.json({ ok: true });
});
