/** Reference content seeding shared by the CLI seed script and the test suite. */
import { Chess } from 'chess.js';
import { db } from './index.js';
import { courses } from './seed/lessons.js';
import { puzzles } from './seed/puzzles.js';
import { openings } from './seed/openings.js';
import { achievements } from './seed/achievements.js';

const id = (p: string) => p + Math.random().toString(36).slice(2, 12);

export function seedReferenceContent(): void {
  if ((db.prepare('SELECT COUNT(*) AS n FROM courses').get() as { n: number }).n === 0) {
    for (const course of courses) {
      db.prepare('INSERT INTO courses (id, slug, title, level, summary, description, icon, minutes) VALUES (?,?,?,?,?,?,?,?)')
        .run(id('crs_'), course.slug, course.title, course.level, course.summary, course.description, course.icon,
          course.lessons.reduce((a, l) => a + l.minutes, 0));
      course.lessons.forEach((lesson, index) => {
        db.prepare(
          `INSERT INTO lessons (id, course_id, slug, order_index, title, level, minutes, body, fen, highlights, quiz, tags)
           VALUES (?, (SELECT id FROM courses WHERE slug = ?), ?,?,?,?,?,?,?,?,?,?)`
        ).run(id('lsn_'), course.slug, lesson.slug, index, lesson.title, lesson.level, lesson.minutes, lesson.body,
          lesson.fen ?? null, JSON.stringify(lesson.highlights ?? []), JSON.stringify(lesson.quiz ?? []), lesson.tags ?? null);
      });
    }
  }
  if ((db.prepare('SELECT COUNT(*) AS n FROM puzzles').get() as { n: number }).n === 0) {
    for (const p of puzzles) {
      const chess = new Chess(p.fen);
      for (const san of p.solution) chess.move(san);
      db.prepare('INSERT INTO puzzles (id, fen, solution, rating, themes, title, difficulty, side_to_move, explanation) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(p.id, p.fen, JSON.stringify(p.solution), p.rating, p.themes.join(','), p.title, p.difficulty,
          new Chess(p.fen).turn(), p.explanation);
    }
  }
  if ((db.prepare('SELECT COUNT(*) AS n FROM openings').get() as { n: number }).n === 0) {
    for (const o of openings) {
      const chess = new Chess();
      for (const san of o.moves.split(' ')) chess.move(san);
      db.prepare('INSERT INTO openings (id, eco, name, family, moves, plans, traps, side) VALUES (?,?,?,?,?,?,?,?)')
        .run(o.id, o.eco, o.name, o.family, o.moves, o.plans, o.traps ?? null, o.side);
    }
  }
  if ((db.prepare('SELECT COUNT(*) AS n FROM achievements').get() as { n: number }).n === 0) {
    for (const a of achievements) {
      db.prepare('INSERT INTO achievements (id, name, description, icon, tier, category, target) VALUES (?,?,?,?,?,?,?)')
        .run(a.id, a.name, a.description, a.icon, a.tier, a.category, a.target);
    }
  }
  if ((db.prepare('SELECT COUNT(*) AS n FROM plans').get() as { n: number }).n === 0) {
    const insert = db.prepare('INSERT INTO plans (id, name, price_cents, currency, interval, features) VALUES (?,?,?,?,?,?)');
    insert.run('free', 'Free', 0, 'USD', 'month', JSON.stringify(['Online and offline chess', 'Beginner courses', 'Daily puzzle', 'Game history', 'Clubs and tournaments', 'Basic statistics']));
    insert.run('premium', 'Premium', 700, 'USD', 'month', JSON.stringify(['Everything in Free', 'Full game analysis', 'Advanced statistics', 'Personalised training', 'All courses', 'No ads']));
    insert.run('pro', 'Pro', 1500, 'USD', 'month', JSON.stringify(['Everything in Premium', 'Coach tools', 'Club administration', 'Tournament management', 'Priority support']));
  }
}
