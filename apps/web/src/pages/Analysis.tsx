import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Activity, ArrowLeft, AlertTriangle, Bot, ChevronLeft, ChevronRight, CircleDot, Download, Flame, Sparkles, Target, Upload, XCircle } from 'lucide-react';
import { api, ApiError, formatDateTime } from '../lib/api';
import { Alert, Badge, Button, Card, CardHead, Empty, Loading, Progress } from '../components/ui';
import { ChessBoard } from '../components/board/ChessBoard';

interface ClassifiedMove {
  ply: number; san: string; fen: string; evalCp: number;
  classification: 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';
  bestSan: string | null; lossCp: number; comment: string;
}

interface AnalysisPayload {
  moves: ClassifiedMove[];
  /** True when the full breakdown needs Premium; the headline numbers are still real. */
  locked?: boolean;
  previewMoves?: ClassifiedMove[];
  positions: string[];
  evalsWhite: number[];
  accuracyWhite: number;
  accuracyBlack: number;
  counts: Record<string, number>;
  opening: string | null;
  summary: string;
  gameId: string;
  white?: string;
  black?: string;
}

const CLASS_META: Record<string, { label: string; tone: string; color: string }> = {
  brilliant: { label: 'Brilliant', tone: 'purple', color: '#c084fc' },
  best: { label: 'Best', tone: 'success', color: '#22c55e' },
  good: { label: 'Good', tone: 'default', color: '#a6a6b0' },
  book: { label: 'Book', tone: 'muted', color: '#8b8b99' },
  inaccuracy: { label: 'Inaccuracy', tone: 'warning', color: '#f59e0b' },
  mistake: { label: 'Mistake', tone: 'warning', color: '#fb923c' },
  blunder: { label: 'Blunder', tone: 'error', color: '#ef4444' },
};

export function Analysis() {
  const { gameId } = useParams<{ gameId?: string }>();
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ply, setPly] = useState(0);
  const [pgn, setPgn] = useState('');
  const [importing, setImporting] = useState(false);
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'errors'>('all');

  useEffect(() => {
    api.get<{ games: any[] }>('/history?limit=12').then(d => setRecentGames(d.games)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gameId) { setAnalysis(null); return; }
    setLoading(true);
    setError('');
    api.get<{ analysis: AnalysisPayload }>(`/games/${gameId}/analysis`)
      .then(res => {
        setAnalysis(res.analysis);
        setPly(Math.max(0, res.analysis.positions.length - 1));
      })
      .catch(err => setError(err instanceof ApiError ? err.message : 'Analysis failed.'))
      .finally(() => setLoading(false));
  }, [gameId]);

  const currentFen = useMemo(() => {
    if (!analysis) return new Chess().fen();
    if (ply === 0) return analysis.positions[0];
    return analysis.positions[Math.min(ply, analysis.positions.length - 1)];
  }, [analysis, ply]);

  // Stepping is driven by the stored positions, so a locked (Premium) report can still be walked
  // through even though its per-move detail is withheld.
  const totalPlies = analysis ? Math.max(0, analysis.positions.length - 1) : 0;
  const move = analysis && ply > 0 ? analysis.moves[ply - 1] ?? null : null;
  const evalCp = analysis ? analysis.evalsWhite[Math.min(ply, analysis.evalsWhite.length - 1)] : 0;
  const evalPercent = Math.max(3, Math.min(97, 50 + (evalCp / 1000) * 50));

  const importPgn = async () => {
    if (pgn.trim().length < 10) { setError('Paste a PGN game first.'); return; }
    setImporting(true);
    setError('');
    try {
      const res = await api.post<{ gameId: string }>('/history/import', { pgn });
      window.location.assign(`/analysis/${res.gameId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That PGN could not be imported.');
    } finally { setImporting(false); }
  };

  if (!gameId) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <div className="eyebrow"><Activity size={13} style={{ verticalAlign: -2 }} /> Analysis</div>
            <h1>Game analysis</h1>
            <p>Engine-backed review of a finished game: evaluation at every move, accuracy, and every inaccuracy, mistake and blunder identified.</p>
          </div>
        </header>
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'start' }}>
          <Card>
            <CardHead title="Your finished games" subtitle="Analysis opens instantly for any game you played." />
            {recentGames.length === 0 ? (
              <Empty icon={<Activity size={24} />} title="No finished games" action={<Link to="/play" className="btn btn-primary btn-sm">Play a game</Link>}>
                Finish a game and it will appear here for review.
              </Empty>
            ) : (
              <div>
                {recentGames.map(game => (
                  <Link key={game.id} to={`/analysis/${game.id}`} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className={`badge ${game.result === 'win' ? 'badge-success' : game.result === 'loss' ? 'badge-error' : 'badge-muted'}`} style={{ width: 44, justifyContent: 'center' }}>{game.result}</span>
                    <span className="grow">
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '.88rem' }}>vs {game.opponent}</span>
                      <span className="tiny muted">{game.category} · {game.opening ?? 'unknown opening'} · {formatDateTime(game.playedAt)}</span>
                    </span>
                    <ChevronRight size={14} />
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHead title="Analyse any PGN" subtitle="Paste a game from another platform or a club sheet." action={<Upload size={15} style={{ color: 'var(--lavender)' }} />} />
            <textarea className="textarea" style={{ minHeight: 160, fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }}
              placeholder={`[Event "Club game"]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6`} value={pgn} onChange={e => setPgn(e.target.value)} aria-label="PGN to import" />
            {error && <div className="form-error mt-1">{error}</div>}
            <Button className="mt-2" onClick={importPgn} loading={importing} icon={<Upload size={15} />}>Import and analyse</Button>
            <p className="tiny muted mt-2" style={{ marginBottom: 0 }}>Imported games are private to your account and are not rated.</p>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page"><Card><CardHead title="Analysing your game…" subtitle="The engine reviews every move. Longer games take a few seconds." /><Progress value={100} /><div className="skeleton mt-2" style={{ height: 60 }} /></Card></div>;
  if (error) return <div className="page"><Alert tone="error" title="Analysis unavailable">{error}</Alert><Link to="/analysis" className="btn btn-secondary mt-2"><ArrowLeft size={15} /> Back to analysis</Link></div>;
  if (!analysis) return <div className="page"><Loading rows={2} /></div>;

  const visibleMoves = filter === 'errors'
    ? analysis.moves.filter(m => ['inaccuracy', 'mistake', 'blunder'].includes(m.classification))
    : analysis.moves;

  return (
    <div className="page">
      <div className="row-between wrap mb-2">
        <Link to="/analysis" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> All analyses</Link>
        <div className="row" style={{ gap: 8 }}>
          {analysis.opening && <Badge tone="purple">{analysis.opening}</Badge>}
          <a className="btn btn-secondary btn-sm" href={`/api/games/${analysis.gameId}/pgn`} download><Download size={14} /> PGN</a>
        </div>
      </div>

      <Card className="mb-2" style={{ marginBottom: 16 }}>
        <div className="row-between wrap" style={{ gap: 18 }}>
          <div className="row" style={{ gap: 22 }}>
            <div className="stat"><span className="stat-value" style={{ color: '#86efac' }}>{analysis.accuracyWhite}%</span><span className="stat-label">White accuracy</span></div>
            <div className="stat"><span className="stat-value" style={{ color: '#fca5a5' }}>{analysis.accuracyBlack}%</span><span className="stat-label">Black accuracy</span></div>
            <div className="stat"><span className="stat-value">{totalPlies}</span><span className="stat-label">Moves analysed</span></div>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {Object.entries(analysis.counts).map(([key, value]) => (
              <span key={key} className={`badge badge-${CLASS_META[key]?.tone ?? 'muted'}`}>{CLASS_META[key]?.label ?? key}: {value}</span>
            ))}
          </div>
        </div>
        <p className="small mt-2" style={{ color: '#d6d6de', margin: '12px 0 0' }}>{analysis.summary}</p>
      </Card>

      {analysis.locked && (
        <Card className="mb-2" style={{ marginBottom: 16 }}>
          <div className="row-between wrap" style={{ gap: 12 }}>
            <div>
              <strong>Move-by-move review is a Premium feature</strong>
              <p className="small muted" style={{ margin: '6px 0 0' }}>
                Accuracy, the evaluation graph and the opening name above are real results from this game.
                Upgrade to unlock each move's classification, the best move you missed and written insights.
                Games against the computer stay free.
              </p>
            </div>
            <Link to="/pricing" className="btn btn-primary btn-sm">See plans</Link>
          </div>
        </Card>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div>
          <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
            <div className="evalbar" style={{ height: 'auto', minHeight: 320 }} aria-label={`Evaluation ${evalCp > 0 ? 'favouring White' : evalCp < 0 ? 'favouring Black' : 'equal'}`}>
              <div style={{ height: `${evalPercent}%` }} />
            </div>
            <div className="grow">
              <ChessBoard
                fen={currentFen}
                interactive={false}
                lastMove={lastMoveHint(analysis, ply)}
                ariaLabel="Analysis board"
              />
            </div>
          </div>
          <div className="row-between mt-2">
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="secondary" onClick={() => setPly(0)} disabled={ply === 0}>Start</Button>
              <Button size="sm" variant="ghost" onClick={() => setPly(p => Math.max(0, p - 1))} disabled={ply === 0} icon={<ChevronLeft size={15} />}>Prev</Button>
              <Button size="sm" variant="ghost" onClick={() => setPly(p => Math.min(totalPlies, p + 1))} disabled={ply >= totalPlies}>Next <ChevronRight size={15} /></Button>
              <Button size="sm" variant="secondary" onClick={() => setPly(totalPlies)}>End</Button>
            </div>
            <span className="small" style={{ fontWeight: 700, color: evalCp > 40 ? '#e8e6ef' : evalCp < -40 ? '#c084fc' : 'var(--muted)' }}>
              {evalCp > 0 ? '+' : ''}{(evalCp / 100).toFixed(2)} {Math.abs(evalCp) < 40 ? '(equal)' : evalCp > 0 ? 'White' : 'Black'}
            </span>
          </div>
          {move && (
            <Card className="mt-2" padded>
              <div className="row-between">
                <span className="row" style={{ gap: 8 }}>
                  <strong>Move {Math.ceil(move.ply / 2)}{move.ply % 2 === 0 ? '…' : '.'} {move.san}</strong>
                  <span className={`badge badge-${CLASS_META[move.classification].tone}`}>{CLASS_META[move.classification].label}</span>
                </span>
                {move.bestSan && move.bestSan !== move.san && <span className="small muted">Best: <strong style={{ color: '#86efac' }}>{move.bestSan}</strong></span>}
              </div>
              <p className="small" style={{ margin: '8px 0 0', color: '#cfcfd9' }}>{move.comment}</p>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card padded>
            <div className="row-between mb-2">
              <strong style={{ fontSize: '.9rem' }}>Move list</strong>
              <div className="btn-group">
                <button type="button" className={`chip ${filter === 'all' ? 'active' : ''}`} style={{ padding: '2px 10px' }} onClick={() => setFilter('all')}>All</button>
                <button type="button" className={`chip ${filter === 'errors' ? 'active' : ''}`} style={{ padding: '2px 10px' }} onClick={() => setFilter('errors')}>Errors only</button>
              </div>
            </div>
            <div className="movelist" style={{ maxHeight: 420 }}>
              {visibleMoves.length === 0 ? <p className="small muted">No errors found — a clean game.</p> : visibleMoves.map(item => (
                <button
                  key={item.ply}
                  type="button"
                  onClick={() => setPly(item.ply)}
                  className="list-row"
                  style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid #26262f', cursor: 'pointer', textAlign: 'left', color: 'inherit', padding: '8px 2px' }}
                >
                  <span className="tiny muted" style={{ width: 42 }}>{Math.ceil(item.ply / 2)}{item.ply % 2 ? '.' : '…'}</span>
                  <span style={{ fontWeight: 600, width: 56 }}>{item.san}</span>
                  <span className={`badge badge-${CLASS_META[item.classification].tone}`} style={{ flex: '0 0 auto' }}>{CLASS_META[item.classification].label}</span>
                  <span className="grow" />
                  {item.lossCp > 0 && <span className="tiny muted">−{(item.lossCp / 100).toFixed(1)}</span>}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="What this game teaches" action={<Sparkles size={15} style={{ color: 'var(--lavender)' }} />} />
            {analysis.locked ? (
              <p className="small muted" style={{ margin: 0 }}>
                Written insights come from the move-by-move review, so they unlock with Premium. Your
                accuracy numbers above are already exact.
              </p>
            ) : (
            <div className="stack" style={{ gap: 10 }}>
              {buildInsights(analysis).map(insight => (
                <div key={insight.title} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: insight.color, flex: '0 0 auto', marginTop: 2 }}>{insight.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.86rem' }}>{insight.title}</div>
                    <div className="tiny muted">{insight.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            )}
            <div className="row mt-2">
              <Link to="/coach" className="btn btn-secondary btn-sm"><Bot size={14} /> Ask the coach</Link>
              <Link to="/training" className="btn btn-ghost btn-sm">Train this weakness</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function lastMoveHint(analysis: AnalysisPayload, ply: number): { from: string; to: string } | null {
  if (ply < 1) return null;
  const uci = analysis.moves[ply - 1]?.san;
  if (!uci) return null;
  // Derive the from/to squares by replaying the move on the previous position.
  try {
    const previous = new Chess(analysis.positions[ply - 1]);
    const played = previous.move(uci);
    return { from: played.from, to: played.to };
  } catch { return null; }
}

function buildInsights(analysis: AnalysisPayload) {
  const out: Array<{ title: string; detail: string; color: string; icon: JSX.Element }> = [];
  const blunders = analysis.moves.filter(m => m.classification === 'blunder');
  const mistakes = analysis.moves.filter(m => m.classification === 'mistake');
  if (blunders.length > 0) {
    out.push({ title: `${blunders.length} blunder${blunders.length > 1 ? 's' : ''}`, detail: `First at move ${Math.ceil(blunders[0].ply / 2)} (${blunders[0].san}). Run the CCT scan before every move.`, color: 'var(--error)', icon: <XCircle size={16} /> });
  }
  if (mistakes.length > 0) {
    out.push({ title: `${mistakes.length} mistake${mistakes.length > 1 ? 's' : ''}`, detail: `Most came around move ${Math.ceil(mistakes[0].ply / 2)}. Check undefended pieces before committing.`, color: 'var(--warning)', icon: <AlertTriangle size={16} /> });
  }
  const bestCount = (analysis.counts.best ?? 0) + (analysis.counts.brilliant ?? 0);
  if (bestCount > 0) {
    out.push({ title: `${bestCount} best moves`, detail: 'Your strongest moves are marked "best" in the move list — study them to see what you saw correctly.', color: 'var(--success)', icon: <Target size={16} /> });
  }
  if (analysis.opening) {
    out.push({ title: `Opening: ${analysis.opening}`, detail: 'Book moves are marked separately so you can see where theory ended and your own plans began.', color: 'var(--lavender)', icon: <CircleDot size={16} /> });
  }
  const avg = (analysis.accuracyWhite + analysis.accuracyBlack) / 2;
  out.push({ title: `Average accuracy ${Math.round(avg)}%`, detail: avg >= 85 ? 'High accuracy — your decisions were consistent.' : avg >= 65 ? 'Solid. Reducing one blunder per game would lift this immediately.' : 'Focus on simple safety checks before every move; that is the fastest path upward.', color: '#e8e6ef', icon: <Flame size={16} /> });
  return out.slice(0, 4);
}
