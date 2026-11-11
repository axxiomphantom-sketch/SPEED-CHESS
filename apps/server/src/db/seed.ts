/**
 * Seeds reference content and transparent demo accounts.
 * Demo accounts are clearly marked in their bios — they exist so a fresh install
 * has real records to display, never to impersonate live players.
 */
import { Chess } from 'chess.js';
import { db, migrate, nowIso } from './index.js';
import { hashPassword } from '../lib/password.js';
import { seedReferenceContent } from './reference.js';
import { CATEGORIES } from '../lib/ratings.js';
import { createGame, applyMove, resign, finishGame } from '../services/games.js';

const id = (p: string) => p + Math.random().toString(36).slice(2, 12);
const slug = (s: string) => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

function seedContent() {
  seedReferenceContent();
}

interface DemoPlayer {
  username: string; email: string; password: string; country: string; bio: string;
  ratings: Partial<Record<typeof CATEGORIES[number], number>>; role?: string; title?: string;
}

const demoPlayers: DemoPlayer[] = [
  { username: 'demo_player', email: 'demo@speedchess.local', password: 'DemoPlayer123', country: 'NG',
    bio: 'Demo account created by the seed script. Explore the platform freely — everything here is real data.', ratings: { blitz: 1180, rapid: 1210, bullet: 1050, classical: 1240 } },
  { username: 'coach_ada', email: 'coach@speedchess.local', password: 'CoachAda123', country: 'NG', role: 'coach', title: 'CM',
    bio: 'Demo coach account. Candidate Master, ten years of teaching beginners and club players.', ratings: { blitz: 2010, rapid: 2085, bullet: 1960, classical: 2110 } },
  { username: 'organizer_kai', email: 'organizer@speedchess.local', password: 'OrganizerKai123', country: 'GB', role: 'organizer',
    bio: 'Demo organiser account, used to demonstrate the tournament tools.', ratings: { blitz: 1655, rapid: 1690, bullet: 1580, classical: 1710 } },
  { username: 'admin_speedchess', email: 'admin@speedchess.local', password: 'AdminSpeed123', country: 'NG', role: 'admin',
    bio: 'Demo administrator account for the protected admin dashboard.', ratings: { blitz: 1500, rapid: 1520, bullet: 1450, classical: 1530 } },
  { username: 'nova_blitz', email: 'nova@speedchess.local', password: 'NovaBlitz123', country: 'US',
    bio: 'Demo account — blitz specialist.', ratings: { blitz: 1890, rapid: 1765, bullet: 1915, classical: 1740 } },
  { username: 'rookie_sam', email: 'sam@speedchess.local', password: 'RookieSam123', country: 'IN',
    bio: 'Demo account — a beginner working through How to Play.', ratings: { blitz: 940, rapid: 980, bullet: 870, classical: 1010 } },
  { username: 'lina_rapid', email: 'lina@speedchess.local', password: 'LinaRapid123', country: 'DE',
    bio: 'Demo account — rapid player who loves endgames.', ratings: { blitz: 1540, rapid: 1620, bullet: 1480, classical: 1655 } },
  { username: 'tommy_tactics', email: 'tommy@speedchess.local', password: 'TommyTactics123', country: 'BR',
    bio: 'Demo account — puzzle addict.', ratings: { blitz: 1425, rapid: 1390, bullet: 1360, classical: 1440 } },
];

/**
 * Plays deterministic demo games between seeded accounts so the leaderboards,
 * histories and analytics show genuine (if seeded) records.
 */
function playDemoGames(playerIds: Record<string, string>) {
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }).n;
  if (existing > 0) return;

  const ratedPairs: Array<[string, string, string, number, number]> = [
    ['nova_blitz', 'coach_ada', 'blitz', 180, 2],
    ['rookie_sam', 'lina_rapid', 'rapid', 600, 5],
    ['tommy_tactics', 'nova_blitz', 'blitz', 180, 2],
    ['lina_rapid', 'demo_player', 'rapid', 600, 5],
    ['demo_player', 'rookie_sam', 'blitz', 180, 2],
    ['coach_ada', 'tommy_tactics', 'classical', 1800, 10],
  ];
  // Natural opening sequences; each game is played move by move through the real game service.
  const scripts: string[][] = [
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'],
    ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'h6'],
    ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e6'],
    ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5', 'Nfd7', 'f4', 'c5'],
    ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6'],
    ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'],
  ];
  // Play a SAN script through the authoritative move service by matching legal moves.
  const playScript = (gameId: string, whiteId: string, blackId: string, script: string[], stopAt = script.length) => {
    for (let i = 0; i < Math.min(stopAt, script.length); i++) {
      const game = db.prepare('SELECT fen, status FROM games WHERE id = ?').get(gameId) as { fen: string; status: string };
      if (!game || game.status !== 'active') break;
      const chess = new Chess(game.fen);
      const legal = chess.moves({ verbose: true });
      const target = legal.find(m => m.san === script[i]);
      if (!target) break;
      const mover = chess.turn() === 'w' ? whiteId : blackId;
      const res = applyMove(gameId, mover, target.from, target.to, target.promotion);
      if (!res.ok) break;
    }
  };

  ratedPairs.forEach((pair, index) => {
    const [whiteName, blackName, category, seconds, increment] = pair;
    const whiteId = playerIds[whiteName];
    const blackId = playerIds[blackName];
    if (!whiteId || !blackId) return;
    const game = createGame({ whiteId, blackId, mode: 'online', seconds, increment, rated: true, category: category as any });
    playScript(game.id, whiteId, blackId, scripts[index % scripts.length]);
    const current = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id) as any;
    if (current.status !== 'active') return;
    if (index % 3 === 0) resign(game.id, whiteId);
    else if (index % 3 === 1) resign(game.id, blackId);
    else finishGame(current, 'draw', 'agreement');
  });

  // A computer game and a local game for the demo player's history.
  const demoId = playerIds.demo_player;
  if (demoId) {
    const computerGame = createGame({ whiteId: demoId, blackId: null, mode: 'computer', seconds: 600, increment: 5, difficulty: 'beginner' });
    playScript(computerGame.id, demoId, demoId, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6']);
    const cur = db.prepare('SELECT * FROM games WHERE id = ?').get(computerGame.id) as any;
    if (cur.status === 'active') resign(computerGame.id, demoId);

    const localGame = createGame({ whiteId: null, blackId: null, mode: 'local', seconds: 300, increment: 0, whiteName: 'White', blackName: 'Black' });
    playScript(localGame.id, '', '', ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6']);
    const localCur = db.prepare('SELECT * FROM games WHERE id = ?').get(localGame.id) as any;
    if (localCur.status === 'active') finishGame(localCur, 'draw', 'agreement');
  }
  console.log(`[seed] ${ratedPairs.length + 2} demo games played`);
}

async function seedUsers() {
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const playerIds: Record<string, string> = {};
  if (existing === 0) {
    for (const player of demoPlayers) {
      const userId = id('usr_');
      playerIds[player.username] = userId;
      db.prepare(
        `INSERT INTO users (id, username, username_lower, email, email_lower, password_hash, country, role, bio, title,
          email_verified, onboarded, plan)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,1,?)`
      ).run(userId, player.username, player.username.toLowerCase(), player.email, player.email.toLowerCase(),
        await hashPassword(player.password), player.country, player.role ?? 'player', player.bio, player.title ?? null,
        player.username === 'coach_ada' ? 'premium' : player.username === 'organizer_kai' ? 'pro' : 'free');
      for (const c of CATEGORIES) {
        const value = player.ratings[c] ?? 1200;
        db.prepare('INSERT INTO ratings (user_id, category, rating, rd, peak, games) VALUES (?,?,?,?,?,?)')
          .run(userId, c, value, 90, value + 15, 12 + Math.floor(Math.random() * 20));
        db.prepare('INSERT INTO rating_history (user_id, category, rating, delta) VALUES (?,?,?,?)')
          .run(userId, c, value - 25, 0);
        db.prepare('INSERT INTO rating_history (user_id, category, rating, delta) VALUES (?,?,?,?)')
          .run(userId, c, value, value - (value - 25));
      }
      if (player.role === 'coach') {
        db.prepare('INSERT INTO coach_profiles (user_id, headline, expertise, languages, hourly_rate, currency, verified, accepting) VALUES (?,?,?,?,?,?,1,1)')
          .run(userId, 'Candidate Master · beginner and club coaching',
            'Openings, endgames, beginner fundamentals', 'English, Yoruba', 2500, 'USD');
      }
      for (const lessonSlug of ['what-is-chess', 'the-board', 'signing-up-basics']) {
        const lesson = db.prepare('SELECT id FROM lessons WHERE slug = ?').get(lessonSlug) as { id: string } | undefined;
        if (lesson) {
          db.prepare("INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, status, quiz_score, quiz_total, completed_at) VALUES (?,?, 'completed', 1, 1, ?)")
            .run(userId, lesson.id, nowIso());
        }
      }
      const puzzleRows = db.prepare('SELECT id FROM puzzles LIMIT 4').all() as { id: string }[];
      for (const p of puzzleRows) {
        db.prepare('INSERT INTO puzzle_attempts (user_id, puzzle_id, solved, ms) VALUES (?,?,?,?)')
          .run(userId, p.id, Math.random() > 0.25 ? 1 : 0, 12000 + Math.floor(Math.random() * 40000));
      }
    }
    console.log(`[seed] ${demoPlayers.length} demo accounts`);
  } else {
    for (const player of demoPlayers) {
      const row = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(player.username.toLowerCase()) as { id: string } | undefined;
      if (row) playerIds[player.username] = row.id;
    }
  }
  return playerIds;
}

function seedSocial(playerIds: Record<string, string>) {
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM friendships').get() as { n: number }).n;
  if (existing === 0) {
    const pairs: Array<[string, string, string]> = [
      ['demo_player', 'nova_blitz', 'accepted'], ['demo_player', 'rookie_sam', 'accepted'],
      ['demo_player', 'lina_rapid', 'pending'], ['coach_ada', 'tommy_tactics', 'accepted'],
    ];
    for (const [a, b, status] of pairs) {
      if (playerIds[a] && playerIds[b]) {
        db.prepare('INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?,?,?)')
          .run(playerIds[a], playerIds[b], status);
      }
    }
  }
  const clubCount = (db.prepare('SELECT COUNT(*) AS n FROM clubs').get() as { n: number }).n;
  if (clubCount === 0) {
    const clubId = id('clb_');
    db.prepare('INSERT INTO clubs (id, name, slug, description, country, owner_id) VALUES (?,?,?,?,?,?)')
      .run(clubId, 'Speed Chess Lagos', 'speed-chess-lagos',
        'A welcoming club for players in Lagos and across Nigeria. Weekly blitz nights, beginner classes and club tournaments.',
        'NG', playerIds.organizer_kai ?? null);
    for (const name of ['organizer_kai', 'demo_player', 'coach_ada', 'rookie_sam']) {
      if (!playerIds[name]) continue;
      db.prepare('INSERT INTO club_members (club_id, user_id, role) VALUES (?,?,?)')
        .run(clubId, playerIds[name], name === 'organizer_kai' ? 'owner' : 'member');
    }
    db.prepare('INSERT INTO club_announcements (id, club_id, author_id, title, body) VALUES (?,?,?,?,?)')
      .run(id('ann_'), clubId, playerIds.organizer_kai ?? null, 'Blitz night every Wednesday',
        'Join us on Wednesday at 19:00 for five rounds of 3+2 blitz. All levels welcome — new players get a free lesson before round one.');
    const clubId2 = id('clb_');
    db.prepare('INSERT INTO clubs (id, name, slug, description, country, owner_id) VALUES (?,?,?,?,?,?)')
      .run(clubId2, 'Global Endgame Study', 'global-endgame-study',
        'For players who love technique: rook endings, pawn races and the art of converting small advantages.', 'GB', playerIds.coach_ada ?? null);
    for (const name of ['coach_ada', 'lina_rapid', 'nova_blitz']) {
      if (!playerIds[name]) continue;
      db.prepare('INSERT INTO club_members (club_id, user_id, role) VALUES (?,?,?)')
        .run(clubId2, playerIds[name], name === 'coach_ada' ? 'owner' : 'member');
    }
  }
  const articleCount = (db.prepare('SELECT COUNT(*) AS n FROM articles').get() as { n: number }).n;
  if (articleCount === 0) {
    const insert = db.prepare('INSERT INTO articles (id, slug, title, summary, body, category, author_id, status) VALUES (?,?,?,?,?,?,?,?)');
    insert.run(id('art_'), 'how-to-stop-blundering', 'How to stop blundering in five moves',
      'The single habit that gains most players 100+ rating points: a ten-second check before every move.',
      `Most games below 1500 are decided by a blunder, not by strategy. The fix is not "think harder" — it is a checklist.\n\n## The CCT scan\n\nBefore every move, look at Checks, Captures and Threats. First for your opponent, then for yourself.\n\n1. What does my opponent's last move threaten?\n2. Are any of my pieces undefended?\n3. Do I have any checks or captures that win material?\n\n## Why it works\n\nBlunders are almost never caused by a lack of chess knowledge. They happen because attention was on your own plan. The scan forces you to look at the board from your opponent's side before you commit.\n\n## A practical drill\n\nPlay ten games where the only goal is to complete the scan before every single move. Your rating will take care of itself.`,
      'strategy', playerIds.coach_ada ?? null, 'published');
    insert.run(id('art_'), 'opening-principles-that-last', 'Three opening principles that never expire',
      'Centre, development, king safety — why these three rules outperform memorising long variations.',
      `Openings change every few years. Principles do not.\n\n## 1. Fight for the centre\n\nPawns on e4 and d4 give your pieces the most squares. A knight in the centre attacks eight squares; in the corner, two.\n\n## 2. Develop with a purpose\n\nEach development move should do two things: bring a piece out and prepare castling. Moving the same piece twice in the opening is usually a wasted tempo.\n\n## 3. Make your king safe\n\nCastling is not about hiding. It is about activating a rook and removing the most common tactical target from the board.\n\nIf you follow these three rules you will reach a playable middlegame in every game — without memorising a single variation.`,
      'opening', playerIds.coach_ada ?? null, 'published');
  }
}

function seedTournament(playerIds: Record<string, string>) {
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM tournaments').get() as { n: number }).n;
  if (existing > 0) return;
  const starts = new Date(Date.now() + 3 * 864e5).toISOString();
  const deadline = new Date(Date.now() + 2 * 864e5).toISOString();
  const tournamentId = id('trn_');
  db.prepare(
    `INSERT INTO tournaments (id, name, slug, description, organizer_id, format, category, rounds, initial_seconds, increment,
      max_players, starts_at, registration_deadline, status, rules, prize)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(tournamentId, 'SPEED CHESS Weekly Blitz', 'speed-chess-weekly-blitz',
    'Five rounds of 3+2 Swiss blitz open to every rating. Pairings are generated automatically between rounds.',
    playerIds.organizer_kai ?? null, 'swiss', 'blitz', 5, 180, 2, 64, starts, deadline, 'upcoming',
    'Fair play rules apply. No engine assistance. Players must be available for all five rounds; withdrawing after round two removes you from the standings.',
    'Top three receive premium membership months and a profile badge.');
  for (const name of ['demo_player', 'nova_blitz', 'rookie_sam', 'lina_rapid', 'tommy_tactics']) {
    if (!playerIds[name]) continue;
    const seed = (db.prepare("SELECT COUNT(*) AS n FROM registrations WHERE tournament_id = ?").get(tournamentId) as { n: number }).n + 1;
    db.prepare("INSERT INTO registrations (tournament_id, user_id, status, seed) VALUES (?,?, 'registered', ?)")
      .run(tournamentId, playerIds[name], seed);
  }
  console.log('[seed] 1 upcoming tournament with 5 registrations');
}

async function main() {
  migrate();
  seedContent();
  const playerIds = await seedUsers();
  seedSocial(playerIds);
  playDemoGames(playerIds);
  seedTournament(playerIds);
  const totals = {
    users: (db.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n,
    games: (db.prepare('SELECT COUNT(*) AS n FROM games').get() as any).n,
    courses: (db.prepare('SELECT COUNT(*) AS n FROM courses').get() as any).n,
    lessons: (db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as any).n,
    puzzles: (db.prepare('SELECT COUNT(*) AS n FROM puzzles').get() as any).n,
  };
  console.log('[seed] done', totals);
  console.log('[seed] demo logins — demo@speedchess.local / DemoPlayer123, admin@speedchess.local / AdminSpeed123');
  db.close();
}

main().catch(err => { console.error('[seed] failed', err); process.exit(1); });
