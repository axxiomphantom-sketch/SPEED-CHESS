import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, MessageSquare, Search, Swords, UserPlus, Users, X } from 'lucide-react';
import { api, ApiError, timeAgo } from '../lib/api';
import { Alert, Avatar, Badge, Button, Card, CardHead, Empty, Loading, Tabs } from '../components/ui';

export function Friends() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'friends' | 'requests' | 'search' | 'challenges' | 'activity'>('friends');
  const [data, setData] = useState<{ friends: any[]; incoming: any[]; outgoing: any[] } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<{ incoming: any[]; outgoing: any[] }>({ incoming: [], outgoing: [] });
  const [activity, setActivity] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [friends, challengeData, activityData] = await Promise.all([
        api.get<typeof data>('/friends'),
        api.get<typeof challenges>('/challenges'),
        api.get<{ activity: any[] }>('/friends/activity'),
      ]);
      setData(friends);
      setChallenges(challengeData);
      setActivity(activityData.activity);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load friends.'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(() => {
      api.get<{ players: any[] }>(`/players?q=${encodeURIComponent(query.trim())}`).then(d => setResults(d.players)).catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const request = async (username: string) => {
    setError(''); setNotice('');
    try {
      await api.post('/friends/request', { username });
      setNotice(`Friend request sent to ${username}.`);
      load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not send the request.'); }
  };

  const respond = async (requestId: number, accept: boolean) => {
    try {
      await api.post(`/friends/${requestId}/${accept ? 'accept' : 'decline'}`);
      load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not update the request.'); }
  };

  const respondChallenge = async (id: string, accept: boolean) => {
    try {
      const res = await api.post<{ game?: any }>(`/challenges/${id}/${accept ? 'accept' : 'decline'}`);
      if (accept && res.game) navigate(`/play/game/${res.game.id}`);
      else load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not respond to the challenge.'); }
  };

  const block = async (username: string) => {
    try { await api.post(`/friends/${username}/block`); setNotice(`You blocked ${username}.`); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not block this player.'); }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Users size={13} style={{ verticalAlign: -2 }} /> Community</div>
          <h1>Friends</h1>
          <p>Add players, see who is online, send direct challenges and follow your friends' activity. You control who can contact you in Settings.</p>
        </div>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Tabs value={tab} onChange={setTab} label="Friends sections" tabs={[
        { id: 'friends', label: 'Friends', count: data?.friends.length },
        { id: 'requests', label: 'Requests', count: (data?.incoming.length ?? 0) + (data?.outgoing.length ?? 0) },
        { id: 'challenges', label: 'Challenges', count: challenges.incoming.length },
        { id: 'search', label: 'Find players' },
        { id: 'activity', label: 'Activity' },
      ]} />

      {tab === 'friends' && (
        !data ? <Loading rows={2} /> : data.friends.length === 0 ? (
          <Empty icon={<Users size={26} />} title="No friends yet" action={<Button onClick={() => setTab('search')}>Find players</Button>}>
            Search for players by username and send a friend request.
          </Empty>
        ) : (
          <div className="grid grid-auto">
            {data.friends.map(friend => (
              <Card key={friend.id} hover>
                <div className="row" style={{ gap: 12 }}>
                  <Avatar name={friend.username} src={friend.avatarUrl} size="lg" online={friend.online} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <Link to={`/players/${friend.username}`} style={{ fontWeight: 700, color: '#fff' }}>{friend.username}</Link>
                    <div className="tiny muted">{friend.rating} blitz · {friend.division}</div>
                    <Badge tone={friend.online ? 'success' : 'muted'}>{friend.online ? 'Online' : 'Offline'}</Badge>
                  </div>
                </div>
                <div className="row mt-2" style={{ gap: 6 }}>
                  <Button size="sm" variant="primary" onClick={() => navigate(`/messages/${friend.username}`)} icon={<MessageSquare size={13} />}>Message</Button>
                  <Button size="sm" variant="secondary" onClick={async () => {
                    try { await api.post('/challenges', { username: friend.username, category: 'blitz', seconds: 180, increment: 2, rated: true }); setNotice(`Challenge sent to ${friend.username}.`); load(); }
                    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not send the challenge.'); }
                  }} icon={<Swords size={13} />}>Challenge</Button>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'requests' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Incoming requests" />
            {!data || data.incoming.length === 0 ? <p className="small muted">No incoming requests.</p> : data.incoming.map(req => (
              <div key={req.requestId} className="list-row">
                <Avatar name={req.username} src={req.avatarUrl} size="sm" />
                <div className="grow">
                  <Link to={`/players/${req.username}`} style={{ fontWeight: 600, color: '#fff' }}>{req.username}</Link>
                  <div className="tiny muted">{req.rating} blitz</div>
                </div>
                <Button size="sm" variant="success" onClick={() => respond(req.requestId, true)} icon={<Check size={13} />}>Accept</Button>
                <Button size="sm" variant="ghost" onClick={() => respond(req.requestId, false)} icon={<X size={13} />}>Decline</Button>
              </div>
            ))}
          </Card>
          <Card>
            <CardHead title="Sent requests" />
            {!data || data.outgoing.length === 0 ? <p className="small muted">No pending sent requests.</p> : data.outgoing.map(req => (
              <div key={req.requestId} className="list-row">
                <Avatar name={req.username} src={req.avatarUrl} size="sm" />
                <div className="grow"><span style={{ fontWeight: 600 }}>{req.username}</span><div className="tiny muted">Waiting for a response</div></div>
                <Badge tone="warning">Pending</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'challenges' && (
        <Card>
          <CardHead title="Challenges" subtitle="Incoming challenges can be accepted, which opens a live game immediately." />
          {challenges.incoming.length === 0 && challenges.outgoing.length === 0 ? (
            <p className="small muted">No open challenges. Send one from your friends list.</p>
          ) : (
            <>
              {challenges.incoming.map(challenge => (
                <div key={challenge.id} className="list-row">
                  <div className="grow">
                    <strong>{challenge.from}</strong>
                    <div className="tiny muted">{challenge.category} · {challenge.seconds / 60}+{challenge.increment} · {challenge.rated ? 'rated' : 'casual'}</div>
                  </div>
                  <Button size="sm" onClick={() => respondChallenge(challenge.id, true)}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => respondChallenge(challenge.id, false)}>Decline</Button>
                </div>
              ))}
              {challenges.outgoing.map(challenge => (
                <div key={challenge.id} className="list-row">
                  <div className="grow"><strong>To {challenge.to}</strong><div className="tiny muted">{challenge.category}</div></div>
                  <Badge tone="warning">Waiting</Badge>
                </div>
              ))}
            </>
          )}
        </Card>
      )}

      {tab === 'search' && (
        <Card>
          <CardHead title="Find players" subtitle="Search by username." action={<Search size={15} style={{ color: 'var(--lavender)' }} />} />
          <input className="input" placeholder="Search usernames…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search players" />
          <div className="mt-2">
            {results.length === 0 ? <p className="small muted">{query.length < 2 ? 'Type at least two characters.' : 'No players found.'}</p> : results.map(player => (
              <div key={player.id} className="list-row">
                <Avatar name={player.username} src={player.avatarUrl} size="sm" online={player.online} />
                <div className="grow">
                  <Link to={`/players/${player.username}`} style={{ fontWeight: 600, color: '#fff' }}>{player.username}</Link>
                  <div className="tiny muted">{player.rating} blitz{player.country ? ` · ${player.country}` : ''}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => request(player.username)} icon={<UserPlus size={13} />}>Add</Button>
                <Button size="sm" variant="ghost" onClick={() => block(player.username)}>Block</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'activity' && (
        <Card>
          <CardHead title="Friend activity" action={<Badge tone="muted">{activity.length} events</Badge>} />
          {activity.length === 0 ? <p className="small muted">No recent activity from your friends.</p> : (
            <div className="timeline">
              {activity.map(item => (
                <div key={item.id} className="timeline-item">
                  <Link to={`/players/${item.username}`} style={{ fontWeight: 600, color: '#fff' }}>{item.username}</Link>
                  <span className="small muted"> {item.summary}</span>
                  <div className="tiny muted">{timeAgo(item.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
