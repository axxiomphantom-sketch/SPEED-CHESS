import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import {
  ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Compass, Crown, Flag, Grid3x3, MoveRight,
  RotateCcw, Shield, Sparkles, Swords, Target, Trophy, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, CardHead, Empty, Loading, Progress } from '../components/ui';
import { ChessBoard } from '../components/board/ChessBoard';

interface CourseSummary {
  id: string; slug: string; title: string; level: string; summary: string; icon: string | null;
  minutes: number; lessonCount: number; completedLessons: number; progress: number;
}

const STAGES = [
  { slug: 'what-is-chess', label: 'Board basics', icon: Grid3x3 },
  { slug: 'the-king', label: 'Piece recognition', icon: Crown },
  { slug: 'the-pawn', label: 'Piece movement', icon: MoveRight },
  { slug: 'special-moves-castling', label: 'Special moves', icon: Shield },
  { slug: 'tactics-forks', label: 'Capturing & tactics', icon: Zap },
  { slug: 'check-and-checkmate', label: 'Check and checkmate', icon: Swords },
  { slug: 'opening-principles', label: 'Basic strategy', icon: Target },
  { slug: 'first-game-guide', label: 'First complete game', icon: Trophy },
];

/** Guided interactive exercises: the learner really has to move the right piece. */
const EXERCISES = [
  {
    id: 'knight-jump',
    title: 'Move the knight to a light square',
    prompt: 'Knights always land on the opposite colour square. Pick the knight and move it to any legal square.',
    fen: '7k/8/8/3N4/8/8/8/6K1 w - - 0 1',
    from: ['d5'],
    validate: (move: any) => (['b4', 'b6', 'c3', 'c7', 'e3', 'e7', 'f4', 'f6'].includes(move.to)),
    success: 'Correct — the knight always jumps to the opposite colour. That is why it can never lose a tempo against a bishop on the same colour.',
  },
  {
    id: 'rook-file',
    title: 'Give check with the rook',
    prompt: 'The rook moves in straight lines. Find a move that gives check to the black king.',
    fen: '7k/8/8/8/8/8/6R1/6K1 w - - 0 1',
    from: ['g2'],
    validate: (_move: any, san: string) => san.includes('+') || san.includes('#'),
    success: 'Correct. The rook attacks along the rank and file — here it reaches the eighth rank to check the king.',
  },
  {
    id: 'bishop-diagonal',
    title: 'Capture with the bishop',
    prompt: 'Bishops move diagonally. Capture the black pawn with your bishop.',
    fen: '7k/8/8/8/3p4/8/2B5/6K1 w - - 0 1',
    from: ['c2'],
    validate: (_move: any, san: string) => san.toLowerCase().includes('xc'),
    success: 'Correct — a diagonal capture. Remember: this bishop can never reach the light squares.',
  },
  {
    id: 'pawn-push',
    title: 'Promote the pawn',
    prompt: 'Push the pawn to the last rank. Choose carefully — you may promote to any piece.',
    fen: '8/P5k1/8/8/8/8/6K1/8 w - - 0 1',
    from: ['a7'],
    validate: (_move: any, san: string) => san.includes('='),
    success: 'That pawn is now a queen. A single pawn can decide a game — this is why every pawn push matters.',
  },
  {
    id: 'castle',
    title: 'Castle kingside',
    prompt: 'Castle with the white king. Both the king and the rook must be on their original squares.',
    fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
    from: ['e1'],
    validate: (_move: any, san: string) => san === 'O-O',
    success: 'Castled. The king is safe behind pawns and the rook is active in one move.',
  },
  {
    id: 'back-rank',
    title: 'Deliver checkmate',
    prompt: 'Find the checkmate in one. The black king cannot escape its own pawns.',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    from: ['a1'],
    validate: (_move: any, san: string) => san.includes('#'),
    success: 'Checkmate. The back-rank mate is the pattern beginners meet most often — and it is why "luft" (h6/h3) exists.',
  },
];

export function HowToPlay() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [exerciseState, setExerciseState] = useState<{ fen: string; done: boolean; message: string }>({ fen: EXERCISES[0].fen, done: false, message: '' });

  useEffect(() => {
    api.get<{ courses: CourseSummary[] }>('/learn/courses').then(d => {
      setCourses(d.courses.filter(c => ['beginner', 'intermediate'].includes(c.level)).slice(0, 6));
    }).catch(() => setCourses([]));
    if (user) {
      api.get<{ progress: Array<{ slug: string; status: string }> }>('/learn/progress')
        .then(d => setCompleted(d.progress.filter(p => p.status === 'completed').map(p => p.slug)))
        .catch(() => {});
    }
  }, [user]);

  const totalLessons = courses?.reduce((sum, c) => sum + c.lessonCount, 0) ?? 0;
  const totalDone = courses?.reduce((sum, c) => sum + c.completedLessons, 0) ?? 0;
  const overall = totalLessons ? Math.round((totalDone / totalLessons) * 100) : 0;
  const exercise = EXERCISES[exerciseIndex];

  const onExerciseMove = (move: { from: string; to: string; promotion?: string }) => {
    try {
      const chess = new Chess(exerciseState.fen);
      const played = chess.move({ from: move.from, to: move.to, promotion: (move.promotion as any) ?? 'q' });
      const correct = exercise.validate(move, played.san);
      setExerciseState({
        fen: chess.fen(),
        done: correct,
        message: correct ? exercise.success : `That move (${played.san}) is legal, but it is not the idea of this exercise. Reset and try again.`,
      });
    } catch {
      setExerciseState(prev => ({ ...prev, message: 'That move is not legal here.' }));
    }
  };

  const selectExercise = (index: number) => {
    setExerciseIndex(index);
    setExerciseState({ fen: EXERCISES[index].fen, done: false, message: '' });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Compass size={13} style={{ verticalAlign: -2 }} /> How to Play</div>
          <h1>Learn chess from zero</h1>
          <p>A complete beginner academy: the board, every piece, every special rule, checkmate, draws and your first full game. Each lesson has an interactive board and a knowledge test.</p>
        </div>
        <div className="row">
          <Link to="/learn" className="btn btn-secondary">Full learning centre</Link>
        </div>
      </header>

      <section className="hero-panel mb-2" style={{ marginBottom: 18 }}>
        <div className="row-between wrap" style={{ gap: 16 }}>
          <div>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <Badge tone="purple"><Sparkles size={12} /> Academy progress</Badge>
              {user && <span className="tiny muted">{totalDone} of {totalLessons} lessons complete</span>}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{overall === 100 ? 'Academy complete — time to play rated chess.' : overall > 0 ? 'Keep going — you are building real foundations.' : 'Start with “What is chess?” and take it one lesson at a time.'}</h2>
            <div style={{ maxWidth: 420, marginTop: 12 }}><Progress value={overall} /></div>
          </div>
          <Link to="/learn/lesson/what-is-chess" className="btn btn-primary btn-lg">
            {overall > 0 ? 'Continue the academy' : 'Start from lesson one'} <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <h2 style={{ fontSize: '1.15rem', marginBottom: 12 }}>The learning path</h2>
      <div className="grid grid-auto mb-2" style={{ marginBottom: 22 }}>
        {STAGES.map((stage, index) => {
          const done = completed.includes(stage.slug);
          return (
            <Link key={stage.slug} to={`/learn/lesson/${stage.slug}`} className="card card-tight card-hover row" style={{ gap: 12, textDecoration: 'none', color: 'inherit' }}>
              <span className="pillar-icon" style={{ margin: 0, width: 34, height: 34, background: done ? 'rgba(34,197,94,.16)' : undefined, color: done ? 'var(--success)' : undefined }}>
                {done ? <Check size={16} /> : <stage.icon size={16} />}
              </span>
              <span className="grow">
                <span className="tiny muted">Step {index + 1}</span>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '.9rem' }}>{stage.label}</span>
              </span>
              <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
            </Link>
          );
        })}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="stack">
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Courses</h2>
          {courses === null ? <Loading rows={2} /> : courses.length === 0 ? (
            <Empty icon={<BookOpen size={24} />} title="Courses are loading">Refresh the page if this persists.</Empty>
          ) : courses.map(course => (
            <Card key={course.id} hover>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{course.title}</h3>
                  <p className="small muted" style={{ margin: '2px 0 0' }}>{course.summary}</p>
                </div>
                <Badge tone="muted">{course.lessonCount} lessons</Badge>
              </div>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <span className="tiny muted">{course.completedLessons}/{course.lessonCount} complete · {course.minutes} min</span>
                <span className="tiny" style={{ fontWeight: 700 }}>{course.progress}%</span>
              </div>
              <Progress value={course.progress} />
              <div className="row mt-2">
                <Link to={`/learn/course/${course.slug}`} className="btn btn-secondary btn-sm">View lessons</Link>
              </div>
            </Card>
          ))}
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Interactive practice" subtitle="Move the pieces — the board enforces the real rules." action={<Badge tone="purple">{exerciseIndex + 1}/{EXERCISES.length}</Badge>} />
            <div className="row-between mb-2">
              <strong style={{ fontSize: '.92rem' }}>{exercise.title}</strong>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setExerciseState({ fen: exercise.fen, done: false, message: '' })}>
                <RotateCcw size={14} /> Reset
              </button>
            </div>
            <p className="small muted">{exercise.prompt}</p>
            <ChessBoard
              fen={exerciseState.fen}
              onMove={onExerciseMove}
              interactive={!exerciseState.done}
              allowedFrom={exercise.from}
              ariaLabel={`Practice exercise: ${exercise.title}`}
            />
            {exerciseState.message && (
              <div className={`alert ${exerciseState.done ? 'alert-success' : 'alert-warning'} mt-2`}>
                {exerciseState.done ? <CheckCircle2 size={16} /> : <Flag size={16} />}
                <div>{exerciseState.message}</div>
              </div>
            )}
            {exerciseState.done && (
              <Button className="mt-2 btn-block" onClick={() => selectExercise((exerciseIndex + 1) % EXERCISES.length)} type="button">
                Next exercise <ArrowRight size={15} />
              </Button>
            )}
            <div className="chip-row mt-2">
              {EXERCISES.map((item, index) => (
                <button key={item.id} type="button" className={`chip ${index === exerciseIndex ? 'active' : ''}`} onClick={() => selectExercise(index)}>
                  {index + 1}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="What you will be able to do" />
            <ul className="small" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {['Set up a board and name any square', 'Move all six pieces legally, including captures',
                'Castle, capture en passant and promote correctly', 'Recognise check, checkmate and every draw',
                'Apply opening principles in a real game', 'Finish a complete game against the computer'].map(item => (
                <li key={item} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <Check size={15} style={{ color: 'var(--success)', flex: '0 0 auto', marginTop: 3 }} />{item}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="No setup needed" />
            <p className="small muted" style={{ marginBottom: 10 }}>Prefer a real opponent after the lessons? The computer has a beginner level that deliberately misses threats, so you can finish a game with the rules you just learned.</p>
            <Link to="/play?mode=computer" className="btn btn-primary btn-block"><Swords size={16} /> Play the computer</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
