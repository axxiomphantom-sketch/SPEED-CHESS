import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Globe, Lock, Plus, Search, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Badge, Button, Card, Empty, Field, Loading, Modal, Tabs } from '../components/ui';

export function Clubs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'discover' | 'mine'>('discover');
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [mine, setMine] = useState<any[] | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', description: '', country: '', isPrivate: false });

  const load = useCallback(async () => {
    try {
      const [all, own] = await Promise.all([api.get<{ clubs: any[] }>('/clubs'), api.get<{ clubs: any[] }>('/clubs/mine')]);
      setClubs(all.clubs);
      setMine(own.clubs);
    } catch { setClubs([]); setMine([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setError('');
    try {
      const res = await api.post<{ clubId: string }>('/clubs', form);
      setCreating(false);
      setNotice('Club created. You are the owner.');
      setForm({ name: '', description: '', country: '', isPrivate: false });
      await load();
      const created = (await api.get<{ clubs: any[] }>('/clubs/mine')).clubs.find(c => c.id === res.clubId);
      if (created) navigate(`/clubs/${created.slug}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the club.'); }
  };

  const source = tab === 'discover' ? clubs : mine;
  const list = (source ?? []).filter((club: any) => club.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><Building2 size={13} style={{ verticalAlign: -2 }} /> Clubs</div>
          <h1>Clubs</h1>
          <p>Join a club to play friendly internal events, share announcements and represent your community on the club leaderboard.</p>
        </div>
        {user && <Button onClick={() => setCreating(true)} icon={<Plus size={16} />}>Create a club</Button>}
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Tabs value={tab} onChange={setTab} label="Club sections" tabs={[
        { id: 'discover', label: 'Discover', count: clubs?.length },
        { id: 'mine', label: 'My clubs', count: mine?.length },
      ]} />

      <div className="search-box mb-2" style={{ maxWidth: 340, marginBottom: 16 }}>
        <Search size={15} />
        <input className="input" placeholder="Search clubs" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search clubs" />
      </div>

      {source === null ? <Loading rows={3} /> : list.length === 0 ? (
        <Empty icon={<Building2 size={26} />} title={tab === 'mine' ? 'You are not in a club yet' : 'No clubs found'}>
          {tab === 'mine' ? 'Discover a club and ask to join, or create your own.' : 'Try a different search term.'}
        </Empty>
      ) : (
        <div className="grid grid-auto">
          {list.map((club: any) => (
            <Card key={club.id} hover>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <span className="pillar-icon" style={{ margin: 0, width: 36, height: 36 }}><Building2 size={16} /></span>
                {club.isPrivate || club.is_private ? <Badge tone="warning"><Lock size={11} /> Private</Badge> : <Badge tone="success"><Globe size={11} /> Open</Badge>}
              </div>
              <h3 style={{ marginBottom: 4, fontSize: '1rem' }}>{club.name}</h3>
              <p className="small muted" style={{ minHeight: 40 }}>{club.description?.slice(0, 110) ?? 'No description yet.'}</p>
              <div className="row-between tiny muted" style={{ marginBottom: 10 }}>
                <span className="row" style={{ gap: 4 }}><Users size={12} /> {club.member_count ?? club.members ?? 0} members</span>
                <span>{club.country ?? 'Global'}</span>
              </div>
              <Link to={`/clubs/${club.slug ?? club.id}`} className="btn btn-secondary btn-sm btn-block">View club</Link>
            </Card>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Create a club"
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button onClick={create}>Create club</Button></>}>
        <Field label="Club name" htmlFor="c-name"><input id="c-name" className="input" maxLength={60} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description" htmlFor="c-desc" hint="What is your club about? Who should join?">
          <textarea id="c-desc" className="textarea" maxLength={500} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Country code (optional)" htmlFor="c-country"><input id="c-country" className="input" maxLength={2} value={form.country} onChange={e => setForm({ ...form, country: e.target.value.toUpperCase() })} /></Field>
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.isPrivate} onChange={e => setForm({ ...form, isPrivate: e.target.checked })} />
          <span className="small">Private club — new members need approval</span>
        </label>
      </Modal>
    </div>
  );
}
