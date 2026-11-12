import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, GraduationCap, Send, Star } from 'lucide-react';
import { api, ApiError, formatDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Avatar, Badge, Button, Card, CardHead, Empty, Field, Loading, Modal, Tabs } from '../components/ui';

interface CoachProfile {
  username: string; headline: string; expertise: string[]; languages: string[]; rate: number | null;
  currency: string | null; accepting: boolean; verified: boolean; country: string | null; avatarUrl: string | null;
  rating: number; title: string | null;
}

export function Coaching() {
  const { user } = useAuth();
  const [coaches, setCoaches] = useState<CoachProfile[] | null>(null);
  const [tab, setTab] = useState<'find' | 'assignments' | 'profile'>('find');
  const [assignments, setAssignments] = useState<any[] | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [form, setForm] = useState({ headline: '', expertise: '', languages: '', hourlyRate: 0, accepting: true });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignment, setAssignment] = useState({ title: '', instructions: '', studentUsername: '' });
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submissionText, setSubmissionText] = useState('');

  useEffect(() => {
    api.get<{ coaches: CoachProfile[] }>('/coaching/coaches').then(d => setCoaches(d.coaches)).catch(() => setCoaches([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get<{ assignments: any[] }>('/coaching/assignments').then(d => setAssignments(d.assignments)).catch(() => setAssignments([]));
    api.get<any>('/coaching/profile').then(d => {
      setCanPublish(d.canPublish);
      if (d.profile) setForm({ headline: d.profile.headline, expertise: d.profile.expertise, languages: d.profile.languages ?? '', hourlyRate: d.profile.hourly_rate ?? 0, accepting: Boolean(d.profile.accepting) });
    }).catch(() => {});
  }, [user]);

  const saveProfile = async () => {
    setError('');
    try {
      await api.put('/coaching/profile', { ...form, hourlyRate: Number(form.hourlyRate) });
      setNotice('Coaching profile saved and visible in the coaching centre.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save your profile.'); }
  };

  const createAssignment = async () => {
    setError('');
    try {
      await api.post('/coaching/assignments', assignment);
      setAssigning(null);
      setAssignment({ title: '', instructions: '', studentUsername: '' });
      setNotice('Assignment sent to your student.');
      const res = await api.get<{ assignments: any[] }>('/coaching/assignments');
      setAssignments(res.assignments);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the assignment.'); }
  };

  const submitAssignment = async () => {
    if (!submittingId || !submissionText.trim()) return;
    try {
      await api.post(`/coaching/assignments/${submittingId}/submit`, { submission: submissionText.trim() });
      const res = await api.get<{ assignments: any[] }>('/coaching/assignments');
      setAssignments(res.assignments);
      setSubmittingId(null);
      setSubmissionText('');
      setNotice('Assignment submitted for review.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not submit.'); }
  };

  const isCoach = ['coach', 'admin'].includes(user?.role ?? '');

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><GraduationCap size={13} style={{ verticalAlign: -2 }} /> Coaching</div>
          <h1>Coaching centre</h1>
          <p>Work with a verified human coach: structured assignments, submitted work and written feedback. Coaching is educational — it never involves playing moves for you in live games.</p>
        </div>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Tabs value={tab} onChange={setTab} label="Coaching sections" tabs={[
        { id: 'find', label: 'Find a coach', count: coaches?.length },
        { id: 'assignments', label: 'Assignments', count: assignments?.length },
        ...(user ? [{ id: 'profile' as const, label: isCoach ? 'My coach profile' : 'Become a coach' }] : []),
      ]} />

      {tab === 'find' && (
        coaches === null ? <Loading rows={2} /> : coaches.length === 0 ? (
          <Empty icon={<GraduationCap size={26} />} title="No coaches are accepting students right now">
            Verified coaches appear here when they open their schedule.
          </Empty>
        ) : (
          <div className="grid grid-auto">
            {coaches.map(coach => (
              <Card key={coach.username} hover>
                <div className="row" style={{ gap: 12 }}>
                  <Avatar name={coach.username} src={coach.avatarUrl} size="lg" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <Link to={`/players/${coach.username}`} style={{ fontWeight: 700, color: '#fff' }}>{coach.username}</Link>
                      {coach.verified && <Badge tone="success"><CheckCircle2 size={11} /> Verified</Badge>}
                    </div>
                    <p className="small muted" style={{ margin: '2px 0 4px' }}>{coach.headline}</p>
                    <div className="tiny muted">{coach.rating} classical{coach.country ? ` · ${coach.country}` : ''}</div>
                  </div>
                </div>
                <div className="chip-row mt-2">
                  {coach.expertise.slice(0, 4).map(item => <span key={item} className="badge badge-muted">{item}</span>)}
                </div>
                <div className="row-between mt-2">
                  <span className="small">{coach.rate ? `$${(coach.rate / 100).toFixed(0)}/hour` : 'Rate on request'}</span>
                  <Link to={`/messages/${coach.username}`} className="btn btn-primary btn-sm"><Send size={13} /> Contact</Link>
                </div>
                <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
                  Payment and scheduling are arranged directly with the coach. SPEED CHESS does not process coaching payments in this build.
                </p>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'assignments' && (
        !user ? <Alert tone="info">Sign in to see assignments.</Alert> : !assignments ? <Loading rows={2} /> : assignments.length === 0 ? (
          <Empty icon={<BookOpen size={24} />} title="No assignments yet">
            { isCoach ? 'Create an assignment for one of your students.' : 'Your coach can send you structured work here.' }
          </Empty>
        ) : (
          <div className="stack">
            {isCoach && <Button onClick={() => setAssigning('new')} icon={<BookOpen size={15} />}>New assignment</Button>}
            {assignments.map(item => (
              <Card key={item.id}>
                <div className="row-between">
                  <div>
                    <strong>{item.title}</strong>
                    <div className="tiny muted">{item.mine ? `From ${item.coach}` : `For ${item.student}`} · created {formatDate(item.createdAt)}</div>
                  </div>
                  <Badge tone={item.status === 'reviewed' ? 'success' : item.status === 'submitted' ? 'warning' : 'muted'}>{item.status}</Badge>
                </div>
                <p className="small" style={{ margin: '8px 0', color: '#cfcfd9' }}>{item.instructions}</p>
                {item.submission && <Alert tone="info" title="Submission">{item.submission}</Alert>}
                {item.feedback && <Alert tone="success" title="Coach feedback">{item.feedback}</Alert>}
                {item.mine && item.status === 'pending' && (
                  <Button size="sm" variant="secondary" onClick={() => setSubmittingId(item.id)}>Submit work</Button>
                )}
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'profile' && (
        !canPublish ? (
          <Card>
            <CardHead title="Become a coach" action={<Star size={15} style={{ color: 'var(--lavender)' }} />} />
            <p className="small muted">Coaching profiles are available to approved coach accounts. Applications are reviewed by the platform team so students can trust who they are working with.</p>
            <Alert tone="info" title="How to apply">
              Send an application from Settings → Account or contact support with your playing record and teaching experience. Approval is manual and is not granted automatically.
            </Alert>
            <Link to="/settings" className="btn btn-secondary btn-sm mt-2">Open settings</Link>
          </Card>
        ) : (
          <Card>
            <CardHead title="My coach profile" subtitle="Students see this in the coaching centre." />
            <Field label="Headline" htmlFor="p-head"><input id="p-head" className="input" maxLength={120} value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })} /></Field>
            <Field label="Expertise" htmlFor="p-exp" hint="Comma separated, e.g. endgames, opening preparation, beginners"><input id="p-exp" className="input" value={form.expertise} onChange={e => setForm({ ...form, expertise: e.target.value })} /></Field>
            <Field label="Languages" htmlFor="p-lang"><input id="p-lang" className="input" value={form.languages} onChange={e => setForm({ ...form, languages: e.target.value })} /></Field>
            <Field label="Hourly rate (cents)" htmlFor="p-rate" hint="Leave 0 for rate on request."><input id="p-rate" className="input" type="number" min={0} value={form.hourlyRate} onChange={e => setForm({ ...form, hourlyRate: Number(e.target.value) })} /></Field>
            <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={form.accepting} onChange={e => setForm({ ...form, accepting: e.target.checked })} />
              <span className="small">Currently accepting new students</span>
            </label>
            <Button onClick={saveProfile}>Save profile</Button>
          </Card>
        )
      )}

      <Modal open={submittingId !== null} onClose={() => setSubmittingId(null)} title="Submit assignment"
        footer={<><Button variant="secondary" onClick={() => setSubmittingId(null)}>Cancel</Button><Button onClick={submitAssignment} disabled={!submissionText.trim()}>Submit</Button></>}>
        <Field label="What did you do?" htmlFor="s-text" hint="Describe the work you completed, the games you studied or the puzzles you solved.">
          <textarea id="s-text" className="textarea" style={{ minHeight: 120 }} value={submissionText} onChange={e => setSubmissionText(e.target.value)} />
        </Field>
      </Modal>

      <Modal open={assigning !== null} onClose={() => setAssigning(null)} title="New assignment"
        footer={<><Button variant="secondary" onClick={() => setAssigning(null)}>Cancel</Button><Button onClick={createAssignment}>Send assignment</Button></>}>
        <Field label="Student username" htmlFor="a-student"><input id="a-student" className="input" value={assignment.studentUsername} onChange={e => setAssignment({ ...assignment, studentUsername: e.target.value })} /></Field>
        <Field label="Title" htmlFor="a-title"><input id="a-title" className="input" value={assignment.title} onChange={e => setAssignment({ ...assignment, title: e.target.value })} /></Field>
        <Field label="Instructions" htmlFor="a-inst"><textarea id="a-inst" className="textarea" style={{ minHeight: 120 }} value={assignment.instructions} onChange={e => setAssignment({ ...assignment, instructions: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}
