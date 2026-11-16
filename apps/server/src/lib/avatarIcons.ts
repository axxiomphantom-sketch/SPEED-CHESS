/**
 * Valid preset avatar ids.
 *
 * The rendering catalogue lives in the web app (`apps/web/src/lib/avatars.ts`) because it is SVG
 * markup the server has no use for. Only the *ids* matter to the API, so they are mirrored here
 * rather than importing UI code into the backend.
 *
 * The two lists are kept honest by `apps/server/src/tests/avatars.ts`, which reads the web catalogue
 * and fails if they ever disagree — a drift here would silently reject a valid avatar with
 * "Unknown avatar choice".
 */

export const PIECE_TYPES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;
export const PIECE_THEMES = ['purple', 'violet', 'light', 'charcoal'] as const;

/** `piece-theme` for every combination = 24 ids. */
export const PIECE_ICON_IDS: string[] = PIECE_TYPES.flatMap(type =>
  PIECE_THEMES.map(theme => `${type}-${theme}`),
);

/** Twelve abstract compositions, `geo-01` … `geo-12`. */
export const ABSTRACT_ICON_IDS: string[] = Array.from(
  { length: 12 },
  (_, i) => `geo-${String(i + 1).padStart(2, '0')}`,
);

export const AVATAR_ICON_IDS = new Set([...PIECE_ICON_IDS, ...ABSTRACT_ICON_IDS]);

export function isAvatarIcon(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_ICON_IDS.has(value);
}
