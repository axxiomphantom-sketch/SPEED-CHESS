/**
 * Tests for the Supabase → SPEED CHESS identity bridge.
 *
 * These do not hit a real Supabase project (that would need live credentials in CI). They test the
 * part we own and can break: username normalisation, collision handling, idempotent provisioning,
 * linking an existing account by email, and the guarantee that a Supabase-managed account can never
 * be logged into through the legacy password path.
 */
import { db } from '../db/index.js';
import { assert, assertEqual, test, testAsync, suite } from './harness.js';
import {
  SUPABASE_PASSWORD_SENTINEL, ensureLocalUser, findBySupabaseId, linkSupabaseUser, normaliseUsername,
} from '../services/supabaseUsers.js';
import { verifyPassword } from '../lib/password.js';
import { config, resolveSupabaseConfig } from '../config.js';

function fakeUuid(seed: string): string {
  const hex = Buffer.from(seed).toString('hex').padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Registered from run.ts after `migrate()`, so the users table exists. */
export function registerSupabaseBridgeSuite(): void {
suite('Supabase identity bridge', () => {
  test('normalises hostile usernames into the allowed shape', () => {
    assertEqual(normaliseUsername('Nova Blitz'), 'nova_blitz');
    assertEqual(normaliseUsername('  Ada!!Lovelace  '), 'ada_lovelace');
    // Short names are padded deterministically so they still satisfy the 3-character minimum.
    assertEqual(normaliseUsername('ab'), 'abplr');
    assert(/^[a-z0-9_]{3,24}$/.test(normaliseUsername('ab')), 'short names are padded to a valid length');
    assert(/^[a-z0-9_]{3,24}$/.test(normaliseUsername('✂✂✂')), 'symbol-only names fall back to a valid name');
    assert(/^[a-z0-9_]{3,24}$/.test(normaliseUsername(null, 'Some.One@example.com')), 'email fallback is valid');
    assert(normaliseUsername('x'.repeat(80)).length <= 24, 'long names are truncated');
  });

  test('creates exactly one local account per Supabase user', () => {
    const supabaseUserId = fakeUuid('bridge-create');
    const firstName = ensureLocalUser({
      supabaseUserId, email: 'bridge.one@example.com', username: 'bridge_one', emailVerified: true,
    });
    assertEqual(firstName.email_verified, 1, 'verified email is recorded');
    assertEqual(firstName.supabase_user_id, supabaseUserId);

    const second = ensureLocalUser({
      supabaseUserId, email: 'bridge.one@example.com', username: 'bridge_one', emailVerified: true,
    });
    assertEqual(second.id, firstName.id, 'second call returns the same row');
    const count = db.prepare('SELECT COUNT(*) AS n FROM users WHERE supabase_user_id = ?').get(supabaseUserId) as { n: number };
    assertEqual(count.n, 1, 'no duplicate rows');
  });

  test('two Supabase users with the same username get distinct local usernames', () => {
    const a = ensureLocalUser({
      supabaseUserId: fakeUuid('bridge-a'), email: 'dup.a@example.com', username: 'same_name', emailVerified: true,
    });
    const b = ensureLocalUser({
      supabaseUserId: fakeUuid('bridge-b'), email: 'dup.b@example.com', username: 'same_name', emailVerified: true,
    });
    assert(a.username !== b.username, `usernames must differ (got ${a.username} and ${b.username})`);
  });

  test('links an existing local account by email instead of creating a second one', () => {
    const userId = 'usr_bridge_existing';
    db.prepare(
      `INSERT OR REPLACE INTO users (id, username, username_lower, email, email_lower, password_hash, email_verified)
       VALUES (?,?,?,?,?,?,1)`,
    ).run(userId, 'existing_player', 'existing_player', 'existing@example.com', 'existing@example.com', SUPABASE_PASSWORD_SENTINEL);

    const supabaseUserId = fakeUuid('bridge-link');
    const linked = ensureLocalUser({
      supabaseUserId, email: 'existing@example.com', username: 'ignored_name', emailVerified: true,
    });
    assertEqual(linked.id, userId, 'the existing account is reused, preserving ratings and games');
    assertEqual(findBySupabaseId(supabaseUserId)?.id, userId, 'the Supabase id is stored on the local row');
    const total = db.prepare('SELECT COUNT(*) AS n FROM users WHERE email_lower = ?').get('existing@example.com') as { n: number };
    assertEqual(total.n, 1, 'no duplicate account for the same email');
  });

  testAsync('a Supabase-managed account cannot be logged into with a local password', async () => {
    const user = ensureLocalUser({
      supabaseUserId: fakeUuid('bridge-nopw'), email: 'nopw@example.com', username: 'nopw_player', emailVerified: true,
    });
    assertEqual(user.password_hash, SUPABASE_PASSWORD_SENTINEL);
    // Even if someone typed the sentinel itself as the password, verification must fail.
    assertEqual(await verifyPassword(SUPABASE_PASSWORD_SENTINEL, user.password_hash), false);
    assertEqual(await verifyPassword('', user.password_hash), false);
    assertEqual(await verifyPassword('DemoPlayer123', user.password_hash), false);
  });

  test('an unverified email can never be linked to an existing account (takeover guard)', () => {
    db.prepare(
      `INSERT OR REPLACE INTO users (id, username, username_lower, email, email_lower, password_hash, email_verified)
       VALUES (?,?,?,?,?,?,1)`,
    ).run('usr_bridge_victim', 'victim_player', 'victim_player', 'victim@example.com', 'victim@example.com', SUPABASE_PASSWORD_SENTINEL);

    let threw = false;
    try {
      ensureLocalUser({
        supabaseUserId: fakeUuid('bridge-attacker'),
        email: 'victim@example.com',
        username: 'attacker',
        emailVerified: false,
      });
    } catch { threw = true; }
    assert(threw, 'linking must require a verified address');
    assertEqual(
      (db.prepare('SELECT supabase_user_id FROM users WHERE id = ?').get('usr_bridge_victim') as { supabase_user_id: string | null }).supabase_user_id,
      null,
      'the victim account must remain unlinked',
    );
  });

  test('linkSupabaseUser attaches an id to an existing row', () => {
    const userId = 'usr_bridge_manual';
    db.prepare(
      `INSERT OR REPLACE INTO users (id, username, username_lower, email, email_lower, password_hash)
       VALUES (?,?,?,?,?,?)`,
    ).run(userId, 'manual_link', 'manual_link', 'manual@example.com', 'manual@example.com', SUPABASE_PASSWORD_SENTINEL);
    const supabaseUserId = fakeUuid('bridge-manual');
    linkSupabaseUser(userId, supabaseUserId);
    assertEqual(findBySupabaseId(supabaseUserId)?.id, userId);
  });

  test('the unique index prevents one Supabase user owning two rows', () => {
    const supabaseUserId = fakeUuid('bridge-unique');
    ensureLocalUser({ supabaseUserId, email: 'uniq@example.com', username: 'uniq_player', emailVerified: true });
    let threw = false;
    try {
      db.prepare(
        `INSERT INTO users (id, username, username_lower, email, email_lower, password_hash, supabase_user_id)
         VALUES (?,?,?,?,?,?,?)`,
      ).run('usr_bridge_conflict', 'uniq_other', 'uniq_other', 'uniq2@example.com', 'uniq2@example.com', SUPABASE_PASSWORD_SENTINEL, supabaseUserId);
    } catch { threw = true; }
    assert(threw, 'a duplicate supabase_user_id must be rejected by the database');
  });
});
}

/**
 * Regression guard for the configuration bug that took three rounds to find, plus the variable
 * contract the project documents.
 *
 * The browser used to decide whether Supabase was available from `import.meta.env.VITE_*`, which
 * Vite inlines at build time. A build without an env file folded the check to `false` and
 * tree-shook the whole Supabase SDK out of the bundle, so the app silently used local auth while
 * the server was fully configured.
 *
 * These tests assert the *rule*, not the ambient environment: they must pass on a machine with no
 * `.env` file at all, which is the situation a fresh clone or CI is in. An earlier version of this
 * suite asserted that credentials were configured, so it failed for the wrong reason.
 */
export function registerRuntimeConfigSuite(): void {
suite('Runtime auth configuration', () => {
  test('the server prefers SUPABASE_* over VITE_SUPABASE_*', () => {
    const resolved = resolveSupabaseConfig({
      SUPABASE_URL: 'https://plain.example.co',
      SUPABASE_PUBLISHABLE_KEY: 'plain-key',
      VITE_SUPABASE_URL: 'https://vite.example.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'vite-key',
    });
    assertEqual(resolved.url, 'https://plain.example.co');
    assertEqual(resolved.key, 'plain-key');
  });

  test('the server falls back to the VITE_ pair', () => {
    const resolved = resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://vite.example.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'vite-key',
    });
    assertEqual(resolved.url, 'https://vite.example.co');
    assertEqual(resolved.key, 'vite-key');
  });

  test('a blank value counts as unset, so it cannot mask a working VITE_ value', () => {
    const resolved = resolveSupabaseConfig({
      SUPABASE_URL: '   ',
      SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SUPABASE_URL: 'https://vite.example.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'vite-key',
    });
    assertEqual(resolved.url, 'https://vite.example.co', 'blank SUPABASE_URL must not win');
    assertEqual(resolved.key, 'vite-key', 'blank SUPABASE_PUBLISHABLE_KEY must not win');
  });

  test('with nothing set both values are empty, never invented', () => {
    const resolved = resolveSupabaseConfig({});
    assertEqual(resolved.url, '');
    assertEqual(resolved.key, '');
    // Whitespace is trimmed, so a stray space cannot look like a hostname or key.
    assertEqual(resolveSupabaseConfig({ SUPABASE_URL: ' https://x.example.co ' }).url, 'https://x.example.co');
  });

  test('the configured values are a bare origin and a publishable key', () => {
    // Skips cleanly when the environment has no credentials, instead of failing.
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      assert(true, 'no Supabase credentials in this environment — shape checks skipped');
      return;
    }
    assert(!config.supabaseUrl.includes('/rest/v1'), 'a /rest/v1 suffix breaks the auth client');
    assert(!config.supabaseUrl.endsWith('/'), 'a trailing slash produces // in auth URLs');
    assert(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl),
      `unexpected URL shape: ${config.supabaseUrl}`);

    const key = config.supabasePublishableKey;
    assert(key.startsWith('sb_publishable_') || key.split('.').length === 3,
      'the exposed key must be a publishable/anon key');
    // A service-role key is a JWT whose payload carries "role":"service_role".
    const payload = key.split('.')[1];
    if (payload) {
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { role?: string };
      assert(decoded.role !== 'service_role', 'a service-role key must never reach the browser');
    }
    assert(!/service_role/.test(key), 'no service_role marker in the key');
  });
});
}
