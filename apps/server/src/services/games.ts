import { Chess } from 'chess.js';
import { db, nowIso } from '../db/index.js';
import { id, shortCode } from '../lib/ids.js';
import { categoryFor, glicko2Update, type Category } from '../lib/ratings.js';
import { bumpAchievement, getUserRating, logActivity, notify } from '../lib/service.js';
import { identifyOpening } from '@speed-chess/engine';
import { hub } from './hub.js';

export interface GameRow {
  id: string; white_id: string | null; black_id: string | null; white_name: string; black_name: string;
  white_rating: number | null; black_rating: number | null; mode: string; rated: number; category: Category;
  initial_seconds: number; increment: number; difficulty: string | null; fen: string; pgn: string | null;
  status: string; result: string | null; termination: string | null; white_clock_ms: number;
  black_clock_ms: number; turn: string; opening_name: string | null; tournament_id: string | null;
  is_private: number; invite_code: string | null; started_at: string; finished_at: string | null;
  accuracy_white: number | null; accuracy_black: number | null; updated_at: string;
}

const START_FEN = new Chess().fen();

export function gameById(gameId: string): GameRow | undefined {
  return db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as GameRow | undefined;
}

export function movesFor(gameId: string) {
  return db.prepare('SELECT ply, san, uci, fen_after, clock_white_ms, clock_black_ms, is_check, is_capture FROM moves WHERE game_id = ? ORDER BY ply').all(gameId);
}

export function gamePayload(game: GameRow) {
  return {
    id: game.id,
    white: { id: game.white_id, name: game.white_name, rating: game.white_rating },
    black: { id: game.black_id, name: game.black_name, rating: game.black_rating },
    mode: game.mode,
    rated: Boolean(game.rated),
    category: game.category,
    initialSeconds: game.initial_seconds,
    increment: game.increment,
    difficulty: game.difficulty,
    fen: game.fen,
    status: game.status,
    result: game.result,
    termination: game.termination,
    turn: game.turn,
    clocks: { white: game.white_clock_ms, black: game.black_clock_ms },
    moves: movesFor(game.id),
    opening: game.opening_name,
    pgn: game.pgn,
    inviteCode: game.invite_code,
    isPrivate: Boolean(game.is_private),
    tournamentId: game.tournament_id,
    startedAt: game.started_at,
    finishedAt: game.finished_at,
    accuracy: { white: game.accuracy_white, black: game.accuracy_black },
  };
}

function usernameOf(userId: string): string {
  const row = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
  return row?.username ?? 'Player';
}

export interface CreateGameOptions {
  whiteId?: string | null;
  blackId?: string | null;
  /** Set for games where a player owns the record without playing a colour (local hot-seat, imports). */
  ownerId?: string | null;
  mode: 'computer' | 'online' | 'local' | 'tournament';
  seconds: number;
  increment: number;
  rated?: boolean;
  difficulty?: string | null;
  category?: Category;
  isPrivate?: boolean;
  tournamentId?: string | null;
  whiteName?: string;
  blackName?: string;
}

export function createGame(opts: CreateGameOptions): GameRow {
  const gameId = id('gm_');
  const category = opts.category ?? categoryFor(opts.seconds, opts.increment);
  const whiteRating = opts.whiteId ? Math.round(getUserRating(opts.whiteId, category).rating) : null;
  const blackRating = opts.blackId ? Math.round(getUserRating(opts.blackId, category).rating) : null;
  const whiteName = opts.whiteName ?? (opts.whiteId ? usernameOf(opts.whiteId) : 'White');
  const blackName = opts.blackName ?? (opts.blackId ? usernameOf(opts.blackId)
    : opts.mode === 'computer' ? `Computer (${opts.difficulty ?? 'easy'})` : 'Black');
  db.prepare(
    `INSERT INTO games (id, white_id, black_id, owner_id, white_name, black_name, white_rating, black_rating, mode, rated, category,
       initial_seconds, increment, difficulty, fen, status, white_clock_ms, black_clock_ms, turn, tournament_id, is_private, invite_code, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    gameId, opts.whiteId ?? null, opts.blackId ?? null, opts.ownerId ?? opts.whiteId ?? opts.blackId ?? null,
    whiteName, blackName, whiteRating, blackRating,
    opts.mode, opts.rated ? 1 : 0, category, opts.seconds, opts.increment, opts.difficulty ?? null, START_FEN, 'active',
    opts.seconds * 1000, opts.seconds * 1000, 'w', opts.tournamentId ?? null, opts.isPrivate ? 1 : 0,
    opts.isPrivate ? shortCode(6) : null, nowIso(),
  );
  const game = gameById(gameId)!;
  if (game.white_id) hub.toUser(game.white_id, 'game:started', { game: gamePayload(game) });
  if (game.black_id) hub.toUser(game.black_id, 'game:started', { game: gamePayload(game) });
  return game;
}

export interface MoveResult {
  ok: boolean;
  error?: string;
  game?: ReturnType<typeof gamePayload>;
  finished?: { result: string; termination: string };
}

function elapsedSince(game: GameRow): number {
  return Math.max(0, Date.now() - new Date(game.updated_at.replace(' ', 'T') + 'Z').getTime());
}

function tick(game: GameRow): { white: number; black: number; timedOut: boolean } {
  const elapsed = elapsedSince(game);
  const remaining = Math.max(0, (game.turn === 'w' ? game.white_clock_ms : game.black_clock_ms) - elapsed);
  return {
    white: game.turn === 'w' ? remaining : game.white_clock_ms,
    black: game.turn === 'b' ? remaining : game.black_clock_ms,
    timedOut: remaining <= 0,
  };
}

export function sideOf(game: GameRow, userId: string | undefined): 'w' | 'b' | null {
  if (!userId) return null;
  if (game.white_id === userId) return 'w';
  if (game.black_id === userId) return 'b';
  return null;
}

/** Applies a legal move after validating turn ownership, clocks and rules. */
export function applyMove(gameId: string, userId: string | undefined, from: string, to: string, promotion?: string): MoveResult {
  const game = gameById(gameId);
  if (!game) return { ok: false, error: 'Game not found' };
  if (game.status !== 'active') return { ok: false, error: 'This game has already finished' };
  const side = sideOf(game, userId);
  // Computer games have no Black user: the engine moves as the side opposite the human player.
  const isEngineTurn = game.mode === 'computer' && userId === undefined && game.turn === 'b';
  if (game.mode !== 'local' && !side && !isEngineTurn) return { ok: false, error: 'You are not a player in this game' };
  if (side && side !== game.turn) return { ok: false, error: 'It is not your turn' };
  if (game.mode === 'computer' && userId !== undefined && game.turn === 'b') {
    return { ok: false, error: 'It is the computer\'s turn' };
  }

  const clocks = tick(game);
  if (clocks.timedOut) {
    const result = game.turn === 'w' ? 'black' : 'white';
    const payload = finishGame(game, result, 'timeout');
    return { ok: false, error: 'Your clock ran out', game: payload, finished: { result, termination: 'timeout' } };
  }

  const chess = new Chess(game.fen);
  let move;
  try {
    move = chess.move({ from, to, promotion: (promotion as any) || 'q' });
  } catch {
    return { ok: false, error: 'Illegal move' };
  }
  if (!move) return { ok: false, error: 'Illegal move' };

  const ply = (db.prepare('SELECT COUNT(*) AS n FROM moves WHERE game_id = ?').get(gameId) as { n: number }).n + 1;
  const moverSide = game.turn;
  const clocksAfter = {
    white: moverSide === 'w' ? clocks.white + game.increment * 1000 : clocks.white,
    black: moverSide === 'b' ? clocks.black + game.increment * 1000 : clocks.black,
  };
  const fenAfter = chess.fen();
  const sanHistory = (db.prepare('SELECT san FROM moves WHERE game_id = ? ORDER BY ply').all(gameId) as { san: string }[])
    .map(m => m.san).concat(move.san);
  const opening = identifyOpening(sanHistory) ?? game.opening_name;

  db.prepare(
    `INSERT INTO moves (game_id, ply, san, uci, fen_after, clock_white_ms, clock_black_ms, is_check, is_capture)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(gameId, ply, move.san, `${from}${to}${promotion ?? ''}`, fenAfter, clocksAfter.white, clocksAfter.black,
    chess.isCheck() ? 1 : 0, move.captured ? 1 : 0);

  let status: string = game.status;
  let result: string | null = null;
  let termination: string | null = null;
  if (chess.isCheckmate()) { status = 'finished'; result = moverSide === 'w' ? 'white' : 'black'; termination = 'checkmate'; }
  else if (chess.isStalemate()) { status = 'finished'; result = 'draw'; termination = 'stalemate'; }
  else if (chess.isDrawByFiftyMoves()) { status = 'finished'; result = 'draw'; termination = 'fifty-move'; }
  else if (chess.isThreefoldRepetition()) { status = 'finished'; result = 'draw'; termination = 'repetition'; }
  else if (chess.isInsufficientMaterial()) { status = 'finished'; result = 'draw'; termination = 'insufficient'; }

  db.prepare(
    `UPDATE games SET fen = ?, updated_at = ?, turn = ?, white_clock_ms = ?, black_clock_ms = ?, status = ?, result = ?,
       termination = ?, opening_name = ?, finished_at = ? WHERE id = ?`
  ).run(fenAfter, nowIso(), chess.turn(), clocksAfter.white, clocksAfter.black, status, result, termination, opening,
    status === 'finished' ? nowIso() : null, gameId);

  if (status === 'finished') finishGame(gameById(gameId)!, result as 'white' | 'black' | 'draw', termination!);

  const payload = gamePayload(gameById(gameId)!);
  hub.toGame(gameId, 'game:move', { gameId, game: payload });
  return { ok: true, game: payload, finished: status === 'finished' ? { result: result!, termination: termination! } : undefined };
}

export function resign(gameId: string, userId: string): MoveResult {
  const game = gameById(gameId);
  if (!game) return { ok: false, error: 'Game not found' };
  if (game.status !== 'active') return { ok: false, error: 'Game already finished' };
  const side = sideOf(game, userId);
  if (!side) return { ok: false, error: 'You are not a player in this game' };
  return { ok: true, game: finishGame(game, side === 'w' ? 'black' : 'white', 'resignation') };
}

const drawOffers = new Map<string, { by: string; at: number }>();

export function offerDraw(gameId: string, userId: string): { ok: boolean; error?: string; agreed?: boolean; game?: any } {
  const game = gameById(gameId);
  if (!game) return { ok: false, error: 'Game not found' };
  if (game.status !== 'active') return { ok: false, error: 'Game already finished' };
  const side = sideOf(game, userId);
  if (!side) return { ok: false, error: 'You are not a player in this game' };
  const offer = drawOffers.get(gameId);
  if (offer && offer.by !== userId && Date.now() - offer.at < 120_000) {
    drawOffers.delete(gameId);
    return { ok: true, agreed: true, game: finishGame(game, 'draw', 'agreement') };
  }
  drawOffers.set(gameId, { by: userId, at: Date.now() });
  const opponent = side === 'w' ? game.black_id : game.white_id;
  if (opponent) hub.toUser(opponent, 'game:draw-offer', { gameId });
  return { ok: true, agreed: false };
}

export function declineDraw(gameId: string, userId: string) {
  const game = gameById(gameId);
  const offer = drawOffers.get(gameId);
  if (!game || !offer || offer.by === userId) return { ok: false, error: 'No draw offer to decline' };
  drawOffers.delete(gameId);
  const side = sideOf(game, userId);
  const opponent = side === 'w' ? game.black_id : game.white_id;
  if (opponent) hub.toUser(opponent, 'game:draw-declined', { gameId });
  return { ok: true };
}

/** Finishes a game exactly once, then applies ratings and achievements. */
export function finishGame(game: GameRow, result: 'white' | 'black' | 'draw', termination: string) {
  const already = game.status === 'finished';
  db.prepare('UPDATE games SET status = ?, result = ?, termination = ?, finished_at = ?, pgn = ? WHERE id = ?')
    .run('finished', result, termination, nowIso(), buildPgn(game, result, termination), game.id);
  const fresh = gameById(game.id)!;
  if (!already) finaliseGame(fresh, result);
  const payload = gamePayload(gameById(game.id)!);
  hub.toGame(game.id, 'game:finished', { game: payload });
  return payload;
}

function finaliseGame(game: GameRow, result: 'white' | 'black' | 'draw') {
  const isRatedOnline = game.rated === 1 && game.mode !== 'computer' && game.white_id && game.black_id;
  if (isRatedOnline) {
    const whiteState = getUserRating(game.white_id!, game.category);
    const blackState = getUserRating(game.black_id!, game.category);
    const whiteScore = (result === 'white' ? 1 : result === 'draw' ? 0.5 : 0) as 1 | 0 | 0.5;
    const blackScore = (1 - whiteScore) as 1 | 0 | 0.5;
    const newWhite = glicko2Update(
      { rating: whiteState.rating, rd: whiteState.rd, volatility: whiteState.volatility },
      { rating: blackState.rating, rd: blackState.rd, volatility: blackState.volatility }, whiteScore);
    const newBlack = glicko2Update(
      { rating: blackState.rating, rd: blackState.rd, volatility: blackState.volatility },
      { rating: whiteState.rating, rd: whiteState.rd, volatility: whiteState.volatility }, blackScore);
    const apply = db.prepare(
      `UPDATE ratings SET rating = ?, rd = ?, volatility = ?, games = games + 1, peak = MAX(peak, ?), updated_at = ?
       WHERE user_id = ? AND category = ?`);
    apply.run(newWhite.rating, newWhite.rd, newWhite.volatility, newWhite.rating, nowIso(), game.white_id, game.category);
    apply.run(newBlack.rating, newBlack.rd, newBlack.volatility, newBlack.rating, nowIso(), game.black_id, game.category);
    const hist = db.prepare('INSERT INTO rating_history (user_id, category, rating, delta, game_id) VALUES (?,?,?,?,?)');
    hist.run(game.white_id, game.category, newWhite.rating, newWhite.rating - whiteState.rating, game.id);
    hist.run(game.black_id, game.category, newBlack.rating, newBlack.rating - blackState.rating, game.id);
    hub.toUser(game.white_id!, 'rating:changed', { category: game.category, rating: newWhite.rating, delta: newWhite.rating - whiteState.rating });
    hub.toUser(game.black_id!, 'rating:changed', { category: game.category, rating: newBlack.rating, delta: newBlack.rating - blackState.rating });
  }

  for (const [userId, side] of [[game.white_id, 'white'], [game.black_id, 'black']] as const) {
    if (!userId) continue;
    const won = result === side;
    const drew = result === 'draw';
    bumpAchievement(userId, 'first_game');
    bumpAchievement(userId, 'games_25');
    if (won) {
      bumpAchievement(userId, 'first_win');
      bumpAchievement(userId, 'wins_10');
    }
    if (drew) bumpAchievement(userId, 'first_draw');
    logActivity(userId, 'game',
      `${won ? 'Won' : drew ? 'Drew' : 'Lost'} a ${game.category} game against ${userId === game.white_id ? game.black_name : game.white_name}`,
      `/analysis/${game.id}`);
    notify(userId, 'game', `Game finished — ${won ? 'victory' : drew ? 'draw' : 'defeat'}`,
      `${game.white_name} vs ${game.black_name} · ${game.category}`, `/analysis/${game.id}`);
  }

  if (game.tournament_id) {
    const pairing = db.prepare('SELECT * FROM pairings WHERE game_id = ?').get(game.id) as any;
    if (pairing && !pairing.result) {
      db.prepare('UPDATE pairings SET result = ? WHERE id = ?').run(result, pairing.id);
      const points = (userId: string, value: number) =>
        db.prepare('UPDATE registrations SET points = points + ? WHERE tournament_id = ? AND user_id = ?')
          .run(value, game.tournament_id, userId);
      if (result === 'white') { points(game.white_id!, 1); bumpAchievement(game.white_id!, 'tournament_win'); }
      else if (result === 'black') { points(game.black_id!, 1); bumpAchievement(game.black_id!, 'tournament_win'); }
      else { points(game.white_id!, 0.5); points(game.black_id!, 0.5); }
    }
  }
}

export function buildPgn(game: GameRow, result: 'white' | 'black' | 'draw', termination: string) {
  const moves = db.prepare('SELECT san FROM moves WHERE game_id = ? ORDER BY ply').all(game.id) as { san: string }[];
  const resultTag = result === 'white' ? '1-0' : result === 'black' ? '0-1' : '1/2-1/2';
  const date = new Date(game.started_at).toISOString().slice(0, 10).replace(/-/g, '.');
  const tags = [
    `[Event "SPEED CHESS ${game.mode}"]`,
    `[Site "SPEED CHESS"]`,
    `[Date "${date}"]`,
    `[White "${game.white_name}"]`,
    `[Black "${game.black_name}"]`,
    `[Result "${resultTag}"]`,
    `[TimeControl "${game.initial_seconds}+${game.increment}"]`,
    `[Termination "${termination}"]`,
    game.opening_name ? `[Opening "${game.opening_name}"]` : '',
    `[Variant "Standard"]`,
  ].filter(Boolean).join('\n');
  const body: string[] = [];
  moves.forEach((m, i) => {
    if (i % 2 === 0) body.push(`${i / 2 + 1}. ${m.san}`);
    else body.push(m.san);
  });
  return `${tags}\n\n${body.join(' ')} ${resultTag}\n`;
}

export function sweepTimeouts() {
  const active = db.prepare("SELECT * FROM games WHERE status = 'active'").all() as GameRow[];
  for (const game of active) {
    if (tick(game).timedOut) {
      finishGame(game, game.turn === 'w' ? 'black' : 'white', 'timeout');
    }
  }
}

export function activeGameFor(userId: string): GameRow | undefined {
  return db.prepare(
    `SELECT * FROM games WHERE status = 'active' AND mode IN ('online','tournament') AND (white_id = ? OR black_id = ?)
     ORDER BY started_at DESC LIMIT 1`
  ).get(userId, userId) as GameRow | undefined;
}
