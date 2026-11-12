import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Bot, Check, ChevronDown, Crown, Gamepad2, GraduationCap, PlayCircle, ShieldCheck, Sparkles, Swords, Target, TrendingUp, Users, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { Badge, Card } from '../components/ui';
import { BrandWordmark, Logo } from '../components/Brand';
import { HeroBoard } from '../components/HeroBoard';

interface Meta {
  stats: { players: number; games: number; lessons: number; puzzles: number; tournaments: number; clubs: number; online: number };
  plans: Array<{ id: string; name: string; price_cents: number; interval: string; features: string[] }>;
  announcements: Array<{ id: string; title: string; body: string; level: string }>;
  registrationOpen: boolean;
}

const PILLARS = [
  { icon: Gamepad2, title: 'Play', body: 'Online rated and casual chess, private games with friends, and a computer opponent with five genuine difficulty levels — including offline play.' },
  { icon: BookOpen, title: 'Learn', body: 'A complete beginner academy: every piece, every rule, special moves, checkmate and draws — each with an interactive board and a knowledge test.' },
  { icon: Target, title: 'Improve', body: 'Validated puzzles, an opening explorer and full post-game analysis with real engine evaluations, accuracy scores and move classifications.' },
  { icon: Swords, title: 'Compete', body: 'Swiss and elimination tournaments with automatic pairings, plus global, country, club and friends leaderboards across four time controls.' },
  { icon: Users, title: 'Connect', body: 'Friends with live presence, private messages, clubs with membership roles, announcements and club events.' },
  { icon: GraduationCap, title: 'Create', body: 'Coaches publish profiles, set assignments and review student games. Approved creators publish lessons and articles.' },
];

const FAQ = [
  { q: 'Is SPEED CHESS free to use?', a: 'Yes. The free plan includes online and offline chess, the complete How to Play academy, puzzles, game history, clubs and public tournaments. Premium adds full game analysis, advanced statistics and every course; Pro adds coach, club and tournament management tools. There is no pay-to-win — nothing purchasable affects a game.' },
  { q: 'Do I need to install anything to play the computer?', a: 'No. The chess engine runs on the server, and every rule — castling, en passant, promotion, checkmate, stalemate, threefold repetition and the fifty-move rule — is validated on the server so the result cannot be spoofed. Offline support means you can keep playing on a weak connection; the board also works entirely in your browser.' },
  { q: 'How are ratings calculated?', a: 'Four separate ratings (bullet, blitz, rapid, classical) use Glicko-2 with a rating deviation, so new players settle quickly and established players move slowly. Platform divisions — Bronze to Master — are display labels, not official chess titles.' },
  { q: 'How do you handle fair play?', a: 'Moves are validated server-side and the AI coach is disabled inside your own active rated games. Reports are reviewed manually by moderators: no account is penalised by an automated signal alone, and every restriction can be appealed through support.' },
  { q: 'How do puzzles work?', a: 'Every puzzle position and solution line is validated when it is loaded into the platform, so a puzzle can never be unsolvable. You move first; the platform answers with the defensive move automatically and confirms each correct continuation.' },
  { q: 'Can I use SPEED CHESS with a keyboard or screen reader?', a: 'Yes. The board is fully keyboard operable, every square has an accessible label, contrast targets are met and a reduced-motion option removes animations.' },
];

export function Landing() {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => { api.get<Meta>('/meta').then(setMeta).catch(() => {}); }, []);

  return (
    <div>
      <nav className="landing-nav" aria-label="Public navigation">
        <Link to="/" className="brand" style={{ padding: 0 }}><Logo /><BrandWordmark /></Link>
        <div className="landing-nav-links">
          <a href="#pillars">Platform</a>
          <a href="#how">How to Play</a>
          <a href="#tournaments">Tournaments</a>
          <a href="#plans">Plans</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="grow" />
        <Link to="/login" className="btn btn-ghost">Sign in</Link>
        <Link to="/register" className="btn btn-primary">Create account</Link>
      </nav>

      {meta?.announcements?.length ? (
        <div style={{ background: 'rgba(121,37,217,.16)', borderBottom: '1px solid rgba(203,167,255,.25)', padding: '8px 32px', fontSize: '.84rem', textAlign: 'center' }}>
          <strong>{meta.announcements[0].title}</strong> — {meta.announcements[0].body}
        </div>
      ) : null}

      <header className="landing-hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow" style={{ marginBottom: 14 }}>ONE PLATFORM · EVERY PLAYER</div>
            <h1 className="hero-title">YOUR NEXT MOVE<br /><span className="grad">STARTS HERE.</span></h1>
            <p className="hero-sub">
              Play chess, sharpen your skills, challenge players around the world and become part of a global chess
              community. Learn from the very beginning, compete in real tournaments and watch your rating grow.
            </p>
            <div className="row wrap mt-3">
              <Link to="/play" className="btn btn-primary btn-lg"><PlayCircle size={18} /> PLAY CHESS</Link>
              <Link to="/how-to-play" className="btn btn-secondary btn-lg"><BookOpen size={18} /> LEARN CHESS</Link>
            </div>
            <div className="row wrap mt-3" style={{ gap: 18 }}>
              <StatPill value={meta?.stats.players ?? 0} label="players" />
              <StatPill value={meta?.stats.games ?? 0} label="games finished" />
              <StatPill value={meta?.stats.puzzles ?? 0} label="validated puzzles" />
              <StatPill value={meta?.stats.lessons ?? 0} label="lessons" />
            </div>
          </div>
          <div><HeroBoard /></div>
        </div>
      </header>

      <section className="section" id="pillars">
        <div className="section-head">
          <div className="eyebrow">The platform</div>
          <h2>Everything chess, in one connected ecosystem</h2>
          <p className="muted">SPEED CHESS is not a board with a scoreboard. It is a full environment: learn the rules, play seriously, analyse honestly, compete fairly and belong to a community.</p>
        </div>
        <div className="grid grid-3">
          {PILLARS.map(p => (
            <div className="pillar" key={p.title}>
              <div className="pillar-icon"><p.icon size={19} /></div>
              <h3>{p.title}</h3>
              <p className="small muted" style={{ margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="how">
        <div className="grid grid-2" style={{ alignItems: 'center', gap: 32 }}>
          <div>
            <div className="eyebrow">How to Play Academy</div>
            <h2>From “what is a knight?” to a finished game</h2>
            <p className="muted">Twenty-five structured lessons across six courses. Each lesson teaches one idea, shows it on a real board you can move, and finishes with a knowledge test that explains every answer.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 10 }}>
              {['Board, coordinates and setup', 'All six pieces and how they move', 'Castling, en passant and promotion',
                'Check, checkmate, stalemate and every draw rule', 'Opening principles, tactics and basic endgames',
                'Your first complete guided game'].map(item => (
                <li key={item} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <Check size={17} style={{ color: 'var(--success)', flex: '0 0 auto', marginTop: 3 }} />
                  <span className="small">{item}</span>
                </li>
              ))}
            </ul>
            <Link to="/how-to-play" className="btn btn-primary">Start the academy <ArrowRight size={16} /></Link>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            {[
              { icon: Sparkles, title: 'Learn Chess from Zero', meta: '4 lessons · boards + tests' },
              { icon: Crown, title: 'Meet the Chess Pieces', meta: '6 lessons · one per piece' },
              { icon: ShieldCheck, title: 'Special Moves and Rules', meta: '5 lessons · castling to stalemate' },
              { icon: Zap, title: 'Tactics Toolkit', meta: '4 lessons · forks, pins, skewers' },
            ].map(card => (
              <div className="card card-tight row" key={card.title} style={{ gap: 14 }}>
                <span className="pillar-icon" style={{ margin: 0 }}><card.icon size={18} /></span>
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: '.92rem' }}>{card.title}</div>
                  <div className="tiny muted">{card.meta}</div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--muted)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div className="eyebrow">Built for real play</div>
          <h2>A chessboard that behaves like a chessboard</h2>
        </div>
        <div className="grid grid-3">
          <Card>
            <h4><Gamepad2 size={16} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--lavender)' }} />Server-validated rules</h4>
            <p className="small muted" style={{ margin: 0 }}>Every move is checked on the server: it is not your turn, it is illegal, or your clock ran out — the platform decides, and the result is recorded once.</p>
          </Card>
          <Card>
            <h4><Bot size={16} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--lavender)' }} />Five real difficulty levels</h4>
            <p className="small muted" style={{ margin: 0 }}>An alpha-beta engine with capture quiescence, from a deliberately blundering beginner to a depth-5 opponent — the same engine analyses your finished games.</p>
          </Card>
          <Card>
            <h4><Activity_icon /> Honest analysis</h4>
            <p className="small muted" style={{ margin: 0 }}>Accuracy, best moves, inaccuracies, mistakes and blunders are computed from engine search. If a feature needs a provider you have not configured, the platform says so instead of pretending.</p>
          </Card>
        </div>
      </section>

      <section className="section" id="tournaments">
        <div className="grid grid-2" style={{ alignItems: 'start', gap: 28 }}>
          <div>
            <div className="eyebrow">Competition</div>
            <h2>Tournaments that run themselves</h2>
            <p className="muted">Organisers create an event in a minute. Swiss pairings, elimination brackets, byes, tiebreaks and the games themselves are generated by the platform, with standings that update as results arrive.</p>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div className="panel"><div className="stat-value">{meta?.stats.tournaments ?? 0}</div><div className="stat-label">Tournaments</div></div>
              <div className="panel"><div className="stat-value">{meta?.stats.clubs ?? 0}</div><div className="stat-label">Clubs</div></div>
              <div className="panel"><div className="stat-value">{meta?.stats.online ?? 0}</div><div className="stat-label">Online now</div></div>
              <div className="panel"><div className="stat-value">4</div><div className="stat-label">Rated time controls</div></div>
            </div>
          </div>
          <Card>
            <h3 style={{ marginBottom: 4 }}>Featured tournament</h3>
            <p className="small muted">SPEED CHESS Weekly Blitz · Five rounds · 3+2 Swiss</p>
            <div className="stack" style={{ gap: 8 }}>
              {[['Format', 'Swiss'], ['Time control', '3+2 blitz'], ['Rounds', '5'], ['Prize', 'Premium months + badge']].map(([k, v]) => (
                <div className="row-between" key={k} style={{ fontSize: '.86rem' }}>
                  <span className="muted">{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <Link to="/tournaments" className="btn btn-primary btn-block mt-2">Browse tournaments</Link>
          </Card>
        </div>
      </section>

      <section className="section" id="plans">
        <div className="section-head">
          <div className="eyebrow">Plans</div>
          <h2>Fair pricing. No pay-to-win, ever.</h2>
          <p className="muted">Chess is decided on the board. Paid plans add learning depth and professional tools — never strength, ratings or advantages in a game.</p>
        </div>
        <div className="grid grid-3">
          {(meta?.plans ?? []).map(plan => (
            <Card key={plan.id} hover>
              <div className="row-between">
                <h3 style={{ margin: 0 }}>{plan.name}</h3>
                {plan.id === 'premium' && <Badge tone="purple">Popular</Badge>}
              </div>
              <div className="mt-2" style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>
                {plan.price_cents === 0 ? 'Free' : `$${(plan.price_cents / 100).toFixed(2)}`}
                {plan.price_cents > 0 && <span className="small muted" style={{ fontWeight: 500 }}> /{plan.interval}</span>}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 18px', display: 'grid', gap: 8 }}>
                {plan.features.slice(0, 7).map(f => (
                  <li key={f} className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <Check size={15} style={{ color: 'var(--success)', flex: '0 0 auto', marginTop: 3 }} />{f}
                  </li>
                ))}
              </ul>
              <Link to="/register" className={`btn ${plan.id === 'free' ? 'btn-secondary' : 'btn-primary'} btn-block`}>
                {plan.price_cents === 0 ? 'Start free' : `Choose ${plan.name}`}
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section className="section" id="faq">
        <div className="section-head"><div className="eyebrow">Questions</div><h2>Frequently asked questions</h2></div>
        <div className="stack" style={{ maxWidth: 880 }}>
          {FAQ.map(item => (
            <details className="card card-tight" key={item.q} style={{ cursor: 'pointer' }}>
              <summary style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 12, listStyle: 'none' }}>
                {item.q}<ChevronDown size={16} style={{ flex: '0 0 auto', marginTop: 4, color: 'var(--muted)' }} />
              </summary>
              <p className="small muted" style={{ margin: '10px 0 0' }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="hero-panel text-center">
          <h2 style={{ marginBottom: 8 }}>Ready to make your first move?</h2>
          <p className="muted" style={{ maxWidth: 560, margin: '0 auto 20px' }}>Create a free account and start with the beginner academy, or jump straight into a game against the computer.</p>
          <div className="row center wrap">
            <Link to="/register" className="btn btn-primary btn-lg">Create free account</Link>
            <Link to="/login" className="btn btn-secondary btn-lg">I already have one</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-grid">
          <div>
            <Link to="/" className="brand" style={{ padding: 0, marginBottom: 12 }}><Logo size={30} /><BrandWordmark compact /></Link>
            <p className="small muted" style={{ maxWidth: 300 }}>PLAY. LEARN. COMPETE. EVOLVE. One platform, every player, endless possibilities.</p>
            <div className="row" style={{ gap: 8 }}>
              <Badge tone="purple"><ShieldCheck size={12} /> Fair play</Badge>
              <Badge tone="muted">Glicko-2 ratings</Badge>
            </div>
          </div>
          <div>
            <h5>Platform</h5>
            <div className="footer-links">
              <Link to="/play">Play chess</Link>
              <Link to="/how-to-play">How to play</Link>
              <Link to="/learn">Learn chess</Link>
              <Link to="/training">Puzzles</Link>
              <Link to="/tournaments">Tournaments</Link>
            </div>
          </div>
          <div>
            <h5>Community</h5>
            <div className="footer-links">
              <Link to="/clubs">Clubs</Link>
              <Link to="/leaderboards">Leaderboards</Link>
              <Link to="/content">Content</Link>
              <Link to="/coaching">Coaches</Link>
              <Link to="/achievements">Achievements</Link>
            </div>
          </div>
          <div>
            <h5>Support</h5>
            <div className="footer-links">
              <Link to="/help">Help centre</Link>
              <Link to="/legal/about">About</Link>
              <Link to="/legal/contact">Contact</Link>
              <Link to="/legal/privacy">Privacy policy</Link>
              <Link to="/legal/terms">Terms of service</Link>
              <Link to="/legal/fair-play">Fair play policy</Link>
              <Link to="/legal/guidelines">Community guidelines</Link>
              <Link to="/legal/cookies">Cookie settings</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} SPEED CHESS. Built for players at every level.</span>
          <span>Platform divisions (Bronze–Master) are display labels, not official chess titles.</span>
        </div>
      </footer>
    </div>
  );
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem' }}>{value.toLocaleString()}</div>
      <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
    </div>
  );
}

function Activity_icon() {
  return <TrendingUp size={16} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--lavender)' }} />;
}
