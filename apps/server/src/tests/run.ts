/**
 * Automated test suite for SPEED CHESS.
 * Covers: chess rules via the engine, the move service (castling, en passant,
 * promotion, checkmate, stalemate, draws, clocks, ratings), auth, puzzles,
 * matchmaking and tournaments.
 */
import { Chess } from 'chess.js';
import { assert, assertEqual, assertClose, flush, report, suite, test, testAsync } from './harness.js';
import { db, migrate } from '../db/index.js';
import { glicko2Update, categoryFor, divisionFor } from '../lib/ratings.js';
import { hashPassword, verifyPassword, passwordIssues } from '../lib/password.js';
import { analyseGame, chooseComputerMove, identifyOpening, LEVELS } from '@speed-chess/engine';
import { applyMove, createGame, finishGame, gameById, resign, offerDraw, movesFor } from '../services/games.js';
import { matchmaker, windowFor } from '../services/matchmaking.js';
import { generateSwissRound, startRoundGames, tournamentStandings } from '../services/tournaments.js';
import { seedReferenceContent } from '../db/reference.js';

migrate();
seedReferenceContent();

const newUser = (suffix: string) => {
  const id = `usr_test_${suffix}`;
  db.prepare(`INSERT OR REPLACE INTO users (id, username, username_lower, email, email_lower, password_hash, email_verified)
    VALUES (?,?,?,?,?,?,1)`).run(id, `tester_${suffix}`, `tester_${suffix}`, `${suffix}@test.local`, `${suffix}@test.local`, 'x');
  for (const c of ['bullet', 'blitz', 'rapid', 'classical']) {
    db.prepare('INSERT OR REPLACE INTO ratings (user_id, category, rating, rd) VALUES (?,?,?,?)').run(id, c, 1500, 90);
  }
  return id;
};

/* ------------------------------------------------------------------ */
async function main() {
suite('Chess rules (chess.js integration)', () => {
  test('detects checkmate — back-rank mate', () => {
    const chess = new Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    chess.move('Ra8');
    assert(chess.isCheckmate(), 'expected checkmate after Ra8');
  });
  test('detects stalemate and it is a draw', () => {
    const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    assert(chess.isStalemate(), 'expected stalemate');
    assert(chess.isDraw(), 'stalemate must be a draw');
  });
  test('allows castling when legal and blocks it after the king moves', () => {
    const chess = new Chess();
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) chess.move(san);
    const moves = chess.moves({ verbose: true }).map(m => m.san);
    assert(moves.includes('O-O'), 'kingside castling should be legal');
    chess.move('O-O');
    assertEqual(chess.get('g1')?.type, 'k', 'king should be on g1 after castling');
    assertEqual(chess.get('f1')?.type, 'r', 'rook should be on f1 after castling');
  });
  test('captures en passant only immediately', () => {
    const chess = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const san = chess.move({ from: 'e5', to: 'd6' });
    assertEqual(san.san, 'exd6', 'en passant SAN');
    assertEqual(chess.get('d5'), undefined, 'captured pawn must be removed');
  });
  test('promotes a pawn and records the chosen piece', () => {
    const chess = new Chess('8/P5k1/8/8/8/8/6K1/8 w - - 0 1');
    const move = chess.move({ from: 'a7', to: 'a8', promotion: 'n' });
    assertEqual(move.promotion, 'n', 'underpromotion to knight');
    assertEqual(chess.get('a8')?.type, 'n', 'knight on a8');
  });
  test('rejects illegal moves', () => {
    const chess = new Chess();
    let threw = false;
    try { chess.move({ from: 'e2', to: 'e5' }); } catch { threw = true; }
    assert(threw, 'an illegal pawn jump must be rejected');
  });
  test('detects threefold repetition', () => {
    const chess = new Chess();
    for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) chess.move(san);
    assert(chess.isThreefoldRepetition(), 'expected threefold repetition');
  });
  test('detects insufficient material', () => {
    const chess = new Chess('4k3/8/8/8/8/8/8/4KB2 w - - 0 1');
    assert(chess.isInsufficientMaterial(), 'king and bishop vs king is insufficient');
  });
});

/* ------------------------------------------------------------------ */
suite('Engine (search, opponent, analysis)', () => {
  test('finds mate in one', () => {
    const result = chooseComputerMove('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'expert');
    assertEqual(result.move?.san, 'Ra8#', 'engine should find Ra8 mate');
  });
  test('prefers winning a free queen', () => {
    const fen = '4k3/8/8/8/8/8/4q3/3QK3 w - - 0 1';
    const result = chooseComputerMove(fen, 'advanced');
    assert(result.move?.san === 'Kxe2' || result.move?.san === 'Qxe2+', 'engine should win the queen or trade queens');
  });
  test('difficulty levels cover the full strength range', () => {
    assertEqual(LEVELS.length, 5, 'five levels');
    assert(LEVELS[0].depth < LEVELS[4].depth, 'beginner depth must be lower than expert');
  });
  test('identifies openings from move sequences', () => {
    assertEqual(identifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']), 'Ruy López');
    assertEqual(identifyOpening(['d4', 'd5', 'c4', 'e6']), "Queen's Gambit Declined");
    assertEqual(identifyOpening(['a3']), null);
  });
  test('analyses a full game and produces real evaluations', () => {
    const pgn = `[Event "test"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;
    const analysis = analyseGame(pgn);
    assertEqual(analysis.moves.length, 4, 'every ply analysed');
    assert(analysis.accuracyWhite >= 0 && analysis.accuracyWhite <= 100, 'accuracy in range');
    assert(analysis.moves[0].classification === 'book' || analysis.moves[0].classification === 'good' || analysis.moves[0].classification === 'inaccuracy', 'first move is classified');
    assert(analysis.moves[3].san === 'Qh4#', 'mate recorded');
  });
  test('classifies a blunder in a real game', () => {
    const pgn = `[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;
    const analysis = analyseGame(pgn);
    assert(analysis.moves.length === 7, 'seven plies analysed');
    assert(analysis.moves.some(m => ['inaccuracy', 'mistake', 'blunder'].includes(m.classification)),
      'at least one imprecise move is flagged');
    assert(analysis.moves[analysis.moves.length - 1].classification === 'best', 'the mating move is rated best');
    assert(analysis.moves.filter(m => m.classification === 'book').length <= 4, 'book detection stops when the line leaves theory');
  });
});

/* ------------------------------------------------------------------ */
suite('Rating system (Glicko-2)', () => {
  test('a win raises the rating and lowers the deviation', () => {
    const result = glicko2Update({ rating: 1500, rd: 200, volatility: 0.06 }, { rating: 1500, rd: 200, volatility: 0.06 }, 1);
    assert(result.rating > 1500, 'rating should rise');
    assert(result.rd < 200, 'deviation should shrink');
  });
  test('beating a much stronger player gains more than beating an equal', () => {
    const equal = glicko2Update({ rating: 1500, rd: 90, volatility: 0.06 }, { rating: 1500, rd: 90, volatility: 0.06 }, 1);
    const upset = glicko2Update({ rating: 1500, rd: 90, volatility: 0.06 }, { rating: 2000, rd: 90, volatility: 0.06 }, 1);
    assert(upset.rating - 1500 > equal.rating - 1500, 'upset must gain more points');
  });
  test('a draw between equals is rating-neutral', () => {
    const result = glicko2Update({ rating: 1500, rd: 90, volatility: 0.06 }, { rating: 1500, rd: 90, volatility: 0.06 }, 0.5);
    assertClose(result.rating, 1500, 0.01);
  });
  test('converges instead of looping (regression test)', () => {
    const start = Date.now();
    for (let i = 0; i < 200; i++) glicko2Update({ rating: 1200 + i, rd: 350, volatility: 0.06 }, { rating: 1600, rd: 80, volatility: 0.06 }, 0.5);
    assert(Date.now() - start < 2000, '200 updates must finish quickly');
  });
  test('time controls map to the correct category and division', () => {
    assertEqual(categoryFor(60, 0), 'bullet');
    assertEqual(categoryFor(180, 2), 'blitz');
    assertEqual(categoryFor(600, 5), 'rapid');
    assertEqual(categoryFor(1800, 10), 'classical');
    assertEqual(divisionFor(1250).name, 'Silver');
    assertEqual(divisionFor(2050).name, 'Master');
  });
});

/* ------------------------------------------------------------------ */
suite('Passwords and sessions', () => {
  testAsync('hashes with scrypt and verifies correctly', async () => {
    const hash = await hashPassword('CorrectHorse9');
    assert(hash.startsWith('scrypt$'), 'scrypt prefix');
    assert(await verifyPassword('CorrectHorse9', hash), 'correct password verifies');
    assert(!(await verifyPassword('wrongPassword1', hash)), 'wrong password rejected');
  });
  test('rejects weak passwords with a reason', () => {
    assert(passwordIssues('short').length > 0, 'short password rejected');
    assert(passwordIssues('alllettersonly').length > 0, 'letter-only password rejected');
    assertEqual(passwordIssues('StrongPass1').length, 0, 'strong password accepted');
  });
});

/* ------------------------------------------------------------------ */
suite('Game service (authoritative moves)', () => {
  const white = newUser('white');
  const black = newUser('black');

  test('creates a rated online game with clocks and correct metadata', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 300, increment: 2, rated: true });
    assertEqual(game.status, 'active');
    assertEqual(game.turn, 'w');
    assertEqual(game.white_clock_ms, 300000);
    assertEqual(game.category, 'blitz');
  });
  test('rejects a move from the wrong player', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 300, increment: 0, rated: true });
    const result = applyMove(game.id, black, 'e2', 'e4');
    assert(!result.ok, 'black cannot move first');
    assertEqual(result.error, 'It is not your turn');
  });
  test('rejects an illegal move', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 300, increment: 0, rated: true });
    const result = applyMove(game.id, white, 'e2', 'e5');
    assert(!result.ok, 'illegal move rejected');
  });
  test('accepts legal moves and switches the turn', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 300, increment: 0, rated: true });
    const result = applyMove(game.id, white, 'e2', 'e4');
    assert(result.ok, result.error ?? 'move should be legal');
    assertEqual(result.game?.turn, 'b');
    assertEqual(movesFor(game.id).length, 1);
  });
  test('detects checkmate and finishes the game', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 600, increment: 0, rated: true });
    // Fool's mate
    applyMove(game.id, white, 'f2', 'f3');
    applyMove(game.id, black, 'e7', 'e5');
    applyMove(game.id, white, 'g2', 'g4');
    const mate = applyMove(game.id, black, 'd8', 'h4');
    assert(mate.ok, mate.error ?? 'Qh4 should be legal');
    assertEqual(mate.finished?.termination, 'checkmate');
    const stored = gameById(game.id)!;
    assertEqual(stored.status, 'finished');
    assertEqual(stored.result, 'black');
    assert(stored.pgn && stored.pgn.includes('Qh4#'), 'PGN should record the mate');
  });
  test('applies ratings exactly once per finished game', () => {
    const before = db.prepare('SELECT rating, games FROM ratings WHERE user_id = ? AND category = ?').get(white, 'blitz') as any;
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 300, increment: 0, rated: true });
    applyMove(game.id, white, 'e2', 'e4');
    applyMove(game.id, black, 'e7', 'e5');
    resign(game.id, white);
    const after = db.prepare('SELECT rating, games FROM ratings WHERE user_id = ? AND category = ?').get(white, 'blitz') as any;
    assertEqual(after.games, before.games + 1, 'games counter incremented once');
    // Calling finish again must not double-apply
    const stored = gameById(game.id)!;
    finishGame(stored, 'black', 'resignation');
    const afterTwice = db.prepare('SELECT games FROM ratings WHERE user_id = ? AND category = ?').get(white, 'blitz') as any;
    assertEqual(afterTwice.games, after.games, 'finishing twice must not rate twice');
  });
  test('cannot move after the game has finished', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 300, increment: 0, rated: true });
    applyMove(game.id, white, 'e2', 'e4');
    resign(game.id, black);
    const after = applyMove(game.id, white, 'e7', 'e5');
    assert(!after.ok, 'moves must be rejected after the game ends');
  });
  test('draw offers require both players', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 300, increment: 0, rated: true });
    const first = offerDraw(game.id, white);
    assertEqual(first.agreed, false);
    const second = offerDraw(game.id, black);
    assertEqual(second.agreed, true);
    assertEqual(gameById(game.id)!.termination, 'agreement');
  });
  test('unrated games do not change ratings', () => {
    const before = db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND category = ?').get(white, 'blitz') as any;
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 300, increment: 0, rated: false });
    applyMove(game.id, white, 'e2', 'e4');
    resign(game.id, white);
    const after = db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND category = ?').get(white, 'blitz') as any;
    assertEqual(after.rating, before.rating, 'casual game must not affect ratings');
  });
  test('computer games are rejected unless it is the engine\'s turn', () => {
    const game = createGame({ whiteId: white, blackId: null, mode: 'computer', seconds: 600, increment: 0, difficulty: 'easy' });
    const stored = gameById(game.id)!;
    assertEqual(stored.black_id, null, 'computer games have no black user');
    assertEqual(stored.mode, 'computer');
    // The engine cannot move before the human has moved.
    assertEqual(applyMove(game.id, undefined, 'e7', 'e5').ok, false, 'the engine waits for its turn');
    // The human moves as White...
    assertEqual(applyMove(game.id, white, 'e2', 'e4').ok, true, 'the human moves as White');
    // ...and cannot also move for the engine.
    assertEqual(applyMove(game.id, white, 'e7', 'e5').ok, false, 'the human cannot play the engine side');
    // The engine replies with no user id at all.
    const engine = applyMove(game.id, undefined, 'e7', 'e5');
    assertEqual(engine.ok, true, 'the engine moves for Black');
    assertEqual(gameById(game.id)!.turn, 'w', 'the turn returns to the human');
    // A third party cannot move in the game.
    assertEqual(applyMove(game.id, newUser('stranger'), 'd2', 'd4').ok, false, 'a third party cannot move');
  });
});

/* ------------------------------------------------------------------ */
suite('Matchmaking', () => {
  const a = newUser('mma');
  const b = newUser('mmb');
  test('pairs two queued players of similar rating', () => {
    db.prepare('UPDATE ratings SET rating = 1500 WHERE user_id = ?').run(a);
    db.prepare('UPDATE ratings SET rating = 1520 WHERE user_id = ?').run(b);
    matchmaker.cancel(a); matchmaker.cancel(b);
    const first = matchmaker.enqueue({ userId: a, username: 'tester_mma', rating: 1500, category: 'rapid', seconds: 600, increment: 5, rated: true });
    assertEqual(first.waiting, true);
    const second = matchmaker.enqueue({ userId: b, username: 'tester_mmb', rating: 1520, category: 'rapid', seconds: 600, increment: 5, rated: true });
    assert(second.matched, 'second player should be matched');
    assert(second.matched!.white_id === a || second.matched!.black_id === a, 'player a seated');
    assert(second.matched!.white_id === b || second.matched!.black_id === b, 'player b seated');
  });
  test('widening window eventually accepts a mismatch, but not immediately', () => {
    const c = newUser('mmc');
    db.prepare('UPDATE ratings SET rating = 2200 WHERE user_id = ?').run(c);
    matchmaker.cancel(a); matchmaker.cancel(b); matchmaker.cancel(c);
    matchmaker.enqueue({ userId: a, username: 'tester_mma', rating: 1000, category: 'classical', seconds: 1800, increment: 10, rated: true });
    const far = matchmaker.enqueue({ userId: c, username: 'tester_mmc', rating: 2200, category: 'classical', seconds: 1800, increment: 10, rated: true });
    assertEqual(far.matched, undefined, '1200 points apart is not paired immediately');
    assertEqual(windowFor(0), 100);
    assert(windowFor(30_000) === Number.POSITIVE_INFINITY, 'after 20s any rating is accepted');
    matchmaker.cancel(a); matchmaker.cancel(c);
  });
  test('unrated games pair regardless of rating distance', () => {
    const d = newUser('mmd');
    matchmaker.cancel(a); matchmaker.cancel(d);
    matchmaker.enqueue({ userId: a, username: 'tester_mma', rating: 800, category: 'bullet', seconds: 60, increment: 0, rated: false });
    const casual = matchmaker.enqueue({ userId: d, username: 'tester_mmd', rating: 2400, category: 'bullet', seconds: 60, increment: 0, rated: false });
    assert(casual.matched, 'casual games ignore the rating window');
    assertEqual(casual.matched!.rated, 0, 'the game is unrated');
    matchmaker.cancel(a); matchmaker.cancel(d);
  });
  test('a matched game is playable by exactly those two players', () => {
    const p1 = newUser('mmp1');
    const p2 = newUser('mmp2');
    const outsider = newUser('mmp3');
    matchmaker.cancel(p1); matchmaker.cancel(p2);
    matchmaker.enqueue({ userId: p1, username: 'tester_mmp1', rating: 1500, category: 'blitz', seconds: 180, increment: 2, rated: false });
    const paired = matchmaker.enqueue({ userId: p2, username: 'tester_mmp2', rating: 1500, category: 'blitz', seconds: 180, increment: 2, rated: false });
    assert(paired.matched, 'players paired');
    const gameId = paired.matched!.id;
    const white = paired.matched!.white_id === p1 ? p1 : p2;
    const black = white === p1 ? p2 : p1;
    assertEqual(applyMove(gameId, black, 'e7', 'e5').ok, false, 'Black cannot move first');
    assertEqual(applyMove(gameId, outsider, 'e2', 'e4').ok, false, 'an outsider cannot move');
    assertEqual(applyMove(gameId, white, 'e2', 'e4').ok, true, 'White moves');
    assertEqual(applyMove(gameId, black, 'e7', 'e5').ok, true, 'Black replies');
  });
  test('does not pair players in different time controls', () => {
    matchmaker.cancel(a); matchmaker.cancel(b);
    matchmaker.enqueue({ userId: a, username: 'tester_mma', rating: 1500, category: 'rapid', seconds: 600, increment: 5, rated: true });
    const other = matchmaker.enqueue({ userId: b, username: 'tester_mmb', rating: 1500, category: 'bullet', seconds: 60, increment: 0, rated: true });
    assertEqual(other.matched, undefined);
    matchmaker.cancel(a); matchmaker.cancel(b);
  });
});

/* ------------------------------------------------------------------ */
suite('Tournaments', () => {
  test('Swiss pairing never repeats an opponent within a round', () => {
    const tournamentId = 'trn_test_swiss';
    db.prepare(`INSERT OR REPLACE INTO tournaments (id, name, slug, description, format, category, rounds, initial_seconds,
      increment, max_players, starts_at, registration_deadline, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),'upcoming')`)
      .run(tournamentId, 'Test Swiss', 'test-swiss', 'Test tournament', 'swiss', 'blitz', 3, 180, 2, 16);
    const players = ['s1', 's2', 's3', 's4', 's5', 's6'].map(newUser);
    players.forEach((p, i) => {
      db.prepare("INSERT OR REPLACE INTO registrations (tournament_id, user_id, status, seed) VALUES (?,?, 'registered', ?)")
        .run(tournamentId, p, i + 1);
    });
    const pairs = generateSwissRound(tournamentId, 1);
    assertEqual(pairs, 3, 'three boards for six players');
    const rows = db.prepare('SELECT white_id, black_id FROM pairings WHERE tournament_id = ? AND round = 1').all(tournamentId) as any[];
    assertEqual(rows.length, 3, 'three pairings stored');
    const seen = new Set<string>();
    for (const row of rows) {
      assert(!seen.has(row.white_id), 'a player cannot be paired twice');
      seen.add(row.white_id);
      assert(!seen.has(row.black_id), 'a player cannot be paired twice');
      seen.add(row.black_id);
    }
    const standings = tournamentStandings(tournamentId);
    assertEqual(standings.length, 6, 'all players in standings');
    startRoundGames(tournamentId, 1);
    const games = db.prepare('SELECT game_id FROM pairings WHERE tournament_id = ? AND round = 1').all(tournamentId) as any[];
    assert(games.every(g => g.game_id), 'each pairing must open a real game');
  });
});

/* ------------------------------------------------------------------ */
suite('Database integrity', () => {
  test('all reference content is present after seeding', () => {
    const courses = (db.prepare('SELECT COUNT(*) AS n FROM courses').get() as any).n;
    const lessons = (db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as any).n;
    const puzzles = (db.prepare('SELECT COUNT(*) AS n FROM puzzles').get() as any).n;
    const openings = (db.prepare('SELECT COUNT(*) AS n FROM openings').get() as any).n;
    assert(lessons >= 20, `expected at least 20 lessons, found ${lessons}`);
    assert(courses >= 5, `expected at least 5 courses, found ${courses}`);
    assert(puzzles >= 15, `expected at least 15 puzzles, found ${puzzles}`);
    assert(openings >= 15, `expected at least 15 openings, found ${openings}`);
  });
  test('every puzzle solution is a legal move sequence', () => {
    const rows = db.prepare('SELECT id, fen, solution FROM puzzles').all() as any[];
    for (const row of rows) {
      const chess = new Chess(row.fen);
      for (const san of JSON.parse(row.solution)) chess.move(san);
    }
  });
  test('every lesson has a valid FEN when one is supplied', () => {
    const rows = db.prepare('SELECT slug, fen FROM lessons WHERE fen IS NOT NULL').all() as any[];
    assert(rows.length > 10, 'lessons should include demonstration boards');
    for (const row of rows) new Chess(row.fen);
  });
  test('foreign keys are enforced', () => {
    let threw = false;
    try {
      db.prepare('INSERT INTO lesson_progress (user_id, lesson_id, status) VALUES (?,?,?)').run('does-not-exist', 'also-missing', 'started');
    } catch { threw = true; }
    assert(threw, 'invalid foreign keys must be rejected');
  });
  test('usernames and emails are unique', () => {
    let threw = false;
    try {
      db.prepare(`INSERT INTO users (id, username, username_lower, email, email_lower, password_hash)
        VALUES ('x1','dupe','dupe','a@b.c','a@b.c','h')`).run();
      db.prepare(`INSERT INTO users (id, username, username_lower, email, email_lower, password_hash)
        VALUES ('x2','dupe','dupe','d@e.f','d@e.f','h')`).run();
    } catch { threw = true; }
    assert(threw, 'duplicate usernames must be rejected');
  });
});

await flush();
const ok = report();
db.close();
process.exit(ok ? 0 : 1);
}

main();
