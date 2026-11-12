import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Chess } from 'chess.js';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Badge, Button, Card, CardHead, Loading } from '../components/ui';
import { ChessBoard } from '../components/board/ChessBoard';
import { Markdown } from '../components/Markdown';

interface QuizQuestion { q: string; options: string[]; answer: number; explanation: string }
interface Lesson {
  slug: string; title: string; body: string; fen: string | null; highlights: string[];
  quiz: QuizQuestion[]; minutes: number; level: string; order_index: number; course_id: string;
}

export function LessonView() {
  const { slug } = useParams<{ slug: string }>();
  const { user, refresh } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [prev, setPrev] = useState<{ slug: string; title: string } | null>(null);
  const [next, setNext] = useState<{ slug: string; title: string } | null>(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [completion, setCompletion] = useState<{ courseCompleted: boolean; courseProgress: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLesson(null);
    setAnswers({});
    setSubmitted(false);
    setCompletion(null);
    setError('');
    api.get<any>(`/learn/lessons/${slug}`)
      .then(res => {
        setLesson(res.lesson);
        setPrev(res.prev);
        setNext(res.next);
        setBoardFen(res.lesson.fen ?? null);
        if (user) api.post(`/learn/lessons/${slug}/start`).catch(() => {});
      })
      .catch(err => setError(err instanceof ApiError ? err.message : 'Could not load this lesson.'));
  }, [slug, user]);

  const score = useMemo(() => {
    if (!lesson) return 0;
    return lesson.quiz.reduce((total, question, index) => total + (answers[index] === question.answer ? 1 : 0), 0);
  }, [answers, lesson]);

  const complete = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      const res = await api.post<{ courseCompleted: boolean; courseProgress: number }>(`/learn/lessons/${lesson.slug}/complete`, {
        score: lesson.quiz.length ? score : undefined,
        total: lesson.quiz.length || undefined,
      });
      setCompletion(res);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your progress.');
    } finally { setSaving(false); }
  };

  if (error) return <div className="page"><Alert tone="error" title="Lesson unavailable">{error}</Alert></div>;
  if (!lesson) return <div className="page"><Loading rows={3} /></div>;

  return (
    <div className="page">
      <div className="row-between wrap mb-2">
        <Link to="/learn" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Learning centre</Link>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone="purple">{lesson.level}</Badge>
          <Badge tone="muted">{lesson.minutes} min</Badge>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)' }}>{lesson.title}</h1>
          <Card className="mt-2">
            <Markdown source={lesson.body} />
          </Card>

          {lesson.quiz.length > 0 && (
            <Card className="mt-2">
              <CardHead
                title="Knowledge test"
                subtitle="Choose an answer for each question, then check your answers."
                action={submitted ? <Badge tone={score === lesson.quiz.length ? 'success' : 'warning'}>{score}/{lesson.quiz.length}</Badge> : undefined}
              />
              <div className="stack" style={{ gap: 18 }}>
                {lesson.quiz.map((question, qIndex) => (
                  <div key={qIndex}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{qIndex + 1}. {question.q}</div>
                    <div className="stack" style={{ gap: 6 }}>
                      {question.options.map((option, oIndex) => {
                        const selected = answers[qIndex] === oIndex;
                        const correct = submitted && oIndex === question.answer;
                        const wrong = submitted && selected && oIndex !== question.answer;
                        return (
                          <button
                            key={oIndex}
                            type="button"
                            onClick={() => !submitted && setAnswers(prev => ({ ...prev, [qIndex]: oIndex }))}
                            className="link-row"
                            style={{
                              cursor: submitted ? 'default' : 'pointer', textAlign: 'left',
                              borderColor: correct ? 'var(--success)' : wrong ? 'var(--error)' : selected ? 'var(--violet)' : undefined,
                              background: correct ? 'rgba(34,197,94,.12)' : wrong ? 'rgba(239,68,68,.1)' : selected ? 'rgba(121,37,217,.14)' : undefined,
                            }}
                          >
                            <span className="row" style={{ gap: 10 }}>
                              <span style={{
                                width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center',
                                background: '#22222b', fontSize: '.72rem', fontWeight: 700, flex: '0 0 auto',
                              }}>{String.fromCharCode(65 + oIndex)}</span>
                              {option}
                            </span>
                            {correct && <Check size={16} style={{ color: 'var(--success)' }} />}
                            {wrong && <X size={16} style={{ color: 'var(--error)' }} />}
                          </button>
                        );
                      })}
                    </div>
                    {submitted && (
                      <div className="tiny mt-1" style={{ color: '#b8b8c4', marginTop: 6 }}>
                        <strong style={{ color: answers[qIndex] === question.answer ? 'var(--success)' : 'var(--error)' }}>
                          {answers[qIndex] === question.answer ? 'Correct. ' : `Not quite — the answer is ${String.fromCharCode(65 + question.answer)}. `}
                        </strong>
                        {question.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!submitted ? (
                <Button className="mt-2" onClick={() => setSubmitted(true)} disabled={Object.keys(answers).length < lesson.quiz.length}>
                  Check answers
                </Button>
              ) : (
                <div className="row mt-2">
                  <Button variant="secondary" onClick={() => { setSubmitted(false); setAnswers({}); }}>Retake test</Button>
                  <Button onClick={complete} loading={saving} icon={<CheckCircle2 size={16} />}>
                    { completion ? 'Progress saved' : 'Mark lesson complete' }
                  </Button>
                </div>
              )}
            </Card>
          )}

          {lesson.quiz.length === 0 && (
            <Button className="mt-2" onClick={complete} loading={saving} icon={<CheckCircle2 size={16} />}>
              { completion ? 'Progress saved' : 'Mark lesson complete' }
            </Button>
          )}

          {completion && (
            <Alert tone={completion.courseCompleted ? 'success' : 'info'} title={completion.courseCompleted ? 'Course complete' : 'Lesson complete'}>
              {completion.courseCompleted
                ? 'You have finished every lesson in this course. The achievement is now on your profile.'
                : `Course progress: ${completion.courseProgress}%. Keep going — each lesson builds on the last.`}
            </Alert>
          )}

          <div className="row-between mt-3">
            {prev ? (
              <Link to={`/learn/lesson/${prev.slug}`} className="btn btn-secondary btn-sm"><ChevronLeft size={15} /> {prev.title}</Link>
            ) : <span />}
            {next ? (
              <Link to={`/learn/lesson/${next.slug}`} className="btn btn-primary btn-sm">{next.title} <ChevronRight size={15} /></Link>
            ) : <span />}
          </div>
        </div>

        <div className="stack">
          {lesson.fen && (
            <Card>
              <CardHead title="Demonstration board" subtitle="Move the pieces to explore the idea yourself." />
              <ChessBoard
                fen={boardFen ?? lesson.fen}
                highlights={lesson.highlights}
                interactive
                onMove={move => {
                  try {
                    const chess = new Chess(boardFen ?? lesson.fen!);
                    chess.move({ from: move.from, to: move.to, promotion: (move.promotion as any) ?? 'q' });
                    setBoardFen(chess.fen());
                  } catch { /* illegal for this demonstration — ignore */ }
                }}
                ariaLabel={`Demonstration board for ${lesson.title}`}
              />
              <div className="row-between mt-2">
                <Button size="sm" variant="secondary" onClick={() => setBoardFen(lesson.fen)} icon={<RotateCcw size={14} />}>Reset board</Button>
                <span className="tiny muted">Highlights show the squares in the lesson</span>
              </div>
            </Card>
          )}
          <Card>
            <CardHead title="Lesson checkpoints" />
            <ul className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6, color: '#cfcfd9' }}>
              <li>Read every section before the test.</li>
              <li>Replay the demonstration board at least once.</li>
              <li>Answer the test without looking back.</li>
              <li>Complete the lesson to unlock your progress.</li>
            </ul>
            <Link to="/training" className="btn btn-secondary btn-sm btn-block mt-2">Practise with puzzles</Link>
          </Card>
          <Card>
            <CardHead title="Course" action={<BookOpen size={15} style={{ color: 'var(--lavender)' }} />} />
            <Link to="/learn" className="small">← All courses</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
