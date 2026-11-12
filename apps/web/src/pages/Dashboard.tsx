import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Award, Bot, Calendar, ChevronRight, Clock, Flame, Gamepad2, Play, Puzzle, Swords,
  Trophy, UserPlus, Users, Zap,
} from 'lucide-react';
import { api, formatDate, timeAgo, type Ratings } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Avatar, Badge, Card, CardHead, Empty, Loading, Progress, Sparkline, StatBar } from '../components/ui';
import { MiniBoard } from '../components/board/ChessBoard';

interface DashboardData {
  stats: { total: number; wins: number; losses: number; draws: number; winRate: number; byCategory: Record<string, { games: number; wins: number }> };
  ratings: Ratings;
  division: { name: string; tone: string };
  activeGameId: string | null;
  toPlay: Array<{ tournamentId: string; round: number; board: number; opponent: string; color: 'white' | 'black'; gameId: string }>;
  recentGames: Array<{ id: string; opponent: string; color: string; result: 'win' | 'loss' | 'draw'; category: string; termination: string; playedAt: string }>;
  ratingHistory: Array<{ category: string; rating: number; delta: number; created_at: string }>;
  dailyPuzzles: number;
  achievements: Array<{ id: string; name: string; description: string; icon: string; tier: string; progress: number; target: number; unlocked: boolean }>;
  upcomingTournaments: Array<{ id: string; name: string; slug: string; starts_at: string; format: string; category: string; points: number }>;
  continueLesson: { slug: string; title: string; courseTitle: string } | null;
  friends: Array<{ id: string; username: string; avatarUrl: string | null; online: boolean }>;
}

interface DailyPuzzle {
  puzzle: { id: string; fen: string; rating: number; themes: string[]; title: string | null; difficulty: string } | null;
  solvedToday?: boolean;
  streak?: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [daily, setDaily] = useState<DailyPuzzle | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<DashboardData>('/me/dashboard').then(setData).catch(err => setError(err.message));
    api.get<DailyPuzzle>('/puzzles/daily').then(setDaily).catch(() => {});
  }, []);

  if (error) return <div className="page"><div className="form-error">{error}</div></div>;
  if (!data || !user) return <div className="page"><Loading rows={3} /></div>;

  const mainRating = data.ratings.blitz;
  const history = data.ratingHistory.filter(h => h.category === 'blitz').slice(-24).map(h => h.rating);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="page">
      {/* Welcome */}
      <section className="hero-panel" style={{ marginBottom: 18 }}>
        <div className="row-between wrap" style={{ gap: 18 }}>
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={user.username} src={user.avatarUrl} size="xl" online />
            <div>
              <div className="eyebrow">{greeting}</div>
              <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.1rem)', margin: '2px 0 6px' }}>{user.username}</h1>
              <div className="row wrap" style={{ gap: 8 }}>
                <Badge tone="purple">{data.division.name}</Badge>
                <Badge tone="muted">{mainRating.rating} blitz</Badge>
                <Badge tone="muted">{data.stats.total} games</Badge>
                {mainRating.rd > 200 && <Badge tone="warning">Provisional rating</Badge>}
              </div>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            {data.activeGameId ? (
              <Link to={`/play/game/${data.activeGameId}`} className="btn btn-primary btn-lg"><Play size={17} /> Resume game</Link>
            ) : (
              <Link to="/play" className="btn btn-primary btn-lg"><Gamepad2 size={17} /> Play now</Link>
            )}
            <Link to="/training" className="btn btn-secondary btn-lg"><Puzzle size={17} /> Daily puzzle</Link>
          </div>
        </div>
      </section>

      {data.toPlay.length > 0 && (
        <Card className="mb-2" style={{ borderColor: 'rgba(203,167,255,.35)' }}>
          <CardHead title="Your tournament games are ready" action={<Trophy size={16} style={{ color: 'var(--lavender)' }} />} />
          <div className="stack" style={{ gap: 8 }}>
            {data.toPlay.map(item => (
              <div key={item.gameId} className="row-between panel">
                <div>
                  <div style={{ fontWeight: 600 }}>Round {item.round} · board {item.board}</div>
                  <div className="small muted">vs {item.opponent} · you play {item.color}</div>
                </div>
                <Link to={`/play/game/${item.gameId}`} className="btn btn-primary btn-sm">Open game</Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)' }}>
        <div className="stack">
          {/* Performance */}
          <Card>
            <CardHead
              title="Performance"
              subtitle="All finished games on your account"
              action={<Link to="/analytics" className="btn btn-ghost btn-sm">Full analytics <ChevronRight size={14} /></Link>}
            />
            <div className="kpi-strip" style={{ marginBottom: 14 }}>
              <div className="kpi"><div className="stat-value">{data.stats.total}</div><div className="stat-label">Games</div></div>
              <div className="kpi"><div className="stat-value" style={{ color: 'var(--success)' }}>{data.stats.wins}</div><div className="stat-label">Wins</div></div>
              <div className="kpi"><div className="stat-value" style={{ color: 'var(--error)' }}>{data.stats.losses}</div><div className="stat-label">Losses</div></div>
              <div className="kpi"><div className="stat-value" style={{ color: 'var(--muted)' }}>{data.stats.draws}</div><div className="stat-label">Draws</div></div>
              <div className="kpi"><div className="stat-value">{data.stats.winRate}%</div><div className="stat-label">Win rate</div></div>
            </div>
            <div className="grid grid-2" style={{ gap: 18 }}>
              <div>
                <div className="row-between mb-2">
                  <strong style={{ fontSize: '.86rem' }}>Blitz rating</strong>
                  <span className="row" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>{Math.round(mainRating.rating)}</span>
                    <span className="tiny muted">peak {Math.round(mainRating.peak)}</span>
                  </span>
                </div>
                <Sparkline points={history.length > 1 ? history : [mainRating.rating]} height={54} />
                <div className="tiny muted">RD ±{Math.round(mainRating.rd)} · {mainRating.games} rated games</div>
              </div>
              <div>
                <strong style={{ fontSize: '.86rem' }}>By time control</strong>
                <div className="mt-1">
                  {(['bullet', 'blitz', 'rapid', 'classical'] as const).map(cat => (
                    <StatBar
                      key={cat}
                      label={`${cat[0].toUpperCase()}${cat.slice(1)} · ${ Math.round(data.ratings[cat].rating) }`}
                      value={data.stats.byCategory[cat]?.games ?? 0}
                      max={Math.max(1, ...Object.values(data.stats.byCategory).map(c => c.games))}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Recent games */}
          <Card>
            <CardHead title="Recent games" action={<Link to="/history" className="btn btn-ghost btn-sm">History <ChevronRight size={14} /></Link>} />
            {data.recentGames.length === 0 ? (
              <Empty icon={<Swords size={26} />} title="No games yet" action={<Link to="/play" className="btn btn-primary btn-sm">Play your first game</Link>}>
                Your finished games appear here with result, opening and accuracy.
              </Empty>
            ) : (
              <div>
                {data.recentGames.map(game => (
                  <Link key={game.id} to={`/analysis/${game.id}`} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className={`badge ${game.result === 'win' ? 'badge-success' : game.result === 'loss' ? 'badge-error' : 'badge-muted'}`} style={{ width: 44, justifyContent: 'center' }}>
                      {game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw'}
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '.88rem' }}>{game.opponent}</span>
                      <span className="tiny muted">{game.category} · as {game.color} · {game.termination ?? 'finished'}</span>
                    </span>
                    <span className="tiny muted nowrap">{timeAgo(game.playedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Continue learning */}
          <Card>
            <CardHead title="Continue learning" action={<Link to="/learn" className="btn btn-ghost btn-sm">All courses <ChevronRight size={14} /></Link>} />
            {data.continueLesson ? (
              <div className="row-between panel" style={{ gap: 14 }}>
                <div>
                  <div className="tiny muted">{data.continueLesson.courseTitle}</div>
                  <div style={{ fontWeight: 600 }}>{data.continueLesson.title}</div>
                </div>
                <Link to={`/learn/lesson/${data.continueLesson.slug}`} className="btn btn-primary btn-sm">Resume</Link>
              </div>
            ) : (
              <div className="row-between panel" style={{ gap: 14 }}>
                <div>
                  <div className="tiny muted">How to Play Academy</div>
                  <div style={{ fontWeight: 600 }}>Start with “What is chess?”</div>
                </div>
                <Link to="/how-to-play" className="btn btn-primary btn-sm">Start</Link>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          {/* Quick play */}
          <Card>
            <CardHead title="Quick play" action={<Zap size={16} style={{ color: 'var(--lavender)' }} />} />
            <div className="stack" style={{ gap: 8 }}>
              <Link to="/play" className="link-row"><span className="row" style={{ gap: 8 }}><Play size={15} /> Play now</span><ArrowRight size={14} /></Link>
              <Link to="/play?mode=computer" className="link-row"><span className="row" style={{ gap: 8 }}><Bot size={15} /> Play the computer</span><ArrowRight size={14} /></Link>
              <Link to="/play?tab=online" className="link-row"><span className="row" style={{ gap: 8 }}><Swords size={15} /> Ranked match</span><ArrowRight size={14} /></Link>
              <Link to="/friends" className="link-row"><span className="row" style={{ gap: 8 }}><Users size={15} /> Play a friend</span><ArrowRight size={14} /></Link>
            </div>
          </Card>

          {/* Daily puzzle */}
          <Card>
            <CardHead
              title="Daily puzzle"
              action={daily?.streak ? <Badge tone="warning"><Flame size={11} /> {daily.streak} day streak</Badge> : undefined}
            />
            {daily?.puzzle ? (
              <>
                <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                  <MiniBoard fen={daily.puzzle.fen} size={112} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{daily.puzzle.title ?? 'Daily puzzle'}</div>
                    <div className="tiny muted">{daily.puzzle.difficulty} · rating {daily.puzzle.rating}</div>
                    <div className="chip-row mt-1">
                      {daily.puzzle.themes.slice(0, 2).map(t => <span key={t} className="badge badge-muted">{t}</span>)}
                    </div>
                    {daily.solvedToday && <Badge tone="success" className="mt-1">Solved today</Badge>}
                  </div>
                </div>
                <Link to="/training?daily=1" className="btn btn-primary btn-block mt-2">
                  {daily.solvedToday ? 'Review the puzzle' : 'Solve the puzzle'}
                </Link>
              </>
            ) : <p className="small muted">No puzzles available.</p>}
          </Card>

          {/* Tournaments */}
          <Card>
            <CardHead title="Your tournaments" action={<Link to="/tournaments" className="btn btn-ghost btn-sm">Browse</Link>} />
            {data.upcomingTournaments.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>You are not registered for any tournament. <Link to="/tournaments">Find one →</Link></p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {data.upcomingTournaments.map(t => (
                  <Link key={t.id} to={`/tournaments/${t.slug}`} className="link-row">
                    <span>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '.86rem' }}>{t.name}</span>
                      <span className="tiny muted"><Calendar size={11} style={{ verticalAlign: -1 }} /> {formatDate(t.starts_at)} · {t.format}</span>
                    </span>
                    <ChevronRight size={14} />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Community */}
          <Card>
            <CardHead title="Friends online" action={<Link to="/friends" className="btn btn-ghost btn-sm"><UserPlus size={14} /></Link>} />
            {data.friends.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>No friends yet. <Link to="/friends">Find players →</Link></p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {data.friends.map(f => (
                  <div key={f.id} className="row-between">
                    <Link to={`/players/${f.username}`} className="row" style={{ gap: 9, color: 'inherit', textDecoration: 'none' }}>
                      <Avatar name={f.username} src={f.avatarUrl} size="sm" online={f.online} />
                      <span className="small" style={{ fontWeight: 600 }}>{f.username}</span>
                    </Link>
                    <Badge tone={f.online ? 'success' : 'muted'}>{f.online ? 'Online' : 'Offline'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Achievements */}
          <Card>
            <CardHead title="Achievements" action={<Link to="/achievements" className="btn btn-ghost btn-sm"><Award size={14} /></Link>} />
            <div className="stack" style={{ gap: 10 }}>
              {data.achievements.slice(0, 4).map(a => (
                <div key={a.id}>
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <span className="small" style={{ fontWeight: 600, color: a.unlocked ? '#fff' : 'var(--muted)' }}>{a.name}</span>
                    <span className="tiny muted">{Math.min(a.progress, a.target)}/{a.target}</span>
                  </div>
                  <Progress value={a.unlocked ? 100 : (a.progress / a.target) * 100} className={a.unlocked ? 'progress-success' : ''} />
                </div>
              ))}
            </div>
          </Card>

          <Card className="text-center">
            <Clock size={20} style={{ color: 'var(--lavender)' }} />
            <p className="small muted" style={{ margin: '8px 0 12px' }}>Train a little every day — consistency beats long sessions.</p>
            <Link to="/coach" className="btn btn-outline btn-sm btn-block">Ask the coach for a plan</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
