import { useEffect, useState } from 'react';
import { Activity, BarChart3, PieChart, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Card, CardHead, Empty, Loading, Progress, ResultBar, Tabs } from '../components/ui';

export function Analytics() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<'overview' | 'openings' | 'ratings'>('overview');

  useEffect(() => {
    if (!user) return;
    api.get<any>('/me/analytics').then(setData).catch(() => setData(null));
  }, [user]);

  if (!user) return <div className="page"><Empty icon={<BarChart3 size={26} />} title="Sign in to see your analytics">Every number here comes from your own recorded games.</Empty></div>;
  if (!data) return <div className="page"><Loading rows={3} /></div>;

  const maxMonthly = Math.max(1, ...data.monthly.map((m: any) => m.games));
  const ratingSeries = Object.entries(
    (data.ratingHistory as any[]).reduce<Record<string, Array<{ rating: number; created_at: string }>>>((acc, row) => {
      (acc[row.category] ??= []).push({ rating: row.rating, created_at: row.created_at });
      return acc;
    }, {}),
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><BarChart3 size={13} style={{ verticalAlign: -2 }} /> Analytics</div>
          <h1>Your statistics</h1>
          <p>Derived from your finished games only. Where there is not enough data, we show nothing rather than a guess.</p>
        </div>
        <Badge tone="muted">{data.totals.games} games</Badge>
      </header>

      <Tabs value={tab} onChange={setTab} label="Analytics sections" tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'openings', label: 'Openings', count: data.openings.length },
        { id: 'ratings', label: 'Ratings' },
      ]} />

      {tab === 'overview' && (
        <>
          <div className="kpi-strip mb-2" style={{ marginBottom: 16 }}>
            <div className="kpi"><div className="stat-value">{data.totals.games}</div><div className="stat-label">Games played</div></div>
            <div className="kpi"><div className="stat-value" style={{ color: 'var(--success)' }}>{data.totals.wins}</div><div className="stat-label">Wins</div></div>
            <div className="kpi"><div className="stat-value">{data.totals.draws}</div><div className="stat-label">Draws</div></div>
            <div className="kpi"><div className="stat-value">{data.averageAccuracy ?? '—'}{data.averageAccuracy !== null ? '%' : ''}</div><div className="stat-label">Average accuracy</div></div>
          </div>
          <div className="grid grid-2">
            <Card>
              <CardHead title="By colour" action={<PieChart size={15} style={{ color: 'var(--lavender)' }} />} />
              {['white', 'black'].map(color => {
                const bucket = data.byColor[color];
                const percent = bucket.games ? Math.round((bucket.wins / bucket.games) * 100) : 0;
                return (
                  <div key={color} style={{ marginBottom: 14 }}>
                    <div className="row-between small"><span style={{ textTransform: 'capitalize', fontWeight: 600 }}>As {color}</span><span className="muted">{bucket.wins}/{bucket.games} wins · {percent}%</span></div>
                    <Progress value={percent} className="progress-success" />
                  </div>
                );
              })}
              <h4 style={{ marginTop: 18 }}>By time control</h4>
              {Object.entries(data.byCategory).map(([category, bucket]: [string, any]) => (
                <div key={category} style={{ marginBottom: 10 }}>
                  <div className="row-between tiny" style={{ marginBottom: 3 }}>
                    <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{category}</span>
                    <span className="muted">{bucket.games} games · {bucket.games ? Math.round((bucket.wins / bucket.games) * 100) : 0}% wins</span>
                  </div>
                  <ResultBar wins={bucket.wins} draws={bucket.draws} losses={bucket.losses} />
                </div>
              ))}
            </Card>
            <div className="stack">
              <Card>
                <CardHead title="Games per month" action={<Activity size={15} style={{ color: 'var(--lavender)' }} />} />
                {data.monthly.length === 0 ? <p className="small muted">No games recorded yet.</p> : (
                  <div className="row" style={{ alignItems: 'flex-end', gap: 8, height: 140, marginTop: 8 }}>
                    {data.monthly.map((month: any) => (
                      <div key={month.month} style={{ flex: 1, textAlign: 'center' }}>
                        <div title={`${month.games} games, ${month.wins} wins`} style={{
                          height: `${Math.max(4, (month.games / maxMonthly) * 110)}px`,
                          background: 'linear-gradient(180deg,#9333EA,#7925D9)', borderRadius: '4px 4px 0 0',
                        }} />
                        <div className="tiny muted" style={{ marginTop: 4 }}>{month.month.slice(5)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <CardHead title="How games ended" />
                {data.terminations.length === 0 ? <p className="small muted">No games recorded yet.</p> : data.terminations.map((row: any) => {
                  const total = data.terminations.reduce((sum: number, r: any) => sum + r.n, 0);
                  return (
                    <div key={row.termination} className="row-between small" style={{ padding: '4px 0' }}>
                      <span style={{ textTransform: 'capitalize' }}>{String(row.termination ?? 'unknown').replace('-', ' ')}</span>
                      <span className="muted">{row.n} ({Math.round((row.n / total) * 100)}%)</span>
                    </div>
                  );
                })}
              </Card>
            </div>
          </div>
        </>
      )}

      {tab === 'openings' && (
        data.openings.length === 0 ? <Empty icon={<TrendingUp size={24} />} title="No opening data yet">Play rated games and openings are identified automatically.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Opening</th><th>Games</th><th>Wins</th><th>Win rate</th></tr></thead>
              <tbody>
                {data.openings.map((opening: any) => (
                  <tr key={opening.name}>
                    <td style={{ fontWeight: 600 }}>{opening.name}</td>
                    <td className="muted">{opening.games}</td>
                    <td className="muted">{opening.wins}</td>
                    <td style={{ width: 200 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <Progress value={opening.winRate} className="progress-success" />
                        <span className="tiny" style={{ minWidth: 34 }}>{opening.winRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'ratings' && (
        ratingSeries.length === 0 ? <Empty icon={<TrendingUp size={24} />} title="No rating changes yet">Play a rated game to start a rating history.</Empty> : (
          <div className="grid grid-2">
            {ratingSeries.map(([category, points]) => (
              <Card key={category}>
                <CardHead title={`${category[0].toUpperCase() + category.slice(1)} rating`} action={<Badge tone="purple">{Math.round(points[points.length - 1].rating)}</Badge>} />
                <Sparkline points={points.map(p => p.rating)} />
                <div className="row-between tiny muted mt-1">
                  <span>{points.length} changes</span>
                  <span>low {Math.round(Math.min(...points.map(p => p.rating)))} · high {Math.round(Math.max(...points.map(p => p.rating)))}</span>
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="small muted">Not enough rating changes to draw a trend yet.</p>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points.map((value, index) => {
    const x = (index / (points.length - 1)) * 300;
    const y = 90 - ((value - min) / span) * 78;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 300 96" style={{ width: '100%', height: 96 }} role="img" aria-label="Rating history trend">
      <path d={path} fill="none" stroke="#9333EA" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
