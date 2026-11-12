import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Search, Send } from 'lucide-react';
import { api, ApiError, timeAgo } from '../lib/api';
import { Alert, Avatar, Badge, Button, Card, Empty, Loading } from '../components/ui';

interface Thread {
  userId: string; username: string; avatarUrl: string | null; lastMessage: string; lastAt: string; unread: number;
}

export function Messages() {
  const { username } = useParams<{ username?: string }>();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [conversation, setConversation] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(() => {
    api.get<{ threads: Thread[] }>('/messages/threads').then(d => setThreads(d.threads)).catch(() => setThreads([]));
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const loadConversation = useCallback(async (name: string) => {
    setError('');
    setConversation(null);
    try {
      const res = await api.get<any>(`/messages/with/${name}`);
      setConversation(res);
      loadThreads();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not open this conversation.'); }
  }, [loadThreads]);

  useEffect(() => { if (username) loadConversation(username); else setConversation(null); }, [username, loadConversation]);

  useEffect(() => {
    if (!conversation) return;
    const timer = setInterval(() => { api.get<any>(`/messages/with/${conversation.with.username}`).then(setConversation).catch(() => {}); }, 8000);
    return () => clearInterval(timer);
  }, [conversation?.with.username]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [conversation?.messages.length]);

  const send = async () => {
    if (!draft.trim() || !conversation) return;
    setSending(true);
    setError('');
    try {
      await api.post('/messages/send', { toUsername: conversation.with.username, body: draft.trim() });
      setDraft('');
      await loadConversation(conversation.with.username);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Message not sent.'); }
    finally { setSending(false); }
  };

  const filtered = threads?.filter(t => t.username.toLowerCase().includes(query.trim().toLowerCase())) ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><MessageSquare size={13} style={{ verticalAlign: -2 }} /> Messages</div>
          <h1>Messages</h1>
          <p>Direct messages with your friends. Players who only accept messages from friends are protected by their settings.</p>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card padded style={{ padding: 12 }}>
          <div className="search-box" style={{ maxWidth: 'none', marginBottom: 10 }}>
            <Search size={15} />
            <input className="input" placeholder="Search conversations" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search conversations" />
          </div>
          {threads === null ? <Loading rows={2} /> : filtered.length === 0 ? (
            <p className="small muted">{threads.length === 0 ? 'No conversations yet. Open a friend’s profile and send a message.' : 'No matches.'}</p>
          ) : (
            <div className="stack" style={{ gap: 2 }}>
              {filtered.map(thread => (
                <button key={thread.userId} type="button" onClick={() => navigate(`/messages/${thread.username}`)}
                  className="list-row"
                  style={{
                    width: '100%', background: conversation?.with.id === thread.userId ? 'rgba(121,37,217,.14)' : 'none',
                    border: 'none', borderBottom: '1px solid #26262f', cursor: 'pointer', color: 'inherit', textAlign: 'left', padding: '9px 8px',
                    borderRadius: 8,
                  }}>
                  <Avatar name={thread.username} src={thread.avatarUrl} size="sm" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row-between"><strong style={{ fontSize: '.86rem' }}>{thread.username}</strong><span className="tiny muted">{timeAgo(thread.lastAt)}</span></div>
                    <div className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.lastMessage}</div>
                  </div>
                  {thread.unread > 0 && <span className="badge badge-purple">{thread.unread}</span>}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card padded style={{ minHeight: 420, display: 'flex', flexDirection: 'column' }}>
          {error && <Alert tone="error">{error}</Alert>}
          {!username ? (
            <Empty icon={<MessageSquare size={26} />} title="Select a conversation">
              Choose a thread on the left, or start one from a player's profile.
            </Empty>
          ) : !conversation ? <Loading rows={2} /> : (
            <>
              <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12 }}>
                <div className="row" style={{ gap: 10 }}>
                  <Avatar name={conversation.with.username} src={conversation.with.avatarUrl} size="sm" online={conversation.with.online} />
                  <div>
                    <strong>{conversation.with.username}</strong>
                    <div className="tiny muted">{conversation.with.online ? 'Online' : 'Offline'}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Badge tone="muted">Private</Badge>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/players/${conversation.with.username}`)}>Profile</Button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conversation.messages.length === 0 && <p className="small muted">No messages yet — say hello.</p>}
                {conversation.messages.map((message: any) => (
                  <div key={message.id} style={{ alignSelf: message.mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                    <div style={{
                      padding: '8px 12px', borderRadius: 14, fontSize: '.88rem', lineHeight: 1.45,
                      background: message.mine ? 'linear-gradient(135deg, #7925D9, #9333EA)' : '#22222b',
                      color: message.mine ? '#fff' : '#e6e6ee',
                      borderBottomRightRadius: message.mine ? 4 : 14, borderBottomLeftRadius: message.mine ? 14 : 4,
                    }}>{message.body}</div>
                    <div className="tiny muted" style={{ textAlign: message.mine ? 'right' : 'left', marginTop: 2 }}>{timeAgo(message.createdAt)}</div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="row mt-2" style={{ gap: 8 }}>
                <input className="input" placeholder={`Message ${conversation.with.username}…`} value={draft}
                  onChange={e => setDraft(e.target.value)} maxLength={2000}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  aria-label="Message text" />
                <Button onClick={send} loading={sending} disabled={!draft.trim()} icon={<Send size={15} />}>Send</Button>
              </div>
              <p className="tiny muted" style={{ margin: '6px 0 0' }}>Messages are private between you and {conversation.with.username}. Report abuse from their profile.</p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
