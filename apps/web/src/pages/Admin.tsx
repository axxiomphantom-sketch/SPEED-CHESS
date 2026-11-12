import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, FileText, Gavel, Megaphone, Settings2, ShieldAlert, Trophy, UserCog } from 'lucide-react';
import { api, ApiError, formatDate, formatDateTime } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Avatar, Badge, Button, Card, CardHead, Empty, Field, Loading, Modal, Tabs } from '../components/ui';

export function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'overview' | 'reports' | 'users' | 'content' | 'tournaments' | 'settings' | 'audit'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [reports, setReports] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[] | null>(null);
  const [queue, setQueue] = useState<any[] | null>(null);
  const [tournaments, setTournaments] = useState<any[] | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [resolving, setResolving] = useState<any>(null);
  const [resolution, setResolution] = useState({ status: 'dismissed', resolution: '' });
  const [announcing, setAnnouncing] = useState(false);
  const [announcement, setAnnouncement] = useState({ title: '', body: '', level: 'info' });
  const [roleTarget, setRoleTarget] = useState<any>(null);
  const [newRole, setNewRole] = useState('player');

  const isAdmin = user?.role === 'admin';
  const isStaff = ['admin', 'moderator'].includes(user?.role ?? '');

  const load = useCallback(async () => {
    setError('');
    try {
      if (tab === 'overview') setOverview(await api.get('/admin/overview'));
      if (tab === 'reports') setReports((await api.get<{ reports: any[] }>('/admin/reports?status=all')).reports);
      if (tab === 'users') setUsers((await api.get<{ users: any[] }>(`/admin/users?q=${encodeURIComponent(userQuery)}`)).users);
      if (tab === 'content' && isStaff) setQueue((await api.get<{ articles: any[] }>('/content/queue/pending')).articles);
      if (tab === 'tournaments') setTournaments((await api.get<{ tournaments: any[] }>('/admin/tournaments')).tournaments);
      if (tab === 'settings' && isAdmin) setSettings((await api.get<{ settings: any }>('/admin/settings')).settings);
      if (tab === 'audit' && isAdmin) setAuditLog((await api.get<{ logs: any[] }>('/admin/audit')).logs);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load admin data.'); }
  }, [tab, userQuery, isAdmin, isStaff]);

  useEffect(() => { if (isStaff) load(); }, [load, isStaff]);

  const act = async (path: string, body: unknown, message: string) => {
    setError(''); setNotice('');
    try { await api.post(path, body); setNotice(message); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Action failed.'); }
  };

  const resolveReport = async () => {
    if (!resolving) return;
    try {
      await api.post(`/admin/reports/${resolving.id}/resolve`, resolution);
      setResolving(null);
      setResolution({ status: 'dismissed', resolution: '' });
      setNotice('Report resolved and recorded in the audit log.');
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not resolve the report.'); }
  };

  const updateSetting = async (key: string, value: unknown) => {
    try {
      await api.patch('/admin/settings', { [key]: value });
      setSettings((prev: any) => ({ ...prev, [key]: value }));
      setNotice('Platform setting updated.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not update the setting.'); }
  };

  if (!user || !isStaff) {
    return (
      <div className="page">
        <Empty icon={<ShieldAlert size={26} />} title="Staff access only">
          The admin dashboard requires a moderator or administrator account. If you believe this is a mistake, contact support from the Help centre.
        </Empty>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><UserCog size={13} style={{ verticalAlign: -2 }} /> Administration</div>
          <h1>Admin dashboard</h1>
          <p>Platform health, moderation queue, account management and audit trail. Every action here is logged with the acting account.</p>
        </div>
        <Badge tone="purple">{user.role}</Badge>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Tabs value={tab} onChange={setTab} label="Admin sections" tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'reports', label: 'Reports', count: reports?.filter(r => r.status === 'open').length },
        { id: 'users', label: 'Users' },
        { id: 'content', label: 'Content queue', count: queue?.length },
        { id: 'tournaments', label: 'Tournaments' },
        ...(isAdmin ? [{ id: 'settings' as const, label: 'Platform settings' }, { id: 'audit' as const, label: 'Audit log' }] : []),
      ]} />

      {tab === 'overview' && (
        !overview ? <Loading rows={3} /> : (
          <>
            <div className="kpi-strip mb-2" style={{ marginBottom: 16 }}>
              {[
                ['Players', overview.users?.total ?? 0],
                ['Active games', overview.games?.active ?? 0],
                ['Games today', overview.games?.today ?? 0],
                ['Open reports', overview.safety?.openReports ?? 0],
                ['Courses', overview.content?.courses ?? 0],
                ['Online now', overview.users?.onlineRecently ?? 0],
              ].map(([label, value]) => (
                <div className="kpi" key={String(label)}>
                  <div className="stat-value">{String(value)}</div>
                  <div className="stat-label">{String(label)}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-2">
              <Card>
                <CardHead title="Games per day" action={<Activity size={15} style={{ color: 'var(--lavender)' }} />} />
                {(overview.charts?.games ?? []).length === 0 ? <p className="small muted">No games recorded yet.</p> : (
                  <div className="row" style={{ alignItems: 'flex-end', gap: 5, height: 120 }}>
                    {overview.charts.games.map((row: any) => {
                      const max = Math.max(1, ...overview.charts.games.map((r: any) => r.games));
                      return (
                        <div key={row.day} style={{ flex: 1, textAlign: 'center' }} title={`${row.day}: ${row.games} games`}>
                          <div style={{ height: `${Math.max(3, (row.games / max) * 96)}px`, background: 'linear-gradient(180deg,#9333EA,#7925D9)', borderRadius: '3px 3px 0 0' }} />
                          <div className="tiny muted" style={{ fontSize: '.6rem' }}>{row.day.slice(8)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <h4 style={{ marginTop: 18 }}>Content</h4>
                <div className="row-between small"><span className="muted">Lessons</span><span style={{ fontWeight: 600 }}>{overview.content?.lessons ?? 0}</span></div>
                <div className="row-between small mt-1"><span className="muted">Puzzles</span><span style={{ fontWeight: 600 }}>{overview.content?.puzzles ?? 0}</span></div>
                <div className="row-between small mt-1"><span className="muted">Published articles</span><span style={{ fontWeight: 600 }}>{overview.content?.articles ?? 0}</span></div>
              </Card>
              <Card>
                <CardHead title="System" action={<Settings2 size={15} style={{ color: 'var(--lavender)' }} />} />
                <div className="row-between small" style={{ padding: '5px 0' }}><span className="muted">Uptime</span><span style={{ fontWeight: 600 }}>{Math.floor((overview.health?.uptimeSeconds ?? 0) / 3600)}h</span></div>
                <div className="row-between small" style={{ padding: '5px 0' }}><span className="muted">Memory (RSS)</span><span style={{ fontWeight: 600 }}>{overview.health?.memoryMb ?? 0} MB</span></div>
                <div className="row-between small" style={{ padding: '5px 0' }}><span className="muted">Subscriptions</span><span style={{ fontWeight: 600 }}>{overview.subscriptions?.premium ?? 0} premium · {overview.subscriptions?.pro ?? 0} pro</span></div>
                <div className="row-between small" style={{ padding: '5px 0' }}><span className="muted">Suspended accounts</span><span style={{ fontWeight: 600 }}>{overview.users?.suspended ?? 0}</span></div>
                <div className="row-between small" style={{ padding: '5px 0' }}><span className="muted">Audit events</span><span style={{ fontWeight: 600 }}>{overview.safety?.auditEvents ?? 0}</span></div>
                <div className="row-between small" style={{ padding: '5px 0' }}><span className="muted">Email delivery</span>
                  <Badge tone={overview.system?.emailConfigured ? 'success' : 'warning'}>{overview.system?.emailConfigured ? 'SMTP configured' : 'Console mode'}</Badge></div>
                <div className="row-between small" style={{ padding: '5px 0' }}><span className="muted">Payments</span>
                  <Badge tone={overview.system?.paymentsConfigured ? 'success' : 'warning'}>{overview.system?.paymentsConfigured ? 'Provider configured' : 'Not configured'}</Badge></div>
                <div className="divider" style={{ margin: '12px 0' }} />
                {isAdmin && <Button size="sm" variant="secondary" onClick={() => setAnnouncing(true)} icon={<Megaphone size={14} />}>Publish announcement</Button>}
              </Card>
            </div>
          </>
        )
      )}

      {tab === 'reports' && (
        !reports ? <Loading rows={2} /> : reports.length === 0 ? (
          <Empty icon={<Gavel size={24} />} title="No reports">The moderation queue is empty.</Empty>
        ) : (
          <div className="stack">
            {reports.map(report => (
              <Card key={report.id}>
                <div className="row-between" style={{ marginBottom: 6 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone={report.status === 'open' ? 'warning' : 'success'}>{report.status}</Badge>
                    <Badge tone="muted">{report.reason}</Badge>
                    <span className="tiny muted">{report.target_type} · {report.target_id}</span>
                  </div>
                  <span className="tiny muted">{formatDateTime(report.created_at)}</span>
                </div>
                <div className="small" style={{ color: '#d5d5de' }}>
                  <strong>{report.reporter ?? 'Anonymous'}</strong> reported <strong>{report.target ?? report.target_id}</strong>
                </div>
                {report.details && <p className="small muted" style={{ margin: '6px 0 0' }}>“{report.details}”</p>}
                {report.resolution && <Alert tone="info" title="Resolution">{report.resolution}</Alert>}
                {report.status === 'open' && (
                  <div className="row mt-2">
                    <Button size="sm" variant="secondary" onClick={() => setResolving(report)}>Review</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(`/admin/reports/${report.id}/resolve`, { action: 'dismiss', note: 'No violation found' }, 'Report dismissed.')}>Dismiss</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'users' && (
        <>
          <div className="row mb-2" style={{ gap: 8, marginBottom: 14 }}>
            <input className="input" style={{ maxWidth: 320 }} placeholder="Search by username or email" value={userQuery} onChange={e => setUserQuery(e.target.value)} aria-label="Search users" />
            <Button variant="secondary" size="sm" onClick={load}>Search</Button>
          </div>
          {!users ? <Loading rows={2} /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Player</th><th>Role</th><th>Status</th><th>Plan</th><th>Joined</th><th /></tr></thead>
                <tbody>
                  {users.map(row => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/players/${row.username}`} className="row" style={{ gap: 8, color: 'inherit', textDecoration: 'none' }}>
                          <Avatar name={row.username} src={row.avatarUrl} size="sm" />
                          <span>
                            <span style={{ fontWeight: 600 }}>{row.username}</span>
                            <span className="tiny muted" style={{ display: 'block' }}>{row.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td><Badge tone={row.role === 'admin' ? 'purple' : row.role === 'player' ? 'muted' : 'warning'}>{row.role}</Badge></td>
                      <td><Badge tone={row.status === 'active' ? 'success' : row.status === 'restricted' ? 'warning' : 'error'}>{row.status}</Badge></td>
                      <td className="muted" style={{ textTransform: 'capitalize' }}>{row.plan}</td>
                      <td className="tiny muted">{formatDate(row.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {isAdmin && (
                          <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <Button size="sm" variant="ghost" onClick={() => { setRoleTarget(row); setNewRole(row.role); }}>Role</Button>
                            <Button size="sm" variant="ghost" onClick={() => act(`/admin/users/${row.id}/status`, { status: row.status === 'restricted' ? 'active' : 'restricted', reason: 'Manual review' }, `${row.username} updated.`)}>
                              {row.status === 'restricted' ? 'Restore' : 'Restrict'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'content' && (
        !queue ? <Loading rows={2} /> : queue.length === 0 ? (
          <Empty icon={<FileText size={24} />} title="Nothing waiting for review">New articles appear here before publication.</Empty>
        ) : (
          <div className="stack">
            {queue.map(article => (
              <Card key={article.id}>
                <div className="row-between">
                  <div>
                    <strong>{article.title}</strong>
                    <div className="tiny muted">{article.author} · {article.category}</div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Button size="sm" variant="success" onClick={() => act(`/content/${article.id}/moderate`, { approve: true }, 'Article published.')}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(`/content/${article.id}/moderate`, { approve: false, note: 'Does not meet editorial guidelines' }, 'Article rejected.')}>Reject</Button>
                  </div>
                </div>
                <p className="small muted" style={{ marginTop: 6 }}>{article.summary}</p>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'tournaments' && (
        !tournaments ? <Loading rows={2} /> : tournaments.length === 0 ? <Empty icon={<Trophy size={24} />} title="No tournaments">Nothing to moderate.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tournament</th><th>Format</th><th>Status</th><th>Players</th><th>Starts</th><th /></tr></thead>
              <tbody>
                {tournaments.map(t => (
                  <tr key={t.id}>
                    <td><Link to={`/tournaments/${t.slug}`} style={{ fontWeight: 600 }}>{t.name}</Link><div className="tiny muted">{t.organizer ?? '—'}</div></td>
                    <td className="muted">{t.format}</td>
                    <td><Badge tone={t.status === 'ongoing' ? 'success' : t.status === 'cancelled' ? 'error' : 'muted'}>{t.status}</Badge></td>
                    <td className="muted">{t.players ?? 0}</td>
                    <td className="tiny muted">{formatDate(t.starts_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {isAdmin && t.status !== 'cancelled' && t.status !== 'completed' && (
                        <Button size="sm" variant="ghost" onClick={() => act(`/admin/tournaments/${t.id}/cancel`, { reason: 'Cancelled by staff' }, 'Tournament cancelled and entrants notified.')}>Cancel</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'settings' && (
        !settings ? <Loading rows={2} /> : (
          <div className="grid grid-2">
            <Card>
              <CardHead title="Access" action={<ShieldAlert size={15} style={{ color: 'var(--warning)' }} />} />
              {[
                { key: 'registrationOpen', label: 'Registration open', hint: 'When off, new accounts cannot be created.' },
                { key: 'maintenanceMode', label: 'Maintenance mode', hint: 'Shows a maintenance page to non-staff.' },
                { key: 'requireEmailVerification', label: 'Require email verification', hint: 'Restricts rated play until verified.' },
              ].map(item => (
                <label key={item.key} className="row-between" style={{ gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <span><span style={{ display: 'block', fontSize: '.9rem' }}>{item.label}</span><span className="tiny muted">{item.hint}</span></span>
                  <input type="checkbox" checked={Boolean(settings[item.key])} onChange={e => updateSetting(item.key, e.target.checked)} />
                </label>
              ))}
            </Card>
            <Card>
              <CardHead title="Fair play thresholds" action={<AlertTriangle size={15} style={{ color: 'var(--warning)' }} />} />
              <p className="tiny muted">These values flag games for human review. They never trigger an automatic restriction.</p>
              <Field label="Announcement banner" htmlFor="s-banner" hint="Shown at the top of the app. Leave empty to hide it.">
                <input id="s-banner" className="input" maxLength={200} defaultValue={settings.announcementBanner ?? ''} onBlur={e => updateSetting('announcementBanner', e.target.value)} />
              </Field>
              <Alert tone="info">A flag creates a report in this queue. A moderator reviews the game and decides whether any action is justified.</Alert>
            </Card>
          </div>
        )
      )}

      {tab === 'audit' && (
        !auditLog ? <Loading rows={3} /> : auditLog.length === 0 ? <Empty icon={<Activity size={24} />} title="Audit log is empty">Staff actions appear here as they happen.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
              <tbody>
                {auditLog.map((entry: any, index: number) => (
                  <tr key={index}>
                    <td className="tiny muted nowrap">{formatDateTime(entry.created_at)}</td>
                    <td>{entry.actor ?? 'system'}</td>
                    <td><span className="badge badge-muted">{entry.action}</span></td>
                    <td className="tiny muted">{entry.target_type}:{entry.target_id}</td>
                    <td className="tiny muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.details ? JSON.stringify(entry.details) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Modal open={Boolean(resolving)} onClose={() => setResolving(null)} title="Review report"
        footer={<><Button variant="secondary" onClick={() => setResolving(null)}>Cancel</Button><Button onClick={resolveReport}>Record decision</Button></>}>
        <p className="small muted">Recording a decision is visible in the audit log. Restrictions require a written reason so the player can appeal.</p>
        <Field label="Decision" htmlFor="rr-action">
          <select id="rr-action" className="select" value={resolution.status} onChange={e => setResolution({ ...resolution, status: e.target.value })}>
            <option value="reviewing">Keep under review</option>
            <option value="dismissed">No violation — dismiss</option>
            <option value="actioned">Violation confirmed — action taken</option>
          </select>
        </Field>
        <Field label="Written resolution (shown to the reporter)" htmlFor="rr-note" hint="At least 3 characters. Be specific so the player can appeal meaningfully.">
          <textarea id="rr-note" className="textarea" value={resolution.resolution} onChange={e => setResolution({ ...resolution, resolution: e.target.value })} />
        </Field>
      </Modal>

      <Modal open={announcing} onClose={() => setAnnouncing(false)} title="Publish an announcement"
        footer={<><Button variant="secondary" onClick={() => setAnnouncing(false)}>Cancel</Button>
          <Button onClick={async () => { await act('/admin/announcements', announcement, 'Announcement published.'); setAnnouncing(false); }}>Publish</Button></>}>
        <Field label="Title" htmlFor="an-title"><input id="an-title" className="input" value={announcement.title} onChange={e => setAnnouncement({ ...announcement, title: e.target.value })} /></Field>
        <Field label="Body" htmlFor="an-body"><textarea id="an-body" className="textarea" value={announcement.body} onChange={e => setAnnouncement({ ...announcement, body: e.target.value })} /></Field>
        <Field label="Level" htmlFor="an-level">
          <select id="an-level" className="select" value={announcement.level} onChange={e => setAnnouncement({ ...announcement, level: e.target.value })}>
            <option value="info">Information</option>
            <option value="success">Positive news</option>
            <option value="warning">Warning</option>
          </select>
        </Field>
      </Modal>

      <Modal open={Boolean(roleTarget)} onClose={() => setRoleTarget(null)} title={`Change role for ${roleTarget?.username ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setRoleTarget(null)}>Cancel</Button>
          <Button onClick={async () => { await act(`/admin/users/${roleTarget.id}/role`, { role: newRole }, 'Role updated.'); setRoleTarget(null); }}>Save role</Button></>}>
        <Field label="Role" htmlFor="role-select">
          <select id="role-select" className="select" value={newRole} onChange={e => setNewRole(e.target.value)}>
            {['player', 'coach', 'organizer', 'moderator', 'admin'].map(role => <option key={role} value={role}>{role}</option>)}
          </select>
        </Field>
        <Alert tone="warning">Granting coach, organizer, moderator or admin access gives the account extra abilities. This action is audited.</Alert>
      </Modal>
    </div>
  );
}
