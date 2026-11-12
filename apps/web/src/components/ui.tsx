import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { initials } from '../lib/api';

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}
export function Button({ variant = 'primary', size = 'md', loading, block, icon, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin-icon" style={{ animation: 'spin .8s linear infinite' }} /> : icon}
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ children, className = '', hover, padded = true, style }: {
  children: ReactNode; className?: string; hover?: boolean; padded?: boolean; style?: CSSProperties;
}) {
  return <section className={`card ${hover ? 'card-hover' : ''} ${padded ? '' : 'card-tight'} ${className}`} style={style}>{children}</section>;
}

export function CardHead({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h3 className="card-title">{title}</h3>
        {subtitle && <p className="small muted" style={{ margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ children, tone = 'default', className = '' }: { children: ReactNode; tone?: 'default' | 'purple' | 'success' | 'warning' | 'error' | 'muted'; className?: string }) {
  return <span className={`badge ${tone === 'default' ? '' : `badge-${tone}`} ${className}`}>{children}</span>;
}

/* ---------- Avatar ---------- */
export function Avatar({ name, src, size = 'md', online }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; online?: boolean }) {
  const cls = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : size === 'xl' ? 'avatar-xl' : '';
  return (
    <span className={`avatar ${cls}`} style={{ position: 'relative' }}>
      {src ? <img src={src} alt="" /> : initials(name)}
      {online !== undefined && (
        <span
          className={online ? 'online-dot' : 'offline-dot'}
          style={{ position: 'absolute', right: -1, bottom: -1, border: '2px solid var(--card)' }}
          title={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  );
}

/* ---------- Stat ---------- */
export function Stat({ label, value, delta, hint }: { label: string; value: ReactNode; delta?: number | null; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {typeof delta === 'number' && delta !== 0 && (
        <span className={delta > 0 ? 'stat-delta-up' : 'stat-delta-down'}>{delta > 0 ? '+' : ''}{delta}</span>
      )}
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}

/* ---------- Progress ---------- */
export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`progress ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/* ---------- Alerts ---------- */
export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode; title?: string }) {
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={17} style={{ flex: '0 0 auto', marginTop: 1 }} />
      <div>{title && <strong style={{ display: 'block', marginBottom: 2 }}>{title}</strong>}{children}</div>
    </div>
  );
}

/* ---------- Empty / loading ---------- */
export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h4>{title}</h4>
      {children && <p className="small" style={{ maxWidth: 460, margin: '0 auto 14px' }}>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…', rows = 1 }: { label?: string; rows?: number }) {
  return (
    <div className="stack" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: i === 0 ? 84 : 56 }} />
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="spinner" />
      {label && <span className="small muted">{label}</span>}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, width }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}
        style={width ? { maxWidth: width } : undefined} onClick={e => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close dialog" type="button"><X size={16} /></button>
        </div>
        {children}
        {footer && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (id: T) => void; label?: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={value === tab.id}
          className={`tab ${value === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}{typeof tab.count === 'number' ? ` (${tab.count})` : ''}
        </button>
      ))}
    </div>
  );
}

/* ---------- Form field ---------- */
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

/* ---------- Confirm dialog ---------- */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string;
  tone?: 'danger' | 'primary'; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} footer={
      <>
        <Button variant="secondary" onClick={onCancel} type="button">Cancel</Button>
        <Button variant={tone} onClick={onConfirm} type="button">{confirmLabel}</Button>
      </>
    }>
      <div className="small muted">{message}</div>
    </Modal>
  );
}

/* ---------- Section header ---------- */
export function PageHead({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="row wrap">{action}</div>}
    </header>
  );
}

/* ---------- Simple sparkline / bar chart (no external deps) ---------- */
export function Sparkline({ points, height = 48, tone = 'var(--violet)' }: { points: number[]; height?: number; tone?: string }) {
  if (points.length < 2) return <div className="small muted">Not enough data yet</div>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 100;
  const step = width / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(height - ((p - min) / range) * (height - 6) - 3).toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }} aria-hidden="true">
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={tone} opacity="0.14" />
      <path d={path} fill="none" stroke={tone} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal win/draw/loss distribution bar used in analytics. */
export function ResultBar({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = wins + draws + losses;
  if (total === 0) return <div className="progress" aria-label="No games recorded"><span style={{ width: '0%' }} /></div>;
  return (
    <div className="row" style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: '#22222b' }}
      role="img" aria-label={`${wins} wins, ${draws} draws, ${losses} losses`}>
      <span style={{ width: `${(wins / total) * 100}%`, background: 'var(--success)' }} />
      <span style={{ width: `${(draws / total) * 100}%`, background: '#6b6b78' }} />
      <span style={{ width: `${(losses / total) * 100}%`, background: 'var(--error)' }} />
    </div>
  );
}

export function StatBar({ label, value, max, tone = 'var(--violet)' }: { label: string; value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row-between" style={{ marginBottom: 4 }}>
        <span className="small" style={{ color: '#d6d6de' }}>{label}</span>
        <span className="small muted">{value}</span>
      </div>
      <div className="progress"><span style={{ width: `${pct}%`, background: tone }} /></div>
    </div>
  );
}

/* ---------- Copy to clipboard ---------- */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const id = useId();
  return (
    <Button
      variant="secondary"
      size="sm"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch { /* clipboard unavailable */ }
      }}
      aria-describedby={copied ? `${id}-copied` : undefined}
    >
      {copied ? 'Copied' : label}
      <span id={`${id}-copied`} className="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
    </Button>
  );
}

/* ---------- Error boundary ---------- */
export function RouteError({ message }: { message?: string }) {
  return (
    <div className="page">
      <Alert tone="error" title="Something went wrong">
        {message ?? 'This page could not be loaded. Please try again.'}
        <div className="mt-2"><Link to="/dashboard" className="btn btn-secondary btn-sm">Back to dashboard</Link></div>
      </Alert>
    </div>
  );
}
