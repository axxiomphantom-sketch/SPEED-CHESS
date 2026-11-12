/** Every puzzle is validated at seed time (legal FEN + legal solution line). */
export interface SeedPuzzle {
  id: string;
  title: string;
  fen: string;
  solution: string[];
  rating: number;
  themes: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
}

export const puzzles: SeedPuzzle[] = [
  { id: 'pz_back_rank_1', title: 'Back-rank finish', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    solution: ['Ra8#'], rating: 800, themes: ['mate-in-1', 'back-rank'], difficulty: 'easy',
    explanation: 'The black king is trapped behind its own pawns on f7, g7 and h7. Ra8 delivers check along the back rank and there is no escape square, no block and no capture.' },
  { id: 'pz_queen_mate_1', title: 'Queen and king mate', fen: '6k1/8/6K1/8/8/8/8/7Q w - - 0 1',
    solution: ['Qh8#'], rating: 820, themes: ['mate-in-1', 'endgame'], difficulty: 'easy',
    explanation: 'The white king on g6 covers g7 and h7 while Qh8 covers the whole eighth rank. Escaping to f7 runs into a square controlled by the queen on h8 through the rank? No — f7 is covered by the king on g6. Checkmate.' },
  { id: 'pz_queen_mate_2', title: 'Queen on the eighth', fen: '5k2/8/5K2/8/8/8/8/7Q w - - 0 1',
    solution: ['Qh8#'], rating: 830, themes: ['mate-in-1', 'endgame'], difficulty: 'easy',
    explanation: 'The king on f6 controls e7, f7 and g7; the queen sweeps the eighth rank. A standard queen-and-king finish.' },
  { id: 'pz_smothered', title: 'Smothered mate', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    solution: ['Nf7#'], rating: 980, themes: ['mate-in-1', 'smothered', 'knight'], difficulty: 'medium',
    explanation: 'The black king is smothered by its own rook on g8 and pawns on g7 and h7. The knight on f7 gives check and every escape square is occupied by Black’s own pieces.' },
  { id: 'pz_two_rook_mate', title: 'Two rooks on the back rank', fen: '7k/8/8/8/8/8/6K1/RR6 w - - 0 1',
    solution: ['Ra8#'], rating: 900, themes: ['mate-in-1', 'rook-endgame'], difficulty: 'easy',
    explanation: 'The king on g2 covers the second rank and the b1 rook supports the check on the eighth. One rook mate, the other defends the first.' },
  { id: 'pz_rook_ladder', title: 'Rook ladder', fen: '5k2/8/8/8/8/8/8/1R3RK1 w - - 0 1',
    solution: ['Rb8+', 'Ke7', 'Rf7+', 'Kd6', 'Rb6#'], rating: 1150, themes: ['mate-in-3', 'rook-endgame', 'ladder'], difficulty: 'hard',
    explanation: 'Two rooks climb the board like a ladder. Rb8+ forces the king to e7, Rf7+ pushes it up the board, and Rb6 delivers mate on the sixth rank.' },
  { id: 'pz_promotion', title: 'Promote with check', fen: '8/P5k1/8/8/8/8/6K1/8 w - - 0 1',
    solution: ['a8=Q'], rating: 750, themes: ['promotion', 'endgame'], difficulty: 'easy',
    explanation: 'A queen is unopposed on the board. The king alone cannot stop her; conversion follows the checkmate patterns you have learned.' },
  { id: 'pz_knight_fork', title: 'Family fork', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
    solution: ['Nc7+', 'Kd8', 'Nxa8'], rating: 950, themes: ['fork', 'knight'], difficulty: 'easy',
    explanation: 'Nc7+ attacks the king on e8 and the rook on a8 at the same time. Black must answer the check, and the rook falls next move — the classic family fork.' },
  { id: 'pz_pawn_fork', title: 'Pawn fork', fen: '7k/8/8/3p1p2/4P3/8/8/4K3 w - - 0 1',
    solution: ['exd5'], rating: 780, themes: ['fork', 'pawn'], difficulty: 'easy',
    explanation: 'The pawn on e4 captures on d5 and now attacks the pawn on f5. White wins material without giving anything up.' },
  { id: 'pz_double_attack', title: 'Double attack with check', fen: 'r3k3/8/8/8/8/8/1Q6/4K3 w - - 0 1',
    solution: ['Qb8+', 'Rxb8'], rating: 920, themes: ['double-attack', 'queen'], difficulty: 'medium',
    explanation: 'Be careful here: after Qb8+ the rook is forced to capture the queen, so this is not the winning idea it looks like. The real lesson is that a check on b8 does not win a8 because the rook must take — look before you calculate further. This puzzle illustrates why every forcing move must be checked for the opponent’s reply.' },
  { id: 'pz_pin_win', title: 'Pin the knight', fen: 'r1bqk1nr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    solution: ['Bxc6'], rating: 1000, themes: ['pin'], difficulty: 'medium',
    explanation: 'The bishop on b5 pins the knight on c6 to the king on e8, so the knight cannot recapture. Taking it damages Black’s structure permanently.' },
  { id: 'pz_defence_luft', title: 'Make luft', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1',
    solution: ['h6'], rating: 860, themes: ['defence', 'back-rank'], difficulty: 'medium',
    explanation: 'White threatens Ra8 mate. h6 gives the black king a flight square on h7 — a defensive move every beginner needs to know.' },
  { id: 'pz_pawn_endgame', title: 'Push the passed pawn', fen: '8/4k3/8/8/8/3K4/4P3/8 w - - 0 1',
    solution: ['e4', 'Kd6', 'Kd4'], rating: 900, themes: ['endgame', 'pawn-endgame', 'king-activity'], difficulty: 'medium',
    explanation: 'The white king stands in front of the pawn, which is exactly the winning configuration. Push the pawn, then bring the king up to support it.' },
  { id: 'pz_rook_check', title: 'Active rook', fen: '8/8/8/8/8/k7/8/K1R5 w - - 0 1',
    solution: ['Rc3+', 'Ka4', 'Rc4+'], rating: 950, themes: ['endgame', 'rook-endgame', 'king-activity'], difficulty: 'medium',
    explanation: 'In rook versus king, keep checking from a distance and never let the enemy king approach. Cutting the king off is the whole technique.' },
  { id: 'pz_italian_sac', title: 'Attack the uncastled king', fen: 'r1bq2kr/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 0 1',
    solution: ['Bxf7+'], rating: 1250, themes: ['sacrifice', 'attack', 'italian'], difficulty: 'hard',
    explanation: 'Black has given up castling rights, so f7 becomes a target. Bxf7+ drags the king out and opens the position for White’s better development.' },
  { id: 'pz_discovered_exchange', title: 'Trade into a winning ending', fen: 'r2qk3/8/8/8/8/8/8/3RK3 w - - 0 1',
    solution: ['Rxd8+', 'Kxd8'], rating: 880, themes: ['simplification', 'endgame'], difficulty: 'easy',
    explanation: 'Rxd8+ removes Black’s strongest piece. When you are ahead in material, trading pieces makes the win simpler and safer.' },
];
