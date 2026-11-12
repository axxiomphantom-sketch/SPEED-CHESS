import type { WebSocket } from 'ws';

/** In-memory realtime hub: user sockets, game subscriptions and spectators. */
class Hub {
  private users = new Map<string, Set<WebSocket>>();
  private games = new Map<string, Set<WebSocket>>();

  register(userId: string, socket: WebSocket) {
    if (!this.users.has(userId)) this.users.set(userId, new Set());
    this.users.get(userId)!.add(socket);
  }

  unregister(userId: string, socket: WebSocket) {
    this.users.get(userId)?.delete(socket);
    for (const [gameId, set] of this.games) {
      set.delete(socket);
      if (set.size === 0) this.games.delete(gameId);
    }
  }

  joinGame(gameId: string, socket: WebSocket) {
    if (!this.games.has(gameId)) this.games.set(gameId, new Set());
    this.games.get(gameId)!.add(socket);
  }

  leaveGame(gameId: string, socket: WebSocket) {
    this.games.get(gameId)?.delete(socket);
  }

  send(socket: WebSocket, type: string, payload: unknown) {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type, ...(payload as object) }));
  }

  toUser(userId: string, type: string, payload: unknown) {
    for (const socket of this.users.get(userId) ?? []) this.send(socket, type, payload);
  }

  toGame(gameId: string, type: string, payload: unknown) {
    for (const socket of this.games.get(gameId) ?? []) this.send(socket, type, payload);
  }

  broadcastToAll(type: string, payload: unknown) {
    for (const set of this.users.values()) for (const socket of set) this.send(socket, type, payload);
  }

  onlineUsers(): string[] {
    return [...this.users.entries()].filter(([, set]) => set.size > 0).map(([userId]) => userId);
  }

  isOnline(userId: string): boolean {
    return (this.users.get(userId)?.size ?? 0) > 0;
  }
}

export const hub = new Hub();
