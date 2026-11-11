import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Crown, Megaphone, Trophy, UserMinus, UserPlus } from 'lucide-react';
import { api, ApiError, formatDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Avatar, Badge, Button, Card, CardHead, Empty, Field, Loading, Modal, Tabs } from '../components/ui';

export function ClubDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'overview' | 'members' | 'events'>('overview');
  const [posting, setPosting] = useState(false);
  const [announcement, setAnnouncement] = useState({ title: '', body: '' });

  const load = useCallback(async () => {
    try { const res = await api.get<any>(`/clubs/${slug}`); setData(res); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Club not found.'); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const join = async () => {
    try {
      const res = await api.post<{ status: string }>(`/clubs/${slug}/join`);
      setNotice(res.status === 'pending' ? 'Request sent — a club manager must approve it.' : 'You joined the club.');
      load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not join.'); }
  };

  const leave = async () => {
    try { await api.post(`/clubs/${slug}/leave`); setNotice('You left the club.'); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not leave.'); }
  };

  const manage = async (userId: string, action: string) => {
    try { await api.post(`/clubs/${slug}/members/${userId}`, { action }); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Action failed.'); }
  };

  const post = async () => {
    try {
      await api.post(`/clubs/${slug}/announcements`, announcement);
      setPosting(false);
      setAnnouncement({ title: '', body: '' });
      load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not post the announcement.'); }
  };

  if (error && !data) return <div className="page"><Alert tone="error">{error}</Alert><Link to="/clubs" className="btn btn-secondary mt-2">All clubs</Link></div>;
  if (!data) return <div className="page"><Loading rows={3} /></div>;

  const club = data.club;
  const membership = data.membership;

  return (
    <div className="page">
      <div className="row-between wrap mb-2">
        <Link to="/clubs" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> All clubs</Link>
        <div className="row" style={{ gap: 8 }}>
          {club.isPrivate ? <Badge tone="warning">Private</Badge> : <Badge tone="success">Open</Badge>}
          <Badge tone="muted">{data.members.length} members</Badge>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="hero-panel mb-2" style={{ marginBottom: 18 }}>
        <div className="row-between wrap" style={{ gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(1.4rem, 2.6vw, 1.9rem)', marginBottom: 6 }}>{club.name}</h1>
            <p className="small muted" style={{ maxWidth: 640, margin: 0 }}>{club.description}</p>
            <div className="row mt-2" style={{ gap: 14 }}>
              <span className="small">{club.country ?? 'Global'}</span>
              <span className="small">Founded {formatDate(club.created_at)}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {!membership ? <Button onClick={join} icon={<UserPlus size={15} />}>Join club</Button>
              : membership.status === 'pending' ? <Badge tone="warning">Awaiting approval</Badge>
              : club.owner_id === user?.id ? <Badge tone="purple"><Crown size={12} /> You own this club</Badge>
              : <Button variant="secondary" onClick={leave} icon={<UserMinus size={15} />}>Leave club</Button>}
            {data.canManage && <Button variant="secondary" onClick={() => setPosting(true)} icon={<Megaphone size={15} />}>Announcement</Button>}
          </div>
        </div>
      </section>

      <Tabs value={tab} onChange={setTab} label="Club sections" tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'members', label: 'Members', count: data.members.length },
        { id: 'events', label: 'Events', count: data.events.length },
      ]} />

      {tab === 'overview' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Announcements" action={<Megaphone size={15} style={{ color: 'var(--lavender)' }} />} />
            {data.announcements.length === 0 ? <p className="small muted">No announcements yet.</p> : (
              <div className="stack" style={{ gap: 14 }}>
                {data.announcements.map((item: any) => (
                  <div key={item.id} style={{ borderLeft: '2px solid var(--violet)', paddingLeft: 12 }}>
                    <strong style={{ fontSize: '.9rem' }}>{item.title}</strong>
                    <p className="small" style={{ margin: '4px 0', color: '#cfcfd9' }}>{item.body}</p>
                    <div className="tiny muted">{item.author ?? 'Club'} · {formatDate(item.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHead title="Top members" />
            {data.members.slice(0, 6).map((member: any) => (
              <div key={member.id} className="list-row">
                <Avatar name={member.username} src={member.avatarUrl} size="sm" online={member.online} />
                <div className="grow">
                  <Link to={`/players/${member.username}`} style={{ fontWeight: 600, color: '#fff', fontSize: '.88rem' }}>{member.username}</Link>
                  <div className="tiny muted">{member.rating} blitz</div>
                </div>
                {member.role !== 'member' && <Badge tone="purple">{member.role}</Badge>}
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'members' && (
        <Card padded>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Member</th><th>Role</th><th>Rating</th><th>Joined</th><th /></tr></thead>
              <tbody>
                {data.members.map((member: any) => (
                  <tr key={member.id}>
                    <td>
                      <Link to={`/players/${member.username}`} className="row" style={{ gap: 8, color: 'inherit', textDecoration: 'none' }}>
                        <Avatar name={member.username} src={member.avatarUrl} size="sm" online={member.online} />
                        <span style={{ fontWeight: 600 }}>{member.username}</span>
                      </Link>
                    </td>
                    <td><Badge tone={member.role === 'owner' ? 'purple' : member.role === 'moderator' ? 'warning' : 'muted'}>{member.role}</Badge></td>
                    <td>{member.rating}</td>
                    <td className="tiny muted">{formatDate(member.joinedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {data.canManage && member.role !== 'owner' && (
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          {member.role === 'member'
                            ? <Button size="sm" variant="ghost" onClick={() => manage(member.id, 'promote')}>Promote</Button>
                            : <Button size="sm" variant="ghost" onClick={() => manage(member.id, 'demote')}>Demote</Button>}
                          <Button size="sm" variant="ghost" onClick={() => manage(member.id, 'remove')}>Remove</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'events' && (
        data.events.length === 0 ? <Empty icon={<Trophy size={24} />} title="No club events scheduled">Club managers can organise a tournament and it will appear here.</Empty> : (
          <div className="grid grid-auto">
            {data.events.map((event: any) => (
              <Card key={event.id} hover>
                <Badge tone={event.status === 'ongoing' ? 'success' : 'purple'}>{event.status}</Badge>
                <h3 style={{ margin: '8px 0 2px', fontSize: '1rem' }}>{event.name}</h3>
                <div className="tiny muted">Starts {formatDate(event.starts_at)}</div>
                <Link to={`/tournaments/${event.slug}`} className="btn btn-secondary btn-sm mt-2">View event</Link>
              </Card>
            ))}
          </div>
        )
      )}

      <Modal open={posting} onClose={() => setPosting(false)} title="Post an announcement"
        footer={<><Button variant="secondary" onClick={() => setPosting(false)}>Cancel</Button><Button onClick={post}>Publish</Button></>}>
        <Field label="Title" htmlFor="a-title"><input id="a-title" className="input" value={announcement.title} onChange={e => setAnnouncement({ ...announcement, title: e.target.value })} /></Field>
        <Field label="Message" htmlFor="a-body"><textarea id="a-body" className="textarea" value={announcement.body} onChange={e => setAnnouncement({ ...announcement, body: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}
