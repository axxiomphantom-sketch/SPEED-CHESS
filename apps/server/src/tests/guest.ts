/**
 * Guest play and the avatar preset contract.
 *
 * The guest tests assert the *boundary*, not just the happy path: a guest may play the computer and
 * a friend on one device, and must be unable to reach anything that belongs to an account. That
 * boundary is the whole risk of this feature — a guest is unauthenticated by definition — so each
 * "cannot" below is a privilege check rather than a courtesy.
 */
import { db, nowIso } from '../db/index.js';
import { assert, assertEqual, test, suite } from './harness.js';
import {
  GUEST_COOKIE, createGuest, guestFromToken, guestOwnsGame, setGuestIcon, sweepExpiredGuests,
} from '../lib/guest.js';
import { AVATAR_ICON_IDS, isAvatarIcon } from '../lib/avatarIcons.js';
import { applyMove, createGame, gameById } from '../services/games.js';
import { sha256 } from '../lib/ids.js';

/** Creates a guest row directly, bypassing HTTP so the tests need no server. */
function newGuest(icon?: string) {
  const { token, guest } = createGuest(icon ?? null);
  return { token, guest };
}

export function registerGuestSuite(): void {
suite('Guest play', () => {
  test('a guest token resolves to an identity', () => {
    const { token, guest } = newGuest('knight-violet');
    const resolved = guestFromToken(token);
    assert(resolved !== null, 'a fresh token must resolve');
    assertEqual(resolved!.id, guest.id);
    assertEqual(resolved!.avatarIcon, 'knight-violet');
  });

  test('an unknown or empty token resolves to nothing', () => {
    assertEqual(guestFromToken(undefined), null);
    assertEqual(guestFromToken(''), null);
    assertEqual(guestFromToken('definitely-not-a-token'), null);
  });

  test('only the hash is stored, never the raw token', () => {
    const { token } = newGuest();
    const raw = db.prepare('SELECT COUNT(*) AS n FROM guest_sessions WHERE token_hash = ?').get(token) as { n: number };
    // If the raw token were stored verbatim this would find it; a leaked database would then be a
    // set of usable sessions.
    assertEqual(raw.n, 0, 'the raw token must not be stored');
    const hashed = db.prepare('SELECT COUNT(*) AS n FROM guest_sessions WHERE token_hash = ?').get(sha256(token)) as { n: number };
    assertEqual(hashed.n, 1, 'the hashed token must be stored');
  });

  test('an expired token stops authenticating immediately', () => {
    const { token, guest } = newGuest();
    // Expiry is enforced in the lookup query, so a stale row is inert even before the sweep runs.
    db.prepare('UPDATE guest_sessions SET expires_at = ? WHERE id = ?')
      .run('2000-01-01 00:00:00', guest.id);
    assertEqual(guestFromToken(token), null, 'an expired guest must not authenticate');
  });

  test('the sweep removes expired guests and their unfinished games', () => {
    const { guest } = newGuest();
    const game = createGame({
      whiteId: null, blackId: null, guestOwnerId: guest.id, mode: 'computer',
      seconds: 300, increment: 0, whiteName: guest.displayName,
    });
    db.prepare('UPDATE guest_sessions SET expires_at = ? WHERE id = ?').run('2000-01-01 00:00:00', guest.id);

    const result = sweepExpiredGuests();
    assert(result.guests >= 1, 'the expired guest must be swept');
    assert(result.games >= 1, 'its unfinished game must be swept');
    assertEqual(gameById(game.id), undefined, 'the unfinished guest game must be gone');
  });

  test('a guest owns its game; another guest does not', () => {
    const owner = newGuest();
    const stranger = newGuest();
    const game = createGame({
      whiteId: null, blackId: null, guestOwnerId: owner.guest.id, mode: 'computer',
      seconds: 300, increment: 0, whiteName: owner.guest.displayName,
    });
    assert(guestOwnsGame(game, owner.guest), 'the creator must own the game');
    assert(!guestOwnsGame(game, stranger.guest), 'a different guest must not own it');
    assert(!guestOwnsGame(game, null), 'no guest owns nothing');
    // A user-owned game (owner_id set, guest_owner_id null) must not look guest-owned.
    const userGame = createGame({ whiteId: null, blackId: null, ownerId: null, mode: 'local', seconds: 300, increment: 0 });
    assert(!guestOwnsGame(userGame, owner.guest), 'a game with no guest owner is not guest-owned');
  });

  test('a guest may move as White but never for the engine', () => {
    const { guest } = newGuest();
    const game = createGame({
      whiteId: null, blackId: null, guestOwnerId: guest.id, mode: 'computer',
      seconds: 300, increment: 0, whiteName: guest.displayName,
    });
    const mine = applyMove(game.id, undefined, 'e2', 'e4', undefined, true);
    assert(mine.ok, `the guest should be able to move as White: ${mine.error}`);

    const afterWhite = gameById(game.id)!;
    assertEqual(afterWhite.turn, 'b', 'it must be Black to move');
    const engineSeat = applyMove(game.id, undefined, 'e7', 'e5', undefined, true);
    assert(!engineSeat.ok, 'a guest must not move for the engine');
  });

  test('local hot-seat works for a guest on both sides', () => {
    const { guest } = newGuest();
    const game = createGame({
      whiteId: null, blackId: null, guestOwnerId: guest.id, mode: 'local',
      seconds: 300, increment: 0, whiteName: 'White', blackName: 'Black',
    });
    // Local games ignore ownership by design: one device controls both armies.
    assert(applyMove(game.id, undefined, 'd2', 'd4', undefined, true).ok, 'White must move');
    assert(applyMove(game.id, undefined, 'd7', 'd5', undefined, true).ok, 'Black must move');
  });

  test('a guest icon survives being updated', () => {
    const { guest } = newGuest();
    setGuestIcon(guest.id, 'pawn-charcoal');
    const row = db.prepare('SELECT avatar_icon FROM guest_sessions WHERE id = ?').get(guest.id) as { avatar_icon: string };
    assertEqual(row.avatar_icon, 'pawn-charcoal');
  });

  test('the guest cookie cannot collide with the session cookie', () => {
    assertEqual(GUEST_COOKIE, 'sc_guest');
    // Compared through a widened type: the point is that these must not become equal, which the
    // literal types alone would make a compile error rather than a runtime guard.
    const asString: string = GUEST_COOKIE;
    assert(asString !== 'sc_session', 'guest and account cookies must be different');
  });

  test('guests never appear in the users table', () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    for (let i = 0; i < 3; i++) newGuest();
    const after = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    // This is the property that keeps guests out of leaderboards and player search without those
    // queries needing to know guests exist.
    assertEqual(after, before, 'creating guests must not add users rows');
  });
});

suite('Avatar presets', () => {
  test('the catalogue is 24 pieces plus 12 abstracts', () => {
    const pieces = [...AVATAR_ICON_IDS].filter(id => !id.startsWith('geo-'));
    const abstracts = [...AVATAR_ICON_IDS].filter(id => id.startsWith('geo-'));
    assertEqual(pieces.length, 24, 'six pieces in four themes');
    assertEqual(abstracts.length, 12);
  });

  test('every documented theme and piece exists', () => {
    for (const type of ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']) {
      for (const theme of ['purple', 'violet', 'light', 'charcoal']) {
        assert(isAvatarIcon(`${type}-${theme}`), `missing ${type}-${theme}`);
      }
    }
  });

  test('unknown ids are rejected rather than stored', () => {
    for (const bad of ['', 'king', 'king-pink', 'geo-13', 'geo-1', null, undefined, 42, {}]) {
      assert(!isAvatarIcon(bad as never), `must reject ${String(bad)}`);
    }
  });
});
}
