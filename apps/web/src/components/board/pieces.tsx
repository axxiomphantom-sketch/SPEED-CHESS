import type { CSSProperties } from 'react';

/**
 * Original vector piece set drawn for SPEED CHESS.
 * White pieces use a warm ivory fill, black pieces charcoal with a violet rim,
 * so both sides stay readable on every board theme.
 */
type PieceCode = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

const IVORY = '#F5F1E8';
const IVORY_SHADE = '#D9D2C2';
const CHARCOAL = '#22212A';
const CHARCOAL_SHADE = '#3A3946';
const OUTLINE_LIGHT = '#3B2B23';
const OUTLINE_DARK = '#0C0B10';

interface PieceProps { piece: string; size?: number | string; style?: CSSProperties; }

function Colors(isWhite: boolean) {
  return isWhite
    ? { fill: IVORY, shade: IVORY_SHADE, stroke: OUTLINE_LIGHT, highlight: '#FFFFFF' }
    : { fill: CHARCOAL, shade: CHARCOAL_SHADE, stroke: OUTLINE_DARK, highlight: '#6E5A8F' };
}

function PieceSvg({ type, isWhite }: { type: PieceCode; isWhite: boolean }) {
  const c = Colors(isWhite);
  const common = { stroke: c.stroke, strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

  switch (type) {
    case 'p':
      return (
        <g {...common}>
          <path d="M22.4 12.7c3.1 3.1 3.6 6.7 1.3 9.1-1 1-1.1 1.5-.3 2.6 2.5 3 4.4 6.6 5.2 10.6.5 2.4.7 4.7.8 7 .02.4-.2.7-.6.7H16.2c-.4 0-.7-.3-.6-.7.1-2.3.3-4.6.8-7 .8-4 2.7-7.6 5.2-10.6.8-1.1.7-1.6-.3-2.6-2.3-2.4-1.8-6 1.1-9.1z" fill={c.fill} />
          <path d="M16.6 36.4c0 .2 0 .3.02.4h11.6c.02-.1.02-.2.02-.4V29a2.2 2.2 0 0 0-2.2-2.2h-7.2A2.2 2.2 0 0 0 16.6 29z" fill={c.shade} stroke="none" />
          <rect x="10.4" y="38.4" width="24.2" height="4" rx="1.6" fill={c.fill} />
          <ellipse cx="22.5" cy="11.6" rx="4.2" ry="3.1" fill={c.fill} />
          <ellipse cx="21" cy="10.6" rx="1.5" ry=".9" fill={c.highlight} opacity={isWhite ? .85 : .28} stroke="none" />
        </g>
      );
    case 'n':
      return (
        <g {...common}>
          <path d="M15.7 42.5c.5-3 1.8-5.6 3.8-7.9 1.3-1.5 2.7-2.7 4.2-3.7 1.4-.9 2.1-1.8 2.4-3.2.2-.9-.2-1.4-1-1.5-1.6-.2-3.1.5-4.5 1.6-1.7 1.3-2.6 2.5-3.6 4.3-.4.7-1 .9-1.8.9-.6 0-1-.3-1.1-.9-.3-1.6 0-3.5.9-5.5 1.6-3.4 4.6-5.9 8.7-8.3.5-.3 1-.9 1.1-1.5.2-1.2.7-2.2 1.6-3.1.4-.4.7-.5 1-.1l1.6 2.1c.5.7 1 1.2 1.9 1.4l3.9.8c1.5.4 2.6 1 3.5 2.2 4.5 6 5.8 13.6 4.5 21-.1.4-.3.6-.7.6H16.3c-.4 0-.7-.3-.6-.7z" fill={c.fill} />
          <path d="M22 27.4c.5-.6 1.1-1 1.9-1.2l1.9-.4c.5-.1.7-.3.8-.8l.2-1.2c.1-.5.4-.7.9-.5l1 .4c.4.2.8.1 1-.3l.7-1.2c.2-.4.6-.5 1-.2l1.6 1.4" fill="none" stroke={c.shade} strokeWidth="1.4" opacity=".9" />
          <circle cx="24.6" cy="21.4" r="1" fill={c.stroke} stroke="none" />
          <path d="M15.4 40.2h24.1v3.9H15.4z" fill={c.fill} />
          <path d="M17 40.2h21v3.9H17z" fill={c.shade} opacity=".25" stroke="none" />
          <ellipse cx="19.4" cy="42.2" rx="2.2" ry="1.6" fill={c.highlight} opacity={isWhite ? .5 : .18} stroke="none" />
        </g>
      );
    case 'b':
      return (
        <g {...common}>
          <circle cx="22.5" cy="12.6" r="2.6" fill={c.fill} />
          <path d="M14.3 27.6c2.4-2.5 3.7-5.5 2.9-9-.1-.5 0-.9.4-1.2 3.1-1.9 6.7-1.9 9.9 0 .4.3.5.7.4 1.2-.8 3.5.5 6.5 2.9 9 .7.7.3 1.6-.6 1.7l-4.6.5c3.2 2.6 5.3 5.8 6 9.7.1.6-.3 1.1-.9 1.1H14.9c-.6 0-1-.5-.9-1.1.7-3.9 2.8-7.1 6-9.7l-4.6-.5c-.9-.1-1.3-1-.6-1.7z" fill={c.fill} />
          <path d="M14.6 27.4c.5-.5.8-1.1 1.6-1.2l6.9-.7c1.2 2.9 4.4 3 5.6 0l6.1.7c.5.1.8.5 1 .9l-2 .3c-3.6.4-6.5 1.3-6.5 2.9h-4.6c0-1.8-3.1-2.5-6.5-2.9z" fill={c.shade} opacity=".55" stroke="none" />
          <rect x="12.4" y="38.6" width="20.2" height="4" rx="1.4" fill={c.fill} />
          <path d="M16.6 30.2h11.8" stroke={c.shade} strokeWidth="1.2" opacity=".65" />
          <ellipse cx="21.2" cy="17.4" rx="1.4" ry="2.2" fill={c.highlight} opacity={isWhite ? .6 : .2} stroke="none" transform="rotate(-18 21.2 17.4)" />
        </g>
      );
    case 'r':
      return (
        <g {...common}>
          <path d="M13.4 12.2h4v3.3h3.6v-3.3h3.9v3.3h3.6v-3.3h4v7.9l-2.6 1.9-.1 11.4c1.6.9 2.9 2.3 3.2 4.1.1.6-.4 1.1-1 1.1H12.9c-.6 0-1.1-.5-1-1.1.3-1.8 1.6-3.2 3.2-4.1l-.1-11.4-2.6-1.9z" fill={c.fill} />
          <path d="M16.8 20.3v11.3c-1 .9-1.6 2-1.9 3.4h15.3c-.3-1.4-.9-2.5-1.9-3.4V20.3l1.4-1H15.4z" fill={c.shade} opacity=".38" stroke="none" />
          <rect x="10.6" y="39.2" width="23.8" height="4.2" rx="1.4" fill={c.fill} />
          <path d="M15.6 17.4h13.8" stroke={c.shade} strokeWidth="1.2" opacity=".7" />
          <path d="M15.6 18.8h13.8" stroke={c.shade} strokeWidth="1.2" opacity=".7" />
          <rect x="14.6" y="13.4" width="2" height="2.2" fill={c.highlight} opacity={isWhite ? .7 : .22} stroke="none" />
        </g>
      );
    case 'q':
      return (
        <g {...common}>
          <path d="M9.6 16.6l-.5-6.4c0-.7.9-1.1 1.4-.5l4.1 5.2 3.2-6.7c.3-.7 1.3-.7 1.6 0l2.6 5.5 2.6-5.5c.3-.7 1.3-.7 1.6 0l3.2 6.7 4.1-5.2c.5-.6 1.4-.2 1.4.5l-.5 6.4c-.3 3.9-2.6 7-6.2 8.4v8.3c1.3.6 2.2 1.6 2.6 3 .2.6-.3 1.2-.9 1.2H14.1c-.6 0-1.1-.6-.9-1.2.4-1.4 1.3-2.4 2.6-3V25c-3.6-1.4-5.9-4.5-6.2-8.4z" fill={c.fill} />
          <path d="M11.6 17.4c.5 2.9 2.3 5.3 5 6.5v9.9h11.8v-9.9c2.7-1.2 4.5-3.6 5-6.5H11.6z" fill={c.shade} opacity=".32" stroke="none" />
          <circle cx="9.1" cy="10.2" r="2.1" fill={c.fill} />
          <circle cx="36.1" cy="10.2" r="2.1" fill={c.fill} />
          <circle cx="15" cy="6.2" r="1.9" fill={c.fill} />
          <circle cx="30.1" cy="6.2" r="1.9" fill={c.fill} />
          <circle cx="22.6" cy="4.4" r="2.1" fill={c.fill} />
          <ellipse cx="22.6" cy="4.4" rx="1.5" ry="1.6" fill="none" stroke={c.shade} strokeWidth="1.1" />
          <ellipse cx="18.2" cy="32.2" rx="1.6" ry="3.6" fill={c.highlight} opacity={isWhite ? .5 : .16} stroke="none" />
        </g>
      );
    case 'k':
      return (
        <g {...common}>
          <path d="M22.6 4.4v3.4h-3.4c-.5 0-.8.4-.8.8s.3.8.8.8h3.4v3.6c0 .5.4.8.8.8s.8-.3.8-.8v-3.6h3.4c.5 0 .8-.4.8-.8s-.3-.8-.8-.8h-3.4V4.4c0-.5-.4-.8-.8-.8s-.8.3-.8.8z" fill={c.fill} />
          <path d="M13.1 24.4c0-2.6 1.6-4.8 3.9-5.7-.9-1.1-1.4-2.4-1.4-3.8 0-2.1 1.1-3.9 2.8-5 1.1-.7 2.6-1.2 4.2-1.2s3.1.5 4.2 1.2c1.7 1.1 2.8 2.9 2.8 5 0 1.4-.5 2.7-1.4 3.8 2.3.9 3.9 3.1 3.9 5.7 0 1.8-.8 3.4-2 4.5l.7 6.1c.05.5-.3.9-.8.9H15.2c-.5 0-.85-.4-.8-.9l.7-6.1c-1.2-1.1-2-2.7-2-4.5z" fill={c.fill} />
          <path d="M14.6 22.2c0 1.7 1 3.2 2.5 3.9l-.8 7.4h12.7l-.8-7.4c1.5-.7 2.5-2.2 2.5-3.9 0-2.5-2.2-4.4-5.3-4.4-1.4 0-2.4-.4-2.9-1.2-.5.8-1.5 1.2-2.9 1.2-3.1 0-5.3 1.9-5.3 4.4z" fill={c.shade} opacity=".34" stroke="none" />
          <rect x="10.9" y="39.6" width="23.4" height="4.2" rx="1.4" fill={c.fill} />
          <rect x="10.9" y="39.6" width="23.4" height="4.2" rx="1.4" fill={c.shade} opacity=".2" stroke="none" />
          <path d="M16.2 38.9h13" stroke={c.shade} strokeWidth="1.1" opacity=".5" />
          <ellipse cx="18.3" cy="27.4" rx="2.1" ry="2.9" fill={c.highlight} opacity={isWhite ? .42 : .14} stroke="none" />
        </g>
      );
  }
}

export function Piece({ piece, size, style }: PieceProps) {
  const isWhite = piece === piece.toUpperCase();
  const type = piece.toLowerCase() as PieceCode;
  return (
    <span className="piece" style={{ ...(size ? { width: size, height: size } : {}), ...style }} aria-hidden="true">
      <svg viewBox="0 0 45 48" role="img" aria-label={`${isWhite ? 'White' : 'Black'} ${type}`}>
        <PieceSvg type={type} isWhite={isWhite} />
      </svg>
    </span>
  );
}

export const PIECE_GLYPH: Record<string, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
