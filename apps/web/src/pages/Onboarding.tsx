import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Gamepad2, Puzzle } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Progress } from '../components/ui';
import { BrandWordmark, Logo } from '../components/Brand';

const EXPERIENCE = [
  { key: 'new', label: 'I have never played', detail: 'Start with Learn Chess from Zero' },
  { key: 'beginner', label: 'I know how the pieces move', detail: 'Rules, then first games' },
  { key: 'casual', label: 'I play casually', detail: 'Tactics and opening principles' },
  { key: 'club', label: 'I play at club level', detail: 'Analysis and structured training' },
  { key: 'advanced', label: 'I am an advanced player', detail: 'Deep analysis and study' },
];

const INTERESTS = ['Tactics', 'Openings', 'Endgames', 'Strategy', 'Calculation', 'Tournaments', 'Coaching', 'Puzzles'];

export function Onboarding() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [experience, setExperience] = useState('beginner');
  const [categories, setCategories] = useState<string[]>(['blitz', 'rapid']);
  const [interests, setInterests] = useState<string[]>(['Tactics']);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], value: string) => list.includes(value) ? list.filter(v => v !== value) : [...list, value];

  const finish = async () => {
    setSaving(true);
    setError('');
    try {
      await api.patch('/me/onboarding', { experience, categories, interests });
      await refresh();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your preferences.');
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      title: `Welcome${user ? `, ${user.username}` : ''}`,
      body: 'Two quick questions and your dashboard, lessons and recommended activity will be set up for you.',
    },
    { title: 'How much chess have you played?', body: 'This sets your provisional starting ratings and your first lesson.' },
    { title: 'Which time controls will you play?', body: 'You can change this at any time in Settings.' },
    { title: 'What would you like to work on?', body: 'We use this to recommend lessons, puzzles and articles.' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 620 }}>
        <div className="row" style={{ marginBottom: 20 }}>
          <Logo size={34} /><BrandWordmark />
        </div>
        <div className="card" style={{ padding: 26 }}>
          <Progress value={((step + 1) / steps.length) * 100} className="mb-2" />
          <div className="tiny muted mb-2">Step {step + 1} of {steps.length}</div>
          <h2 style={{ marginBottom: 6 }}>{steps[step].title}</h2>
          <p className="muted">{steps[step].body}</p>

          {step === 1 && (
            <div className="stack" style={{ gap: 8 }}>
              {EXPERIENCE.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className="link-row"
                  style={{ borderColor: experience === option.key ? 'var(--violet)' : undefined, background: experience === option.key ? 'rgba(121,37,217,.16)' : undefined, cursor: 'pointer', width: '100%' }}
                  onClick={() => setExperience(option.key)}
                >
                  <span>
                    <span style={{ fontWeight: 600, display: 'block', textAlign: 'left' }}>{option.label}</span>
                    <span className="tiny muted">{option.detail}</span>
                  </span>
                  {experience === option.key && <Check size={16} style={{ color: 'var(--lavender)' }} />}
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="chip-row">
              {[{ id: 'bullet', label: 'Bullet 1+0' }, { id: 'blitz', label: 'Blitz 3+2' }, { id: 'rapid', label: 'Rapid 10+5' }, { id: 'classical', label: 'Classical 30+10' }].map(c => (
                <button key={c.id} type="button" className={`chip ${categories.includes(c.id) ? 'active' : ''}`} onClick={() => setCategories(toggle(categories, c.id))}>{c.label}</button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="chip-row">
              {INTERESTS.map(item => (
                <button key={item} type="button" className={`chip ${interests.includes(item) ? 'active' : ''}`} onClick={() => setInterests(toggle(interests, item))}>{item}</button>
              ))}
            </div>
          )}

          {step === 0 && (
            <div className="grid grid-3 mt-2">
              {[{ icon: BookOpen, label: 'Guided academy' }, { icon: Gamepad2, label: 'Play immediately' }, { icon: Puzzle, label: 'Daily puzzle' }].map(item => (
                <div key={item.label} className="panel text-center">
                  <item.icon size={20} style={{ color: 'var(--lavender)' }} />
                  <div className="small" style={{ marginTop: 6 }}>{item.label}</div>
                </div>
              ))}
            </div>
          )}

          {error && <div className="form-error mt-2" role="alert">{error}</div>}

          <div className="row-between mt-3">
            <button className="btn btn-ghost" type="button" onClick={() => step === 0 ? navigate('/dashboard') : setStep(step - 1)} disabled={saving}>
              {step === 0 ? 'Skip for now' : 'Back'}
            </button>
            {step < steps.length - 1 ? (
              <Button type="button" onClick={() => setStep(step + 1)} disabled={step === 2 && categories.length === 0}>
                Continue <ArrowRight size={16} />
              </Button>
            ) : (
              <Button type="button" onClick={finish} loading={saving}>Finish setup <ArrowRight size={16} /></Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
