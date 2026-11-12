import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react';
import { api, ApiError, timeAgo } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, Empty, Loading, Tabs } from '../components/ui';

export function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { const res = await api.get<{ notifications: any[] }>('/notifications'); setItems(res.notifications); }
    catch { setItems([]); }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const markAll = async () => {
    try { await api.post('/notifications/read-all'); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not mark notifications as read.'); }
  };

  const markOne = async (id: string) => {
    try { await api.post(`/notifications/${id}/read`); setItems(prev => prev?.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n) ?? null); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not update.'); }
  };

  const remove = async (id: string) => {
    try { await api.del(`/notifications/${id}`); setItems(prev => prev?.filter(n => n.id !== id) ?? null); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not delete.'); }
  };

  if (!user) return <div className="page"><Empty icon={<Bell size={26} />} title="Sign in to see notifications">Notifications are personal to your account.</Empty></div>;

  const unread = items?.filter(n => !n.read_at) ?? [];
  const list = (items ?? []).filter(n => tab === 'all' || !n.read_at);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Bell size={13} style={{ verticalAlign: -2 }} /> Notifications</div>
          <h1>Notifications</h1>
          <p>Game invites, friend requests, tournament starts and learning reminders. Choose which categories reach you in Settings.</p>
        </div>
        {unread.length > 0 && <Button variant="secondary" onClick={markAll} icon={<CheckCheck size={15} />}>Mark all read</Button>}
      </header>

      {error && <div className="form-error">{error}</div>}

      <Tabs value={tab} onChange={setTab} label="Notification filters" tabs={[
        { id: 'all', label: 'All', count: items?.length },
        { id: 'unread', label: 'Unread', count: unread.length },
      ]} />

      {items === null ? <Loading rows={2} /> : list.length === 0 ? (
        <Empty icon={<BellOff size={26} />} title={tab === 'unread' ? 'Nothing unread' : 'No notifications yet'}>
          Notifications appear when someone challenges you, a tournament starts or you unlock something.
        </Empty>
      ) : (
        <Card padded style={{ padding: 0 }}>
          {list.map(item => (
            <div key={item.id} className="list-row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: item.read_at ? 'none' : 'rgba(121,37,217,.06)' }}>
              <span className="pillar-icon" style={{ margin: 0, width: 32, height: 32, fontSize: 13 }}>
                <Bell size={14} />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <strong style={{ fontSize: '.9rem' }}>{item.title}</strong>
                  {!item.read_at && <Badge tone="purple">New</Badge>}
                </div>
                <div className="small muted">{item.body}</div>
                <div className="tiny muted">{item.type} · {timeAgo(item.created_at)}</div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {item.link && <Link to={item.link} onClick={() => !item.read_at && markOne(item.id)} className="btn btn-sm btn-secondary">Open</Link>}
                {!item.read_at && <Button size="sm" variant="ghost" onClick={() => markOne(item.id)}>Mark read</Button>}
                <Button size="sm" variant="ghost" onClick={() => remove(item.id)} aria-label="Delete notification"><Trash2 size={13} /></Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
