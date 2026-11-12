/**
 * Tests for in-game chat.
 *
 * The interesting behaviour is all in the guards: who may post, what a message may contain, and
 * that a finished game is read-only. Those are the parts that protect players from each other, so
 * they are asserted here rather than left to manual clicking.
 */
import { db } from '../db/index.js';
import { suite, test, assert, assertEqual } from './harness.js';
import {
  MAX_MESSAGE_LENGTH, isParticipant, messagesFor, normaliseBody, postMessage,
} from '../services/gameChat.js';
import { createGame } from '../services/games.js';
import { finishGame } from '../services/games.js';

function makeUser(suffix: string): string {
  const id = `usr_chat_${suffix}`;
  db.prepare(`INSERT OR REPLACE INTO users (id, username, username_lower, email, email_lower, password_hash, email_verified)
    VALUES (?,?,?,?,?,?,1)`).run(id, `chat_${suffix}`, `chat_${suffix}`, `${suffix}@chat.test`, `${suffix}@chat.test`, 'x');
  return id;
}

export function registerGameChatSuite(): void {
suite('In-game chat', () => {
  const white = makeUser('white');
  const black = makeUser('black');
  const outsider = makeUser('outsider');

  test('collapses whitespace and strips control characters', () => {
    assertEqual(normaliseBody('  hello   world  '), 'hello world');
    assertEqual(normaliseBody('line\none\ttwo'), 'line one two');
    // A message that is only control characters must not become a blank bubble.
    assertEqual(normaliseBody('\u0000\u0001\u0002'), '');
  });

  test('caps length rather than rejecting', () => {
    const long = 'a'.repeat(MAX_MESSAGE_LENGTH + 500);
    assertEqual(normaliseBody(long).length, MAX_MESSAGE_LENGTH);
  });

  test('only the two players may post', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 180, increment: 2 });
    assert(isParticipant(game.id, white), 'white is a participant');
    assert(isParticipant(game.id, black), 'black is a participant');
    assert(!isParticipant(game.id, outsider), 'a third player is not');

    const own = postMessage(game.id, white, 'good luck');
    assert(own.ok, 'a player can post');
    const other = postMessage(game.id, black, 'you too');
    assert(other.ok, 'the opponent can post');

    const denied = postMessage(game.id, outsider, 'hello spectators');
    assert(!denied.ok, 'a non-participant is refused');
    if (!denied.ok) assertEqual(denied.status, 403);
  });

  test('rejects empty messages', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 180, increment: 2 });
    const result = postMessage(game.id, white, '   \n  ');
    assert(!result.ok, 'whitespace-only is refused');
    if (!result.ok) assertEqual(result.status, 400);
  });

  test('history is readable and ordered oldest first', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 180, increment: 2 });
    postMessage(game.id, white, 'first');
    postMessage(game.id, black, 'second');
    const list = messagesFor(game.id);
    assertEqual(list.length, 2);
    assertEqual(list[0].body, 'first');
    assertEqual(list[1].username, `chat_black`);
    assert(list.every(m => m.fromPlayer), 'both authors are players, not spectators');
  });

  test('a finished game is read-only but keeps its history', () => {
    const game = createGame({ whiteId: white, blackId: black, mode: 'online', seconds: 180, increment: 2 });
    postMessage(game.id, white, 'before the end');
    const row = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id) as any;
    finishGame(row, 'white', 'resignation');

    const refused = postMessage(game.id, black, 'after the end');
    assert(!refused.ok, 'posting after the end is refused');
    if (!refused.ok) assertEqual(refused.status, 409);

    assertEqual(messagesFor(game.id).length, 1, 'earlier messages remain visible');
  });

  test('posting to a game that does not exist is a 404', () => {
    const result = postMessage('gm_does_not_exist', white, 'hello');
    assert(!result.ok, 'posting to a missing game is refused');
    if (!result.ok) assertEqual(result.status, 404);
  });
});
}
