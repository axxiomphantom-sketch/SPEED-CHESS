import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShieldCheck } from 'lucide-react';
import { Logo } from './Brand';

export function AuthShell({ children, title, subtitle, footer }: { children: ReactNode; title: string; subtitle?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside" aria-hidden="true">
        <Link to="/" className="brand" style={{ padding: 0 }}>
          <Logo size={36} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
            <span className="brand-name">SPEED CHESS</span>
            <span className="brand-tag">Play · Learn · Compete · Evolve</span>
          </span>
        </Link>
        <div>
          <h2 style={{ fontSize: '2rem', lineHeight: 1.1, marginBottom: 14 }}>Every player starts<br />with a first move.</h2>
          <p className="muted" style={{ maxWidth: 380 }}>Learn the rules properly, play real games with server-validated moves, and review them honestly with engine analysis.</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '22px 0 0', display: 'grid', gap: 12 }}>
            {['Complete beginner academy with interactive boards', 'Rated and casual play across four time controls',
              'Puzzles validated before they are published', 'Tournaments, clubs and coaches in one account'].map(item => (
              <li key={item} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(121,37,217,.25)', display: 'grid', placeItems: 'center', flex: '0 0 auto', marginTop: 2 }}>
                  <Check size={13} style={{ color: 'var(--lavender)' }} />
                </span>
                <span className="small" style={{ color: '#c9c9d4' }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="small muted row" style={{ gap: 8 }}>
          <ShieldCheck size={15} style={{ color: 'var(--success)' }} />
          Passwords are hashed with scrypt. Sessions are httpOnly and revocable.
        </div>
      </aside>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: '1.7rem', marginBottom: 6 }}>{title}</h1>
            {subtitle && <p className="muted" style={{ margin: 0 }}>{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-3 small muted">{footer}</div>}
          <div className="mt-3"><Link to="/" className="small">← Back to speedchess.home</Link></div>
        </div>
      </div>
    </div>
  );
}
