import { Chess } from 'chess.js';
import { analyseGame, evaluateWhite, LEVELS, search } from '@speed-chess/engine';

/**
 * The SPEED CHESS coach is deliberately transparent about what it is:
 * - evaluations and best moves come from the local engine (real search, not guessed),
 * - explanations are produced from a curated knowledge base of chess principles,
 * - it refuses to help during an active rated game (fair play).
 */

export interface CoachAnswer {
  answer: string;
  source: 'engine' | 'knowledge-base' | 'engine+knowledge';
  evaluation?: { cp: number; label: string; bestMove: string | null; line: string | null };
  relatedLessons: string[];
  disclaimer: string;
}

const DISCLAIMER =
  'Engine evaluations come from the local SPEED CHESS engine. Explanations are educational guidance, not engine output. The coach is disabled during rated games.';

interface Topic { keywords: string[]; lessons: string[]; answer: string; }

const TOPICS: Topic[] = [
  {
    keywords: ['castle', 'castling', 'kingside', 'queenside'],
    lessons: ['special-moves-castling', 'protect-your-king'],
    answer:
      'Castling moves your king two squares toward a rook and places the rook beside it — the only move where two pieces move at once. ' +
      'Castle early (usually by move 10) to tuck the king behind pawns and connect your rooks. You may not castle if the king or that rook has already moved, ' +
      'if a piece stands between them, if the king is in check, or if the king would pass through or land on an attacked square.',
  },
  {
    keywords: ['en passant', 'enpassant'],
    lessons: ['special-moves-en-passant'],
    answer:
      'En passant ("in passing") lets a pawn capture an enemy pawn that has just jumped two squares past it. Your pawn moves diagonally to the empty square the enemy pawn skipped, ' +
      'and the enemy pawn is removed. It is only legal on the very next move — wait one move and the right disappears.',
  },
  {
    keywords: ['promotion', 'promote', 'queen my pawn'],
    lessons: ['special-moves-promotion', 'pawn-power'],
    answer:
      'A pawn reaching the far rank promotes to a queen, rook, bishop or knight of your colour. A queen is almost always best; a knight is the usual choice when promoting with check ' +
      'or to avoid stalemate. In practice, use the promotion selector on the board so the move is recorded correctly.',
  },
  {
    keywords: ['stalemate', 'draw', 'drawn', 'fifty', 'repetition', 'insufficient'],
    lessons: ['draws-and-stalemate'],
    answer:
      'A game is drawn by stalemate (no legal move and not in check), agreement, threefold repetition, the fifty-move rule, or insufficient mating material. ' +
      'Stalemate is the trap most beginners fall into: when you are winning, always leave the enemy king a legal square or deliver check.',
  },
  {
    keywords: ['fork', 'knight fork', 'double attack'],
    lessons: ['tactics-forks'],
    answer:
      'A fork attacks two pieces at once. Knights are famous for forks because their attack pattern is hard to see. Look for squares from which a knight hits the king and a rook, ' +
      'or the queen and a loose bishop. Forks are most powerful when one of the targets is the king, because your opponent must answer the check first.',
  },
  {
    keywords: ['pin', 'skewer', 'discovered'],
    lessons: ['tactics-pins', 'tactics-skewers', 'tactics-discovered-attacks'],
    answer:
      'A pin freezes a piece because moving it would expose something more valuable behind it. A skewer is the reverse: the valuable piece is in front and must move, losing what stands behind. ' +
      'A discovered attack works when moving one piece unveils the line of another. All three win material when the restrained piece cannot be defended in time.',
  },
  {
    keywords: ['opening', 'first moves', 'develop', 'centre', 'center'],
    lessons: ['opening-principles'],
    answer:
      'Opening principles beat memorised lines for most players: occupy the centre with a pawn (e4 or d4), develop knights and bishops toward the centre, castle early, and connect your rooks. ' +
      'Avoid moving the same piece twice, avoid early queen sorties, and do not grab pawns at the cost of development.',
  },
  {
    keywords: ['endgame', 'king and pawn', 'rook ending', 'opposition'],
    lessons: ['basic-endgames', 'king-activity'],
    answer:
      'In the endgame the king becomes a fighting piece. Learn three anchors: the rule of the square (can a lone king catch a running pawn?), the opposition (placing kings so the opponent must give way), ' +
      'and the Lucena/Philidor ideas for rook endings. Activate your king before pushing pawns.',
  },
  {
    keywords: ['time', 'clock', 'flag', 'fast'],
    lessons: ['time-management'],
    answer:
      'Manage the clock like material. In 10+5 games aim to reach move 20 with roughly half your time left; move quickly in familiar opening lines and spend time on irreversible decisions ' +
      '(pawn structures, trades, king safety). If you are winning on the board, simplify and keep a small buffer of seconds.',
  },
  {
    keywords: ['blunder', 'why do i lose', 'improve', 'improvement', 'weakness'],
    lessons: ['blunder-check', 'improvement-plan'],
    answer:
      'Most rating points are lost to avoidable blunders, not deep strategy. Before every move run the CCT scan: Checks, Captures, Threats — for both sides. ' +
      'Then ask what your opponent\'s last move attacked. Two minutes of this habit is worth more than memorising opening theory.',
  },
  {
    keywords: ['piece value', 'material', 'trade', 'exchange'],
    lessons: ['piece-values'],
    answer:
      'Pawn = 1, knight = 3, bishop = 3, rook = 5, queen = 9 (the king is priceless). A bishop pair is worth slightly more than 6 in open positions. ' +
      'Trade when you are ahead in material; avoid trading when you are attacking or behind.',
  },
  {
    keywords: ['checkmate', 'mate', 'check'],
    lessons: ['check-and-checkmate'],
    answer:
      'Check means the king is attacked; you must escape it that move — move the king, block the line, or capture the attacker. ' +
      'Checkmate is check with no legal escape. Common patterns: back-rank mate, smothered mate, and the queen-plus-king mate on the edge.',
  },
];

function relativeLabel(cp: number): string {
  const abs = Math.abs(cp);
  if (abs > 900) return 'winning position';
  if (abs > 300) return 'clearly better';
  if (abs > 120) return 'a solid advantage';
  if (abs > 40) return 'a slight edge';
  return 'roughly equal';
}

export function askCoach(question: string, fen?: string): CoachAnswer {
  const q = question.toLowerCase();
  const topics = TOPICS.filter(t => t.keywords.some(k => q.includes(k)));
  const relatedLessons = [...new Set(topics.flatMap(t => t.lessons))];
  let evaluation: CoachAnswer['evaluation'] | undefined;
  let engineText = '';
  let source: CoachAnswer['source'] = topics.length ? 'knowledge-base' : 'engine';

  if (fen) {
    try {
      const chess = new Chess(fen);
      if (chess.isCheckmate()) {
        evaluation = { cp: 0, label: 'checkmate (game over)', bestMove: null, line: null };
        engineText = 'That position is checkmate — the game is already decided.';
      } else if (chess.isDraw()) {
        evaluation = { cp: 0, label: 'draw', bestMove: null, line: null };
        engineText = 'That position is a draw under the rules of chess.';
      } else {
        const result = search(fen, 3, 120000);
        const cp = evaluateWhite(fen) * (chess.turn() === 'w' ? 1 : -1);
        const side = chess.turn() === 'w' ? 'White' : 'Black';
        const legal = chess.moves().length;
        evaluation = {
          cp,
          label: `${side} to move, ${relativeLabel(cp)}`,
          bestMove: result.move?.san ?? null,
          line: result.move?.san ?? null,
        };
        engineText = `The engine evaluates this position as ${relativeLabel(cp)} for ${side.toLowerCase() === 'white' ? 'White' : 'Black'} to move ` +
          `(${cp > 0 ? '+' : ''}${Math.round(cp / 10) / 10} pawns from their point of view), with ${legal} legal moves. ` +
          (result.move ? `Its preferred move is ${result.move.san}. ` : '') +
          'Material, king safety and piece activity are the main factors it weighs.';
        source = topics.length ? 'engine+knowledge' : 'engine';
      }
    } catch {
      engineText = 'The position you shared is not a valid FEN, so I answered from chess principles only.';
      source = 'knowledge-base';
    }
  }

  const parts: string[] = [];
  if (engineText) parts.push(engineText);
  if (topics.length) parts.push(topics.map(t => t.answer).join('\n\n'));
  if (parts.length === 0) {
    parts.push(
      'I can explain chess ideas, evaluate a position you paste (FEN) and review your finished games. ' +
      'Try asking things like "how does castling work?", "what is a fork?", "how do I stop blundering?" — or attach a position for a real engine evaluation. ' +
      'For personal weaknesses, open a finished game and run Game Analysis.',
    );
  }
  return { answer: parts.join('\n\n'), source, evaluation, relatedLessons, disclaimer: DISCLAIMER };
}

export function gameReview(pgn: string) {
  const analysis = analyseGame(pgn);
  const blunderMoves = analysis.moves.filter(m => m.classification === 'blunder');
  const mistakeMoves = analysis.moves.filter(m => m.classification === 'mistake');
  const weakSide = analysis.accuracyWhite < analysis.accuracyBlack ? 'White' : 'Black';
  const recommendations: string[] = [];
  if (blunderMoves.length > 0) recommendations.push('Run the CCT scan (Checks, Captures, Threats) before each move — most blunders are missed opponent replies.');
  if (mistakeMoves.length >= 2) recommendations.push('Practise tactical puzzles: forks and pins appear in the majority of amateur mistakes.');
  if (!analysis.opening) recommendations.push('Study one opening for each colour so you reach a plan by move 6 without burning time.');
  if (analysis.moves.length > 60) recommendations.push('In long games, trade into simpler endgames when ahead — long games show the biggest time-management leaks.');
  if (recommendations.length === 0) recommendations.push('Accuracy was high; focus on converting small advantages with better king and rook activity.');
  return {
    summary: analysis.summary,
    accuracy: { white: analysis.accuracyWhite, black: analysis.accuracyBlack },
    counts: analysis.counts,
    weaknesses: {
      side: weakSide,
      blunders: blunderMoves.map(m => ({ ply: m.ply, san: m.san, best: m.bestSan })),
      mistakes: mistakeMoves.map(m => ({ ply: m.ply, san: m.san, best: m.bestSan })),
    },
    recommendations,
    opening: analysis.opening,
    levels: LEVELS.map(l => l.key),
  };
}
