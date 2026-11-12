import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { db } from '../db/index.js';
import { COOKIE_NAME, resolveSession } from '../lib/auth.js';
import { hub } from '../services/hub.js';

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

/** Mounts the realtime gateway on the HTTP server at /ws. */
export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const intervals = new Map<WebSocket, NodeJS.Timeout>();

  wss.on('connection', (socket: WebSocket, req) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = resolveSession(cookies[COOKIE_NAME]);
    if (!session) {
      socket.send(JSON.stringify({ type: 'auth:required' }));
      socket.close();
      return;
    }
    const userId = session.id;
    hub.register(userId, socket);
    db.prepare('UPDATE users SET last_seen_at = datetime(\'now\') WHERE id = ?').run(userId);
    socket.send(JSON.stringify({ type: 'ready', userId, online: hub.onlineUsers() }));

    socket.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      switch (msg.type) {
        case 'game:watch':
          if (typeof msg.gameId === 'string') hub.joinGame(msg.gameId, socket);
          break;
        case 'game:unwatch':
          if (typeof msg.gameId === 'string') hub.leaveGame(msg.gameId, socket);
          break;
        case 'ping':
          hub.send(socket, 'pong', { at: Date.now() });
          break;
        default:
          break;
      }
    });

    socket.on('close', () => {
      hub.unregister(userId, socket);
      const timer = intervals.get(socket);
      if (timer) clearInterval(timer);
      db.prepare('UPDATE users SET last_seen_at = datetime(\'now\') WHERE id = ?').run(userId);
    });
  });

  // Presence heartbeat so friend lists reflect real online state.
  const heartbeat = setInterval(() => {
    hub.broadcastToAll('presence', { online: hub.onlineUsers() });
  }, 30_000);
  server.on('close', () => clearInterval(heartbeat));

  return wss;
}
