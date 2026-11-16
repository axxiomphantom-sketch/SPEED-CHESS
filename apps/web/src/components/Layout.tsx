import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Award, Bell, BookOpen, Bot, Building2, ChevronRight, Crown, Gamepad2, GraduationCap, History, LayoutDashboard, Library, LogOut, Mail, Menu, Puzzle, Search, Settings, Shield, TrendingUp, Trophy, User, Users, X, Compass, HelpCircle, PlayCircle, ScrollText } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGuest } from '../lib/guest';
import { Avatar, Button } from './ui';
import { BrandWordmark, Logo } from './Brand';

const NAV_GROUPS = [
  {
    label: 'Play',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/play', label: 'Play Chess', icon: Gamepad2 },
      { to: '/tournaments', label: 'Tournaments', icon: Trophy },
      { to: '/leaderboards', label: 'Leaderboards', icon: TrendingUp },
    ],
  },
  {
    label: 'Learn',
    items: [
      { to: '/how-to-play', label: 'How to Play', icon: Compass },
      { to: '/learn', label: 'Learn Chess', icon: BookOpen },
      { to: '/training', label: 'Training & Puzzles', icon: Puzzle },
      { to: '/openings', label: 'Opening Explorer', icon: Library },
      { to: '/history', label: 'Game History', icon: History },
    ],
  },
  {
    label: 'Improve',
    items: [
      { to: '/analysis', label: 'Game Analysis', icon: Activity },
      { to: '/coach', label: 'AI Chess Coach', icon: Bot },
      { to: '/coaching', label: 'Coaching Centre', icon: GraduationCap },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/friends', label: 'Friends', icon: Users },
      { to: '/clubs', label: 'Clubs & Communities', icon: Building2 },
      { to: '/content', label: 'Content Centre', icon: ScrollText },
      { to: '/achievements', label: 'Achievements', icon: Award },
    ],
  },
];

const MOBILE_NAV = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/play', label: 'Play', icon: Gamepad2 },
  { to: '/learn', label: 'Learn', icon: BookOpen },
  { to: '/training', label: 'Puzzles', icon: Puzzle },
  { to: '/profile', label: 'Profile', icon: User },
];

export function AppLayout() {
  const { user, logout, unreadNotifications } = useAuth();
  const { guest } = useGuest();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/dashboard" className="brand"><Logo /><BrandWordmark /></Link>
        {NAV_GROUPS.map(group => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map(item => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <item.icon size={17} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="nav-group">
          <div className="nav-label">Account</div>
          <NavLink to="/messages" className="nav-link"><Mail size={17} />Messages</NavLink>
          <NavLink to="/notifications" className="nav-link">
            <Bell size={17} />Notifications
            {unreadNotifications > 0 && <span className="nav-badge">{unreadNotifications}</span>}
          </NavLink>
          {user?.role === 'admin' || user?.role === 'moderator' ? (
            <NavLink to="/admin" className="nav-link"><Shield size={17} />Admin</NavLink>
          ) : null}
          <NavLink to="/pricing" className="nav-link"><Crown size={17} />Plans</NavLink>
          <NavLink to="/settings" className="nav-link"><Settings size={17} />Settings</NavLink>
          <NavLink to="/help" className="nav-link"><HelpCircle size={17} />Help & Support</NavLink>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          {user ? (
            <div className="panel" style={{ padding: 10 }}>
              <Link to="/profile" className="row" style={{ color: 'inherit', textDecoration: 'none' }}>
                <Avatar name={user.username} src={user.avatarUrl} icon={user.avatarIcon} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '.86rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</span>
                  <span className="tiny muted" style={{ textTransform: 'capitalize' }}>{user.plan} plan</span>
                </span>
              </Link>
              <button
                className="btn btn-ghost btn-sm btn-block"
                style={{ marginTop: 8 }}
                onClick={async () => { await logout(); navigate('/'); }}
                type="button"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          ) : guest ? (
            <div className="panel" style={{ padding: 10 }}>
              <div className="row" style={{ gap: 8 }}>
                <Avatar name={guest.displayName} icon={guest.avatarIcon} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '.86rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {guest.displayName}
                  </span>
                  <span className="tiny muted">Guest · not saved</span>
                </span>
              </div>
              <Link to="/register" className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }}>
                Create account
              </Link>
              <Link to="/login" className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 4 }}>
                Sign in
              </Link>
            </div>
          ) : (
            <Link to="/login" className="btn btn-primary btn-block">Sign in</Link>
          )}
        </div>
      </aside>

      <div className="main">
        {guest && !user && (
          <div className="guest-banner" style={{ margin: '10px 16px 0' }}>
            <Bot size={15} />
            <span>You are playing as a guest — games and puzzle progress are not saved.</span>
            <Link to="/register" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}>
              Create a free account
            </Link>
          </div>
        )}
        <div className="mobile-top">
          <Link to="/dashboard" className="brand" style={{ padding: 0 }}><Logo size={28} /><BrandWordmark compact /></Link>
          <div className="row" style={{ gap: 6 }}>
            <Link to="/notifications" className="btn btn-ghost btn-sm" aria-label="Notifications" style={{ position: 'relative' }}>
              <Bell size={18} />
              {unreadNotifications > 0 && <span style={{ position: 'absolute', top: 0, right: 0, width: 7, height: 7, borderRadius: '50%', background: 'var(--violet)' }} />}
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={() => setMenuOpen(v => !v)} aria-label="Menu" aria-expanded={menuOpen} type="button">
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="mobile-sheet" style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', padding: 14, position: 'sticky', top: 54, zIndex: 39 }}>
            <div className="grid grid-2" style={{ gap: 8 }}>
              {[...NAV_GROUPS.flatMap(g => g.items), { to: '/messages', label: 'Messages', icon: Mail },
                { to: '/settings', label: 'Settings', icon: Settings }, { to: '/help', label: 'Help', icon: HelpCircle },
                ...(user?.role === 'admin' || user?.role === 'moderator' ? [{ to: '/admin', label: 'Admin', icon: Shield }] : [])]
                .map(item => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <item.icon size={16} />{item.label}
                  </NavLink>
                ))}
            </div>
          </div>
        )}

        <GlobalTopbar />
        <Outlet />
      </div>

      <nav className="mobile-nav" aria-label="Quick navigation">
        {MOBILE_NAV.map(item => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <item.icon size={19} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function GlobalTopbar() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); return; }
    const timer = setTimeout(() => {
      api.get<any>(`/meta/search?q=${encodeURIComponent(query.trim())}`)
        .then(data => { setResults(data); setOpen(true); })
        .catch(() => setResults(null));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const groups = useMemo(() => {
    if (!results) return [];
    const out: Array<{ title: string; items: Array<{ label: string; to: string; meta?: string }> }> = [];
    if (results.players?.length) out.push({ title: 'Players', items: results.players.map((p: any) => ({ label: p.username, to: `/players/${p.username}`, meta: p.country })) });
    if (results.lessons?.length) out.push({ title: 'Lessons', items: results.lessons.map((l: any) => ({ label: l.title, to: `/learn/lesson/${l.slug}` })) });
    if (results.openings?.length) out.push({ title: 'Openings', items: results.openings.map((o: any) => ({ label: o.name, to: `/openings/${o.id}`, meta: o.eco })) });
    if (results.tournaments?.length) out.push({ title: 'Tournaments', items: results.tournaments.map((t: any) => ({ label: t.name, to: `/tournaments/${t.slug}`, meta: t.status })) });
    if (results.clubs?.length) out.push({ title: 'Clubs', items: results.clubs.map((c: any) => ({ label: c.name, to: `/clubs/${c.slug}` })) });
    return out;
  }, [results]);

  return (
    <header className="topbar">
      <div className="search-box" ref={boxRef}>
        <Search size={16} />
        <input
          className="input"
          placeholder="Search players, lessons, openings, tournaments…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results && setOpen(true)}
          aria-label="Global search"
        />
        {open && query.trim().length >= 2 && (
          <div className="search-results">
            {groups.length === 0 ? (
              <div className="small muted" style={{ padding: 12 }}>No results for “{query}”.</div>
            ) : groups.map(group => (
              <div key={group.title} className="search-result-group">
                <h6>{group.title}</h6>
                {group.items.map(item => (
                  <Link key={item.to + item.label} to={item.to} className="search-result" onClick={() => { setOpen(false); setQuery(''); }}>
                    <span className="grow">{item.label}</span>
                    {item.meta && <span className="tiny muted">{item.meta}</span>}
                    <ChevronRight size={13} />
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grow" />
      <Link to="/play" className="btn btn-primary btn-sm"><PlayCircle size={15} /> Play now</Link>
      <Link to="/notifications" className="btn btn-ghost btn-sm" aria-label="Notifications"><Bell size={17} /></Link>
      <Link to="/achievements" className="btn btn-ghost btn-sm" aria-label="Achievements"><Award size={17} /></Link>
      {user && (
        <Link to="/profile" className="row" style={{ gap: 8, textDecoration: 'none', color: 'inherit' }}>
          <Avatar name={user.username} src={user.avatarUrl} icon={user.avatarIcon} size="sm" />
          <span className="small" style={{ fontWeight: 600 }}>{user.username}</span>
        </Link>
      )}
    </header>
  );
}

export function PublicLayout() {
  return <Outlet />;
}

/**
 * Guards a route that requires a signed-in user but should not render the app shell.
 *
 * `/onboarding` is the motivation: it is a full-screen wizard, yet it calls PATCH /me/onboarding,
 * which requires auth. Without this guard a signed-out visitor sees a complete, interactive
 * wizard, fills it in, presses "Finish setup", and only then gets a bare "Authentication required"
 * error — the failure the wizard cannot explain or recover from. Checking up front turns that into
 * a normal sign-in prompt that returns the user to the page they were on.
 */
export function AuthOnly() {
  const { user, loading, refresh } = useAuth();
  const location = useLocation();
  const [rechecked, setRechecked] = useState(false);

  /**
   * The cached context can be stale for one render after a fresh sign-in, which showed a
   * signed-in player the sign-in prompt on /onboarding — the "Authentication required" dead end
   * this guard exists to prevent. So when the context says signed-out, ask the API once directly
   * before showing the prompt; a real session resolves immediately and the player continues.
   */
  useEffect(() => {
    if (loading || user || rechecked) return;
    let cancelled = false;
    void refresh().finally(() => { if (!cancelled) setRechecked(true); });
    return () => { cancelled = true; };
  }, [loading, user, rechecked, refresh]);

  if (loading || (!user && !rechecked)) {
    return <div className="center" style={{ minHeight: '60vh' }}><span className="spinner" /></div>;
  }
  if (!user) return <SignInPrompt from={location.pathname + location.search} />;
  return <Outlet />;
}

function SignInPrompt({ from }: { from: string }) {
  const { start, error } = useGuest();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const playAsGuest = async () => {
    setBusy(true);
    const started = await start();
    setBusy(false);
    // Straight to the board — asking a curious visitor to navigate menus is the fastest way to lose
    // them. `/play` is guest-capable, so this never bounces back here.
    if (started) navigate('/play');
  };

  return (
    <div className="page page-narrow" style={{ paddingTop: 60 }}>
      <div className="hero-panel text-center">
        <h2>Sign in to continue</h2>
        <p className="muted">
          This page needs a SPEED CHESS account. You can still play the computer or a friend
          on this device as a guest.
        </p>
        <div className="row center mt-2" style={{ flexWrap: 'wrap' }}>
          <Link to="/login" state={{ from }} className="btn btn-primary">Sign in</Link>
          <Link to="/register" className="btn btn-secondary">Create account</Link>
          <Button variant="outline" onClick={playAsGuest} loading={busy} icon={<Bot size={15} />}>
            Continue as guest
          </Button>
        </div>
        {error && <p className="small" style={{ color: 'var(--error)', marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}

/**
 * Layout for routes a guest may use.
 *
 * Signed-in players get the normal shell. A visitor with no account gets the same shell so the board
 * looks and behaves identically; the guest banner in the header is what tells them progress is not
 * saved. Anyone else is sent to the sign-in prompt.
 */
export function GuestLayout() {
  const { user, loading } = useAuth();
  const { guest, loading: guestLoading } = useGuest();
  const location = useLocation();
  if (loading || guestLoading) {
    return <div className="center" style={{ minHeight: '60vh' }}><span className="spinner" /></div>;
  }
  if (!user && !guest) return <SignInPrompt from={location.pathname + location.search} />;
  return <AppLayout />;
}

export function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="center" style={{ minHeight: '60vh' }}><span className="spinner" /></div>;
  }
  if (!user) return <SignInPrompt from={location.pathname + location.search} />;
  return <AppLayout />;
}
