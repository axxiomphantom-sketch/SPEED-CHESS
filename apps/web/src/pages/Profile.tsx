import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Save, ShieldCheck, Upload, User as UserIcon } from 'lucide-react';
import { api, ApiError, formatDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Avatar, Badge, Button, Card, CardHead, Field, Tabs } from '../components/ui';

export function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ bio: '', country: '' });
  const [privacy, setPrivacy] = useState({ showCountry: true, showActivity: true, allowMessages: true, allowFriendRequests: true });
  const [sessions, setSessions] = useState<any[]>([]);
  const [tab, setTab] = useState<'profile' | 'privacy' | 'security'>('profile');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get<any>(`/players/${user.username}`).then(d => {
      setForm({ bio: d.player.bio ?? '', country: d.player.country ?? '' });
    }).catch(() => {});
    api.get<any>('/me/settings').then(d => {
      const s = d.settings ?? {};
      setPrivacy({
        showCountry: s.showCountry ?? true, showActivity: s.showActivity ?? true,
        allowMessages: s.allowMessages ?? true, allowFriendRequests: s.allowFriendRequests ?? true,
      });
    }).catch(() => {});
    api.get<any>('/auth/sessions').then(d => setSessions(d.sessions)).catch(() => {});
  }, [user]);

  const saveProfile = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      await api.patch('/me/settings', form);
      setNotice('Profile updated.');
      await refresh();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save your profile.'); }
    finally { setSaving(false); }
  };

  const savePrivacy = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      await api.patch('/me/settings', privacy);
      setNotice('Privacy settings saved.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save settings.'); }
    finally { setSaving(false); }
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true); setError(''); setNotice('');
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
      if (file.size > 8 * 1024 * 1024) throw new Error('That image is too large — choose one under 8 MB.');
      const dataUrl = await resizeToDataUrl(file, 512);
      await api.post('/me/avatar', { dataUrl });
      setNotice('Avatar updated.');
      await refresh();
    } catch (err) { setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed.'); }
    finally { setUploading(false); }
  };

  const killSession = async (id: string) => {
    try { await api.del(`/auth/sessions/${id}`); setSessions(prev => prev.filter(s => s.id !== id)); setNotice('Session signed out.'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not end that session.'); }
  };

  if (!user) return <div className="page"><Alert tone="info">Sign in to manage your profile.</Alert></div>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><UserIcon size={13} style={{ verticalAlign: -2 }} /> Profile</div>
          <h1>Your profile</h1>
          <p>What other players see on your public profile. Your email address is never shown publicly.</p>
        </div>
        <Link to={`/players/${user.username}`} className="btn btn-secondary">View public profile</Link>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Tabs value={tab} onChange={setTab} label="Profile sections" tabs={[
        { id: 'profile', label: 'Profile' },
        { id: 'privacy', label: 'Privacy' },
        { id: 'security', label: 'Security' },
      ]} />

      {tab === 'profile' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', alignItems: 'start' }}>
          <Card>
            <CardHead title="Avatar" action={<Camera size={15} style={{ color: 'var(--lavender)' }} />} />
            <div className="row" style={{ gap: 16 }}>
              <Avatar name={user.username} src={user.avatarUrl} size="xl" />
              <div>
                <p className="small muted">A square image, at least 200×200. JPG, PNG or WebP up to 2 MB.</p>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload avatar'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                    onChange={e => { const file = e.target.files?.[0]; if (file) uploadAvatar(file); }} />
                </label>
              </div>
            </div>
            <div className="mt-3">
              <div className="row-between small"><span className="muted">Username</span><span style={{ fontWeight: 600 }}>{user.username}</span></div>
              <div className="row-between small mt-1"><span className="muted">Email</span><span style={{ fontWeight: 600 }}>{user.email}</span></div>
              <div className="row-between small mt-1"><span className="muted">Member since</span><span style={{ fontWeight: 600 }}>{formatDate(user.createdAt)}</span></div>
              <div className="row-between small mt-1"><span className="muted">Plan</span><Badge tone={user.plan === 'free' ? 'muted' : 'purple'}>{user.plan}</Badge></div>
            </div>
            {!user.emailVerified && (
              <Alert tone="warning" title="Email not verified">
                Some features stay limited until you verify. <Link to="/verify-email">Resend the verification email</Link>.
              </Alert>
            )}
          </Card>
          <Card>
            <CardHead title="Public details" />
            <Field label="Bio" htmlFor="f-bio" hint="Up to 300 characters. Never share personal contact details.">
              <textarea id="f-bio" className="textarea" maxLength={300} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} />
            </Field>
            <Field label="Country code" htmlFor="f-country" hint="Two letters, e.g. NG or GB. Leave empty to hide.">
              <input id="f-country" className="input" maxLength={2} value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} />
            </Field>
            <Button onClick={saveProfile} loading={saving} icon={<Save size={15} />}>Save changes</Button>
          </Card>
        </div>
      )}

      {tab === 'privacy' && (
        <Card style={{ maxWidth: 640 }}>
          <CardHead title="Who can see and contact you" />
          {[
            { key: 'showCountry' as const, label: 'Show my country on my profile', hint: 'Turn off to hide your flag everywhere.' },
            { key: 'showActivity' as const, label: 'Show my activity to friends', hint: 'Games, achievements and clubs.' },
            { key: 'allowMessages' as const, label: 'Allow direct messages from non-friends', hint: 'Off means only friends can message you.' },
            { key: 'allowFriendRequests' as const, label: 'Allow friend requests', hint: 'Turn off if you prefer to be left alone.' },
          ].map(item => (
            <label key={item.key} className="row-between" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <span>
                <span style={{ display: 'block', fontWeight: 500, fontSize: '.9rem' }}>{item.label}</span>
                <span className="tiny muted">{item.hint}</span>
              </span>
              <input type="checkbox" checked={privacy[item.key]} onChange={e => setPrivacy({ ...privacy, [item.key]: e.target.checked })} />
            </label>
          ))}
          <Button className="mt-2" onClick={savePrivacy} loading={saving}>Save privacy settings</Button>
          <p className="tiny muted mt-2">Minors: your account is protected by additional safeguards regardless of these settings. See the Help centre for details.</p>
        </Card>
      )}

      {tab === 'security' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Active sessions" action={<ShieldCheck size={15} style={{ color: 'var(--success)' }} />} />
            {sessions.length === 0 ? <p className="small muted">No active sessions listed.</p> : sessions.map(session => (
              <div key={session.id} className="list-row">
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{session.user_agent ?? 'Unknown device'}</div>
                  <div className="tiny muted">{session.ip ?? '—'} · last used {formatDate(session.last_used_at)}</div>
                </div>
                {session.current ? <Badge tone="success">This device</Badge>
                  : <Button size="sm" variant="ghost" onClick={() => killSession(session.id)}>Sign out</Button>}
              </div>
            ))}
            <div className="row mt-2">
              <Link to="/settings" className="btn btn-secondary btn-sm">Password & account</Link>
            </div>
          </Card>
          <Card>
            <CardHead title="Your data" />
            <p className="small muted">You can download everything SPEED CHESS stores about you, or delete your account permanently.</p>
            <div className="row wrap" style={{ gap: 8 }}>
              <a href="/api/auth/data-export" className="btn btn-secondary btn-sm" download>Download my data</a>
              <Link to="/settings" className="btn btn-ghost btn-sm">Delete account</Link>
            </div>
            <Alert tone="info" title="Account deletion">
              Deletion removes your profile, games and messages. Ratings history is anonymised rather than silently rewritten.
            </Alert>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Downscale in the browser so uploads stay small and fast. */
async function resizeToDataUrl(file: File, maxSize: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser cannot process images.');
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.86);
}
