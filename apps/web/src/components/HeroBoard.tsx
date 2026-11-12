import { Chess } from 'chess.js';
import { useMemo } from 'react';
import { Piece } from './board/pieces';

/** Decorative board used on the landing page — a real position, not a fake image. */
export function HeroBoard({ fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5' }: { fen?: string }) {
  const game = useMemo(() => { try { return new Chess(fen); } catch { return new Chess(); } }, [fen]);
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute', inset: '-14% -10%', zIndex: 0,
          background: 'radial-gradient(closest-side, rgba(121,37,217,.42), transparent 72%)',
          filter: 'blur(18px)',
        }}
        aria-hidden="true"
      />
      <div
        style={{
          position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(8,1fr)',
          aspectRatio: '1', borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(203,167,255,.16)',
          transform: 'perspective(1400px) rotateX(6deg) rotateY(-6deg)',
        }}
        aria-label="Chess position from the Italian Game"
        role="img"
      >
        {ranks.map((rank, r) => files.map((file, f) => {
          const square = `${file}${rank}`;
          const isLight = (r + f) % 2 === 0;
          const piece = game.get(square as any);
          return (
            <div
              key={square}
              style={{
                background: isLight ? 'var(--board-light)' : 'var(--board-dark)',
                display: 'grid', placeItems: 'center', position: 'relative',
              }}
            >
              {piece && <Piece piece={piece.type} />}
            </div>
          );
        }))}
      </div>
    </div>
  );
}
