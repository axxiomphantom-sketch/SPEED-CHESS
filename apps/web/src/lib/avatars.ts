/**
 * Avatar presets.
 *
 * Two families live here so the whole app can render one from a short stable id:
 *   • chess pieces — six piece types × four colour themes = 24
 *   • abstract     — twelve geometric/colour-block compositions
 *
 * Everything is inline SVG built from the brand palette (see styles/tokens.css). Inline rather than
 * image files for three reasons: no extra network requests, it scales crisply at every avatar size,
 * and the colours come from the same tokens as the rest of the UI so the set cannot drift out of
 * sync with a theme change.
 *
 * Ids are persisted (users.avatar_icon / guest_sessions.avatar_icon), so `isAvatarIcon` validates
 * anything arriving from a client and old ids must keep working: only add, never rename.
 */

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceTheme = 'purple' | 'violet' | 'light' | 'charcoal';

/** Background gradient + foreground colour for each theme. */
const THEMES: Record<PieceTheme, { from: string; to: string; ink: string; edge: string; label: string }> = {
  purple: { from: '#7925d9', to: '#4c1191', ink: '#ffffff', edge: 'rgba(255,255,255,0.34)', label: 'Purple' },
  violet: { from: '#9333ea', to: '#6d28d9', ink: '#ffffff', edge: 'rgba(255,255,255,0.34)', label: 'Violet' },
  light: { from: '#f4f1ff', to: '#d9cdf7', ink: '#2a1440', edge: 'rgba(42,20,64,0.28)', label: 'Light' },
  charcoal: { from: '#2b2b35', to: '#121218', ink: '#cba7ff', edge: 'rgba(203,167,255,0.36)', label: 'Charcoal' },
};

export const PIECE_TYPES: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
export const PIECE_THEMES: PieceTheme[] = ['purple', 'violet', 'light', 'charcoal'];

export const PIECE_LABELS: Record<PieceType, string> = {
  king: 'King', queen: 'Queen', rook: 'Rook',
  bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn',
};

/**
 * Simplified, solid piece silhouettes on a 48×48 grid.
 *
 * These are deliberately stylised rather than the classic Staunton outlines: at 32 px in a friends
 * list the fine detail of a real piece set turns to mush, so each shape is chosen to stay readable
 * when small.
 */
const PIECE_PATHS: Record<PieceType, string> = {
  // Crown with a wide skirt.
  king:
    'M24 6.5l2.6 5.1 5.4-2.4-1.7 5.6 5.2 2.6-4.6 3 .8 3.1c2.6 1.5 4 3.6 4 6.1 0 3.9-5.6 6.9-11.7 6.9s-11.7-3-11.7-6.9c0-2.5 1.4-4.6 4-6.1l.8-3.1-4.6-3 5.2-2.6-1.7-5.6 5.4 2.4L24 6.5z',
  // Crown with points and a ball on each tip.
  queen:
    'M24 8.5l3 4.9 5.6-2 1.6 5.7 5-1.2-2.4 5.3 2.8 2.3-3.9 2.3c.3.9.4 1.8.4 2.7 0 4-5.4 7-12.1 7s-12.1-3-12.1-7c0-.9.1-1.8.4-2.7l-3.9-2.3 2.8-2.3-2.4-5.3 5 1.2 1.6-5.7 5.6 2L24 8.5z',
  // Turreted tower.
  rook:
    'M15 7h4.5v3.4h3V7h3v3.4h3V7H33v8.2l-2.4 2.1c2.4 1.9 3.9 4.6 3.9 7.6 0 5.6-4.7 9.1-10.5 9.1S13.5 30.5 13.5 24.9c0-3 1.5-5.7 3.9-7.6L15 15.2V7z',
  // Mitre with a slit.
  bishop:
    'M24 6.5a3 3 0 100 6 3 3 0 000-6zm0 7.2c4.9 2.6 7.8 7.1 7.8 12.1 0 4.2-2 7.3-5.1 9.1l1.5 2.3c.5.8-.1 1.9-1.1 1.9H16.9c-1 0-1.6-1.1-1.1-1.9l1.5-2.3c-3.1-1.8-5.1-4.9-5.1-9.1 0-5 2.9-9.5 7.8-12.1zM22.6 17v4.4h-2.9v2.3h2.9V28h2.8v-4.3h2.9v-2.3h-2.9V17h-2.8z',
  // Horse head facing right.
  knight:
    'M20.5 8c-.6 2.1-1.7 3.7-3.4 5.1-3.1 2.5-5.6 5.6-5.6 9.6 0 2.6 1.1 4.6 2.9 6.2l1.9-1.7c-1-1.1-1.6-2.4-1.6-3.9 0-2.4 1.4-4.2 3.4-5.7l-.9 3.6 3.2 1.4 6.9-3.4c1.6-.8 2.6-2.3 2.6-4.1 0-1.4-.7-2.9-1.9-3.9l-3-2.6c-.6-.5-1.5-.3-1.9.4l-.3.6-2.3-.6zM33 31.5c0 2.6-3.7 4.6-8.6 4.6s-9.4-1.9-9.4-4.5c0-1.4 1.5-2.9 3.9-3.9l4.1 2.3c.5.3 1.1.3 1.6 0l4.6-2.3c2.4 1 3.8 2.4 3.8 3.8z',
  // Round head on a collar.
  pawn:
    'M24 9.5a5.6 5.6 0 100 11.2 5.6 5.6 0 000-11.2zm-1.6 13.3c-2.2.7-3.7 2.4-3.7 4.4h10.6c0-2-1.5-3.7-3.7-4.4h-3.2zM14 29.6c0 3.9 4.5 6.6 10 6.6s10-2.7 10-6.6H14z',
};

export interface AvatarPreset {
  id: string;
  label: string;
  family: 'piece' | 'abstract';
}

/** All 24 piece presets, e.g. `knight-violet`. */
export const PIECE_PRESETS: AvatarPreset[] = PIECE_TYPES.flatMap(type =>
  PIECE_THEMES.map(theme => ({
    id: `${type}-${theme}`,
    label: `${PIECE_LABELS[type]} · ${THEMES[theme].label}`,
    family: 'piece' as const,
  })),
);

/**
 * Abstract compositions: each is a generator over the brand palette rather than a hand-drawn shape
 * per preset, so the set stays visually consistent and cheap to extend.
 */
type AbstractShape = 'orbits' | 'blocks' | 'chevrons' | 'diamond' | 'arcs' | 'grid' | 'prism' | 'rings' | 'split' | 'stars' | 'wave' | 'stack';

const ABSTRACT_SHAPES: AbstractShape[] = ['orbits', 'blocks', 'chevrons', 'diamond', 'arcs', 'grid', 'prism', 'rings', 'split', 'stars', 'wave', 'stack'];

const ABSTRACT_PALETTES: Array<{ from: string; to: string; accent: string; alt: string }> = [
  { from: '#7925d9', to: '#2a0a52', accent: '#cba7ff', alt: '#9333ea' },
  { from: '#1c1c24', to: '#090909', accent: '#9333ea', alt: '#7925d9' },
  { from: '#9333ea', to: '#4c1191', accent: '#ffffff', alt: '#cba7ff' },
  { from: '#cba7ff', to: '#7925d9', accent: '#121218', alt: '#ffffff' },
];

export const ABSTRACT_PRESETS: AvatarPreset[] = ABSTRACT_SHAPES.map((_shape, i) => ({
  id: `geo-${String(i + 1).padStart(2, '0')}`,
  label: `Abstract ${String(i + 1).padStart(2, '0')}`,
  family: 'abstract' as const,
}));

export const ALL_PRESET_IDS = new Set([...PIECE_PRESETS, ...ABSTRACT_PRESETS].map(p => p.id));

/** Guard for ids arriving from a client or the database. */
export function isAvatarIcon(value: unknown): value is string {
  return typeof value === 'string' && ALL_PRESET_IDS.has(value);
}

function abstractArt(shape: AbstractShape, i: number): string {
  const p = ABSTRACT_PALETTES[i % ABSTRACT_PALETTES.length];
  switch (shape) {
    case 'orbits':
      return `<circle cx="24" cy="24" r="15" fill="none" stroke="${p.accent}" stroke-width="1.6" opacity="0.85"/>
        <circle cx="24" cy="24" r="9" fill="none" stroke="${p.alt}" stroke-width="1.6" opacity="0.9"/>
        <circle cx="35" cy="15" r="3.4" fill="${p.accent}"/>
        <circle cx="15" cy="31" r="2.4" fill="${p.alt}"/>`;
    case 'blocks':
      return `<rect x="8" y="8" width="14" height="14" rx="3" fill="${p.accent}" opacity="0.92"/>
        <rect x="25" y="8" width="15" height="9" rx="3" fill="${p.alt}" opacity="0.8"/>
        <rect x="25" y="20" width="15" height="20" rx="3" fill="${p.accent}" opacity="0.55"/>
        <rect x="8" y="25" width="14" height="15" rx="3" fill="${p.alt}" opacity="0.7"/>`;
    case 'chevrons':
      return `<path d="M6 20l9-9 9 9 9-9 9 9v6l-9 9-9-9-9 9-9-9z" fill="${p.accent}" opacity="0.9"/>
        <path d="M15 26l9 9 9-9" fill="none" stroke="${p.alt}" stroke-width="2.2"/>`;
    case 'diamond':
      return `<path d="M24 5l17 19-17 19L7 24z" fill="${p.accent}" opacity="0.9"/>
        <path d="M24 13l10 11-10 11-10-11z" fill="${p.to}" opacity="0.95"/>`;
    case 'arcs':
      return `<path d="M4 40a20 20 0 0120-20" fill="none" stroke="${p.accent}" stroke-width="4" stroke-linecap="round"/>
        <path d="M12 44a28 28 0 0128-28" fill="none" stroke="${p.alt}" stroke-width="3.4" stroke-linecap="round" opacity="0.85"/>
        <circle cx="12" cy="16" r="3.6" fill="${p.accent}"/>`;
    case 'grid':
      return `<g fill="${p.accent}">${[10, 20, 30, 40].map(y =>
        [10, 20, 30, 40].map(x => `<circle cx="${x - 2}" cy="${y - 2}" r="2.6" opacity="${((x + y) % 3) === 0 ? 0.45 : 0.95}"/>`).join(''),
      ).join('')}</g>`;
    case 'prism':
      return `<path d="M24 6l18 32H6z" fill="${p.accent}" opacity="0.9"/>
        <path d="M24 18l10 18H14z" fill="${p.to}" opacity="0.95"/>`;
    case 'rings':
      return `<circle cx="24" cy="24" r="16" fill="none" stroke="${p.accent}" stroke-width="3" stroke-dasharray="7 5"/>
        <circle cx="24" cy="24" r="8" fill="${p.alt}"/>
        <circle cx="24" cy="24" r="3" fill="${p.from}"/>`;
    case 'split':
      return `<path d="M6 6h18v36H6z" fill="${p.accent}" opacity="0.92"/>
        <path d="M24 6h18v36H24z" fill="${p.alt}" opacity="0.72"/>
        <circle cx="24" cy="24" r="6" fill="${p.from}"/>`;
    case 'stars':
      return `<path d="M24 7l3.4 8.6 8.6 3.4-8.6 3.4L24 31l-3.4-8.6L12 19l8.6-3.4z" fill="${p.accent}" opacity="0.95"/>
        <path d="M35 28l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6-4.6-1.9 4.6-1.9z" fill="${p.alt}" opacity="0.85"/>`;
    case 'wave':
      return `<path d="M2 30c6-10 12-10 18 0s12 10 18 0v14H2z" fill="${p.accent}" opacity="0.9"/>
        <path d="M2 22c6-10 12-10 18 0s12 10 18 0" fill="none" stroke="${p.alt}" stroke-width="2.6" opacity="0.8"/>`;
    case 'stack':
    default:
      return `<rect x="7" y="26" width="34" height="7" rx="3.5" fill="${p.accent}" opacity="0.55"/>
        <rect x="11" y="18" width="26" height="7" rx="3.5" fill="${p.accent}" opacity="0.8"/>
        <rect x="16" y="10" width="16" height="7" rx="3.5" fill="${p.accent}"/>`;
  }
}

/**
 * Renders a preset as an SVG string suitable for a `data:` URL or `dangerouslySetInnerHTML`.
 *
 * Returned as markup because `Avatar` needs it in three different contexts: a plain <img> src, a
 * React node, and (for guests choosing an icon) a grid of options.
 */
export function avatarPresetSvg(iconId: string): string | null {
  const piece = PIECE_PRESETS.find(p => p.id === iconId);
  if (piece) {
    const [type, theme] = iconId.split('-') as [PieceType, PieceTheme];
    const t = THEMES[theme];
    if (!t || !PIECE_PATHS[type]) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="${PIECE_LABELS[type]}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${t.from}"/><stop offset="100%" stop-color="${t.to}"/>
      </linearGradient></defs>
      <rect width="48" height="48" rx="24" fill="url(#g)"/>
      <circle cx="24" cy="24" r="22" fill="none" stroke="${t.edge}" stroke-width="1.2"/>
      <g transform="translate(0 2.5) scale(0.92) translate(2 1)">
        <path d="${PIECE_PATHS[type]}" fill="${t.ink}"/>
      </g>
    </svg>`;
  }

  const idx = ABSTRACT_PRESETS.findIndex(p => p.id === iconId);
  if (idx >= 0) {
    const pal = ABSTRACT_PALETTES[idx % ABSTRACT_PALETTES.length];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Abstract avatar">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${pal.from}"/><stop offset="100%" stop-color="${pal.to}"/>
      </linearGradient></defs>
      <rect width="48" height="48" rx="24" fill="url(#g)"/>
      <g>${abstractArt(ABSTRACT_SHAPES[idx], idx)}</g>
    </svg>`;
  }
  return null;
}

/** Same markup, encoded for use as an <img src>. */
export function avatarPresetDataUrl(iconId: string): string | null {
  const svg = avatarPresetSvg(iconId);
  if (!svg) return null;
  // encodeURIComponent keeps the payload readable and avoids btoa's Unicode pitfall entirely.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function presetLabel(iconId: string): string {
  return [...PIECE_PRESETS, ...ABSTRACT_PRESETS].find(p => p.id === iconId)?.label ?? 'Avatar';
}
