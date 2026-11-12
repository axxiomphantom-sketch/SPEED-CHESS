import { Chess, type Move } from 'chess.js';
import { search, evaluateWhite, evaluate } from './evaluate.js';

export { Chess };
export type { Move };
export { search, evaluate, evaluateWhite };

export type Difficulty = 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert';

export interface LevelConfig {
  key: Difficulty;
  label: string;
  depth: number;
  /** Probability that the engine plays a deliberately weaker (random) move. */
  blunderChance: number;
  /** Rating band shown to the player. */
  elo: string;
  description: string;
}

export const LEVELS: LevelConfig[] = [
  { key: 'beginner', label: 'Beginner', depth: 1, blunderChance: 0.55, elo: '~600', description: 'Sees one move ahead and often misses threats. Ideal for a first game.' },
  { key: 'easy', label: 'Easy', depth: 2, blunderChance: 0.3, elo: '~1000', description: 'Takes material when it is free and defends against simple threats.' },
  { key: 'intermediate', label: 'Intermediate', depth: 3, blunderChance: 0.12, elo: '~1300', description: 'Punishes loose pieces and plays sensible developing moves.' },
  { key: 'advanced', label: 'Advanced', depth: 4, blunderChance: 0.03, elo: '~1600', description: 'Prunes with alpha-beta and looks for short tactics.' },
  { key: 'expert', label: 'Expert', depth: 5, blunderChance: 0, elo: '~1900', description: 'Full-width search to depth 5 with capture quiescence.' },
];

const LEVEL_MAP = new Map(LEVELS.map(l => [l.key, l]));

export function levelConfig(level: string): LevelConfig {
  return LEVEL_MAP.get(level as Difficulty) ?? LEVEL_MAP.get('easy')!;
}

/** Picks a move for the computer opponent, honouring the difficulty profile. */
export function chooseComputerMove(fen: string, level: string): { move: Move | null; score: number; nodes: number } {
  const cfg = levelConfig(level);
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  if (legal.length === 0) return { move: null, score: 0, nodes: 0 };

  // Take a checkmate when it is on the board. No difficulty level should ever decline mate.
  const mates = legal.filter(m => {
    const probe = new Chess(fen);
    probe.move(m);
    return probe.isCheckmate();
  });
  if (mates.length > 0) return { move: mates[0], score: 99000, nodes: 1 };

  // Never randomly walk into mate-in-one when alternatives exist.
  const safeMoves = legal.filter(m => {
    const probe = new Chess(fen);
    probe.move(m);
    const replies = probe.moves({ verbose: true });
    return !replies.some(r => r.san.includes('#'));
  });
  const pool = safeMoves.length > 0 ? safeMoves : legal;

  if (Math.random() < cfg.blunderChance) {
    const captures = pool.filter(m => m.captured);
    const pickFrom = captures.length > 0 && Math.random() < 0.5 ? captures : pool;
    const move = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    return { move, score: evaluate(new Chess(fen)), nodes: 1 };
  }
  const result = search(fen, cfg.depth);
  return { move: result.move ?? legal[0], score: result.score, nodes: result.nodes };
}

/** Basic opening book so beginners see natural openings. Keyed by move sequence. */
export const OPENING_BOOK: Record<string, string[]> = {
  '': ['e4', 'd4', 'Nf3', 'c4'],
  'e4': ['e5', 'c5', 'e6', 'c6'],
  'e4 e5': ['Nf3'],
  'e4 e5 Nf3': ['Nc6'],
  'e4 e5 Nf3 Nc6': ['Bb5', 'Bc4', 'd4'],
  'e4 c5': ['Nf3', 'Nc3', 'c3'],
  'd4': ['d5', 'Nf6', 'e6'],
  'd4 d5': ['c4', 'Nf3'],
  'd4 Nf6': ['c4', 'Nf3'],
};

export function bookMove(sanHistory: string[]): string | null {
  const options = OPENING_BOOK[sanHistory.join(' ').trim()];
  if (!options || options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)];
}

/** Aggregate opening name lookup by SAN prefix, used by game history and analysis. */
export const OPENING_NAMES: Array<{ moves: string; name: string }> = [
  { moves: 'e4 e5 Nf3 Nc6 Bb5', name: 'Ruy López' },
  { moves: 'e4 e5 Nf3 Nc6 Bc4', name: 'Italian Game' },
  { moves: 'e4 e5 Nf3 Nc6 d4', name: 'Scotch Game' },
  { moves: 'e4 e5 Nf3 Nf6', name: 'Petrov Defence' },
  { moves: 'e4 e5 Nf3 d6', name: 'Philidor Defence' },
  { moves: 'e4 e5 f4', name: "King's Gambit" },
  { moves: 'e4 e5', name: 'Open Game' },
  { moves: 'e4 c5 Nf3 d6', name: 'Sicilian Defence, Najdorf Variation' },
  { moves: 'e4 c5 Nf3 Nc6', name: 'Sicilian Defence, Old Sicilian' },
  { moves: 'e4 c5', name: 'Sicilian Defence' },
  { moves: 'e4 e6', name: 'French Defence' },
  { moves: 'e4 c6', name: 'Caro-Kann Defence' },
  { moves: 'e4 d5', name: 'Scandinavian Defence' },
  { moves: 'e4 Nf6', name: 'Alekhine Defence' },
  { moves: 'e4 d6', name: 'Pirc Defence' },
  { moves: 'e4 g6', name: 'Modern Defence' },
  { moves: 'd4 d5 c4 e6', name: "Queen's Gambit Declined" },
  { moves: 'd4 d5 c4 c6', name: 'Slav Defence' },
  { moves: 'd4 d5 c4 dxc4', name: "Queen's Gambit Accepted" },
  { moves: 'd4 d5 c4', name: "Queen's Gambit" },
  { moves: 'd4 Nf6 c4 g6 Nc3 d5', name: "King's Indian Defence" },
  { moves: 'd4 Nf6 c4 e6 Nc3 Bb4', name: 'Nimzo-Indian Defence' },
  { moves: 'd4 Nf6 c4 e6', name: 'Indian Game' },
  { moves: 'd4 Nf6 c4 c5', name: 'Benoni Defence' },
  { moves: 'd4 f5', name: 'Dutch Defence' },
  { moves: 'd4 d5', name: "Queen's Pawn Game" },
  { moves: 'd4', name: "Queen's Pawn Opening" },
  { moves: 'c4', name: 'English Opening' },
  { moves: 'Nf3', name: 'Réti Opening' },
  { moves: 'g3', name: "King's Fianchetto Opening" },
  { moves: 'b3', name: "Nimzo-Larsen Attack" },
  { moves: 'f4', name: 'Bird Opening' },
  { moves: 'e4', name: "King's Pawn Opening" },
];

/** True when the move sequence still follows a named opening line of at least this depth. */
export function isBookLine(sanMoves: string[]): boolean {
  const line = sanMoves.join(' ');
  return OPENING_NAMES.some(entry =>
    (line === entry.moves || line.startsWith(entry.moves + ' ')) && entry.moves.split(' ').length >= sanMoves.length);
}

export function identifyOpening(sanMoves: string[]): string | null {
  const line = sanMoves.join(' ');
  for (const entry of OPENING_NAMES) {
    if (line === entry.moves || line.startsWith(entry.moves + ' ')) return entry.name;
  }
  return null;
}

export interface ClassifiedMove {
  ply: number;
  san: string;
  fen: string;
  evalCp: number;
  classification: 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';
  bestSan: string | null;
  lossCp: number;
  comment: string;
}

const CLASSIFY_LABEL: Record<ClassifiedMove['classification'], string> = {
  brilliant: 'Brilliant',
  best: 'Best move',
  good: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  book: 'Book move',
};

/** Full post-game analysis: per-move evaluation loss, classification and accuracy. */
export function analyseGame(pgn: string) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const startFen = new Chess().fen();
  const positions: string[] = [startFen];
  const replay = new Chess();
  for (const mv of history) {
    replay.move(mv.san);
    positions.push(replay.fen());
  }

  const evalsWhite: number[] = positions.map(f => evaluateWhite(f));
  const classified: ClassifiedMove[] = [];
  let bookPlies = 0;
  let cpLossWhite = 0;
  let cpLossBlack = 0;

  for (let i = 0; i < history.length; i++) {
    const mv = history[i];
    const before = positions[i];
    const fenAfter = positions[i + 1];
    const moverIsWhite = i % 2 === 0;
    const lineSoFar = history.slice(0, i + 1).map(m => m.san);
    const book = isBookLine(lineSoFar);
    const afterChess = new Chess(fenAfter);
    const deliveredMate = afterChess.isCheckmate();
    const searchRes = deliveredMate ? { move: null, score: 99000, depth: 0, nodes: 0 } : search(before, 3, 120000);
    // Grade the move by searching the position it created — a static evaluation cannot see that a
    // move allows mate in one, so comparing against `evaluate()` would call such a move "good".
    // The resulting score is from the opponent's perspective, hence the negation.
    const afterSearch = deliveredMate ? 99000 : search(fenAfter, 3, 80000).score;
    const playedStm = deliveredMate ? 99000 : -afterSearch;
    const lossStm = deliveredMate ? 0 : Math.max(0, Math.round(searchRes.score - playedStm));
    const cappedLoss = Math.min(lossStm, 300);
    if (moverIsWhite) cpLossWhite += cappedLoss; else cpLossBlack += cappedLoss;
    if (book) bookPlies++;
    let classification: ClassifiedMove['classification'];
    if (deliveredMate) classification = 'best';
    else if (book) classification = 'book';
    else if (lossStm <= 15) classification = searchRes.move?.san === mv.san ? 'best' : 'good';
    else if (lossStm <= 50) classification = 'inaccuracy';
    else if (lossStm <= 150) classification = 'mistake';
    else classification = 'blunder';
    classified.push({
      ply: i + 1,
      san: mv.san,
      fen: fenAfter,
      evalCp: evalsWhite[i + 1],
      classification,
      bestSan: searchRes.move?.san ?? null,
      lossCp: lossStm,
      comment: commentFor(classification, mv.san, searchRes.move?.san ?? null),
    });
  }

  const wMoves = Math.max(1, Math.ceil(history.length / 2));
  const bMoves = Math.max(1, Math.floor(history.length / 2));
  // Accuracy is a per-move average, so it uses capped loss: one hang-the-queen move should not
  // zero the score for an otherwise clean game (its raw loss is capped at mate score).
  const accuracy = (loss: number, n: number) => {
    const avg = loss / n;
    return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-avg / 130))));
  };
  const counts = classified.reduce<Record<string, number>>((acc, c) => {
    acc[c.classification] = (acc[c.classification] ?? 0) + 1;
    return acc;
  }, {});
  const opening = identifyOpening(history.map(m => m.san));
  const lastEval = evalsWhite[evalsWhite.length - 1];

  return {
    moves: classified,
    positions,
    evalsWhite,
    accuracyWhite: accuracy(cpLossWhite, wMoves),
    accuracyBlack: accuracy(cpLossBlack, bMoves),
    counts,
    opening,
    bookPlies,
    finalEvalCp: lastEval,
    summary: buildSummary(classified, accuracy(cpLossWhite, wMoves), accuracy(cpLossBlack, bMoves), opening),
  };
}

function commentFor(kind: ClassifiedMove['classification'], san: string, best: string | null): string {
  switch (kind) {
    case 'blunder': return best ? `${san} loses material or allows a decisive tactic. ${best} kept the game close.` : `${san} is a serious error.`;
    case 'mistake': return best ? `${san} gives away a clear advantage. ${best} was stronger.` : `${san} lets the opponent improve their position for free.`;
    case 'inaccuracy': return best ? `${san} is playable but misses the most precise continuation, ${best}.` : `${san} is slightly imprecise.`;
    case 'best': return `${san} is the strongest move in the position.`;
    case 'brilliant': return `${san} is a striking resource that keeps the advantage.`;
    case 'book': return `${san} is a known opening move.`;
    default: return `${san} is a healthy developing move.`;
  }
}

function buildSummary(moves: ClassifiedMove[], accW: number, accB: number, opening: string | null): string {
  const blunders = moves.filter(m => m.classification === 'blunder');
  const mistakes = moves.filter(m => m.classification === 'mistake');
  const parts: string[] = [];
  if (opening) parts.push(`The game followed the ${opening}.`);
  parts.push(`White played with ${accW}% accuracy, Black with ${accB}%.`);
  if (blunders.length === 0 && mistakes.length <= 1) parts.push('Both sides were accurate; the result came from small positional factors.');
  else {
    const first = blunders[0] ?? mistakes[0];
    const side = first.ply % 2 === 1 ? 'White' : 'Black';
    parts.push(`The turning point was ${first.san} on move ${Math.ceil(first.ply / 2)}, a ${CLASSIFY_LABEL[first.classification].toLowerCase()} by ${side}.`);
  }
  return parts.join(' ');
}

export { CLASSIFY_LABEL };
