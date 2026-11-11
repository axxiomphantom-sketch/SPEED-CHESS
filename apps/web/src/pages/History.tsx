import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, History as HistoryIcon, Swords } from 'lucide-react';
import { api, duration, formatDateTime } from '../lib/api';
import { Button, Card, Empty, Loading } from '../components/ui';

interface HistoryGame {
  id: string; opponent: string; opponentRating: number | null; color: string; result: 'win' | 'loss' | 'draw';
  termination: string | null; category: string; mode: string; rated: boolean; opening: string | null;
  playedAt: string; durationSeconds: number | null; accuracy: number | null;
}

export function History() {
  const [games, setGames] = useState<HistoryGame[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ category: '', outcome: '', mode: '' });
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (filters.category) params.set('category', filters.category);
    if (filters.outcome) params.set('outcome', filters.outcome);
    if (filters.mode) params.set('mode', filters.mode);
    try {
      const res = await api.get<{ games: HistoryGame[]; total: number }>(`/history?${params.toString()}`);
      setGames(res.games);
      setTotal(res.total);
    } catch { setGames([]); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key: keyof typeof filters, value: string) => { setPage(0); setFilters(prev => ({ ...prev, [key]: prev[key] === value ? '' : value })); };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><HistoryIcon size={13} style={{ verticalAlign: -2 }} /> History</div>
          <h1>Game history</h1>
          <p>Every finished game with its result, opening, accuracy and length. Open any game for a full engine review or to export the PGN.</p>
        </div>
        <Link to="/analysis" className="btn btn-secondary">Import a PGN</Link>
      </header>

      <Card padded className="mb-2" style={{ marginBottom: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <div>
            <span className="label">Result</span>
            <div className="chip-row mt-1">
              {['win', 'draw', 'loss'].map(value => (
                <button key={value} type="button" className={`chip ${filters.outcome === value ? 'active' : ''}`} onClick={() => setFilter('outcome', value)}>
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Time control</span>
            <div className="chip-row mt-1">
              {['bullet', 'blitz', 'rapid', 'classical'].map(value => (
                <button key={value} type="button" className={`chip ${filters.category === value ? 'active' : ''}`} onClick={() => setFilter('category', value)}>
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Format</span>
            <div className="chip-row mt-1">
              {['online', 'computer', 'tournament', 'local'].map(value => (
                <button key={value} type="button" className={`chip ${filters.mode === value ? 'active' : ''}`} onClick={() => setFilter('mode', value)}>
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {games === null ? <Loading rows={3} /> : games.length === 0 ? (
        <Empty icon={<Swords size={26} />} title="No games match these filters" action={<Link to="/play" className="btn btn-primary btn-sm">Play a game</Link>}>
          Play a game or clear the filters to see your history.
        </Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Result</th><th>Opponent</th><th>Time control</th><th>Opening</th><th>Accuracy</th><th>Length</th><th>Played</th><th />
                </tr>
              </thead>
              <tbody>
                {games.map(game => (
                  <tr key={game.id}>
                    <td>
                      <span className={`badge ${game.result === 'win' ? 'badge-success' : game.result === 'loss' ? 'badge-error' : 'badge-muted'}`}>
                        {game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{game.opponent}</span>
                      {game.opponentRating && <span className="tiny muted"> ({game.opponentRating})</span>}
                      <div className="tiny muted">as {game.color} · {game.termination ?? '—'}{game.rated ? ' · rated' : ''}</div>
                    </td>
                    <td className="muted" style={{ textTransform: 'capitalize' }}>{game.category}<div className="tiny muted">{game.mode}</div></td>
                    <td className="muted small">{game.opening ?? '—'}</td>
                    <td>{game.accuracy !== null ? `${game.accuracy}%` : <span className="tiny muted">not analysed</span>}</td>
                    <td className="muted nowrap">{duration(game.durationSeconds)}</td>
                    <td className="muted tiny nowrap">{formatDateTime(game.playedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <Link to={`/analysis/${game.id}`} className="btn btn-sm btn-secondary">Analyse</Link>
                        <a href={`/api/games/${game.id}/pgn`} download className="btn btn-sm btn-ghost" aria-label="Download PGN"><Download size={14} /></a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-between mt-2">
            <span className="small muted">{total} games total · page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span>
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)} icon={<ChevronLeft size={14} />}>Previous</Button>
              <Button size="sm" variant="secondary" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next <ChevronRight size={14} /></Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
