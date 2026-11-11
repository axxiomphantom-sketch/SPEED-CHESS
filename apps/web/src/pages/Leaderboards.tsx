import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Globe, TrendingUp, Trophy, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Avatar, Badge, Card, Empty, Loading, Tabs } from '../components/ui';

const CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical'] as const;

interface Entry {
  rank: number; id: string; username: string; country: string | null; avatarUrl: string | null;
  title: string | null; rating: number; peak: number; games: number; winRate: number; division: string;
}

export function Leaderboards() {
  const { user } = useAuth();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('blitz');
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const [view, setView] = useState<'players' | 'clubs' | 'countries'>('players');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [countries, setCountries] = useState<any[] | null>(null);
  const [countryFilter, setCountryFilter] = useState('');

  useEffect(() => {
    if (view === 'players') {
      setEntries(null);
      const params = new URLSearchParams({ category, scope, limit: '50' });
      if (countryFilter) params.set('country', countryFilter);
      api.get<{ entries: Entry[] }>(`/leaderboards?${params.toString()}`).then(d => setEntries(d.entries)).catch(() => setEntries([]));
    } else if (view === 'clubs') {
      api.get<{ clubs: any[] }>(`/leaderboards/clubs?category=${category}`).then(d => setClubs(d.clubs)).catch(() => setClubs([]));
    } else {
      api.get<{ countries: any[] }>('/leaderboards/countries').then(d => setCountries(d.countries)).catch(() => setCountries([]));
    }
  }, [category, scope, view, countryFilter]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><TrendingUp size={13} style={{ verticalAlign: -2 }} /> Rankings</div>
          <h1>Leaderboards</h1>
          <p>Rankings are computed from stored rating records only — no estimated or inflated numbers. Players need at least one rated game to appear.</p>
        </div>
      </header>

      <Tabs value={view} onChange={setView} label="Leaderboard type" tabs={[
        { id: 'players', label: 'Players' },
        { id: 'clubs', label: 'Clubs' },
        { id: 'countries', label: 'Countries' },
      ]} />

      <div className="row wrap mb-2" style={{ marginBottom: 16, gap: 8 }}>
        {CATEGORIES.map(cat => (
          <button key={cat} type="button" className={`chip ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>
            {cat[0].toUpperCase() + cat.slice(1)}
          </button>
        ))}
        {view === 'players' && (
          <>
            <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
            <button type="button" className={`chip ${scope === 'global' ? 'active' : ''}`} onClick={() => setScope('global')}><Globe size={12} /> Global</button>
            <button type="button" className={`chip ${scope === 'friends' ? 'active' : ''}`} onClick={() => setScope('friends')}><Users size={12} /> Friends</button>
            <input className="input" style={{ width: 110, marginLeft: 'auto' }} placeholder="Country" maxLength={2}
              value={countryFilter} onChange={e => setCountryFilter(e.target.value.toUpperCase())} aria-label="Filter by country code" />
          </>
        )}
      </div>

      {view === 'players' && (
        entries === null ? <Loading rows={3} /> : entries.length === 0 ? (
          <Empty icon={<Trophy size={26} />} title={scope === 'friends' ? 'No friends on this leaderboard yet' : 'No ranked players yet'}>
            {scope === 'friends' ? 'Add friends and play rated games to compare ratings.' : 'Players appear once they have finished a rated game.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Player</th><th>Division</th><th>Rating</th><th>Peak</th><th>Games</th><th>Win rate</th></tr></thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} style={entry.id === user?.id ? { background: 'rgba(121,37,217,.1)' } : undefined}>
                    <td>
                      <span style={{
                        display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8,
                        background: entry.rank <= 3 ? 'rgba(203,167,255,.16)' : '#22222b',
                        color: entry.rank <= 3 ? 'var(--lavender)' : 'var(--muted)', fontWeight: 700, fontSize: '.78rem',
                      }}>{entry.rank}</span>
                    </td>
                    <td>
                      <Link to={`/players/${entry.username}`} className="row" style={{ gap: 9, color: 'inherit', textDecoration: 'none' }}>
                        <Avatar name={entry.username} src={entry.avatarUrl} size="sm" />
                        <span>
                          <span style={{ fontWeight: 600 }}>{entry.username}</span>
                          {entry.title && <span className="tiny muted"> {entry.title}</span>}
                          {entry.country && <span className="tiny muted"> · {entry.country}</span>}
                        </span>
                      </Link>
                    </td>
                    <td><Badge tone="muted">{entry.division}</Badge></td>
                    <td style={{ fontWeight: 700 }}>{entry.rating}</td>
                    <td className="muted">{entry.peak}</td>
                    <td className="muted">{entry.games}</td>
                    <td className="muted">{entry.winRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'clubs' && (
        clubs === null ? <Loading rows={2} /> : clubs.length === 0 ? <Empty icon={<Building2 size={26} />} title="No clubs ranked yet">Clubs appear once members have ratings.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Club</th><th>Members</th><th>Average rating</th></tr></thead>
              <tbody>
                {clubs.map(club => (
                  <tr key={club.id}>
                    <td className="muted">{club.rank}</td>
                    <td><Link to={`/clubs/${club.slug}`} style={{ fontWeight: 600 }}>{club.name}</Link>{club.country && <span className="tiny muted"> · {club.country}</span>}</td>
                    <td className="muted">{club.members}</td>
                    <td style={{ fontWeight: 700 }}>{club.averageRating ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'countries' && (
        countries === null ? <Loading rows={2} /> : countries.length === 0 ? <Empty icon={<Globe size={26} />} title="No country data yet">Players who share their country appear here.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Country</th><th>Players</th><th>Top rating</th><th>Average</th></tr></thead>
              <tbody>
                {countries.map(row => (
                  <tr key={row.country}>
                    <td className="muted">{row.rank}</td>
                    <td style={{ fontWeight: 600 }}>{row.country}</td>
                    <td className="muted">{row.players}</td>
                    <td style={{ fontWeight: 700 }}>{row.topRating}</td>
                    <td className="muted">{row.averageRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Card className="mt-3" padded>
        <p className="tiny muted" style={{ margin: 0 }}>
          Divisions (Bronze, Silver, Gold, Platinum, Diamond, Master) are display labels used by SPEED CHESS. They are <strong>not</strong> official chess titles and carry no FIDE meaning.
        </p>
      </Card>
    </div>
  );
}
