import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, CardHead } from './ui';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  fromPlayer?: boolean;
}

/**
 * Chat panel for a single game.
 *
 * Messages arrive over the game's WebSocket room (`game:message`), the same room used for moves —
 * so players and anyone watching receive them without polling. The panel also fetches the history
 * on mount, because a socket only carries messages sent while it is connected; without that,
 * reloading the page would appear to erase the conversation.
 *
 * Posting is restricted to the two players by the API. A spectator sees the panel read-only
 * instead of a composer that would fail when used.
 */
export function GameChat({
  gameId,
  lastEvent,
  readOnly = false,
  closedReason,
}: {
  gameId: string;
  /** The most recent socket event, forwarded from GameRoom's single connection. */
  lastEvent: { type: string; [key: string]: unknown } | null;
  readOnly?: boolean;
  closedReason?: string;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const seen = useRef(new Set<string>());

  // History on mount / when the game changes.
  useEffect(() => {
    let cancelled = false;
    seen.current = new Set();
    api.get<{ messages: ChatMessage[] }>(`/games/${gameId}/messages`)
      .then(d => {
        if (cancelled) return;
        for (const m of d.messages) seen.current.add(m.id);
        setMessages(d.messages);
      })
      .catch(() => { /* a missing history is not worth an error banner over the board */ });
    return () => { cancelled = true; };
  }, [gameId]);

  // Append live messages. `seen` guards against duplicates from a reconnect replaying a frame.
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'game:message') return;
    const incoming = lastEvent.message as ChatMessage | undefined;
    if (!incoming?.id) return;
    if (seen.current.has(incoming.id)) return;
    seen.current.add(incoming.id);
    setMessages(prev => [...prev, incoming]);
  }, [lastEvent]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    // Clear immediately so a double-tap cannot send twice; restored on failure.
    setDraft('');
    try {
      const res = await api.post<{ message: ChatMessage }>(`/games/${gameId}/messages`, { body });
      if (!seen.current.has(res.message.id)) {
        seen.current.add(res.message.id);
        setMessages(prev => [...prev, res.message]);
      }
    } catch (err) {
      setDraft(body);
      setError(err instanceof ApiError ? err.message : 'Could not send that message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card padded>
      <CardHead
        title="Table chat"
        action={<MessageSquare size={15} style={{ color: 'var(--lavender)' }} />}
        subtitle={closedReason}
      />
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        style={{
          maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6,
          marginBottom: 8, paddingRight: 2,
        }}
      >
        {messages.length === 0 ? (
          <p className="tiny muted" style={{ margin: 0 }}>
            {readOnly ? 'No messages in this game.' : 'Say hello — only the two players can post here.'}
          </p>
        ) : messages.map(m => {
          const mine = m.userId === user?.id;
          return (
            <div key={m.id} style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
              background: mine ? 'var(--violet)' : '#16161d',
              color: mine ? '#fff' : 'inherit',
              border: mine ? 'none' : '1px solid var(--border)',
              borderRadius: 10, padding: '6px 9px',
            }}>
              <div className="tiny" style={{ opacity: .75, marginBottom: 1 }}>
                {mine ? 'You' : m.username}
                {m.fromPlayer === false && ' (spectator)'}
              </div>
              <div style={{ fontSize: '.86rem', wordBreak: 'break-word' }}>{m.body}</div>
            </div>
          );
        })}
      </div>

      {error && <p className="tiny" style={{ color: 'var(--danger, #ef4444)', marginBottom: 6 }} role="alert">{error}</p>}

      {readOnly ? (
        <p className="tiny muted" style={{ margin: 0 }}>{closedReason ?? 'Chat is closed.'}</p>
      ) : (
        <form
          onSubmit={e => { e.preventDefault(); void send(); }}
          className="row"
          style={{ gap: 6 }}
        >
          <input
            className="input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Message…"
            maxLength={400}
            aria-label="Chat message"
            style={{ flex: 1 }}
          />
          <Button type="submit" size="sm" loading={sending} disabled={!draft.trim()} icon={<Send size={14} />}>
            Send
          </Button>
        </form>
      )}
    </Card>
  );
}
