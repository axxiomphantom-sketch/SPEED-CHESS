import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { ArrowLeft, Bot, Flag, Handshake, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { api, ApiError, formatClock, type GamePayload } from '../lib/api';
import { useAuth, usePrefs } from '../lib/auth';
import { Alert, Avatar, Badge, Button, Card, CardHead, ConfirmDialog, CopyButton, Modal } from '../components/ui';
import { ChessBoard } from '../components/board/ChessBoard';
import { useGameSocket } from '../hooks/useGameSocket';
import { useChessSound } from '../hooks/useChessSound';

const TERMINATION_TEXT: Record<string, string> = {
  checkmate: 'by checkmate', resignation: 'by resignation', timeout: 'on time', stalemate: 'by stalemate',
  agreement: 'by agreement', repetition: 'by threefold repetition', 'fifty-move': 'by the fifty-move rule',
  insufficient: 'by insufficient material', abandoned: 'abandoned', imported: 'imported game',
};

export function GameRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const { prefs } = usePrefs();
  const [game, setGame] = useState<GamePayload | null>(null);
  const [viewerSide, setViewerSide] = useState<'w' | 'b' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<null | 'resign' | 'abort'>(null);
  const [drawOffer, setDrawOffer] = useState(false);
  const [engineThinking, setEngineThinking] = useState(false);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [orientationFlip, setOrientationFlip] = useState(false);
  const playSound = useChessSound();
  const engineBusy = useRef(false);
  const localClocks = useRef<{ white: number; black: number } | null>(null);
  const [displayClocks, setDisplayClocks] = useState<{ white: number; black: number } | null>(null);
  const lastUpdated = useRef<number>(Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<{ game: GamePayload; viewerSide: 'w' | 'b' | null }>(`/games/${id}`);
      setGame(res.game);
      setViewerSide(res.viewerSide);
      localClocks.current = res.game.clocks;
      lastUpdated.current = Date.now();
      setDisplayClocks(res.game.clocks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this game.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useGameSocket(msg => {
    if (msg.game && msg.game.id === id) {
      setGame(msg.game);
      localClocks.current = msg.game.clocks;
      lastUpdated.current = Date.now();
      setDisplayClocks(msg.game.clocks);
      if (msg.type === 'game:move') playSound(msg.game.moves.at(-1)?.is_capture ? 'capture' : 'check');
      if (msg.type === 'game:finished') { playSound('end'); refresh(); }
    }
    if (msg.type === 'game:draw-offer' && msg.gameId === id) setDrawOffer(true);
    if (msg.type === 'game:draw-declined') setNotice('Your draw offer was declined.');
    if (msg.type === 'game:joined') setNotice('Your opponent has joined the game.');
  }, id, true);

  // Local clock tick for a smooth display between server frames.
  useEffect(() => {
    if (!game || game.status !== 'active') return;
    const timer = window.setInterval(() => {
      if (!localClocks.current) return;
      const elapsed = Date.now() - lastUpdated.current;
      setDisplayClocks({
        white: game.turn === 'w' ? Math.max(0, localClocks.current.white - elapsed) : localClocks.current.white,
        black: game.turn === 'b' ? Math.max(0, localClocks.current.black - elapsed) : localClocks.current.black,
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [game]);

  const fen = reviewPly !== null && game?.moves[reviewPly] ? game.moves[reviewPly].fen_after : game?.fen ?? new Chess().fen();

  const isComputerGame = game?.mode === 'computer';
  const isMyTurn = Boolean(game && game.status === 'active' && (
    game.mode === 'local' ? true
      : isComputerGame ? game.turn === 'w'
        : viewerSide === game.turn
  ));
  // Board faces the player's own colour; local games default to White and the flip button inverts it.
  const baseOrientation: 'white' | 'black' = viewerSide === 'b' ? 'black' : 'white';
  const boardOrientation: 'white' | 'black' = orientationFlip
    ? (baseOrientation === 'white' ? 'black' : 'white')
    : baseOrientation;

  // The server engine moves whenever it is Black's turn in a computer game.
  useEffect(() => {
    if (!game || !isComputerGame || game.status !== 'active' || game.turn !== 'b' || !viewerSide) return;
    if (engineBusy.current) return;
    engineBusy.current = true;
    setEngineThinking(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.post<{ game: GamePayload; engine: { move: string; depth: number } }>(`/games/${game.id}/engine-move`);
        setGame(res.game);
        localClocks.current = res.game.clocks;
        lastUpdated.current = Date.now();
        setDisplayClocks(res.game.clocks);
        playSound('move');
        if (res.game.status === 'finished') { playSound('end'); refresh(); }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The engine could not move.');
      } finally {
        engineBusy.current = false;
        setEngineThinking(false);
      }
    }, 420);
    return () => window.clearTimeout(timer);
  }, [game, isComputerGame, viewerSide, playSound, refresh]);

  const makeMove = useCallback(async (move: { from: string; to: string; promotion?: string }) => {
    if (!game || game.status !== 'active') return;
    setError('');
    setReviewPly(null);
    try {
      const res = await api.post<{ game: GamePayload; finished?: { result: string; termination: string } }>(`/games/${game.id}/move`, move);
      setGame(res.game);
      localClocks.current = res.game.clocks;
      lastUpdated.current = Date.now();
      setDisplayClocks(res.game.clocks);
      playSound(res.game.moves.at(-1)?.is_capture ? 'capture' : 'move');
      if (res.finished) { playSound('end'); refresh(); }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const payload = err.payload as any;
        if (payload?.game) setGame(payload.game);
      } else setError('That move could not be played.');
    }
  }, [game, playSound, refresh]);

  const resign = async () => {
    if (!game) return;
    setConfirm(null);
    try {
      const res = await api.post<{ game: GamePayload }>(`/games/${game.id}/resign`);
      setGame(res.game);
      playSound('end');
      refresh();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not resign.'); }
  };

  const offerDraw = async () => {
    if (!game) return;
    try {
      const res = await api.post<{ agreed: boolean; game?: GamePayload }>(`/games/${game.id}/draw`);
      if (res.agreed && res.game) { setGame(res.game); playSound('end'); refresh(); }
      else setNotice('Draw offered. Your opponent must accept.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not offer a draw.'); }
  };

  const acceptDraw = async () => {
    if (!game) return;
    try {
      const res = await api.post<{ agreed: boolean; game?: GamePayload }>(`/games/${game.id}/draw`);
      if (res.game) { setGame(res.game); setDrawOffer(false); playSound('end'); refresh(); }
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not accept the draw.'); }
  };

  const declineDraw = async () => {
    if (!game) return;
    await api.post(`/games/${game.id}/draw/decline`).catch(() => {});
    setDrawOffer(false);
  };

  if (loading) return <div className="page"><div className="skeleton" style={{ height: 420, borderRadius: 16 }} /></div>;
  if (!game) return <div className="page"><Alert tone="error" title="Game unavailable">{error || 'This game could not be found.'}</Alert></div>;

  const topPlayer = boardOrientation === 'white' ? game.black : game.white;
  const bottomPlayer = boardOrientation === 'white' ? game.white : game.black;
  const topClock = boardOrientation === 'white' ? displayClocks?.black : displayClocks?.white;
  const bottomClock = boardOrientation === 'white' ? displayClocks?.white : displayClocks?.black;
  const lastMovePair = game.moves.length
    ? { from: game.moves[game.moves.length - 1].uci.slice(0, 2), to: game.moves[game.moves.length - 1].uci.slice(2, 4) }
    : null;
  const waitingForOpponent = game.mode === 'online' && game.status === 'active' && !game.black.id;

  return (
    <div className="page">
      <div className="row-between wrap mb-2">
        <div className="row" style={{ gap: 10 }}>
          <Link to="/play" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Back</Link>
          <Badge tone="purple">{game.category}</Badge>
          <Badge tone={game.rated ? 'warning' : 'muted'}>{game.rated ? 'Rated' : 'Casual'}</Badge>
          <Badge tone="muted">{game.mode}</Badge>
          {game.opening && <Badge tone="muted">{game.opening}</Badge>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Button variant="secondary" size="sm" onClick={() => setOrientationFlip(v => !v)} type="button"><RotateCcw size={14} /> Flip</Button>
          {game.status === 'finished' && (
            <Link to={`/analysis/${game.id}`} className="btn btn-primary btn-sm">Analyse game</Link>
          )}
        </div>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="info">{notice}</Alert>}

      {game.status === 'finished' && (
        <Alert tone={game.result === 'draw' ? 'info' : 'success'} title={`Game finished — ${game.result === 'draw' ? 'Draw' : game.result === 'white' ? 'White wins' : 'Black wins'}`}>
          {TERMINATION_TEXT[game.termination ?? ''] ?? game.termination}
          {game.accuracy.white !== null && ` · Accuracy: White ${game.accuracy.white}% / Black ${game.accuracy.black}%`}
        </Alert>
      )}
      {waitingForOpponent && (
        <Alert tone="warning" title="Waiting for an opponent">
          Share the invite code <strong>{game.inviteCode}</strong> — the board unlocks as soon as someone joins.
        </Alert>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 330px', alignItems: 'start', marginTop: 12 }}>
        <div>
          <div className="player-strip mb-2" style={{ marginBottom: 8 }}>
            <div className="row" style={{ gap: 10 }}>
              <Avatar name={topPlayer.name} size="sm" online={false} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{topPlayer.name}</div>
                <div className="tiny muted">{topPlayer.rating ? `${topPlayer.rating} · ` : ''}{boardOrientation === 'white' ? 'Black' : 'White'}</div>
              </div>
            </div>
            <div className={`clock ${((boardOrientation === 'white' ? 'b' : 'w') === game.turn && game.status === 'active') ? 'active' : ''} ${(topClock ?? 99999) < 20000 ? 'low' : ''}`}>
              {formatClock(topClock)}
            </div>
          </div>

          <ChessBoard
            fen={fen}
            orientation={boardOrientation}
            theme={prefs.boardTheme}
            showCoordinates={prefs.showCoordinates}
            showLegalMoves={prefs.showLegalMoves}
            interactive={isMyTurn && game.status === 'active' && reviewPly === null && !waitingForOpponent}
            onMove={makeMove}
            lastMove={lastMovePair}
            ariaLabel={`Chess game: ${game.white.name} versus ${game.black.name}`}
          />

          <div className="player-strip mt-2" style={{ marginTop: 8 }}>
            <div className="row" style={{ gap: 10 }}>
              <Avatar name={bottomPlayer.name} size="sm" online={false} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{bottomPlayer.name}{bottomPlayer.id === user?.id && <span className="tiny muted"> (you)</span>}</div>
                <div className="tiny muted">{bottomPlayer.rating ? `${bottomPlayer.rating} · ` : ''}{boardOrientation === 'white' ? 'White' : 'Black'}</div>
              </div>
            </div>
            <div className={`clock ${((boardOrientation === 'white' ? 'w' : 'b') === game.turn && game.status === 'active') ? 'active' : ''} ${(bottomClock ?? 99999) < 20000 ? 'low' : ''}`}>
              {formatClock(bottomClock)}
            </div>
          </div>

          {engineThinking && (
            <div className="row mt-1 small muted" style={{ gap: 8 }}>
              <Bot size={15} /> Engine is thinking…
            </div>
          )}
          {isMyTurn && game.status === 'active' && !waitingForOpponent && (
            <div className="small mt-1" style={{ color: 'var(--lavender)', fontWeight: 600 }}>Your move</div>
          )}
        </div>

        <div className="stack">
          <Card padded>
            <div className="row-between mb-2">
              <strong style={{ fontSize: '.9rem' }}>Moves</strong>
              {reviewPly !== null && <Button size="sm" variant="ghost" onClick={() => setReviewPly(null)}>Back to live</Button>}
            </div>
            {game.moves.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>No moves yet. {isMyTurn ? 'You move first.' : 'Waiting for the first move.'}</p>
            ) : (
              <div className="movelist">
                {chunkPairs(game.moves.map(m => m.san)).map((pair, index) => (
                  <div className="movelist-row" key={index}>
                    <span className="movelist-num">{index + 1}.</span>
                    <span
                      className={reviewPly === index * 2 ? 'cur' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setReviewPly(index * 2)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setReviewPly(index * 2)}
                    >{pair[0]}</span>
                    {pair[1] && (
                      <span
                        className={reviewPly === index * 2 + 1 ? 'cur' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setReviewPly(index * 2 + 1)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && setReviewPly(index * 2 + 1)}
                      >{pair[1]}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="row-between mt-2">
              <Button size="sm" variant="secondary" disabled={game.moves.length === 0} onClick={() => setReviewPly(0)} type="button">Start</Button>
              <div className="row" style={{ gap: 4 }}>
                <Button size="sm" variant="ghost" type="button" disabled={reviewPly === null && game.moves.length <= 1}
                  onClick={() => setReviewPly(prev => Math.max(0, (prev ?? game.moves.length - 1) - 1))}>◀</Button>
                <Button size="sm" variant="ghost" type="button" disabled={reviewPly === null}
                  onClick={() => setReviewPly(prev => prev !== null && prev + 1 < game.moves.length ? prev + 1 : null)}>▶</Button>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setReviewPly(null)} type="button" disabled={reviewPly === null}>Live</Button>
            </div>
          </Card>

          {game.status === 'active' && (
            <Card padded>
              <strong style={{ fontSize: '.9rem', display: 'block', marginBottom: 10 }}>Game controls</strong>
              <div className="stack" style={{ gap: 8 }}>
                {game.mode !== 'local' && <Button variant="secondary" size="sm" block onClick={offerDraw} icon={<Handshake size={15} />}>Offer draw</Button>}
                {game.mode !== 'local' && <Button variant="danger" size="sm" block onClick={() => setConfirm('resign')} icon={<Flag size={15} />}>Resign</Button>}
                {(game.mode === 'computer' || game.mode === 'local') && (
                  <Button variant="secondary" size="sm" block onClick={() => setConfirm('abort')} icon={<X size={15} />}>End practice game</Button>
                )}
                <button className="btn btn-ghost btn-sm" type="button" onClick={async () => {
                  await api.post('/reports', { targetType: 'game', targetId: game.id, reason: 'cheating', details: 'Reported from the game room.' }).then(() => setNotice('Report submitted. Our moderators will review it.')).catch(() => {});
                }}><ShieldAlert size={14} /> Report this game</button>
              </div>
            </Card>
          )}

          {game.mode === 'online' && game.status === 'active' && game.inviteCode && (
            <Card padded>
              <CardHead title="Invite code" />
              <div className="row-between">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '.1em' }}>{game.inviteCode}</span>
                <CopyButton value={game.inviteCode} />
              </div>
            </Card>
          )}

          <Card padded>
            <CardHead title="Game details" />
            <div className="stack" style={{ gap: 6, fontSize: '.84rem' }}>
              <Row label="Time control" value={`${Math.round(game.initialSeconds / 60)}+${game.increment}`} />
              <Row label="Moves played" value={String(game.moves.length)} />
              <Row label="Opening" value={game.opening ?? 'Not yet identified'} />
              {game.tournamentId && <Row label="Tournament" value="Tournament game" />}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'resign'}
        title="Resign this game?"
        message="Your opponent will be awarded the win and your rating will update. This cannot be undone."
        confirmLabel="Resign"
        onConfirm={resign}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'abort'}
        title="End this practice game?"
        message="Practice games do not affect ratings. The game will be marked as abandoned."
        confirmLabel="End game"
        onConfirm={async () => {
          setConfirm(null);
          if (!game) return;
          await api.post(`/games/${game.id}/abort`).catch(() => {});
          navigate(game.mode === 'local' ? '/play' : '/dashboard');
        }}
        onCancel={() => setConfirm(null)}
      />
      <Modal open={drawOffer} onClose={() => setDrawOffer(false)} title="Draw offered"
        footer={<>
          <Button variant="secondary" onClick={declineDraw}>Decline</Button>
          <Button onClick={acceptDraw}>Accept draw</Button>
        </>}>
        <p className="small muted" style={{ margin: 0 }}>Your opponent offers a draw. If you accept, the game ends immediately as a draw.</p>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="row-between"><span className="muted">{label}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span></div>;
}

function chunkPairs<T>(items: T[]): Array<[T, T?]> {
  const out: Array<[T, T?]> = [];
  for (let i = 0; i < items.length; i += 2) out.push([items[i], items[i + 1]]);
  return out;
}
