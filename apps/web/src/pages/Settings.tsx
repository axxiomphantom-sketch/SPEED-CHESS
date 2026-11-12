import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CreditCard, Download, Lock, Monitor, Palette, Settings as SettingsIcon, Shield, Smartphone, Trash2, User } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, usePrefs } from '../lib/auth';
import { Alert, Badge, Button, Card, CardHead, ConfirmDialog, Field, Loading, Tabs } from '../components/ui';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

const BOARD_THEMES = [
  { id: 'violet', label: 'Violet', light: '#CFC3E8', dark: '#6B4FA8' },
  { id: 'classic', label: 'Classic', light: '#EFE6D2', dark: '#9C7B54' },
  { id: 'emerald', label: 'Emerald', light: '#D7E8DC', dark: '#3F7A5B' },
  { id: 'slate', label: 'Slate', light: '#C9CDD6', dark: '#4E5566' },
  { id: 'midnight', label: 'Midnight', light: '#9AA3B8', dark: '#2B3245' },
];

export function Settings() {
  const { user, logout } = useAuth();
  const { update: setPrefs } = usePrefs();
  const [tab, setTab] = useState<'appearance' | 'account' | 'notifications' | 'privacy' | 'billing'>('appearance');
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const install = useInstallPrompt();
  const [installNotice, setInstallNotice] = useState('');

  useEffect(() => {
    if (!user) return;
    api.get<{ settings: any }>('/me/settings').then(d => setSettings(d.settings)).catch(() => setSettings(null));
  }, [user]);

  const patch = async (payload: Record<string, unknown>, message = 'Saved.') => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.patch('/me/settings', payload);
      setSettings((prev: any) => ({ ...prev, ...payload }));
      setNotice(message);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save that setting.'); }
    finally { setBusy(false); }
  };

  const changePassword = async () => {
    setError(''); setNotice('');
    if (passwords.next !== passwords.confirm) { setError('The new passwords do not match.'); return; }
    if (passwords.next.length < 10) { setError('Use at least 10 characters for your new password.'); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: passwords.current, newPassword: passwords.next });
      setPasswords({ current: '', next: '', confirm: '' });
      setNotice('Password changed. Other devices stay signed in until their session expires.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not change the password.'); }
    finally { setBusy(false); }
  };

  const deleteAccount = async () => {
    setError('');
    try {
      await api.del('/auth/account', { password: deletePassword });
      setDeleting(false);
      await logout();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not delete the account.'); }
  };

  const handleInstall = async () => {
    const outcome = await install.install();
    if (outcome === 'unavailable') {
      // No native prompt (iOS Safari, Firefox desktop, or already installed): give real steps
      // rather than a button that silently does nothing.
      setInstallNotice(
        /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? 'On iPhone or iPad: tap the Share button, then "Add to Home Screen".'
          : 'Your browser has not offered an install prompt yet. Try Chrome or Edge on desktop, or use the browser menu → "Install SPEED CHESS".'
      );
    } else if (outcome === 'accepted') {
      setInstallNotice('Installing SPEED CHESS… it will appear with your other apps.');
    }
  };

  if (!user) return <div className="page"><Alert tone="info">Sign in to open settings.</Alert><Link to="/login" className="btn btn-primary mt-2">Sign in</Link></div>;
  if (!settings) return <div className="page"><Loading rows={3} /></div>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><SettingsIcon size={13} style={{ verticalAlign: -2 }} /> Settings</div>
          <h1>Settings</h1>
          <p>Appearance, account security, notifications and privacy. Changes to the board are saved to your account and follow you to any device.</p>
        </div>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Tabs value={tab} onChange={setTab} label="Settings sections" tabs={[
        { id: 'appearance', label: 'Appearance' },
        { id: 'account', label: 'Account' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'privacy', label: 'Privacy' },
        { id: 'billing', label: 'Billing' },
      ]} />

      {tab === 'appearance' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Board theme" action={<Palette size={15} style={{ color: 'var(--lavender)' }} />} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
              {BOARD_THEMES.map(theme => (
                <button key={theme.id} type="button" onClick={() => { setPrefs({ boardTheme: theme.id as any }); patch({ boardTheme: theme.id }); }}
                  style={{
                    padding: 10, borderRadius: 10, cursor: 'pointer', background: '#16161d',
                    border: `1px solid ${settings.boardTheme === theme.id ? 'var(--violet)' : 'var(--border)'}`,
                  }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                    {Array.from({ length: 16 }).map((_, index) => (
                      <div key={index} style={{ paddingTop: '100%', background: (Math.floor(index / 4) + index) % 2 ? theme.dark : theme.light }} />
                    ))}
                  </div>
                  <span className="tiny">{theme.label}</span>
                </button>
              ))}
            </div>
            <h4 style={{ marginTop: 18 }}>Preferences</h4>
            {[
              { key: 'showCoordinates' as const, label: 'Show board coordinates' },
              { key: 'showLegalMoves' as const, label: 'Highlight legal moves' },
              { key: 'soundEnabled' as const, label: 'Sound effects' },
              { key: 'reducedMotion' as const, label: 'Reduce motion' },
            ].map(item => (
              <label key={item.key} className="row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <span className="small">{item.label}</span>
                <input type="checkbox" checked={Boolean(settings[item.key])}
                  onChange={e => { const value = e.target.checked; patch({ [item.key]: value }); if (item.key === 'soundEnabled') setPrefs({ soundEnabled: value }); if (item.key === 'reducedMotion') setPrefs({ reducedMotion: value }); if (item.key === 'showCoordinates') setPrefs({ showCoordinates: value }); if (item.key === 'showLegalMoves') setPrefs({ showLegalMoves: value }); }} />
              </label>
            ))}
          </Card>
          <Card>
            <CardHead title="Preview" action={<Monitor size={15} style={{ color: 'var(--lavender)' }} />} />
            <div style={{ borderRadius: 10, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}>
              {Array.from({ length: 64 }).map((_, index) => {
                const theme = BOARD_THEMES.find(t => t.id === settings.boardTheme) ?? BOARD_THEMES[0];
                const dark = (Math.floor(index / 8) + index) % 2 === 1;
                return <div key={index} style={{ paddingTop: '100%', background: dark ? theme.dark : theme.light }} />;
              })}
            </div>
            <p className="tiny muted mt-2">Boards in games, puzzles and analysis use this theme. Pieces stay the same for readability.</p>
          </Card>
        </div>
      )}

      {tab === 'account' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Account details" action={<User size={15} style={{ color: 'var(--lavender)' }} />} />
            <div className="row-between small" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span className="muted">Username</span><span style={{ fontWeight: 600 }}>{settings.username}</span></div>
            <div className="row-between small" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="muted">Email</span>
              <span className="row" style={{ gap: 6 }}><span style={{ fontWeight: 600 }}>{settings.email}</span>
                {settings.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge>}</span>
            </div>
            <div className="row-between small" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span className="muted">Role</span><Badge tone="muted">{settings.role}</Badge></div>
            <div className="row-between small" style={{ padding: '8px 0' }}><span className="muted">Plan</span><Badge tone={settings.plan === 'free' ? 'muted' : 'purple'}>{settings.plan}</Badge></div>
            {!settings.emailVerified && <Link to="/verify-email" className="btn btn-secondary btn-sm mt-2">Verify email</Link>}
            <Link to="/profile" className="btn btn-ghost btn-sm mt-2">Edit public profile</Link>
          </Card>
          <Card>
            <CardHead title="Password" action={<Lock size={15} style={{ color: 'var(--lavender)' }} />} />
            <Field label="Current password" htmlFor="pw-cur"><input id="pw-cur" className="input" type="password" autoComplete="current-password" value={passwords.current} onChange={e => setPasswords({ ...passwords, current: e.target.value })} /></Field>
            <Field label="New password" htmlFor="pw-new" hint="At least 10 characters."><input id="pw-new" className="input" type="password" autoComplete="new-password" value={passwords.next} onChange={e => setPasswords({ ...passwords, next: e.target.value })} /></Field>
            <Field label="Confirm new password" htmlFor="pw-conf"><input id="pw-conf" className="input" type="password" autoComplete="new-password" value={passwords.confirm} onChange={e => setPasswords({ ...passwords, confirm: e.target.value })} /></Field>
            <Button onClick={changePassword} loading={busy}>Change password</Button>
            <div className="divider" style={{ margin: '18px 0' }} />
            <Button variant="danger" onClick={() => setDeleting(true)} icon={<Trash2 size={15} />}>Delete my account</Button>
            <p className="tiny muted mt-1">Deletion is permanent. Export your data first from your profile page.</p>
          </Card>
        </div>
      )}

      {tab === 'appearance' && (
        <Card>
          <CardHead title="Install the app" subtitle="Run SPEED CHESS in its own window, with its own icon." action={<Smartphone size={15} style={{ color: 'var(--lavender)' }} />} />
          {install.installed ? (
            <Badge tone="success">Installed — you are running the app version</Badge>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Installing adds SPEED CHESS to your desktop or home screen. It opens full-screen without
                browser chrome and loads instantly. It is the same account and the same games.
              </p>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <Button onClick={handleInstall} loading={install.installing} icon={<Download size={15} />}>
                  Install SPEED CHESS
                </Button>
                <span className="tiny muted">Version 1.0.0</span>
              </div>
              {installNotice && <p className="tiny muted" style={{ marginBottom: 0 }}>{installNotice}</p>}
            </>
          )}
        </Card>
      )}

      {tab === 'notifications' && (
        <Card style={{ maxWidth: 660 }}>
          <CardHead title="What you are notified about" action={<Bell size={15} style={{ color: 'var(--lavender)' }} />} />
          {[
            { key: 'notifyGames' as const, label: 'Games', hint: 'Challenges, your turn in a tournament game, results.' },
            { key: 'notifySocial' as const, label: 'Social', hint: 'Friend requests, messages, club invitations.' },
            { key: 'notifyLearning' as const, label: 'Learning', hint: 'Daily puzzle, course progress, coach assignments.' },
            { key: 'notifyTournaments' as const, label: 'Tournaments', hint: 'Pairings published, rounds starting, results.' },
          ].map(item => (
            <label key={item.key} className="row-between" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <span>
                <span style={{ display: 'block', fontWeight: 500, fontSize: '.9rem' }}>{item.label}</span>
                <span className="tiny muted">{item.hint}</span>
              </span>
              <input type="checkbox" checked={Boolean(settings[item.key])} onChange={e => patch({ [item.key]: e.target.checked })} />
            </label>
          ))}
          <p className="tiny muted mt-2">Security alerts (sign-ins, password changes) are always sent and cannot be disabled.</p>
        </Card>
      )}

      {tab === 'privacy' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Visibility" action={<Shield size={15} style={{ color: 'var(--lavender)' }} />} />
            {[
              { key: 'showCountry' as const, label: 'Show my country' },
              { key: 'showActivity' as const, label: 'Show my activity to friends' },
              { key: 'allowFriendRequests' as const, label: 'Allow friend requests' },
              { key: 'allowMessages' as const, label: 'Allow messages from non-friends' },
            ].map(item => (
              <label key={item.key} className="row-between" style={{ padding: '11px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <span className="small">{item.label}</span>
                <input type="checkbox" checked={Boolean(settings[item.key])} onChange={e => patch({ [item.key]: e.target.checked })} />
              </label>
            ))}
          </Card>
          <Card>
            <CardHead title="Your data" />
            <p className="small muted">Download a machine-readable copy of your account, games, messages and ratings.</p>
            <a className="btn btn-secondary btn-sm" href="/api/auth/data-export" download>Download my data</a>
            <div className="divider" style={{ margin: '18px 0' }} />
            <h4>Safety</h4>
            <ul className="small muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
              <li>Blocking someone hides their messages and challenges immediately.</li>
              <li>Reports go to a human moderator, never an automatic ban.</li>
              <li>Accounts registered by minors get stricter default privacy.</li>
            </ul>
            <Link to="/friends" className="btn btn-ghost btn-sm mt-2">Manage blocked players</Link>
          </Card>
        </div>
      )}

      {tab === 'billing' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Current plan" action={<CreditCard size={15} style={{ color: 'var(--lavender)' }} />} />
            <div className="row" style={{ gap: 10 }}>
              <Badge tone={settings.plan === 'free' ? 'muted' : 'purple'}>{settings.plan.toUpperCase()}</Badge>
              {settings.planRenewsAt && <span className="small muted">Renews {new Date(settings.planRenewsAt).toLocaleDateString()}</span>}
            </div>
            <p className="small muted mt-2">
              {settings.plan === 'free'
                ? 'The free plan includes rated play, puzzles, lessons and analysis. Upgrading adds coaching discounts, unlimited analysis depth and tournament tools — never an in-game advantage.'
                : 'Thank you for supporting SPEED CHESS. Your plan never gives you an engine or move hints in rated games.'}
            </p>
            <div className="row mt-2">
              <Link to="/pricing" className="btn btn-primary btn-sm">{settings.plan === 'free' ? 'See plans' : 'Change plan'}</Link>
              {settings.plan !== 'free' && <Button size="sm" variant="ghost" onClick={async () => {
                try { await api.post('/billing/cancel'); setNotice('Cancellation recorded. Your plan stays active until the renewal date.'); }
                catch (err) { setError(err instanceof ApiError ? err.message : 'Could not cancel.'); }
              }}>Cancel renewal</Button>}
            </div>
          </Card>
          <Card>
            <CardHead title="Billing safety" />
            <ul className="small muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
              <li>SPEED CHESS never stores card numbers — payments are handled by the payment provider.</li>
              <li>Subscription changes are confirmed by email.</li>
              <li>No pay-to-win: engine assistance is never sold.</li>
            </ul>
            <Alert tone="info" title="Payment integration">
              Card payments require a configured payment provider (see docs/DEPLOYMENT.md). Without credentials the checkout returns a clear "integration required" message instead of pretending to charge you.
            </Alert>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete your account?"
        message="This removes your profile, games, messages and club memberships permanently. Your rating history is anonymised."
        confirmLabel="Delete permanently"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteAccount}
      />

      <ConfirmDialog
        open={deleting && !confirmDelete}
        title="Confirm account deletion"
        message={<>Enter your password to continue. <input className="input mt-1" type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} aria-label="Password" /></>}
        confirmLabel="Continue"
        tone="danger"
        onCancel={() => { setDeleting(false); setDeletePassword(''); }}
        onConfirm={() => { setDeleting(false); setConfirmDelete(true); }}
      />
    </div>
  );
}
