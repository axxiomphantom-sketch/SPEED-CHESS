import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Library, Search } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Badge, Button, Card, CardHead, Empty, Loading, Tabs } from '../components/ui';
import { ChessBoard, MiniBoard } from '../components/board/ChessBoard';

interface Opening {
  id: string; eco: string; name: string; family: string; moves: string; plans: string; traps: string | null; side: string;
}

export function Openings() {
  const { id } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [families, setFamilies] = useState<Array<{ family: string; count: number }>>([]);
  const [family, setFamily] = useState('all');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<(Opening & { steps: Array<{ san: string; fen: string }>; saved: boolean }) | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [repertoire, setRepertoire] = useState<Opening[]>([]);
  const [tab, setTab] = useState<'library' | 'repertoire'>('library');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (family !== 'all') params.set('family', family);
    if (query.trim()) params.set('q', query.trim());
    api.get<{ openings: Opening[]; families: any[] }>(`/openings?${params.toString()}`)
      .then(d => { setOpenings(d.openings); setFamilies(d.families); })
      .catch(() => setOpenings([]));
  }, [family, query]);

  useEffect(() => {
    if (!id) { setDetail(null); return; }
    api.get<{ opening: any }>(`/openings/${id}`).then(d => { setDetail(d.opening); setStepIndex(d.opening.steps.length); }).catch(() => setError('Opening not found.'));
  }, [id]);

  useEffect(() => {
    if (user) api.get<{ repertoire: Opening[] }>('/openings/repertoire/mine').then(d => setRepertoire(d.repertoire)).catch(() => {});
  }, [user, detail]);

  const toggleSave = async () => {
    if (!detail) return;
    try {
      const res = await api.post<{ saved: boolean }>(`/openings/${detail.id}/repertoire`);
      setDetail({ ...detail, saved: res.saved });
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not update your repertoire.'); }
  };

  const boardFen = detail ? (stepIndex === 0 ? new Chess().fen() : detail.steps[stepIndex - 1]?.fen ?? new Chess().fen()) : '';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Library size={13} style={{ verticalAlign: -2 }} /> Openings</div>
          <h1>Opening explorer</h1>
          <p>Learn the ideas behind the openings — the plans and the traps, not just the move list. Save what you study to your personal repertoire.</p>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      <Tabs value={tab} onChange={setTab} label="Opening sections" tabs={[
        { id: 'library', label: 'Library', count: openings?.length },
        { id: 'repertoire', label: 'My repertoire', count: repertoire.length },
      ]} />

      {tab === 'library' && (
        <div className="grid" style={{ gridTemplateColumns: detail ? 'minmax(0, 1fr) minmax(0, 1.05fr)' : '1fr', alignItems: 'start' }}>
          <div className="stack">
            <Card padded>
              <div className="row" style={{ gap: 8 }}>
                <div className="search-box" style={{ maxWidth: 'none' }}>
                  <Search size={15} />
                  <input className="input" placeholder="Search openings (e.g. Sicilian, d4)" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search openings" />
                </div>
              </div>
              <div className="chip-row mt-2">
                <button type="button" className={`chip ${family === 'all' ? 'active' : ''}`} onClick={() => setFamily('all')}>All families</button>
                {families.map(f => (
                  <button key={f.family} type="button" className={`chip ${family === f.family ? 'active' : ''}`} onClick={() => setFamily(f.family)}>
                    {f.family} <span className="tiny muted">{f.count}</span>
                  </button>
                ))}
              </div>
            </Card>
            {openings === null ? <Loading rows={2} /> : openings.length === 0 ? (
              <Empty icon={<Library size={26} />} title="No openings found">Try another search term or family.</Empty>
            ) : (
              <div className="grid grid-auto">
                {openings.map(opening => (
                  <Card key={opening.id} hover>
                    <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                      <MiniBoard fen={fenAfter(opening.moves)} size={92} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row-between">
                          <Badge tone="muted">{opening.eco}</Badge>
                          <span className="tiny muted">{opening.family}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '.9rem', margin: '4px 0 2px' }}>{opening.name}</div>
                        <div className="tiny muted" style={{ fontFamily: 'ui-monospace, monospace' }}>{opening.moves}</div>
                        <Button size="sm" variant="secondary" className="mt-1" onClick={() => navigate(`/openings/${opening.id}`)}>
                          Explore
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {detail && (
            <div className="stack">
              <Card>
                <div className="row-between mb-2">
                  <div>
                    <Badge tone="purple">{detail.eco}</Badge> <span className="tiny muted">{detail.family}</span>
                    <h3 style={{ margin: '4px 0 0' }}>{detail.name}</h3>
                  </div>
                  <Button size="sm" variant={detail.saved ? 'success' : 'secondary'} onClick={toggleSave}
                    icon={detail.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}>
                    {detail.saved ? 'Saved' : 'Save'}
                  </Button>
                </div>
                <ChessBoard fen={boardFen} interactive={false} ariaLabel={`${detail.name} mainline position`} />
                <div className="row-between mt-2">
                  <Button size="sm" variant="ghost" onClick={() => setStepIndex(Math.max(0, stepIndex - 1))} disabled={stepIndex === 0} icon={<ChevronLeft size={14} />}>Back</Button>
                  <span className="small muted">{stepIndex} / {detail.steps.length} moves</span>
                  <Button size="sm" variant="ghost" onClick={() => setStepIndex(Math.min(detail.steps.length, stepIndex + 1))} disabled={stepIndex >= detail.steps.length}>
                    Next <ChevronRight size={14} />
                  </Button>
                </div>
                <div className="row wrap" style={{ gap: 5, marginTop: 10 }}>
                  {detail.steps.map((step, i) => (
                    <button key={i} type="button" className={`chip ${stepIndex === i + 1 ? 'active' : ''}`} style={{ padding: '2px 8px', fontSize: '.76rem' }} onClick={() => setStepIndex(i + 1)}>
                      {i % 2 === 0 ? `${i / 2 + 1}.` : ''}{step.san}
                    </button>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHead title="Plans and ideas" />
                <p className="small" style={{ color: '#cfcfd9', margin: 0 }}>{detail.plans}</p>
                {detail.traps && (
                  <div className="alert alert-warning mt-2">
                    <span><strong>Trap to know:</strong> {detail.traps}</span>
                  </div>
                )}
              </Card>
              <Card padded>
                <div className="row-between">
                  <span className="small muted">Play this opening against the computer</span>
                  <a href="/play?mode=computer" className="btn btn-secondary btn-sm">Practise</a>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {tab === 'repertoire' && (
        repertoire.length === 0 ? (
          <Empty icon={<Bookmark size={26} />} title="Your repertoire is empty">
            Open any opening and press Save to build your personal study list.
          </Empty>
        ) : (
          <div className="grid grid-auto">
            {repertoire.map(opening => (
              <Card key={opening.id} hover>
                <Badge tone="purple">{opening.eco}</Badge>
                <h4 style={{ margin: '8px 0 2px' }}>{opening.name}</h4>
                <div className="tiny muted" style={{ fontFamily: 'ui-monospace, monospace' }}>{opening.moves}</div>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => { setTab('library'); navigate(`/openings/${opening.id}`); }}>Study</Button>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function fenAfter(moves: string): string {
  try {
    const chess = new Chess();
    for (const san of moves.split(' ').filter(Boolean)) chess.move(san);
    return chess.fen();
  } catch { return new Chess().fen(); }
}
