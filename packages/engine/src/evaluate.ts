import { Chess, type Move } from 'chess.js';

const PIECE_VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

/** Piece-square tables from White's perspective (a8..h1, index 0 = a8). */
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

const KING_ENDGAME: number[] = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

/** Static evaluation in centipawns from the perspective of the side to move. */
export function evaluate(chess: Chess): number {
  const board = chess.board();
  let score = 0;
  // Material first (kings excluded) so kings use the right table in each phase.
  let material = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (sq && sq.type !== 'k') material += PIECE_VALUE[sq.type];
    }
  }
  const endgame = material <= 2600;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (!sq) continue;
      const idx = sq.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const table = sq.type === 'k' && endgame ? KING_ENDGAME : PST[sq.type];
      const value = PIECE_VALUE[sq.type] + table[idx] * 0.35;
      score += sq.color === 'w' ? value : -value;
    }
  }
  // Side-to-move perspective, small tempo bonus.
  const perspective = chess.turn() === 'w' ? 1 : -1;
  return Math.round(score * perspective) + 8;
}

/**
 * Chess.js will not generate a move that captures the enemy king; it throws for a position where
 * the side to move is already mated. This helper answers "does the opponent have mate in one?"
 * without trusting the search to see it.
 */
function hasMateInOne(chess: Chess): boolean {
  for (const move of chess.moves({ verbose: true }) as unknown as Move[]) {
    try {
      chess.move(move);
    } catch {
      continue;
    }
    const mated = chess.isCheckmate();
    chess.undo();
    if (mated) return true;
  }
  return false;
}

function moveOrderScore(move: Move): number {
  let s = 0;
  if (move.captured) s += 10 * PIECE_VALUE[move.captured] - PIECE_VALUE[move.piece];
  if (move.promotion) s += 800;
  // chess.js puts '#' and '+' in the SAN, so ordering needs no extra board probe. Cloning the
  // position here for every comparison made the search roughly ten times slower.
  if (move.san.includes('#')) s += 100000;
  if (move.san.includes('+')) s += 50;
  if (move.san === 'O-O' || move.san === 'O-O-O') s += 60;
  return s;
}

export interface SearchResult { move: Move | null; score: number; depth: number; nodes: number; }

/** Negamax with alpha-beta pruning, quiescence capture search and a node budget. */
export function search(fen: string, depth: number, nodeBudget = 200000): SearchResult {
  const chess = new Chess(fen);
  let nodes = 0;
  const deadline = Date.now() + 2500;

  const quiesce = (alpha: number, beta: number, plies: number): number => {
    const stand = evaluate(chess);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (plies <= 0) return alpha;
    const caps = chess.moves({ verbose: true }).filter(m => m.captured || m.promotion);
    caps.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
    for (const m of caps) {
      nodes++;
      chess.move(m);
      const score = -quiesce(-beta, -alpha, plies - 1);
      chess.undo();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  const negamax = (d: number, alpha: number, beta: number, ply: number): number => {
    nodes++;
    // Chess.js reports a king capture as illegal, so a checkmate must be detected *before* moving.
    // Without this guard the search happily walks into mate and scores it as a normal position.
    if (chess.isCheckmate()) return -99000 + ply;
    if (chess.isDraw()) return 0;
    if (d === 0 || nodes > nodeBudget || Date.now() > deadline) {
      // With no depth left, mate-in-one is invisible to a static evaluation: a queen one square
      // from the enemy king scores like any other queen. Detect it explicitly.
      // Only the side in check can be mated right now, so the expensive mate scan runs rarely.
      if (chess.inCheck()) {
        const inCheckPlayed = quiesce(alpha, beta, 4);
        if (hasMateInOne(chess)) return Math.max(inCheckPlayed, 98000 - ply);
        return inCheckPlayed;
      }
      return quiesce(alpha, beta, 4);
    }
    const moves = chess.moves({ verbose: true });
    moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const score = -negamax(d - 1, -beta, -alpha, ply + 1);
      chess.undo();
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  };

  let bestMove: Move | null = null;
  let bestScore = -Infinity;
  const root = chess.moves({ verbose: true });
  if (root.length === 0) return { move: null, score: chess.isCheckmate() ? -99000 : 0, depth: 0, nodes };
  root.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
  for (const m of root) {
    chess.move(m);
    const score = -negamax(depth - 1, -Infinity, -bestScore === Infinity ? Infinity : -bestScore, 1);
    chess.undo();
    if (score > bestScore || bestMove === null) { bestScore = score; bestMove = m; }
  }
  return { move: bestMove, score: bestScore, depth, nodes };
}

/** Position evaluation from White's point of view, used by analysis and the eval bar. */
export function evaluateWhite(fen: string): number {
  const c = new Chess(fen);
  const stm = c.turn();
  const raw = evaluate(c);
  return stm === 'w' ? raw : -raw;
}
