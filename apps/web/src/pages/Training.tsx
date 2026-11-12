import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Lightbulb, Puzzle, RotateCcw, SkipForward, Timer } from 'lucide-react';
import { api, ApiError, duration } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Badge, Button, Card, CardHead, Empty, Loading, Progress, Stat, Tabs } from '../components/ui';
import { ChessBoard, MiniBoard } from '../components/board/ChessBoard';

interface PuzzleSummary {
  id: string; fen: string; rating: number; themes: string[]; title: string | null;
  difficulty: string; sideToMove: string; explanation: string | null;
}

interface PuzzleStats {
  attempted: number; solved: number; accuracy: number; averageSeconds: number; streak: number; puzzleRating: number;
}

export function Training() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [tab, setTab] = useState<'solve' | 'browse' | 'stats'>('solve');
  const [difficulty, setDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [theme, setTheme] = useState<string>('');
  const [puzzles, setPuzzles] = useState<PuzzleSummary[] | null>(null);
  const [themes, setThemes] = useState<Array<{ name: string; count: number }>>([]);
  const [stats, setStats] = useState<PuzzleStats | null>(null);
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState<PuzzleSummary | null>(null);
  const [fen, setFen] = useState('');
  const [ply, setPly] = useState(0);
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong' | 'solved'>('idle');
  const [feedback, setFeedback] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [solution, setSolution] = useState<string[] | null>(null);

  const loadPuzzles = useCallback(async () => {
    const query = new URLSearchParams({ limit: '30' });
    if (difficulty !== 'all') query.set('difficulty', difficulty);
    if (theme) query.set('theme', theme);
    try {
      const res = await api.get<{ puzzles: PuzzleSummary[] }>(`/puzzles?${query.toString()}`);
      setPuzzles(res.puzzles);
      setIndex(0);
    } catch { setPuzzles([]); }
  }, [difficulty, theme]);

  useEffect(() => { loadPuzzles(); }, [loadPuzzles]);
  useEffect(() => { api.get<{ themes: any[] }>('/puzzles/themes').then(d => setThemes(d.themes)).catch(() => {}); }, []);
  useEffect(() => { if (user) api.get<PuzzleStats>('/puzzles/stats').then(setStats).catch(() => {}); }, [user]);

  // Daily puzzle flow: load it directly when ?daily=1.
  useEffect(() => {
    if (params.get('daily') !== '1') return;
    api.get<{ puzzle: PuzzleSummary | null; solvedToday?: boolean }>('/puzzles/daily').then(res => {
      if (res.puzzle) { begin(res.puzzle); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, user]);

  const begin = (puzzle: PuzzleSummary) => {
    setActive(puzzle);
    setFen(puzzle.fen);
    setPly(0);
    setStatus('idle');
    setFeedback('');
    setHintsUsed(0);
    setHint('');
    setSolution(null);
    setStartedAt(Date.now());
    setError('');
  };

  useEffect(() => {
    if (active || !puzzles || puzzles.length === 0) return;
    begin(puzzles[index]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzles, index, active]);

  const onMove = async (move: { from: string; to: string; promotion?: string }) => {
    if (!active || status === 'solved') return;
    try {
      const res = await api.post<{ correct: boolean; complete?: boolean; reply?: string | null; fen?: string; nextPly?: number; explanation?: string; hint?: string; error?: string }>(
        `/puzzles/${active.id}/check`,
        { ...move, ply, hintsUsed, ms: Date.now() - startedAt },
      );
      if (!res.correct) {
        // Show the attempted move on the board so the learner sees why it failed.
        const chess = new Chess(fen);
        try { chess.move({ from: move.from, to: move.to, promotion: (move.promotion as any) ?? 'q' }); setFen(chess.fen()); } catch { /* ignore */ }
        setStatus('wrong');
        setFeedback(res.hint ?? res.error ?? 'That move does not solve the puzzle. Reset and try another idea.');
        return;
      }
      setStatus('correct');
      setFen(res.fen ?? fen);
      setPly(res.nextPly ?? ply + 1);
      if (res.complete) {
        setStatus('solved');
        setFeedback(res.explanation ?? 'Solved.');
        api.get<PuzzleStats>('/puzzles/stats').then(setStats).catch(() => {});
      } else {
        setFeedback(res.reply ? `Correct. Your opponent replies ${res.reply}.` : 'Correct.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check that move.');
    }
  };

  const reset = () => { if (active) begin(active); };
  const nextPuzzle = () => {
    if (!puzzles || puzzles.length === 0) return;
    const nextIndex = (index + 1) % puzzles.length;
    setIndex(nextIndex);
    begin(puzzles[nextIndex]);
  };

  const requestHint = async () => {
    if (!active) return;
    try {
      const res = await api.post<{ hint: string }>(`/puzzles/${active.id}/hint`, { ply });
      setHint(res.hint);
      setHintsUsed(h => h + 1);
    } catch { setHint('Look for a forcing move — a check or a capture.'); }
  };

  const revealSolution = async () => {
    if (!active) return;
    try {
      const res = await api.get<{ solution: string[]; explanation: string }>(`/puzzles/${active.id}/solution`);
      setSolution(res.solution);
      setFeedback(res.explanation);
      setStatus('solved');
      await api.post(`/puzzles/${active.id}/solve`, { hintsUsed, ms: Date.now() - startedAt }).catch(() => {});
      api.get<PuzzleStats>('/puzzles/stats').then(setStats).catch(() => {});
    } catch { /* ignore */ }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Puzzle size={13} style={{ verticalAlign: -2 }} /> Training</div>
          <h1>Puzzles and tactics</h1>
          <p>Every position is validated before it is published, so each puzzle has a proven solution. The platform answers the defensive moves for you and confirms each correct continuation.</p>
        </div>
        {stats && (
          <div className="row wrap" style={{ gap: 18 }}>
            <Stat label="Solved" value={stats.solved} />
            <Stat label="Accuracy" value={`${stats.accuracy}%`} />
            <Stat label="Streak" value={stats.streak} hint="days" />
            <Stat label="Puzzle rating" value={stats.puzzleRating} />
          </div>
        )}
      </header>

      <Tabs value={tab} onChange={setTab} label="Training sections" tabs={[
        { id: 'solve', label: 'Solve' },
        { id: 'browse', label: 'Browse library', count: puzzles?.length },
        { id: 'stats', label: 'My progress' },
      ]} />

      {error && <div className="form-error" role="alert">{error}</div>}

      {tab === 'solve' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card>
            {!active ? <Loading rows={2} /> : (
              <>
                <div className="row-between mb-2">
                  <div>
                    <Badge tone="purple">{active.themes[0] ?? 'tactic'}</Badge>{' '}
                    <Badge tone="muted">{active.difficulty}</Badge>{' '}
                    <Badge tone="muted">{active.rating}</Badge>
                  </div>
                  <span className="small muted row" style={{ gap: 5 }}><Timer size={13} /> {Math.floor((Date.now() - startedAt) / 1000)}s</span>
                </div>
                <h3 style={{ marginBottom: 6 }}>{active.title ?? 'Find the best move'}</h3>
                <p className="small muted">
                  {active.sideToMove === 'w' ? 'White' : 'Black'} to move. {status === 'solved' ? 'Solved — review the explanation below.' : 'Play the winning continuation.'}
                </p>
                <ChessBoard
                  fen={fen}
                  orientation={active.sideToMove === 'w' ? 'white' : 'black'}
                  onMove={onMove}
                  interactive={status !== 'solved'}
                  ariaLabel="Puzzle board"
                />
                <div className="row wrap mt-2">
                  <Button size="sm" variant="secondary" onClick={reset} icon={<RotateCcw size={14} />}>Reset</Button>
                  <Button size="sm" variant="secondary" onClick={requestHint} icon={<Lightbulb size={14} />}>Hint</Button>
                  <Button size="sm" variant="ghost" onClick={revealSolution}>Show solution</Button>
                  <div className="grow" />
                  <Button size="sm" variant="primary" onClick={nextPuzzle} icon={<SkipForward size={14} />}>Next puzzle</Button>
                </div>
              </>
            )}
          </Card>

          <div className="stack">
            {feedback && (
              <Alert tone={status === 'solved' ? 'success' : status === 'wrong' ? 'error' : 'info'}
                title={status === 'solved' ? 'Solved' : status === 'wrong' ? 'Not the move' : 'Good move'}>
                {feedback}
              </Alert>
            )}
            {hint && <Alert tone="warning" title="Hint">{hint}</Alert>}
            {solution && (
              <Card>
                <CardHead title="Solution" />
                <div className="row wrap" style={{ gap: 6 }}>
                  {solution.map((san, i) => (
                    <span key={i} className={`badge ${i % 2 === 0 ? 'badge-purple' : 'badge-muted'}`}>{san}</span>
                  ))}
                </div>
              </Card>
            )}
            <Card>
              <CardHead title="Filters" />
              <div className="field">
                <label>Difficulty</label>
                <div className="chip-row">
                  {(['all', 'easy', 'medium', 'hard'] as const).map(d => (
                    <button key={d} type="button" className={`chip ${difficulty === d ? 'active' : ''}`} onClick={() => setDifficulty(d)}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Theme</label>
                <div className="chip-row">
                  <button type="button" className={`chip ${theme === '' ? 'active' : ''}`} onClick={() => setTheme('')}>All</button>
                  {themes.slice(0, 10).map(t => (
                    <button key={t.name} type="button" className={`chip ${theme === t.name ? 'active' : ''}`} onClick={() => setTheme(t.name)}>
                      {t.name} <span className="tiny muted">{t.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>
            <Card>
              <CardHead title="How puzzles work here" />
              <ul className="small muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
                <li>You always move first; the platform plays the defence.</li>
                <li>Solutions are checked on the server, never in the browser.</li>
                <li>Hints are available — using one is recorded, not punished.</li>
                <li>Daily puzzles do not punish you for a missed day.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {tab === 'browse' && (
        <>
          <div className="chip-row mb-2" style={{ marginBottom: 14 }}>
            {(['all', 'easy', 'medium', 'hard'] as const).map(d => (
              <button key={d} type="button" className={`chip ${difficulty === d ? 'active' : ''}`} onClick={() => setDifficulty(d)}>{d}</button>
            ))}
          </div>
          {puzzles === null ? <Loading rows={2} /> : puzzles.length === 0 ? (
            <Empty icon={<Puzzle size={26} />} title="No puzzles match those filters">Try another difficulty or theme.</Empty>
          ) : (
            <div className="grid grid-auto">
              {puzzles.map(puzzle => (
                <Card key={puzzle.id} hover>
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <MiniBoard fen={puzzle.fen} size={104} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{puzzle.title ?? 'Puzzle'}</div>
                      <div className="tiny muted">{puzzle.difficulty} · rating {puzzle.rating}</div>
                      <div className="chip-row mt-1">
                        {puzzle.themes.slice(0, 2).map(t => <span key={t} className="badge badge-muted">{t}</span>)}
                      </div>
                      <Button size="sm" variant="secondary" className="mt-1" onClick={() => { setTab('solve'); begin(puzzle); }}>Solve</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'stats' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Puzzle performance" subtitle="From your recorded attempts" />
            {!stats ? <Loading rows={1} /> : (
              <>
                <div className="kpi-strip mb-2" style={{ marginBottom: 16 }}>
                  <div className="kpi"><div className="stat-value">{stats.attempted}</div><div className="stat-label">Attempted</div></div>
                  <div className="kpi"><div className="stat-value" style={{ color: 'var(--success)' }}>{stats.solved}</div><div className="stat-label">Solved</div></div>
                  <div className="kpi"><div className="stat-value">{stats.accuracy}%</div><div className="stat-label">Accuracy</div></div>
                </div>
                <div className="row-between small"><span className="muted">Average time</span><span style={{ fontWeight: 600 }}>{duration(stats.averageSeconds)}</span></div>
                <div className="row-between small mt-1"><span className="muted">Current daily streak</span><span style={{ fontWeight: 600 }}>{stats.streak} days</span></div>
                <div className="row-between small mt-1"><span className="muted">Puzzle rating</span><span style={{ fontWeight: 600 }}>{stats.puzzleRating}</span></div>
                <div className="mt-2">
                  <div className="row-between tiny muted" style={{ marginBottom: 4 }}><span>Attempted</span><span>Solved</span></div>
                  <Progress value={stats.attempted ? (stats.solved / stats.attempted) * 100 : 0} className="progress-success" />
                </div>
              </>
            )}
          </Card>
          <Card>
            <CardHead title="Training routine that works" />
            <ol className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 8, color: '#cfcfd9' }}>
              <li><strong>Five puzzles a day</strong> beats fifty in one sitting — pattern recognition needs repetition over time.</li>
              <li><strong>Say the idea out loud:</strong> "knight fork", "pin on the queen", "back-rank mate". Naming the pattern is what makes it recognisable later.</li>
              <li><strong>Never guess.</strong> If you cannot see the solution in 60 seconds, take a hint — learning matters more than a clean streak.</li>
              <li><strong>Review your mistakes</strong> with Game Analysis, where the same engine explains what you missed.</li>
              <li><strong>Mix themes.</strong> Fork puzzles build different recognition from endgame puzzles.</li>
            </ol>
          </Card>
        </div>
      )}
    </div>
  );
}
