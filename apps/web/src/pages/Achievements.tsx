import { useEffect, useState } from 'react';
import { Award, CheckCircle2, Lock, Sparkles } from 'lucide-react';
import { api, formatDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Card, Empty, Loading, Progress, Tabs } from '../components/ui';

interface Achievement {
  id: string; name: string; description: string; icon: string | null; tier: string;
  category: string; target: number; progress: number; unlocked_at: string | null;
}

type Tone = 'default' | 'error' | 'success' | 'purple' | 'warning' | 'muted';
const TIER_TONE: Record<string, Tone> = { bronze: 'warning', silver: 'muted', gold: 'purple', platinum: 'success' };

export function Achievements() {
  const { user } = useAuth();
  const [items, setItems] = useState<Achievement[] | null>(null);
  const [tab, setTab] = useState<'all' | 'unlocked' | 'locked'>('all');

  useEffect(() => {
    api.get<{ achievements: Achievement[] }>('/achievements').then(d => setItems(d.achievements)).catch(() => setItems([]));
  }, [user]);

  const unlocked = items?.filter(a => a.unlocked_at) ?? [];
  const list = (items ?? []).filter(a => tab === 'all' || (tab === 'unlocked' ? a.unlocked_at : !a.unlocked_at));
  const byCategory = list.reduce<Record<string, Achievement[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Award size={13} style={{ verticalAlign: -2 }} /> Achievements</div>
          <h1>Achievements</h1>
          <p>Milestones earned by playing, learning and solving — calculated from your real activity. Nothing here is purchasable.</p>
        </div>
        <Badge tone="purple"><Sparkles size={12} /> {unlocked.length} unlocked</Badge>
      </header>

      <Tabs value={tab} onChange={setTab} label="Achievement filters" tabs={[
        { id: 'all', label: 'All', count: items?.length },
        { id: 'unlocked', label: 'Unlocked', count: unlocked.length },
        { id: 'locked', label: 'In progress', count: (items?.length ?? 0) - unlocked.length },
      ]} />

      {items === null ? <Loading rows={3} /> : list.length === 0 ? (
        <Empty icon={<Award size={26} />} title={tab === 'unlocked' ? 'No achievements unlocked yet' : 'Nothing here yet'}>
          Play a game, finish a lesson or solve a puzzle to start unlocking.
        </Empty>
      ) : (
        Object.entries(byCategory).map(([category, group]) => (
          <section key={category} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: '1rem', textTransform: 'capitalize', marginBottom: 10 }}>{category.replace('-', ' ')}</h2>
            <div className="grid grid-auto">
              {group.map(item => {
                const done = Boolean(item.unlocked_at);
                const percent = item.target > 0 ? Math.min(100, Math.round((item.progress / item.target) * 100)) : done ? 100 : 0;
                return (
                  <Card key={item.id} style={{ opacity: done ? 1 : 0.78 }}>
                    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                      <span className="pillar-icon" style={{ margin: 0, width: 38, height: 38, background: done ? 'rgba(34,197,94,.14)' : 'rgba(255,255,255,.04)', color: done ? 'var(--success)' : 'var(--muted)' }}>
                        {done ? <CheckCircle2 size={17} /> : <Lock size={16} />}
                      </span>
                      <div className="grow">
                        <div className="row-between">
                          <strong style={{ fontSize: '.9rem' }}>{item.name}</strong>
                          <Badge tone={TIER_TONE[item.tier] ?? 'muted'}>{item.tier}</Badge>
                        </div>
                        <p className="tiny muted" style={{ margin: '2px 0 8px' }}>{item.description}</p>
                        <Progress value={percent} />
                        <div className="row-between tiny muted" style={{ marginTop: 4 }}>
                          <span>{item.progress}/{item.target}</span>
                          <span>{done ? `Unlocked ${formatDate(item.unlocked_at!)}` : `${percent}%`}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}

      <Card padded>
        <p className="tiny muted" style={{ margin: 0 }}>
          Achievements are cosmetic only. They never unlock engine help in rated games and have no effect on your rating.
        </p>
      </Card>
    </div>
  );
}
