import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Crown, Info, Sparkles, X, Zap } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Button, Card, CardHead, Loading } from '../components/ui';

const PLAN_ORDER = ['free', 'premium', 'pro'];
const PLAN_BLURB: Record<string, string> = {
  free: 'Everything you need to play, learn and compete. No ads, no paywall on the academy.',
  premium: 'For players who review every game and want deeper statistics and training tools.',
  pro: 'For coaches, organisers and clubs that need administration tools alongside everything else.',
};

const PLAN_ICON: Record<string, JSX.Element> = {
  free: <Zap size={18} />, premium: <Sparkles size={18} />, pro: <Crown size={18} />,
};

export function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[] | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ plans: any[] }>('/billing/plans').then(d => setPlans(d.plans.sort((a, b) => PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id)))).catch(() => setPlans([]));
    if (user) api.get<any>('/billing/subscription').then(setSubscription).catch(() => {});
  }, [user]);

  const choose = async (planId: string) => {
    if (!user) { navigate('/register'); return; }
    setBusy(planId); setError(''); setNotice('');
    try {
      const res = await api.post<{ url?: string }>('/billing/checkout', { planId });
      if (res.url) window.location.assign(res.url);
      else setNotice('Checkout session created — the plan activates after the payment provider confirms it.');
    } catch (err) {
      // A 503 with integrationRequired is an honest deployment message, not a crash.
      const payload = err instanceof ApiError ? (err.payload as any) : null;
      setError(payload?.integrationRequired
        ? 'Payments are not configured on this deployment yet, so no charge was made. Every free feature keeps working.'
        : err instanceof ApiError ? err.message : 'Checkout failed.');
    } finally { setBusy(null); }
  };

  return (
    <div className={`page ${user ? '' : 'public-page'}`}>
      <header className="page-head">
        <div>
          <div className="eyebrow"><Crown size={13} style={{ verticalAlign: -2 }} /> Membership</div>
          <h1>Plans</h1>
          <p>Play, learn and compete for free, forever. Paid plans support the platform and add convenience features — never an engine, hints or an advantage in rated games.</p>
        </div>
      </header>

      {!user && (
        <Alert tone="info" title="Free account includes everything essential">
          Rated games, puzzles, the full academy, analysis and tournaments. <Link to="/register">Create a free account</Link>.
        </Alert>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {plans === null ? <Loading rows={1} /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'stretch' }}>
          {plans.map(plan => {
            const current = subscription?.plan === plan.id || user?.plan === plan.id;
            const featured = plan.id === 'premium';
            return (
              <Card key={plan.id} style={{ display: 'flex', flexDirection: 'column', borderColor: featured ? 'var(--violet)' : undefined, position: 'relative' }}>
                {featured && <span className="badge badge-purple" style={{ position: 'absolute', top: 14, right: 14 }}>Most popular</span>}
                <span className="pillar-icon" style={{ margin: 0, width: 40, height: 40 }}>{PLAN_ICON[plan.id] ?? <Sparkles size={18} />}</span>
                <h3 style={{ margin: '12px 0 2px', textTransform: 'capitalize' }}>{plan.name ?? plan.id}</h3>
                <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontSize: '1.9rem', fontWeight: 700 }}>{plan.price_cents === 0 ? 'Free' : `$${(plan.price_cents / 100).toFixed(2)}`}</span>
                  {plan.price_cents > 0 && <span className="small muted">/{plan.interval ?? 'month'}</span>}
                </div>
                <p className="small muted" style={{ minHeight: 44 }}>{PLAN_BLURB[plan.id] ?? plan.name}</p>
                <div className="stack" style={{ gap: 7, flex: 1 }}>
                  {(plan.features ?? []).map((feature: string | { label: string; included: boolean }) => {
                    const label = typeof feature === 'string' ? feature : feature.label;
                    const included = typeof feature === 'string' ? true : feature.included;
                    return (
                      <div key={label} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                        {included ? <Check size={14} style={{ color: 'var(--success)', flex: '0 0 auto', marginTop: 3 }} />
                          : <X size={14} style={{ color: '#5c5c68', flex: '0 0 auto', marginTop: 3 }} />}
                        <span className="small" style={{ color: included ? '#d5d5de' : '#7c7c88' }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
                <Button className="mt-2 btn-block" variant={current ? 'secondary' : featured ? 'primary' : 'secondary'}
                  disabled={current} loading={busy === plan.id}
                  onClick={() => choose(plan.id)}>
                  {current ? 'Current plan' : plan.price_cents === 0 ? 'Included free' : `Choose ${plan.name ?? plan.id}`}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-3">
        <CardHead title="What we will never sell" action={<Info size={15} style={{ color: 'var(--warning)' }} />} />
        <div className="grid grid-2" style={{ gap: 16 }}>
          <ul className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6, color: '#cfcfd9' }}>
            <li>Engine moves or hints during a rated game.</li>
            <li>Rating points, wins or leaderboard placement.</li>
            <li>Tournament pairings or favourable colours.</li>
          </ul>
          <ul className="small" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6, color: '#cfcfd9' }}>
            <li>Removal of fair-play checks on your account.</li>
            <li>Access to other players' private data.</li>
            <li>Silencing a fair-play finding — appeals go to a human.</li>
          </ul>
        </div>
      </Card>

      <div className="grid grid-2 mt-2">
        <Card>
          <CardHead title="Payments" />
          <p className="small muted" style={{ marginBottom: 8 }}>Subscriptions are handled by a payment provider. This build is honest about what is configured:</p>
          <Alert tone="info">
            If no provider credentials are set, the checkout returns “integration required” and no charge is attempted. Card details are never sent to or stored by SPEED CHESS.
          </Alert>
        </Card>
        <Card>
          <CardHead title="Questions" />
          <div className="stack" style={{ gap: 10 }}>
            <div><strong className="small">Can I cancel any time?</strong><div className="tiny muted">Yes — cancellation takes effect at the end of the paid period and nothing else changes.</div></div>
            <div><strong className="small">Do paid plans change my rating?</strong><div className="tiny muted">No. Ratings depend on results only.</div></div>
            <div><strong className="small">Do you offer student discounts?</strong><div className="tiny muted">Not yet. A discounted plan for verified student clubs is planned but not implemented — we will not pretend otherwise.</div></div>
          </div>
          <Link to="/help" className="btn btn-ghost btn-sm mt-2">Help centre</Link>
        </Card>
      </div>
    </div>
  );
}
