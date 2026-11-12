/**
 * Removes every registered account from the chess database.
 *
 * Usage:
 *   npm -w @speed-chess/server run purge:users -- --dry-run    # show what would go (default)
 *   npm -w @speed-chess/server run purge:users                 # dry run, same as above
 *   npm -w @speed-chess/server run purge:users -- --yes        # actually delete
 *   npm -w @speed-chess/server run purge:users -- --yes --keep-seed
 *
 * Why this is not just `DELETE FROM users`:
 *
 *  1. `audit_logs` has no foreign key to `users` and stores the username inside a JSON `meta`
 *     column (`{ username }` on register). Deleting the user leaves the username behind forever.
 *  2. `reports` carries free-text reasons that can name a player.
 *  3. `games` reference players with `ON DELETE SET NULL`, so a deleted user's games survive as
 *     orphaned records with no owner — unplayable and confusing. They are removed too.
 *  4. SQLite does not overwrite deleted rows: the bytes stay in free pages until the database is
 *     compacted. Without `VACUUM` the emails are still readable with `grep` on the file. This
 *     script vacuums, then verifies the file no longer contains them.
 *
 * Everything runs inside one transaction, so a failure part-way leaves the database untouched.
 */
import fs from 'node:fs';
import { db, migrate } from './index.js';
import { config } from '../config.js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--yes');
const keepSeed = args.has('--keep-seed');

/**
 * Demo accounts created by `seed.ts`. They exist so a fresh install shows real leaderboards.
 * `--keep-seed` leaves them in place and removes only accounts people registered themselves.
 */
const SEED_USERNAMES = [
  'demo_player', 'coach_ada', 'organizer_kai', 'admin_speedchess',
  'nova_blitz', 'rookie_sam', 'lina_rapid', 'tommy_tactics',
];

/** Never print a full address in a terminal log or CI output. */
const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

/**
 * PIDs (other than this process) holding the database file open. Best-effort and platform aware:
 * `/proc` on Linux, `lsof` elsewhere; an unknown result returns [] rather than blocking the purge.
 */
function detectOtherConnections(): string[] {
  const target = fs.realpathSync(config.dbFile);
  try {
    if (fs.existsSync('/proc')) {
      const found: string[] = [];
      for (const pid of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue;
        try {
          for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
            try {
              if (fs.realpathSync(`/proc/${pid}/fd/${fd}`) === target) { found.push(pid); break; }
            } catch { /* fd closed between readdir and readlink */ }
          }
        } catch { /* process exited or not ours */ }
      }
      return found;
    }
  } catch { /* fall through */ }
  return [];
}

const count = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as { n: number }).n;

function main() {
  // Refuse to create a database silently: an empty handle here would mean we are pointed at the
  // wrong file (a common cause of "I purged it but the accounts are still there").
  if (!fs.existsSync(config.dbFile)) {
    console.error(`[purge] No database at ${config.dbFile} — nothing to purge.`);
    console.error('[purge] Set DATA_DIR or DATABASE_FILE if the database lives somewhere else.');
    process.exit(2);
  }

  // A live server holds this database open. Writing from a second process leaves the change in a
  // WAL that the running server can still be reading from, and VACUUM cannot reclaim pages that
  // another connection has open — the emails then survive in free pages. Refuse rather than
  // produce a half-purged database the operator believes is clean.
  const holders = detectOtherConnections();
  if (holders.length) {
    console.error('[purge] The database is in use by another process:');
    for (const h of holders) console.error(`          pid ${h}`);
    console.error('[purge] Stop the app first (Ctrl-C the dev server, or `pm2 stop speed-chess`),');
    console.error('[purge] then run this again. Purging under a live server cannot be verified.');
    process.exit(3);
  }

  migrate();

  const before = count('SELECT COUNT(*) AS n FROM users');
  if (before === 0) {
    console.log('[purge] There are no registered accounts. Nothing to do.');
    return;
  }

  const where = keepSeed
    ? `WHERE username_lower NOT IN (${SEED_USERNAMES.map(() => '?').join(',')})`
    : '';
  const params = keepSeed ? SEED_USERNAMES : [];

  const targets = db.prepare(`SELECT id, username, email, role, email_verified, created_at FROM users ${where} ORDER BY created_at`)
    .all(...params) as Array<{ id: string; username: string; email: string; role: string; email_verified: number; created_at: string }>;

  console.log(`\n[purge] database: ${config.dbFile}`);
  console.log(`[purge] mode:     ${apply ? 'APPLY (deleting)' : 'DRY RUN (nothing is deleted)'}${keepSeed ? ', keeping seeded demo accounts' : ''}`);
  console.log(`[purge] ${targets.length} of ${before} account(s) will be removed:\n`);
  for (const t of targets) {
    console.log(`  ${t.username.padEnd(22)} ${maskEmail(t.email).padEnd(34)} ${t.role.padEnd(10)} ${t.created_at}`);
  }

  const ids = targets.map(t => t.id);
  const marks = ids.map(() => '?').join(',') || "''";
  const related = {
    ratings: count(`SELECT COUNT(*) AS n FROM ratings WHERE user_id IN (${marks})`, ...ids),
    games: count(`SELECT COUNT(*) AS n FROM games WHERE white_id IN (${marks}) OR black_id IN (${marks}) OR owner_id IN (${marks})`, ...ids, ...ids, ...ids),
    notifications: count(`SELECT COUNT(*) AS n FROM notifications WHERE user_id IN (${marks})`, ...ids),
    sessions: count(`SELECT COUNT(*) AS n FROM sessions WHERE user_id IN (${marks})`, ...ids),
    audit_logs: count(`SELECT COUNT(*) AS n FROM audit_logs WHERE actor_id IN (${marks})`, ...ids),
  };
  const auditWithUsername = count("SELECT COUNT(*) AS n FROM audit_logs WHERE meta LIKE '%username%'");

  console.log('\n[purge] related rows that go with them:');
  for (const [key, value] of Object.entries(related)) console.log(`  ${key.padEnd(16)} ${value}`);
  console.log(`  ${'audit_logs (all)'.padEnd(16)} ${count('SELECT COUNT(*) AS n FROM audit_logs')}  — cleared wholesale: rows embed usernames in JSON meta`);

  if (!apply) {
    console.log('\n[purge] Dry run. Re-run with --yes to delete.\n');
    return;
  }

  // Collect the addresses first so the post-vacuum check can prove they are gone.
  const emails = targets.map(t => t.email.toLowerCase());

  const run = db.transaction(() => {
    // 1. Audit trail first: it embeds usernames and has no FK, so a user delete will not touch it.
    db.prepare('DELETE FROM audit_logs').run();
    // 2. User-submitted reports can name players in free text.
    db.prepare('DELETE FROM reports').run();
    // 3. Games reference players with ON DELETE SET NULL, which would leave ownerless records.
    db.prepare('DELETE FROM games').run();
    // 4. Accounts. This cascades to 23 tables (ratings, sessions, notifications, messages,
    //    friendships, club_members, puzzle_attempts, …) and nulls the 14 ON DELETE SET NULL ones.
    if (keepSeed) db.prepare(`DELETE FROM users ${where}`).run(...params);
    else db.prepare('DELETE FROM users').run();
  });
  run();

  // Deleted rows keep their bytes in free pages; VACUUM rewrites the file without them. Truncating
  // the WAL first means the rewritten pages are written straight to the main file.
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
  db.pragma('wal_checkpoint(TRUNCATE)');

  const after = count('SELECT COUNT(*) AS n FROM users');
  console.log(`\n[purge] users: ${before} -> ${after}`);

  // Prove it: search the raw file for each address. This is the only check that also catches
  // content left in free pages or WAL, which a row count cannot see.
  db.close();
  const raw = fs.readFileSync(config.dbFile);
  const leaked = emails.filter(email => raw.includes(Buffer.from(email, 'utf8')));
  console.log(`[purge] raw-file check: ${leaked.length === 0
    ? `no trace of ${emails.length} email address(es) in the database file`
    : `${leaked.length} email address(es) STILL PRESENT — tell the maintainer`}`);

  if (leaked.length) process.exit(1);
  if (!keepSeed && after === 0) {
    console.log('[purge] All accounts cleared. Users can now register fresh.');
    console.log('[purge] Note: this does not touch Supabase. Remove accounts there too if you created');
    console.log('        them with Supabase auth (Authentication -> Users in the dashboard).');
  }
  console.log('');
}

main();
