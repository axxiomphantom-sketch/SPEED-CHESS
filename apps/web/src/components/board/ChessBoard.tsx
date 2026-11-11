import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { Piece } from './pieces';

export type BoardTheme = 'violet' | 'classic' | 'emerald' | 'slate' | 'midnight';

const THEME_LABELS: Record<BoardTheme, { light: string; dark: string; label: string }> = {
  violet: { light: 'var(--board-light)', dark: 'var(--board-dark)', label: 'Violet' },
  classic: { light: 'var(--board-light-alt)', dark: 'var(--board-dark-alt)', label: 'Classic' },
  emerald: { light: 'var(--board-light-slate)', dark: 'var(--board-dark-slate)', label: 'Slate' },
  slate: { light: 'var(--board-light-mid)', dark: 'var(--board-dark-mid)', label: 'Midnight' },
  midnight: { light: '#2a2833', dark: '#14121a', label: 'Dark' },
};

export const BOARD_THEMES = THEME_LABELS;

export interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  onMove?: (move: { from: string; to: string; promotion?: string }) => void;
  /** When false the board is read-only but still shows highlights. */
  interactive?: boolean;
  theme?: BoardTheme;
  showCoordinates?: boolean;
  showLegalMoves?: boolean;
  lastMove?: { from: string; to: string } | null;
  highlights?: string[];
  /** Highlights that pulse to show an idea (used by lessons). */
  spotlight?: string[];
  /** Restrict selectable squares (lesson exercises). */
  allowedFrom?: string[];
  checkSquare?: string | null;
  className?: string;
  ariaLabel?: string;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function findKingSquare(chess: Chess, color: 'w' | 'b'): string | null {
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type === 'k' && sq.color === color) return sq.square;
    }
  }
  return null;
}

export function ChessBoard({ fen, orientation = 'white', onMove, interactive = true, theme = 'violet', showCoordinates = true, showLegalMoves = true, lastMove = null, highlights = [], spotlight = [], allowedFrom, checkSquare, className = '', ariaLabel = 'Chessboard' }: ChessBoardProps) {
  const game = useMemo(() => {
    try { return new Chess(fen); } catch { return new Chess(); }
  }, [fen]);

  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSelected(null); setPendingPromotion(null); }, [fen]);

  const legalMoves = useMemo<Move[]>(() => {
    if (!selected) return [];
    return game.moves({ square: selected as any, verbose: true });
  }, [game, selected]);

  // The "highlight legal moves" preference is honoured here: when it is off, a selected piece
  // shows only its own highlight, not the destination hints.
  const moveTargets = useMemo(() => (showLegalMoves ? new Map(legalMoves.map(m => [m.to, m])) : new Map<string, Move>()), [legalMoves, showLegalMoves]);
  const kingInCheck = useMemo(() => {
    if (checkSquare) return checkSquare;
    if (!game.isCheck()) return null;
    return findKingSquare(game, game.turn());
  }, [game, checkSquare]);

  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? FILES : [...FILES].reverse();

  const tryMove = useCallback((from: string, to: string) => {
    const candidates = game.moves({ square: from as any, verbose: true }).filter(m => m.to === to);
    if (candidates.length === 0) return false;
    if (candidates.some(m => m.promotion)) {
      setPendingPromotion({ from, to });
      return true;
    }
    onMove?.({ from, to });
    setSelected(null);
    return true;
  }, [game, onMove]);

  const handleSquare = useCallback((square: string) => {
    if (!interactive) return;
    const piece = game.get(square as any);
    if (selected) {
      if (square === selected) { setSelected(null); return; }
      if (tryMove(selected, square)) return;
      if (piece && piece.color === game.turn()) {
        if (allowedFrom && !allowedFrom.includes(square)) return;
        setSelected(square);
        return;
      }
      setSelected(null);
      return;
    }
    if (piece && piece.color === game.turn()) {
      if (allowedFrom && !allowedFrom.includes(square)) return;
      setSelected(square);
    }
  }, [game, selected, tryMove, interactive, allowedFrom]);

  const onKeyDown = (event: React.KeyboardEvent, square: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSquare(square); }
  };

  return (
    <div className={`board-wrap ${className}`}>
      <div
        className="board"
        ref={boardRef}
        role="grid"
        aria-label={ariaLabel}
        style={{ background: THEME_LABELS[theme].dark }}
      >
        {ranks.map((rank, rIndex) =>
          files.map((file, fIndex) => {
            const square = `${file}${rank}` as Square;
            const isLight = (rIndex + fIndex) % 2 === 0;
            const piece = game.get(square);
            const isSelected = selected === square;
            const isTarget = moveTargets.has(square);
            const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
            const isHighlight = highlights.includes(square);
            const isSpotlight = spotlight.includes(square);
            const isCheck = kingInCheck === square;
            const classes = [
              'sq', isLight ? 'light' : 'dark',
              isSelected ? 'sel' : '', isLast ? 'last' : '',
              isTarget ? 'hint' : '', isTarget && piece ? 'capture' : '',
              isCheck ? 'check' : '',
            ].filter(Boolean).join(' ');
            const bg = isLight ? THEME_LABELS[theme].light : THEME_LABELS[theme].dark;
            return (
              <div
                key={square}
                className={classes}
                style={{
                  background: isHighlight ? 'rgba(121, 37, 217, .42)' : isSpotlight ? 'rgba(203, 167, 255, .38)' : bg,
                  boxShadow: isSpotlight ? 'inset 0 0 0 2px rgba(203,167,255,.85)' : undefined,
                }}
                role="gridcell"
                aria-label={describeSquare(square, piece)}
                aria-selected={isSelected}
                tabIndex={interactive ? 0 : -1}
                onClick={() => handleSquare(square)}
                onKeyDown={e => onKeyDown(e, square)}
                data-square={square}
              >
                {showCoordinates && fIndex === (orientation === 'white' ? 0 : 7) && (
                  <span className="coords-rank">{rank}</span>
                )}
                {showCoordinates && rIndex === 7 && (
                  <span className="coords-file">{file}</span>
                )}
                {piece && <Piece piece={`${piece.color === 'w' ? '' : ''}${piece.type}`} />}
              </div>
            );
          })
        )}
        {pendingPromotion && (
          <div className="promo-overlay" onClick={() => setPendingPromotion(null)}>
            <div className="promo-choices" onClick={e => e.stopPropagation()} role="dialog" aria-label="Choose a promotion piece">
              {(['q', 'r', 'b', 'n'] as const).map(type => (
                <button
                  key={type}
                  className="promo-choice"
                  onClick={() => {
                    onMove?.({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: type });
                    setPendingPromotion(null);
                    setSelected(null);
                  }}
                  aria-label={`Promote to ${type === 'q' ? 'queen' : type === 'r' ? 'rook' : type === 'b' ? 'bishop' : 'knight'}`}
                  type="button"
                >
                  <Piece piece={game.turn() === 'w' ? type.toUpperCase() : type} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function describeSquare(square: string, piece?: { color: string; type: string } | null) {
  if (!piece) return `${square}, empty`;
  const names: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  return `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${names[piece.type]}`;
}

/** Small static board preview used in cards, lessons and puzzle lists. */
export function MiniBoard({ fen, size = 132, orientation = 'white', theme = 'violet' }: { fen: string; size?: number; orientation?: 'white' | 'black'; theme?: BoardTheme }) {
  const game = useMemo(() => { try { return new Chess(fen); } catch { return new Chess(); } }, [fen]);
  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? FILES : [...FILES].reverse();
  return (
    <div style={{ width: size, height: size, display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gridTemplateRows: 'repeat(8,1fr)', borderRadius: 8, overflow: 'hidden', flex: '0 0 auto' }} aria-hidden="true">
      {ranks.map((rank, rIndex) => files.map((file, fIndex) => {
        const square = `${file}${rank}` as Square;
        const isLight = (rIndex + fIndex) % 2 === 0;
        const piece = game.get(square);
        return (
          <div key={square} style={{ position: 'relative', background: isLight ? THEME_LABELS[theme].light : THEME_LABELS[theme].dark, display: 'grid', placeItems: 'center', fontSize: size / 10.5, lineHeight: 1, color: piece?.color === 'w' ? '#fff' : '#111', textShadow: piece?.color === 'w' ? '0 1px 1px rgba(0,0,0,.55)' : 'none' }}>
            {piece && <Piece piece={piece.color === 'w' ? piece.type.toUpperCase() : piece.type} size={`${Math.round((size / 8) * 0.92)}px`} />}
          </div>
        );
      }))}
    </div>
  );
}
