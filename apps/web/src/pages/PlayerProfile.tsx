import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, Flag, MessageSquare, Swords, Trophy, UserPlus } from 'lucide-react';
import { api, ApiError, formatDate, timeAgo } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Avatar, Badge, Button, Card, CardHead, Empty, Field, Loading, Modal, Progress, Tabs } from '../components/ui';

const CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical'] as const;

export function PlayerProfile() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'overview' | 'games' | 'achievements' | 'activity'>('overview');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('cheating');
  const [details, setDetails] = useState('');

  const load = async () => {
    try {
      const res = await api.get<any>(`/players/${username}`);
      setData(res);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Player not found.'); }
  };

  useEffect(() => { setData(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [username]);

  const addFriend = async () => {
    try { await api.post('/friends/request', { username }); setNotice('Friend request sent.'); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not send the request.'); }
  };

  const challenge = async () => {
    try {
      await api.post('/challenges', { username, category: 'blitz', seconds: 180, increment: 2, rated: true });
      setNotice('Challenge sent. It appears in your Challenges tab until it is accepted.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not send the challenge.'); }
  };

  const report = async () => {
    try {
      await api.post('/reports', { targetType: 'user', targetId: data.player.id, reason, details });
      setReporting(false);
      setNotice('Report submitted for review. Fair play reports are never decided automatically.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not submit the report.'); }
  };

  if (error && !data) return <div className="page"><Alert tone="error">{error}</Alert><Link to="/leaderboards" className="btn btn-secondary mt-2">Browse players</Link></div>;
  if (!data) return <div className="page"><Loading rows={3} /></div>;

  const player = data.player;
  const isSelf = player.isSelf || user?.id === player.id;

  return (
    <div className="page">
      {error && <div className="form-error">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="hero-panel mb-2" style={{ marginBottom: 18 }}>
        <div className="row-between wrap" style={{ gap: 18 }}>
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={player.username} src={player.avatarUrl} size="xl" online={player.online} />
            <div>
              <div className="row" style={{ gap: 8 }}>
                <h1 style={{ margin: 0, fontSize: 'clamp(1.3rem, 2.4vw, 1.8rem)' }}>{player.username}</h1>
                {player.title && <Badge tone="purple">{player.title}</Badge>}
                {player.role !== 'player' && <Badge tone="muted">{player.role}</Badge>}
                {player.isCoach && <Badge tone="success">Coach</Badge>}
              </div>
              <div className="row wrap" style={{ gap: 12, marginTop: 6 }}>
                <span className="small muted">{player.country ?? 'Country hidden'}</span>
                <span className="small muted">Joined {formatDate(player.joinedAt)}</span>
                <Badge tone={player.online ? 'success' : 'muted'}>{player.online ? 'Online' : 'Offline'}</Badge>
                <Badge tone="muted">{player.division}</Badge>
              </div>
              {player.bio && <p className="small" style={{ marginTop: 8, maxWidth: 560, color: '#cfcfd9' }}>{player.bio}</p>}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {isSelf ? (
              <Link to="/profile" className="btn btn-primary btn-sm">Edit profile</Link>
            ) : user ? (
              <>
                {data.friendship?.status === 'accepted' ? <Badge tone="success">Friends</Badge>
                  : data.friendship?.status === 'pending' ? <Badge tone="warning">{data.friendship.incoming ? 'Wants to be friends' : 'Request sent'}</Badge>
                  : <Button size="sm" variant="secondary" onClick={addFriend} icon={<UserPlus size={14} />}>Add friend</Button>}
                <Button size="sm" variant="secondary" onClick={() => navigate(`/messages/${player.username}`)} icon={<MessageSquare size={14} />}>Message</Button>
                <Button size="sm" onClick={challenge} icon={<Swords size={14} />}>Challenge</Button>
                <Button size="sm" variant="ghost" onClick={() => setReporting(true)} icon={<Flag size={14} />}>Report</Button>
              </>
            ) : <Link to="/login" className="btn btn-secondary btn-sm">Sign in to interact</Link>}
          </div>
        </div>
      </section>

      <div className="kpi-strip mb-2" style={{ marginBottom: 16 }}>
        {CATEGORIES.map(category => {
          const rating = data.ratings?.[category];
          return (
            <div className="kpi" key={category}>
              <div className="stat-value">{rating ? Math.round(rating.rating) : '—'}</div>
              <div className="stat-label" style={{ textTransform: 'capitalize' }}>{category}</div>
              {rating && <div className="tiny muted">{rating.games} games{rating.provisional ? ' · provisional' : ''}</div>}
            </div>
          );
        })}
        <div className="kpi">
          <div className="stat-value">{data.stats.winRate}%</div>
          <div className="stat-label">Win rate</div>
          <div className="tiny muted">{data.stats.total} games</div>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} label="Profile sections" tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'games', label: 'Games', count: data.recentGames.length },
        { id: 'achievements', label: 'Achievements', count: data.achievements.length },
        { id: 'activity', label: 'Activity', count: data.activity.length },
      ]} />

      {tab === 'overview' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Results" />
            <div className="row-between small"><span className="muted">Wins</span><span style={{ fontWeight: 700, color: 'var(--success)' }}>{data.stats.wins}</span></div>
            <div className="row-between small mt-1"><span className="muted">Draws</span><span style={{ fontWeight: 700 }}>{data.stats.draws}</span></div>
            <div className="row-between small mt-1"><span className="muted">Losses</span><span style={{ fontWeight: 700, color: '#fca5a5' }}>{data.stats.losses}</span></div>
            <div className="mt-2"><Progress value={data.stats.winRate} /></div>
            <h4 style={{ marginTop: 18 }}>Clubs</h4>
            {data.clubs.length === 0 ? <p className="small muted">No club memberships.</p> : data.clubs.map((club: any) => (
              <div key={club.id} className="list-row">
                <Link to={`/clubs/${club.slug}`} style={{ fontWeight: 600, color: '#fff' }}>{club.name}</Link>
                <span className="grow" />
                <Badge tone="muted">{club.role}</Badge>
              </div>
            ))}
            <h4 style={{ marginTop: 18 }}>Tournaments</h4>
            {data.tournaments.length === 0 ? <p className="small muted">No tournament entries.</p> : data.tournaments.map((t: any) => (
              <div key={t.id} className="list-row">
                <Link to={`/tournaments/${t.slug}`} style={{ fontWeight: 600, color: '#fff' }}>{t.name}</Link>
                <span className="grow" />
                <span className="small muted">{t.points ?? 0} pts</span>
              </div>
            ))}
          </Card>
          <Card>
            <CardHead title="Recent games" action={<Link to="/history" className="small">All games</Link>} />
            {data.recentGames.length === 0 ? <p className="small muted">No finished games yet.</p> : data.recentGames.slice(0, 8).map((game: any) => (
              <div key={game.id} className="list-row">
                <span className={`badge ${game.outcome === 'win' ? 'badge-success' : game.outcome === 'loss' ? 'badge-error' : 'badge-muted'}`} style={{ width: 42, justifyContent: 'center' }}>{game.outcome}</span>
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: '.86rem' }}>vs {game.opponent}</div>
                  <div className="tiny muted" style={{ textTransform: 'capitalize' }}>{game.category} · {timeAgo(game.playedAt)}</div>
                </div>
                {isSelf && <Link to={`/analysis/${game.id}`} className="btn btn-sm btn-ghost">Review</Link>}
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'games' && (
        data.recentGames.length === 0 ? <Empty icon={<Swords size={24} />} title="No games to show">Finished games appear here.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Opponent</th><th>Result</th><th>Time control</th><th>Played</th><th /></tr></thead>
              <tbody>
                {data.recentGames.map((game: any) => (
                  <tr key={game.id}>
                    <td style={{ fontWeight: 600 }}>{game.opponent}</td>
                    <td><Badge tone={game.outcome === 'win' ? 'success' : game.outcome === 'loss' ? 'error' : 'muted'}>{game.outcome}</Badge></td>
                    <td className="muted" style={{ textTransform: 'capitalize' }}>{game.category}</td>
                    <td className="muted tiny">{formatDate(game.playedAt)}</td>
                    <td style={{ textAlign: 'right' }}>{isSelf && <Link to={`/analysis/${game.id}`} className="btn btn-sm btn-secondary">Analyse</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'achievements' && (
        data.achievements.length === 0 ? <Empty icon={<Award size={24} />} title="No achievements yet">Achievements appear as they are unlocked.</Empty> : (
          <div className="grid grid-auto">
            {data.achievements.map((achievement: any) => (
              <Card key={achievement.id}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="pillar-icon" style={{ margin: 0, width: 34, height: 34, color: 'var(--success)' }}><Award size={16} /></span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{achievement.name}</div>
                    <div className="tiny muted">{achievement.description}</div>
                    <div className="tiny muted">Unlocked {formatDate(achievement.unlocked_at)}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'activity' && (
        data.activity.length === 0 ? <Empty icon={<Trophy size={24} />} title="No public activity">This player has hidden their activity or has none yet.</Empty> : (
          <Card>
            <div className="timeline">
              {data.activity.map((item: any, index: number) => (
                <div key={index} className="timeline-item">
                  <span className="small">{item.summary}</span>
                  <div className="tiny muted">{timeAgo(item.created_at)}</div>
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      <Modal open={reporting} onClose={() => setReporting(false)} title={`Report ${player.username}`}
        footer={<><Button variant="secondary" onClick={() => setReporting(false)}>Cancel</Button><Button onClick={report}>Submit report</Button></>}>
        <Field label="Reason" htmlFor="pr-reason">
          <select id="pr-reason" className="select" value={reason} onChange={e => setReason(e.target.value)}>
            <option value="cheating">Suspected engine use</option>
            <option value="abuse">Abusive behaviour</option>
            <option value="harassment">Harassment</option>
            <option value="spam">Spam</option>
            <option value="other">Something else</option>
          </select>
        </Field>
        <Field label="What happened?" htmlFor="pr-details" hint="Include game links or timestamps if you can.">
          <textarea id="pr-details" className="textarea" value={details} onChange={e => setDetails(e.target.value)} />
        </Field>
        <Alert tone="info" title="What happens next">
          A human moderator reviews the report. Accounts are never restricted on the basis of a single automated signal, and every action can be appealed.
        </Alert>
      </Modal>
    </div>
  );
}
