import { Chess } from 'chess.js';

export const fenAfter = (moves: string) => {
  const chess = new Chess();
  for (const san of moves.split(' ').filter(Boolean)) chess.move(san);
  return chess.fen();
};

export interface SeedQuiz {
  q: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface SeedLesson {
  slug: string;
  title: string;
  minutes: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  body: string;
  fen?: string;
  highlights?: string[];
  quiz?: SeedQuiz[];
  tags?: string;
}

export interface SeedCourse {
  slug: string;
  title: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  summary: string;
  description: string;
  icon: string;
  lessons: SeedLesson[];
}

const START = new Chess().fen();

export const courses: SeedCourse[] = [
  {
    slug: 'learn-chess-from-zero',
    title: 'Learn Chess from Zero',
    level: 'beginner',
    summary: 'Start from nothing: the board, the goal, the turns and your first moves.',
    description:
      'This course assumes you have never moved a chess piece. In four short lessons you will understand the board, the objective of the game, how a turn works and how games are won, lost or drawn. Every lesson contains an interactive board so you can see each idea instead of only reading it.',
    icon: 'sparkles',
    lessons: [
      {
        slug: 'what-is-chess',
        title: 'What is chess?',
        minutes: 5,
        level: 'beginner',
        tags: 'basics,introduction',
        body: `## Two players, one board, one king each

Chess is a game for two players. Each player starts with sixteen pieces: one king, one queen, two rooks, two bishops, two knights and eight pawns. The board is an 8×8 grid of light and dark squares.

**The objective** is simple to state and hard to achieve: checkmate the enemy king. Checkmate means the king is attacked and there is no legal way to escape.

**How a game flows**
- White always moves first.
- Players take turns, one move at a time.
- You may never skip your turn, and you may never move twice in a row.
- You may not leave your own king in check.

**How games end**
- **Win:** checkmate, resignation, or the opponent's clock runs out.
- **Draw:** stalemate, agreement, threefold repetition, the fifty-move rule, or insufficient material.

> Every chess game is a conversation: you propose a plan, your opponent answers, and the board changes for both of you. The best players are the ones who listen.`,
        fen: START,
        highlights: ['e4', 'd4', 'e5', 'd5'],
        quiz: [
          { q: 'Who moves first in a standard game?', options: ['White', 'Black', 'The player who wins the toss', 'Whoever has fewer pieces'], answer: 0, explanation: 'White always begins. That first-move advantage is why Black is often satisfied with a draw at the top level.' },
          { q: 'What is the objective of chess?', options: ['Capture every piece', 'Reach the other side with a pawn', 'Checkmate the enemy king', 'Have more pieces left at the end'], answer: 2, explanation: 'Material only matters because it helps you checkmate. A queen advantage means nothing if your king falls.' },
        ],
      },
      {
        slug: 'the-board',
        title: 'Reading the board',
        minutes: 6,
        level: 'beginner',
        tags: 'basics,coordinates',
        body: `## Files, ranks and coordinates

The board has 8 **files** (the vertical columns, named a–h from White's left) and 8 **ranks** (the horizontal rows, numbered 1–8 from White's side). Every square has a name: file first, then rank. The bottom-left square for White is **a1** — and it is always a **dark** square.

Two habits worth building from day one:

1. **"Light on the right."** When you set up, the nearest right-hand corner square is light (h1 for White, a8 for Black).
2. **Count before you move.** "Knight to f3" means file f, rank 3. Naming squares out loud makes notation easy later.

Click any square on the board below to see its coordinate; the highlighted squares are the four central pawn squares, the most valuable real estate on the board.`,
        fen: START,
        highlights: ['a1', 'h1', 'a8', 'h8', 'e4', 'd4', 'e5', 'd5'],
        quiz: [
          { q: 'Which square is dark?', options: ['a1', 'h1', 'a8', 'h8'], answer: 0, explanation: 'a1 is dark; h1 is light ("light on the right"). a8 is light and h8 is dark.' },
          { q: 'Which are the four central squares?', options: ['c3, c6, f3, f6', 'd4, d5, e4, e5', 'a4, a5, h4, h5', 'b2, b7, g2, g7'], answer: 1, explanation: 'd4, d5, e4 and e5 form the centre. Pieces placed there reach the most squares.' },
        ],
      },
      {
        slug: 'setting-up-the-board',
        title: 'Setting up the board',
        minutes: 5,
        level: 'beginner',
        tags: 'basics,setup',
        body: `## The starting position, memorised in one rhyme

**"Queen on her own colour."** The white queen starts on d1, a light square; the black queen starts on d8, a dark square. Everything else follows:

- Rooks in the corners: a1, h1 and a8, h8.
- Knights next to them: b1, g1 and b8, g8.
- Bishops beside the knights: c1, f1 and c8, f8.
- King and queen in the middle: king on e1 (white) and e8 (black).
- All eight pawns fill the second rank for White and the seventh for Black.

Notice the symmetry: the kings face each other on the e-file, and the queens face each other on the d-file.`,
        fen: START,
        highlights: ['d1', 'd8', 'e1', 'e8'],
        quiz: [
          { q: 'Which piece starts on d1?', options: ['The king', 'The queen', 'A bishop', 'A knight'], answer: 1, explanation: 'The queen starts on d1 and d8 — "queen on her own colour".' },
        ],
      },
      {
        slug: 'piece-values',
        title: 'Piece values and what they mean',
        minutes: 6,
        level: 'beginner',
        tags: 'basics,material',
        body: `## A shared language for material

Chess players measure material in pawn units:

| Piece | Value |
| --- | --- |
| Pawn | 1 |
| Knight | 3 |
| Bishop | 3 |
| Rook | 5 |
| Queen | 9 |
| King | priceless |

These numbers are a guide, not a law. A rook on an open file can be worth more than a queen trapped in a corner, and the bishop pair is usually worth slightly more than six pawns in an open position.

**How to use values**
- Win material when it is free and safe.
- Do not trade a 5-point rook for a 3-point bishop without a concrete reason.
- When you are ahead in material, trade pieces — every trade makes your advantage simpler.`,
        fen: fenAfter('e4 e5'),
        highlights: ['d1', 'd8'],
        quiz: [
          { q: 'You can win a knight but lose a rook. Is that a good trade?', options: ['Yes, knights are stronger', 'No — you lose two points of material', 'Only in the endgame', 'Only if you keep the bishop pair'], answer: 1, explanation: 'Knight 3 vs rook 5 means you lose two points. Always count before you trade.' },
        ],
      },
    ],
  },
  {
    slug: 'meet-the-pieces',
    title: 'Meet the Chess Pieces',
    level: 'beginner',
    summary: 'One lesson per piece: how it moves, how it captures, and what it is good at.',
    description:
      'Every piece moves differently. Learn them one at a time with an interactive board that shows only legal destinations. Finish with a knowledge test covering all six pieces.',
    icon: 'crown',
    lessons: [
      {
        slug: 'the-king',
        title: 'The king',
        minutes: 6,
        level: 'beginner',
        tags: 'pieces,king',
        body: `## One square in any direction

The king moves exactly one square: horizontally, vertically or diagonally. It captures the same way.

**Rules that protect the king**
- You may never move into check.

**Castling** is the king's only other move — a special move covered in the next course.

## The king in practice

In the opening, keep the king safe: castle early and keep pawns in front of it. In the endgame the king becomes a strong piece — it should walk toward the centre and help escort pawns to promotion.

The board shows a king in the centre of an empty board: eight squares, no more.`,
        fen: '7k/8/8/8/3K4/8/8/8 w - - 0 1',
        highlights: ['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5'],
        quiz: [
          { q: 'How many squares can a king move to at most?', options: ['4', '6', '8', '16'], answer: 2, explanation: 'From a central square the king has eight neighbours. On an edge or corner it has fewer.' },
          { q: 'Can a king move next to the enemy king?', options: ['Yes, if it is safe', 'No — kings may never stand adjacent', 'Only in the endgame', 'Only while castling'], answer: 1, explanation: 'Kings attack each other, so they can never be on neighbouring squares.' },
        ],
      },
      {
        slug: 'the-queen',
        title: 'The queen',
        minutes: 6,
        level: 'beginner',
        tags: 'pieces,queen',
        body: `## The strongest piece on the board

The queen combines the rook and the bishop: any number of squares horizontally, vertically or diagonally, in a straight line. She stops when she reaches a piece: an enemy piece can be captured, a friendly one blocks her.

**Bring her out late.** A queen developed on move 3 becomes a target — enemy knights and bishops develop while attacking her. In the opening, move pawns and minor pieces first.

**Queen safety** is the single biggest source of losses below 1200: before every move ask "can anything capture my queen?"`,
        fen: '7k/8/8/3Q4/8/8/8/6K1 w - - 0 1',
        highlights: ['d1', 'd8', 'a5', 'h5', 'e4', 'a8', 'h1'],
        quiz: [
          { q: 'A queen on d5 attacks which square?', options: ['f3 (a knight jump away)', 'd8 (straight up the file)', 'b4 (one diagonal step)', 'b6 (a knight jump away)'], answer: 1, explanation: 'The queen moves on straight lines: files, ranks and diagonals. d5 to d8 is a file; b4 is not a diagonal from d5.' },
        ],
      },
      {
        slug: 'the-rook',
        title: 'The rook',
        minutes: 5,
        level: 'beginner',
        tags: 'pieces,rook',
        body: `## Straight lines, long range

The rook moves any number of squares horizontally or vertically. It is worth about five pawns and is at its best on **open files** — files with no pawns on them.

**The seventh rank** is famous: a rook there attacks pawns that are still on their starting squares and cuts the enemy king off.

Rooks also take part in castling, the only move that involves two pieces.`,
        fen: '7k/8/8/8/3R4/8/8/6K1 w - - 0 1',
        highlights: ['d1', 'd2', 'd3', 'd5', 'd6', 'd7', 'd8', 'a4', 'b4', 'c4', 'e4', 'f4', 'g4', 'h4'],
        quiz: [
          { q: 'How many directions can a rook move?', options: ['Two (diagonals)', 'Four (files and ranks)', 'Six', 'Eight'], answer: 1, explanation: 'Four: up, down, left, right. The bishop covers diagonals; the rook covers files and ranks.' },
        ],
      },
      {
        slug: 'the-bishop',
        title: 'The bishop',
        minutes: 5,
        level: 'beginner',
        tags: 'pieces,bishop',
        body: `## Diagonals only

The bishop moves any number of squares diagonally. Because it never changes square colour, one bishop is locked to light squares and the other to dark ones — a single bishop can never attack a piece on the other colour.

**Bishops love open positions.** In the opening, develop them before you close the centre with pawns. Two bishops working together ("the bishop pair") are a long-term asset.

Take note of the square colours in the demonstration: the bishop on c1 only ever reaches dark squares.`,
        fen: '7k/8/8/8/3B4/8/8/6K1 w - - 0 1',
        highlights: ['c3', 'b2', 'a1', 'e3', 'f2', 'g1', 'c5', 'b6', 'a7', 'e5', 'f6', 'g7', 'h8'],
        quiz: [
          { q: 'A bishop starts on c1. Which square can it never reach?', options: ['h6', 'a3', 'd2', 'e3'], answer: 3, explanation: 'c1 is a dark square. It can only ever reach dark squares: h6, a3 and d2 are dark; e3 is light.' },
        ],
      },
      {
        slug: 'the-knight',
        title: 'The knight',
        minutes: 6,
        level: 'beginner',
        tags: 'pieces,knight',
        body: `## The L-shaped jumper

The knight moves two squares in one direction and then one square perpendicular — an "L". It is the only piece that can **jump over** other pieces, friend or enemy.

**Where knights shine**
- In closed, blocked positions.
- In the centre, where a knight reaches eight squares.
- In **forks**: a knight attacking two pieces at once is one of the most common winning tactics in amateur chess.

The demonstration shows every square a centralised knight attacks. Notice how all of them are the opposite colour to the knight's square.`,
        fen: '7k/8/8/3N4/8/8/8/6K1 w - - 0 1',
        highlights: ['b4', 'b6', 'c3', 'c7', 'e3', 'e7', 'f4', 'f6'],
        quiz: [
          { q: 'Can a knight jump over pieces?', options: ['No, it is blocked like a queen', 'Yes — it is the only piece that can', 'Only over its own pieces', 'Only when giving check'], answer: 1, explanation: 'The knight ignores what is in between. That is what makes it deadly in cramped positions.' },
          { q: 'How many squares does a knight attack from d5?', options: ['4', '6', '8', '10'], answer: 2, explanation: 'b4, b6, c3, c7, e3, e7, f4, f6 — eight squares, all of the opposite colour.' },
        ],
      },
      {
        slug: 'the-pawn',
        title: 'The pawn',
        minutes: 7,
        level: 'beginner',
        tags: 'pieces,pawn',
        body: `## The soul of chess

A pawn moves **forward one square**, and may move **two squares from its starting position**. It captures **diagonally** — never straight ahead. When a pawn reaches the far rank it **promotes**.

Pawns cannot move backwards. Every pawn push permanently changes the structure of the position, which is why pawn moves deserve more thought than any other move.

**Pawn strengths**
- They control key squares without occupying them.
- A passed pawn (no enemy pawns in front or beside it) can decide a game.
- They form the shield in front of your king.

The demonstration shows a pawn on e2: it may step to e3 or jump to e4, but it attacks d3 and f3.`,
        fen: '7k/8/8/8/8/8/4P3/6K1 w - - 0 1',
        highlights: ['e3', 'e4', 'd3', 'f3'],
        quiz: [
          { q: 'A white pawn on e2 can capture on e3.', options: ['True', 'False — pawns capture diagonally only'], answer: 1, explanation: 'Pawns capture on d3 or f3, never straight ahead.' },
          { q: 'What is a passed pawn?', options: ['A pawn that has moved twice', 'A pawn with no enemy pawns in front or on adjacent files', 'A pawn on the seventh rank', 'A pawn that has promoted'], answer: 1, explanation: 'With no enemy pawn able to stop it, a passed pawn is a long-term asset — it must be pushed.' },
        ],
      },
    ],
  },
  {
    slug: 'special-moves-and-rules',
    title: 'Special Moves and Rules',
    level: 'beginner',
    summary: 'Castling, en passant, promotion, check, checkmate, stalemate and every draw rule.',
    description:
      'These are the rules that decide real games. Each lesson includes the legal conditions, the mistakes beginners make, and an interactive board you can move pieces on.',
    icon: 'book-open',
    lessons: [
      {
        slug: 'special-moves-castling',
        title: 'Castling',
        minutes: 7,
        level: 'beginner',
        tags: 'rules,castling,special',
        body: `## Two pieces, one move

Castling moves your king two squares toward a rook, and the rook jumps to the square the king crossed. It is the only move in chess where two pieces move at once.

- **Kingside castling:** king e1→g1, rook h1→f1 (written O-O).
- **Queenside castling:** king e1→c1, rook a1→d1 (written O-O-O).

## The four conditions

You may castle only if **all** of these are true:
1. Neither the king nor that rook has moved earlier in the game.
2. No piece stands between the king and the rook.
3. The king is not currently in check.
4. The king does not pass through, or land on, a square attacked by an enemy piece.

The rook may pass through an attacked square — only the king's path is restricted.

**Why it matters:** castling protects the king behind a pawn wall and activates a rook in a single move. In most openings, castling before move 10 is a priority.`,
        fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
        highlights: ['e1', 'g1', 'c1', 'h1', 'a1'],
        quiz: [
          { q: 'Your king is in check. Can you castle out of it?', options: ['Yes, castling is a legal way to escape check', 'No — castling is illegal while in check', 'Only queenside', 'Only if the rook is undefended'], answer: 1, explanation: 'Castling cannot be used to escape check. You must first deal with the check normally.' },
          { q: 'After kingside castling, which square is the rook on?', options: ['g1', 'f1', 'h1', 'e1'], answer: 1, explanation: 'King to g1, rook to f1. Queenside: king c1, rook d1.' },
        ],
      },
      {
        slug: 'special-moves-en-passant',
        title: 'En passant',
        minutes: 6,
        level: 'beginner',
        tags: 'rules,en-passant,special',
        body: `## Capturing "in passing"

If an enemy pawn jumps two squares from its starting position and lands **beside** your pawn, you may capture it as if it had moved only one square. Your pawn moves diagonally onto the empty square behind it, and the enemy pawn is removed.

**Two conditions**
1. It must be the move **immediately after** the double pawn push. If you play anything else, the right disappears forever.
2. Only pawns moving two squares from their start can be captured this way.

**Why it exists:** without en passant, a pawn could run past an enemy pawn without ever being threatened. The rule keeps the pawn structure honest.

On the board, Black has just played ...d7-d5. White can play exd6 e.p.`,
        fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        highlights: ['e5', 'd6'],
        quiz: [
          { q: 'How long do you have to capture en passant?', options: ['One move — immediately', 'Three moves', 'Until your opponent castles', 'Any time before promotion'], answer: 0, explanation: 'The right expires immediately. Wait a move and the chance is gone.' },
        ],
      },
      {
        slug: 'special-moves-promotion',
        title: 'Pawn promotion',
        minutes: 5,
        level: 'beginner',
        tags: 'rules,promotion,special,pawn-power',
        body: `## Reaching the end of the board

A pawn that reaches the eighth rank (for White) or the first rank (for Black) is replaced by any piece of the same colour — **except** a king or another pawn. You may promote to a queen, rook, bishop or knight.

- **Promote to a queen** in almost every case.
- **Underpromotion** (to a knight) is correct when the knight gives an immediate check or avoids stalemate. A rook or bishop promotion is occasionally needed to avoid stalemate.

Promotion is the reason a single pawn can win a game: a pawn is a future queen.

The board below shows a white pawn one step from promotion.`,
        fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
        highlights: ['a7', 'a8'],
        quiz: [
          { q: 'Which pieces can a pawn promote to?', options: ['Only a queen', 'Queen, rook, bishop or knight', 'Any piece including a king', 'Queen or king'], answer: 1, explanation: 'Four choices. A second queen is allowed — and usually best.' },
        ],
      },
      {
        slug: 'check-and-checkmate',
        title: 'Check and checkmate',
        minutes: 8,
        level: 'beginner',
        tags: 'rules,check,checkmate',
        body: `## Attacking the king

**Check** means the king is attacked. You must answer it immediately, using exactly three options:
1. **Move** the king to a safe square.
2. **Block** the attack by putting a piece in the way (impossible against a knight).
3. **Capture** the attacking piece.

**Checkmate** is check with no legal answer. That ends the game immediately — the king is never actually captured.

## Recognising mate
Check three things every time:
- Every escape square for the king is covered or occupied.
- No piece can block the check.
- No piece can capture the attacker.

The classic beginner mate is the **back-rank mate**: a king trapped behind its own pawns falls to a rook or queen arriving on the eighth rank.

Look at the board: White plays Ra8 — the black king is boxed in by its own pawns. Checkmate.`,
        fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
        highlights: ['a1', 'a8', 'g8', 'f7', 'g7', 'h7'],
        quiz: [
          { q: 'You are in check. Which of these is NOT a legal response?', options: ['Blocking with a piece', 'Capturing the checking piece', 'Moving the king', 'Ignoring it and attacking elsewhere'], answer: 3, explanation: 'Check must be answered on the very same move — every time, with no exceptions.' },
          { q: 'What exactly is checkmate?', options: ['Check and the opponent has fewer pieces', 'Check with no legal escape', 'Any check after move 20', 'When the king is captured'], answer: 1, explanation: 'The king is never captured. Checkmate means check with no legal response.' },
        ],
      },
      {
        slug: 'draws-and-stalemate',
        title: 'Draws and stalemate',
        minutes: 6,
        level: 'beginner',
        tags: 'rules,draw,stalemate',
        body: `## Five ways a game ends in a draw

1. **Agreement** — both players accept a draw.
2. **Stalemate** — the player to move has no legal move and is not in check.
3. **Threefold repetition** — the same position occurs three times, with the same player to move, the same castling rights and the same en-passant possibility.
4. **The fifty-move rule** — fifty moves by each side with no capture and no pawn move.
5. **Insufficient material** — neither side can possibly deliver mate (king vs king, king and bishop vs king, king and knight vs king).

## Stalemate is a trap

Stalemate turns a winning position into half a point. If you are winning, always ask: does my opponent have a legal move? The board below shows the classic case — Black to move, no legal move, no check. Draw.

**Platform note:** threefold repetition and the fifty-move rule are enforced automatically by the SPEED CHESS engine, exactly as written above.`,
        fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
        highlights: ['h8', 'g6', 'f7'],
        quiz: [
          { q: 'Black has no legal move and is not in check. What is the result?', options: ['Black loses', 'White wins on time', 'Draw by stalemate', 'White must move again'], answer: 2, explanation: 'That is stalemate — a draw, even if White is a queen up.' },
          { q: 'King and bishop versus king is…', options: ['A win for the bishop side', 'A draw by insufficient material', 'Stalemate', 'Decided by the clock'], answer: 1, explanation: 'One bishop can never force mate; the position is drawn by insufficient material.' },
        ],
      },
    ],
  },
  {
    slug: 'tactics-toolkit',
    title: 'Tactics Toolkit',
    level: 'intermediate',
    summary: 'Forks, pins, skewers and discovered attacks — the patterns that win material.',
    description:
      'Tactics decide most games below master level. Learn the four core patterns, then drill them in the Training and Puzzles area where every position is validated.',
    icon: 'zap',
    lessons: [
      {
        slug: 'tactics-forks',
        title: 'Forks',
        minutes: 6,
        level: 'intermediate',
        tags: 'tactics,fork',
        body: `## One piece, two targets

A **fork** attacks two (or more) enemy pieces at once. The opponent can only save one.

- **Knight forks** are the most common because the jump is hard to see.
- **Pawn forks** are deadly on the fifth rank.
- **Queen forks** often come with check, which makes them unanswerable.

**The winning formula:** find a square that attacks the king and another piece. A check must be answered, so the second target falls next move.

On the board, White's knight on c7 forks the king on e8 and the rook on a8. Black must move the king, and White wins the rook — a "family fork".`,
        fen: 'r3k3/8/2N5/8/8/8/8/4K3 w - - 0 1',
        highlights: ['c7', 'e8', 'a8'],
        quiz: [
          { q: 'Why are forks that give check especially strong?', options: ['They win the queen automatically', 'The check must be answered, so the other piece is lost', 'They are the only legal tactic', 'They force a draw'], answer: 1, explanation: 'A check demands an immediate response, which leaves the fork\'s second victim undefended.' },
        ],
      },
      {
        slug: 'tactics-pins',
        title: 'Pins',
        minutes: 7,
        level: 'intermediate',
        tags: 'tactics,pin',
        body: `## Frozen pieces

A **pin** attacks a piece that cannot move because something more valuable stands behind it.

- **Absolute pin:** the piece behind is the king. The pinned piece is legally unable to move.
- **Relative pin:** the piece behind is valuable but not the king. Moving is legal — but usually bad.

**How to exploit a pin**
- Attack the pinned piece again (a pawn push often does it).
- Pile up on the pinned piece with more attackers than defenders.
- Use the fact that the pinned piece cannot defend: it may be unable to recapture.

In the demonstration, White's bishop on b5 pins the knight on c6 to the king on e8. The knight is rooted to the spot.`,
        fen: 'r1bqk1nr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        highlights: ['b5', 'c6', 'e8'],
        quiz: [
          { q: 'What is an absolute pin?', options: ['A pin that wins the queen', 'A pin where the king stands behind the pinned piece', 'A pin with two attackers', 'A pin on the edge of the board'], answer: 1, explanation: 'The king behind the piece makes the pin absolute — moving would expose the king, so it is illegal.' },
        ],
      },
      {
        slug: 'tactics-skewers',
        title: 'Skewers and discovered attacks',
        minutes: 7,
        level: 'intermediate',
        tags: 'tactics,skewer,discovered-attacks',
        body: `## The pin, reversed

A **skewer** attacks a valuable piece that must move — and when it does, something less valuable behind it falls. Think of it as a pin with the pieces swapped: king in front, rook behind.

**Discovered attack:** you move one piece out of the way, and the piece behind it suddenly attacks the enemy. If the piece that moves creates its own threat, the opponent faces two problems at once — a **discovered double attack**, the deadliest tactical pattern of all.

**Practical tip:** before every move, look for your own pieces lined up with enemy pieces. Lines that "look blocked" can be opened by one move.`,
        fen: '4k3/8/8/8/8/8/4r3/4K2R w - - 0 1',
        highlights: ['h1', 'e1', 'e2', 'e8'],
        quiz: [
          { q: 'How does a skewer differ from a pin?', options: ['It only works with bishops', 'The more valuable piece is in front and must move', 'It always wins the king', 'It is a pawn move'], answer: 1, explanation: 'In a skewer the valuable piece is attacked first; it steps aside and reveals a second target.' },
        ],
      },
      {
        slug: 'blunder-check',
        title: 'The blunder check',
        minutes: 5,
        level: 'intermediate',
        tags: 'improvement,discipline',
        body: `## The habit that gains rating fastest

Before you release any move, run this 10-second check:

1. **Was the piece I am moving defended?**
2. **What does my opponent's last move threaten?**
3. **After my move, do any enemy pieces now attack something of mine that is undefended?**
4. **Are there any checks, captures or threats I am missing — for either side?**

This is called the **CCT scan** (Checks, Captures, Threats). Players under 1400 lose the majority of their games to exactly the mistakes this scan catches. Practising it for two weeks changes results more than learning a new opening.

**When you are winning**, add one more question: *can I simplify without risk?* Trade pieces, not pawns, and keep your king safe.`,
        quiz: [
          { q: 'What does the CCT scan stand for?', options: ['Centre, Colour, Time', 'Checks, Captures, Threats', 'Castle, Capture, Trade', 'Clock, Centre, Tactics'], answer: 1, explanation: 'Checks, captures and threats — for both sides. A ten-second habit that prevents most losses.' },
        ],
      },
    ],
  },
  {
    slug: 'strategy-and-endgames',
    title: 'Strategy, Endgames and Time',
    level: 'intermediate',
    summary: 'Opening principles, king safety, basic endgames and clock management.',
    description:
      'Move beyond tactics. These lessons build the plans and habits that turn a series of good moves into a winning game — plus the endgame knowledge every player needs.',
    icon: 'target',
    lessons: [
      {
        slug: 'opening-principles',
        title: 'Opening principles',
        minutes: 7,
        level: 'intermediate',
        tags: 'strategy,opening',
        body: `## Four rules beat twenty moves of theory

1. **Control the centre.** Pawns on e4/d4 (or e5/d5) give your pieces room.
2. **Develop knights and bishops** toward the centre, one move each.
3. **Castle early** so your king is safe and your rook is active.
4. **Connect your rooks** by clearing the back rank.

**What to avoid**
- Moving the same piece twice without reason.
- Early queen sorties that invite attacks.
- Grabbing side pawns at the cost of development.
- Pushing pawns in front of your castled king.

A workable plan: 1.e4 (or 1.d4), knights out, bishops out, castle, rooks to the centre files, then look for a target.`,
        fen: fenAfter('e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6'),
        highlights: ['e4', 'd4', 'f3', 'c4', 'g1'],
        quiz: [
          { q: 'How many pieces should you aim to develop before starting an attack?', options: ['One', 'Two or three minor pieces plus castling', 'All eight pawns', 'It does not matter'], answer: 1, explanation: 'Develop knights and bishops, castle, then look for a plan. Attacking with one piece never works.' },
        ],
      },
      {
        slug: 'protect-your-king',
        title: 'King safety',
        minutes: 6,
        level: 'intermediate',
        tags: 'strategy,king-safety',
        body: `## The most expensive mistake in chess

A king left in the centre is a target. Every check is free tempo for your opponent, and open lines point straight at your most valuable piece.

**King safety checklist**
- Castle within the first ten moves in almost every game.
- Do not move the pawns in front of your castled king unless you must.
- After castling, watch the diagonal leading to your king.
- In opposite-side castling positions, pawn storms are correct — but only with pieces behind them.

**When the queens come off**, safety matters less: activate the king and head for the endgame.`,
        fen: fenAfter('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7'),
        highlights: ['e1', 'f7', 'h5'],
        quiz: [
          { q: 'Why is 2.Qh5 a poor move for beginners?', options: ['It loses the queen immediately', 'It develops the queen too early and invites attacks', 'It is illegal', 'It blocks the king'], answer: 1, explanation: 'The queen becomes a target and White falls behind in development. Qh5 is playable but needs care.' },
        ],
      },
      {
        slug: 'basic-endgames',
        title: 'Basic endgames you must know',
        minutes: 8,
        level: 'intermediate',
        tags: 'endgame,king-activity',
        body: `## Three positions worth memorising

**1. King and queen vs king.** Drive the enemy king to the edge with the queen, bring your king close, deliver mate. Never stalemate: leave the king a square until your own king arrives.

**2. King and rook vs king.** Cut the king off with the rook, bring your king up, then mate on the edge.

**3. King and pawn vs king.** If your king reaches the sixth rank in front of the pawn, you win. If the defending king gets in front, it is a draw. The **rule of the square** tells you instantly whether a king catches a running pawn: count the squares in the square formed by the pawn and its promotion square.

**The golden rule:** in the endgame, the king is a piece. Bring it to the centre.`,
        fen: '8/8/8/3k4/8/8/3KP3/8 w - - 0 1',
        highlights: ['d2', 'e2', 'd5'],
        quiz: [
          { q: 'In the endgame, where should the king be?', options: ['In the corner', 'Behind its own pawns', 'Active, toward the centre', 'On the eighth rank'], answer: 2, explanation: 'An active king controls squares and escorts pawns. Passivity loses drawn endgames.' },
        ],
      },
      {
        slug: 'time-management',
        title: 'Time management',
        minutes: 5,
        level: 'intermediate',
        tags: 'practical,clock',
        body: `## Your clock is material

Every game has three resources: pieces, squares and time. Time is the only one you cannot win back.

**Practical budgets**
- **10+5 rapid:** aim for about half your clock at move 20.
- **3+2 blitz:** 15 seconds per move in the opening, save at least 30 seconds for the endgame.
- **Bullet:** trust the patterns you have trained. Thinking long is not an option.

**Where to spend time**
- Irreversible decisions: pawn pushes, trades, king safety.
- Any position with checks or captures available.

**Where to save time**
- The first 8–10 moves of an opening you know.
- Recaptures that are obviously forced.

If you are winning on the board, simplify and bank seconds. A won position with no time is not won.`,
        fen: START,
        highlights: [],
        quiz: [
          { q: 'In a 10+5 game, what is a sensible clock target for move 20?', options: ['Under 1 minute', 'About half your starting time', 'All of it', 'It does not matter'], answer: 1, explanation: 'Half the clock at move 20 leaves enough for the critical middlegame and endgame.' },
        ],
      },
    ],
  },
  {
    slug: 'first-complete-game',
    title: 'Your First Complete Game',
    level: 'beginner',
    summary: 'Everything comes together: a guided first game with a checklist before every move.',
    description:
      'You know the rules. This final course walks you through a complete game from the first move to the result, with a checklist you can reuse in every game you play.',
    icon: 'play',
    lessons: [
      {
        slug: 'first-game-guide',
        title: 'Playing your first game',
        minutes: 8,
        level: 'beginner',
        tags: 'practice,first-game',
        body: `## A checklist for every move

**Before the game**
1. Check the board is set up correctly (queen on her colour, light on the right).
2. Note the time control.
3. Decide your first three moves before you think about the middlegame.

**On every move**
1. What did my opponent's last move change?
2. Do I have checks, captures or threats?
3. Can I develop a piece or improve one?
4. Is my king safe?
5. After my move, is anything of mine undefended?

**Finishing the game**
- Shake hands (or say "good game").
- Run the game through **Game Analysis** and find one moment to remember.
- Save one puzzle theme to practise tomorrow.

## Your first game here

Open **Play → Play against the computer**, choose the *Beginner* level, and play a full game. The computer blunders deliberately at that level, so you will have real chances. Do not worry about the result — the goal is to finish a game using the checklist.`,
        fen: START,
        highlights: [],
        quiz: [
          { q: 'What should you check before every move?', options: ['Only your own plan', 'Your opponent\'s threats and your undefended pieces', 'The clock only', 'Nothing — just play fast'], answer: 1, explanation: 'Every move starts with what your opponent just did. Then look for your own opportunities.' },
        ],
      },
      {
        slug: 'improvement-plan',
        title: 'Your improvement plan',
        minutes: 5,
        level: 'intermediate',
        tags: 'improvement,plan',
        body: `## A weekly routine that works

**Daily (15 minutes)**
- 5 puzzles from Training (mix of themes).
- One lesson from Learn Chess.

**Weekly**
- Two rated games in your main time control.
- Analyse every loss with Game Analysis — find the single turning point.
- Add one opening idea to your repertoire.

**Monthly**
- Review your analytics: which time control is weakest? Which opening loses most often?
- Set one concrete target, like "no blunders before move 20 in my next five games".

**What not to do**
- Play rated games when tired, upset or in a hurry.
- Blame the opponent, the connection or the engine. Every loss contains one fixable mistake.
- Memorise thirty moves of theory before you can finish a rook endgame.

Consistency beats intensity. Fifteen focused minutes a day beats a six-hour weekend.`,
        fen: START,
        highlights: [],
        quiz: [
          { q: 'What is the most effective way to review a loss?', options: ['Delete it', 'Find one turning point and one habit to change', 'Blame the clock', 'Play another immediately'], answer: 1, explanation: 'One concrete lesson per game compounds faster than vague review of everything.' },
        ],
      },
    ],
  },
];
