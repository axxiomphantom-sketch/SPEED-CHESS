import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Check, Copy, Loader2, Swords, UserPlus, Users, Zap } from 'lucide-react';
import { api, ApiError, DIFFICULTY_LEVELS, TIME_CONTROLS, type GamePayload } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Avatar, Badge, Button, Card, CardHead, Empty, Tabs } from '../components/ui';
import { MiniBoard } from '../components/board/ChessBoard';

type Tab = 'online' | 'computer' | 'friend' | 'local';
const CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical'] as const;

export function Play() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = (params.get('tab') as Tab) ?? (params.get('mode') === 'computer' ? 'computer' : 'online');
  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('blitz');
  const [rated, setRated] = useState(true);
  const [queued, setQueued] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ position?: number; inQueue?: number; waitedSeconds?: number; window?: number; matched?: boolean }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [difficulty, setDifficulty] = useState<string>('easy');
  const [color, setColor] = useState<'white' | 'black'>('white');
  const [seconds, setSeconds] = useState(600);
  const [increment, setIncrement] = useState(5);
  const [invite, setInvite] = useState<GamePayload | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [challengeSent, setChallengeSent] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    api.get<{ friends: any[] }>('/friends').then(d => setFriends(d.friends)).catch(() => {});
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); api.post('/matchmaking/cancel').catch(() => {}); };
  }, []);

  useEffect(() => {
    const tc = TIME_CONTROLS[category];
    setSeconds(tc.seconds);
    setIncrement(tc.increment);
  }, [category]);

  const waitForMatch = async () => {
    const res = await api.post<{ matched: boolean; game?: GamePayload } & Record<string, any>>('/matchmaking/wait');
    if (res.matched && res.game) {
      navigate(`/play/game/${res.game.id}`);
      return;
    }
    setQueueInfo(res);
    pollRef.current = window.setTimeout(waitForMatch, 1200);
  };

  const findMatch = async () => {
    setError('');
    setBusy(true);
    setQueued(true);
    try {
      const res = await api.post<{ matched?: boolean; game?: GamePayload; alreadyPlaying?: boolean } & Record<string, any>>('/matchmaking/join', {
        category, seconds, increment, rated,
      });
      if (res.alreadyPlaying && res.game) { navigate(`/play/game/${res.game.id}`); return; }
      if (res.matched && res.game) { navigate(`/play/game/${res.game.id}`); return; }
      await waitForMatch();
    } catch (err) {
      setQueued(false);
      setError(err instanceof ApiError ? err.message : 'Matchmaking is unavailable right now.');
    } finally {
      setBusy(false);
    }
  };

  const cancelMatch = async () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    await api.post('/matchmaking/cancel').catch(() => {});
    setQueued(false);
  };

  const startComputer = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ game: GamePayload }>('/play/games', {
        mode: 'computer', category, seconds, increment, difficulty, color,
      });
      navigate(`/play/game/${res.game.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the game.');
    } finally { setBusy(false); }
  };

  const startLocal = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ game: GamePayload }>('/play/games', { mode: 'local', category, seconds, increment });
      navigate(`/play/game/${res.game.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the game.');
    } finally { setBusy(false); }
  };

  const createInvite = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ game: GamePayload }>('/play/games', { mode: 'friend', category, seconds, increment, rated, private: true });
      setInvite(res.game);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the private game.');
    } finally { setBusy(false); }
  };

  const joinGame = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ game: GamePayload }>('/play/games/join', { code: joinCode.trim().toUpperCase() });
      navigate(`/play/game/${res.game.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No open game with that code.');
    } finally { setBusy(false); }
  };

  const challenge = async (username: string) => {
    setError('');
    try {
      await api.post('/challenges', { username, category, seconds, increment, rated });
      setChallengeSent(username);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the challenge.');
    }
  };

  const timeControlButtons = useMemo(() => CATEGORIES.map(cat => ({
    id: cat, label: TIME_CONTROLS[cat].label, blurb: TIME_CONTROLS[cat].blurb,
  })), []);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Play</div>
          <h1>Find a game</h1>
          <p>Rated online chess, private games with friends, a computer opponent with five real difficulty levels, or a local board for two players on one device.</p>
        </div>
        <Link to="/history" className="btn btn-secondary btn-sm">Game history</Link>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        label="Game modes"
        tabs={[
          { id: 'online', label: 'Online matchmaking' },
          { id: 'computer', label: 'Play computer' },
          { id: 'friend', label: 'Friends & private' },
          { id: 'local', label: 'Local board' },
        ]}
      />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="stack">
          {tab !== 'local' && (
            <Card>
              <CardHead title="Time control" subtitle="Each time control has its own separate rating." />
              <div className="grid grid-4" style={{ gap: 10 }}>
                {timeControlButtons.map(tc => (
                  <button
                    key={tc.id}
                    type="button"
                    className="link-row"
                    style={{
                      flexDirection: 'column', alignItems: 'flex-start', gap: 2, cursor: 'pointer',
                      borderColor: category === tc.id ? 'var(--violet)' : undefined,
                      background: category === tc.id ? 'rgba(121,37,217,.16)' : undefined,
                    }}
                    onClick={() => setCategory(tc.id as any)}
                  >
                    <span style={{ fontWeight: 700 }}>{tc.label}</span>
                    <span className="tiny muted">{tc.blurb}</span>
                  </button>
                ))}
              </div>
              {tab === 'online' && (
                <label className="checkbox mt-2">
                  <input type="checkbox" checked={rated} onChange={e => setRated(e.target.checked)} />
                  <span>Rated game — affects my {category} rating. Uncheck for a casual game.</span>
                </label>
              )}
            </Card>
          )}

          {tab === 'online' && (
            <Card>
              <CardHead title="Ranked matchmaking" action={<Zap size={16} style={{ color: 'var(--lavender)' }} />} />
              <p className="small muted">You are paired with a player of similar rating. The window starts at ±100 and widens the longer you wait.</p>
              {!queued ? (
                <Button onClick={findMatch} loading={busy} size="lg" icon={<Swords size={17} />}>Find opponent</Button>
              ) : (
                <div className="panel text-center" style={{ padding: 24 }}>
                  <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--lavender)' }} />
                  <p style={{ margin: '10px 0 4px', fontWeight: 600 }}>Searching for an opponent…</p>
                  <p className="small muted" style={{ margin: 0 }}>
                    {queueInfo.position ? `Position ${queueInfo.position} of ${queueInfo.inQueue}` : 'You are first in the queue'}
                    {queueInfo.window ? ` · rating window ±${queueInfo.window}` : ''}
                    {queueInfo.waitedSeconds ? ` · ${queueInfo.waitedSeconds}s` : ''}
                  </p>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={cancelMatch} type="button">Cancel</Button>
                </div>
              )}
              <p className="tiny muted mt-2" style={{ marginBottom: 0 }}>
                Matchmaking needs another player online. Open SPEED CHESS in a second browser profile to try it, or challenge the computer meanwhile.
              </p>
            </Card>
          )}

          {tab === 'computer' && (
            <Card>
              <CardHead title="Computer opponent" subtitle="The engine runs on the server and answers as Black." action={<Bot size={16} style={{ color: 'var(--lavender)' }} />} />
              <span className="label">Difficulty</span>
              <div className="stack mt-1" style={{ gap: 8 }}>
                {DIFFICULTY_LEVELS.map(level => (
                  <button
                    key={level.key}
                    type="button"
                    className="link-row"
                    style={{ borderColor: difficulty === level.key ? 'var(--violet)' : undefined, background: difficulty === level.key ? 'rgba(121,37,217,.14)' : undefined }}
                    onClick={() => setDifficulty(level.key)}
                  >
                    <span style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 600 }}>{level.label} <span className="tiny muted">{level.elo}</span></span>
                      <span className="tiny muted">{level.description}</span>
                    </span>
                    {difficulty === level.key && <Check size={16} style={{ color: 'var(--lavender)' }} />}
                  </button>
                ))}
              </div>
              <div className="row mt-2" style={{ gap: 8 }}>
                <span className="label">Play as</span>
                <button type="button" className={`chip ${color === 'white' ? 'active' : ''}`} onClick={() => setColor('white')}>White</button>
                <button type="button" className={`chip ${color === 'black' ? 'active' : ''}`} onClick={() => setColor('black')}>Black (you move second)</button>
              </div>
              <p className="tiny muted mt-2">Computer games are always unrated. Use the undo-free board to practise consciously — analysis is available when the game ends.</p>
              <Button onClick={startComputer} loading={busy} size="lg" icon={<Bot size={17} />}>Start computer game</Button>
            </Card>
          )}

          {tab === 'friend' && (
            <>
              <Card>
                <CardHead title="Create a private game" subtitle="Share the invite code — no rating is affected unless you both agree to play rated." />
                <label className="checkbox" style={{ marginBottom: 12 }}>
                  <input type="checkbox" checked={rated} onChange={e => setRated(e.target.checked)} />
                  <span>Rated private game</span>
                </label>
                <div className="row wrap">
                  <Button onClick={createInvite} loading={busy} icon={<UserPlus size={16} />}>Create invite</Button>
                  <span className="tiny muted">or</span>
                  <div className="row" style={{ gap: 6 }}>
                    <input className="input" style={{ width: 150, textTransform: 'uppercase' }} placeholder="Invite code"
                      value={joinCode} onChange={e => setJoinCode(e.target.value)} aria-label="Invite code" />
                    <Button variant="secondary" onClick={joinGame} loading={busy}>Join</Button>
                  </div>
                </div>
                {invite && (
                  <div className="panel mt-2">
                    <div className="row-between">
                      <div>
                        <div className="tiny muted">Invite code</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '.12em' }}>{invite.inviteCode}</div>
                      </div>
                      <Button variant="secondary" size="sm" icon={<Copy size={14} />}
                        onClick={() => navigator.clipboard.writeText(invite.inviteCode ?? '').catch(() => {})}>Copy</Button>
                    </div>
                    <Link to={`/play/game/${invite.id}`} className="btn btn-primary btn-block mt-2">Open the board and wait</Link>
                  </div>
                )}
              </Card>
              <Card>
                <CardHead title="Challenge a friend" subtitle={`${TIME_CONTROLS[category].label} · ${rated ? 'rated' : 'casual'}`} />
                {friends.length === 0 ? (
                  <Empty icon={<Users size={24} />} title="No friends yet" action={<Link to="/friends" className="btn btn-secondary btn-sm">Find players</Link>}>
                    Add friends to send direct challenges.
                  </Empty>
                ) : (
                  <div className="stack" style={{ gap: 8 }}>
                    {friends.map(f => (
                      <div key={f.id} className="row-between">
                        <span className="row" style={{ gap: 9 }}>
                          <Avatar name={f.username} src={f.avatarUrl} size="sm" online={f.online} />
                          <span>
                            <span style={{ display: 'block', fontWeight: 600, fontSize: '.88rem' }}>{f.username}</span>
                            <span className="tiny muted">{f.rating} blitz</span>
                          </span>
                        </span>
                        <Button size="sm" variant={challengeSent === f.username ? 'secondary' : 'primary'} disabled={challengeSent === f.username} onClick={() => challenge(f.username)}>
                          {challengeSent === f.username ? 'Challenge sent' : 'Challenge'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="tiny muted mt-2" style={{ marginBottom: 0 }}>Incoming challenges appear on the Friends page.</p>
              </Card>
            </>
          )}

          {tab === 'local' && (
            <Card>
              <CardHead title="Local board" subtitle="Two players, one device. No rating, no clock pressure — perfect for teaching." action={<Users size={16} style={{ color: 'var(--lavender)' }} />} />
              <p className="small muted">The board enforces every rule on the server, so you can use it to demonstrate or play a friendly game in the same room. Rotate the board between moves on a tablet, or use it to coach a beginner move by move.</p>
              <Button onClick={startLocal} loading={busy} size="lg" icon={<Users size={17} />}>Start local game</Button>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Your ratings" />
            <div className="stack" style={{ gap: 10 }}>
              {CATEGORIES.map(cat => {
                const rating = useAuthRating(cat);
                return (
                  <div className="row-between" key={cat} style={{ fontSize: '.86rem' }}>
                    <span style={{ textTransform: 'capitalize', color: '#d6d6de' }}>{cat}</span>
                    <span className="row" style={{ gap: 8 }}>
                      <Badge tone="muted">{rating ? Math.round(rating.rating) : '—'}</Badge>
                      <span className="tiny muted">{rating?.games ?? 0} games</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card>
            <CardHead title="Fair play" />
            <ul className="small muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
              <li>Every move is validated by the server.</li>
              <li>The AI coach is disabled inside your own active rated games.</li>
              <li>Reports are reviewed by people, not automatic bans.</li>
              <li>You can appeal any restriction through support.</li>
            </ul>
          </Card>
          <Card>
            <CardHead title="Featured start" />
            <MiniBoard fen="r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5" size={200} />
            <p className="tiny muted mt-2" style={{ marginBottom: 0 }}>Italian Game — a natural first opening for beginners: develop, castle, then fight for the centre.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function useAuthRating(category: 'bullet' | 'blitz' | 'rapid' | 'classical') {
  const { ratings } = useAuth();
  return ratings?.[category];
}
