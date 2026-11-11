import { useEffect, useRef } from 'react';

export type SocketMessage = { type: string; [key: string]: any };

/** Subscribes to the realtime gateway at /ws (same origin, proxied in development). */
export function useGameSocket(onMessage: (msg: SocketMessage) => void, gameId?: string, enabled = true) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: number | undefined;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket.onopen = () => {
        retry = 0;
        if (gameId) socket?.send(JSON.stringify({ type: 'game:watch', gameId }));
      };
      socket.onmessage = event => {
        try { handlerRef.current(JSON.parse(event.data)); } catch { /* ignore malformed frames */ }
      };
      socket.onclose = () => {
        if (closed) return;
        retry += 1;
        const delay = Math.min(8000, 500 * 2 ** Math.min(retry, 4));
        timer = window.setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      socket?.close();
    };
  }, [gameId, enabled]);
}
