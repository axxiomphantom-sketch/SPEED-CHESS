import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Compass, Lightbulb, Send, Sparkles, Target } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Badge, Button, Card, CardHead, Empty, Loading } from '../components/ui';

interface Plan {
  averageAccuracy: number | null; gamesAnalysed: number;
  puzzles: { attempted: number; solved: number }; lessonsCompleted: number;
  steps: Array<{ title: string; detail: string; link: string }>;
}

interface Message { role: 'user' | 'coach'; text: string; disclaimer?: string }

const SUGGESTIONS = [
  'How do I stop blundering pieces?',
  'What should I learn first as a beginner?',
  'Explain the difference between checkmate and stalemate.',
  'How do I choose between two candidate moves?',
  'What is a good opening for a beginner?',
  'How much should I practise each day?',
];

export function Coach() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) api.get<Plan>('/coach/plan').then(setPlan).catch(() => {});
  }, [user]);

  const ask = async (text: string) => {
    if (!text.trim()) return;
    setAsking(true);
    setError('');
    setMessages(prev => [...prev, { role: 'user', text: text.trim() }]);
    setQuestion('');
    try {
      const res = await api.post<{ answer: string; disclaimer: string; suggestions?: string[] }>('/coach/ask', { question: text.trim() });
      setMessages(prev => [...prev, { role: 'coach', text: res.answer, disclaimer: res.disclaimer }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The coach could not answer right now.');
    } finally { setAsking(false); }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Bot size={13} style={{ verticalAlign: -2 }} /> AI Coach</div>
          <h1>Your chess coach</h1>
          <p>An educational assistant that explains ideas in plain language and builds a plan from your real record. It never analyses positions inside your active rated games.</p>
        </div>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 520 }}>
          <CardHead title="Ask anything about chess" subtitle="Rules, strategy, training habits — not engine assistance."
            action={<Badge tone="purple"><Sparkles size={11} /> Educational only</Badge>} />
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, paddingRight: 4 }}>
            {messages.length === 0 && (
              <div className="empty" style={{ padding: '28px 0' }}>
                <Bot size={26} style={{ color: 'var(--lavender)' }} />
                <p className="small" style={{ maxWidth: 400 }}>Ask about the rules, openings, training routines or how to review a game. If you need an engine to find a tactic in a live game, that is what the coach will not do — it would be cheating.</p>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  padding: '10px 13px', borderRadius: 12, fontSize: '.88rem', lineHeight: 1.55,
                  background: message.role === 'user' ? 'linear-gradient(135deg,#7925D9,#9333EA)' : '#1c1c24',
                  border: message.role === 'coach' ? '1px solid var(--border)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>{message.text}</div>
                {message.disclaimer && <div className="tiny muted" style={{ marginTop: 3 }}>{message.disclaimer}</div>}
              </div>
            ))}
            {asking && <div className="small muted"><span className="spinner" /> Thinking…</div>}
          </div>
          <div className="row mt-2" style={{ gap: 8 }}>
            <input className="input" placeholder="Ask the coach…" value={question} maxLength={600}
              onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(question); }} aria-label="Question for the coach" />
            <Button onClick={() => ask(question)} loading={asking} disabled={!question.trim()} icon={<Send size={15} />}>Ask</Button>
          </div>
          <div className="chip-row mt-2">
            {SUGGESTIONS.slice(0, 4).map(suggestion => (
              <button key={suggestion} type="button" className="chip" onClick={() => ask(suggestion)}>{suggestion}</button>
            ))}
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHead title="Your learning plan" subtitle="Generated from your actual games, puzzles and lessons." action={<Target size={15} style={{ color: 'var(--lavender)' }} />} />
            {!user ? (
              <Empty icon={<Compass size={22} />} title="Sign in for a personal plan" action={<Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>}>
                The plan is built from your record, so it needs an account.
              </Empty>
            ) : !plan ? <Loading rows={2} /> : (
              <>
                <div className="row wrap" style={{ gap: 14, marginBottom: 12 }}>
                  <div className="stat"><span className="stat-value">{plan.gamesAnalysed}</span><span className="stat-label">Games analysed</span></div>
                  <div className="stat"><span className="stat-value">{plan.puzzles.solved}/{plan.puzzles.attempted}</span><span className="stat-label">Puzzles solved</span></div>
                  <div className="stat"><span className="stat-value">{plan.lessonsCompleted}</span><span className="stat-label">Lessons complete</span></div>
                  <div className="stat"><span className="stat-value">{plan.averageAccuracy ?? '—'}{plan.averageAccuracy !== null ? '%' : ''}</span><span className="stat-label">Avg accuracy</span></div>
                </div>
                <div className="stack" style={{ gap: 10 }}>
                  {plan.steps.map((step, index) => (
                    <Link key={step.title} to={step.link} className="list-row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
                      <span className="badge badge-purple" style={{ width: 22, height: 22, justifyContent: 'center', padding: 0 }}>{index + 1}</span>
                      <span className="grow">
                        <span style={{ display: 'block', fontWeight: 600, fontSize: '.88rem' }}>{step.title}</span>
                        <span className="tiny muted">{step.detail}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </Card>
          <Card>
            <CardHead title="What the coach will not do" action={<Lightbulb size={15} style={{ color: 'var(--warning)' }} />} />
            <ul className="small muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
              <li>It will not help you during a live rated game — that request is blocked automatically.</li>
              <li>It does not play your moves for you, and it will not suggest a move in a position you are currently playing.</li>
              <li>It explains patterns and plans; the decisions remain yours.</li>
            </ul>
          </Card>
          <Card padded>
            <div className="row-between">
              <span className="small muted">Want a human coach?</span>
              <Link to="/coaching" className="btn btn-secondary btn-sm">Coaching centre</Link>
            </div>
          </Card>
        </div>
      </div>

      <Alert tone="info" title="How this works">
        The coach is a rule-based educational assistant running on our server. It answers from a curated chess knowledge base and your own statistics; it does not send your questions to an external AI service.
      </Alert>
    </div>
  );
}
