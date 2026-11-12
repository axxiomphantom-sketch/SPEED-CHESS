import { db, nowIso } from '../db/index.js';
import { id } from '../lib/ids.js';
import { notify } from './../lib/service.js';
import { createGame, gamePayload } from './games.js';
import { hub } from './hub.js';

interface Player { userId: string; username: string; seed: number; points: number; played: Set<string>; colorBalance: number; }

function standingsRows(tournamentId: string) {
  return db.prepare(
    `SELECT r.user_id, u.username, u.country, u.avatar_url, r.points, r.seed, r.tiebreak
       FROM registrations r JOIN users u ON u.id = r.user_id
      WHERE r.tournament_id = ? AND r.status = 'registered'
      ORDER BY r.points DESC, r.tiebreak DESC, r.seed ASC`
  ).all(tournamentId) as any[];
}

/** Standard Buchholz tiebreak: sum of opponents' scores. */
function computeTiebreaks(tournamentId: string) {
  const players = new Map<string, number>();
  for (const row of standingsRows(tournamentId)) players.set(row.user_id, row.points);
  const pairingsByPlayer = new Map<string, string[]>();
  for (const p of db.prepare('SELECT white_id, black_id FROM pairings WHERE tournament_id = ?').all(tournamentId) as any[]) {
    for (const side of [p.white_id, p.black_id]) {
      if (!side) continue;
      const list = pairingsByPlayer.get(side) ?? [];
      const opp = side === p.white_id ? p.black_id : p.white_id;
      if (opp) list.push(opp);
      pairingsByPlayer.set(side, list);
    }
  }
  const update = db.prepare('UPDATE registrations SET tiebreak = ? WHERE tournament_id = ? AND user_id = ?');
  for (const [userId, opponents] of pairingsByPlayer) {
    const score = opponents.reduce((sum, opp) => sum + (players.get(opp) ?? 0), 0);
    update.run(score, tournamentId, userId);
  }
}

/** Swiss pairing with deterministic float handling; avoids repeat pairings. */
export function generateSwissRound(tournamentId: string, round: number) {
  const players: Player[] = standingsRows(tournamentId).map((r, index) => ({
    userId: r.user_id, username: r.username, seed: r.seed ?? index + 1,
    points: r.points, played: new Set(), colorBalance: 0,
  }));
  const history = db.prepare('SELECT white_id, black_id FROM pairings WHERE tournament_id = ?').all(tournamentId) as any[];
  for (const h of history) {
    if (h.white_id && h.black_id) {
      players.find(p => p.userId === h.white_id)?.played.add(h.black_id);
      players.find(p => p.userId === h.black_id)?.played.add(h.white_id);
      const w = players.find(p => p.userId === h.white_id);
      const b = players.find(p => p.userId === h.black_id);
      if (w) w.colorBalance++;
      if (b) b.colorBalance--;
    }
  }
  const sorted = [...players].sort((a, b) => b.points - a.points || a.seed - b.seed);
  const pairs: Array<{ white: Player; black: Player }> = [];
  const unpaired: Player[] = [];
  const used = new Set<string>();
  for (const p of sorted) {
    if (used.has(p.userId)) continue;
    const opponent = sorted.find(o =>
      o.userId !== p.userId && !used.has(o.userId) && !p.played.has(o.userId) && o.points === p.points)
      ?? sorted.find(o => o.userId !== p.userId && !used.has(o.userId) && !p.played.has(o.userId));
    if (opponent) {
      used.add(p.userId); used.add(opponent.userId);
      const white = p.colorBalance <= opponent.colorBalance ? p : opponent;
      const black = white === p ? opponent : p;
      pairs.push({ white, black });
    } else {
      unpaired.push(p);
      used.add(p.userId);
    }
  }
  // Pair remaining players as byes when odd.
  const insert = db.prepare('INSERT INTO pairings (id, tournament_id, round, board, white_id, black_id, result) VALUES (?,?,?,?,?,?,?)');
  pairs.forEach((pair, index) => insert.run(id('pr_'), tournamentId, round, index + 1, pair.white.userId, pair.black.userId, null));
  if (pairs.length * 2 < players.length) {
    const byePlayer = unpaired[0];
    insert.run(id('pr_'), tournamentId, round, pairs.length + 1, byePlayer.userId, null, 'bye');
    db.prepare('UPDATE registrations SET points = points + 1 WHERE tournament_id = ? AND user_id = ?').run(tournamentId, byePlayer.userId);
  }
  computeTiebreaks(tournamentId);
  return pairs.length;
}

/** Simple single-elimination bracket generation for round 1 (seeded 1 vs N). */
export function generateEliminationRound(tournamentId: string, round: number) {
  const rows = standingsRows(tournamentId);
  const active = round === 1 ? rows : rows.filter(r => {
    const lost = db.prepare(`SELECT COUNT(*) AS n FROM pairings WHERE tournament_id = ? AND result IS NOT NULL AND result != 'bye'
      AND ((white_id = ? AND result = 'black') OR (black_id = ? AND result = 'white'))`)
      .get(tournamentId, r.user_id, r.user_id) as { n: number };
    return lost.n === 0;
  });
  if (round > 1) {
    const previous = db.prepare('SELECT * FROM pairings WHERE tournament_id = ? AND round = ?').all(tournamentId, round - 1) as any[];
    const winners: string[] = [];
    for (const p of previous) {
      if (p.result === 'white' && p.white_id) winners.push(p.white_id);
      else if (p.result === 'black' && p.black_id) winners.push(p.black_id);
      else if (p.result === 'draw' && p.white_id) winners.push(p.white_id); // higher seed advances on draw
      else if (p.result === 'bye' && p.white_id) winners.push(p.white_id);
    }
    const insert = db.prepare('INSERT INTO pairings (id, tournament_id, round, board, white_id, black_id, result) VALUES (?,?,?,?,?,?,?)');
    let board = 1;
    for (let i = 0; i < winners.length; i += 2) {
      const white = winners[i];
      const black = winners[i + 1] ?? null;
      insert.run(id('pr_'), tournamentId, round, board++, white, black, black ? null : 'bye');
    }
    return Math.ceil(winners.length / 2);
  }
  const insert = db.prepare('INSERT INTO pairings (id, tournament_id, round, board, white_id, black_id, result) VALUES (?,?,?,?,?,?,?)');
  let board = 1;
  const ordered = active.map((r, i) => ({ ...r, seed: r.seed ?? i + 1 }));
  const half = Math.ceil(ordered.length / 2);
  for (let i = 0; i < half; i++) {
    const top = ordered[i];
    const bottom = ordered[ordered.length - 1 - i];
    if (top.user_id === bottom?.user_id) {
      insert.run(id('pr_'), tournamentId, round, board++, top.user_id, null, 'bye');
    } else {
      insert.run(id('pr_'), tournamentId, round, board++, top.user_id, bottom.user_id, null);
    }
  }
  return board - 1;
}

/** Creates the actual chess games for a round and notifies both players. */
export function startRoundGames(tournamentId: string, round: number) {
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!tournament) return 0;
  const pairings = db.prepare("SELECT * FROM pairings WHERE tournament_id = ? AND round = ? AND result IS NULL AND black_id IS NOT NULL")
    .all(tournamentId, round) as any[];
  let created = 0;
  for (const pairing of pairings) {
    if (pairing.game_id) continue;
    const game = createGame({
      whiteId: pairing.white_id, blackId: pairing.black_id, mode: 'tournament',
      seconds: tournament.initial_seconds, increment: tournament.increment, rated: false,
      category: tournament.category, tournamentId,
    });
    db.prepare('UPDATE pairings SET game_id = ? WHERE id = ?').run(game.id, pairing.id);
    hub.toUser(pairing.white_id, 'tournament:pairing', { game: gamePayload(game), tournamentId, round });
    hub.toUser(pairing.black_id, 'tournament:pairing', { game: gamePayload(game), tournamentId, round });
    notify(pairing.white_id, 'tournament', `Round ${round} pairing ready`, `You play White on board ${pairing.board}.`, `/play/game/${game.id}`);
    notify(pairing.black_id, 'tournament', `Round ${round} pairing ready`, `You play Black on board ${pairing.board}.`, `/play/game/${game.id}`);
    created++;
  }
  db.prepare("UPDATE tournaments SET status = 'ongoing' WHERE id = ? AND status = 'upcoming'").run(tournamentId);
  return created;
}

export function tournamentStandings(tournamentId: string) {
  computeTiebreaks(tournamentId);
  return standingsRows(tournamentId);
}

export function advanceTournamentIfComplete(tournamentId: string) {
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as any;
  if (!tournament) return;
  const currentRound = (db.prepare('SELECT MAX(round) AS r FROM pairings WHERE tournament_id = ?').get(tournamentId) as { r: number | null }).r ?? 0;
  const pending = (db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE tournament_id = ? AND round = ? AND result IS NULL")
    .get(tournamentId, currentRound) as { n: number }).n;
  if (pending > 0) return;
  if (tournament.format === 'single-elimination' || tournament.format === 'double-elimination') {
    const remaining = (db.prepare(`SELECT COUNT(*) AS n FROM pairings WHERE tournament_id = ? AND round = ? AND black_id IS NOT NULL`)
      .get(tournamentId, currentRound) as { n: number }).n;
    const lastRoundWinners = db.prepare('SELECT COUNT(*) AS n FROM pairings WHERE tournament_id = ? AND round = ? AND result = ?')
      .get(tournamentId, currentRound, 'white') as { n: number };
    if (remaining <= 1 || lastRoundWinners.n <= 1) {
      db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tournamentId);
      return;
    }
    generateEliminationRound(tournamentId, currentRound + 1);
    return;
  }
  if (currentRound < tournament.rounds) {
    generateSwissRound(tournamentId, currentRound + 1);
    startRoundGames(tournamentId, currentRound + 1);
  } else {
    db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tournamentId);
    notify(tournament.organizer_id, 'tournament', 'Tournament completed', `${tournament.name} has finished.`, `/tournaments/${tournament.slug}`);
  }
}
