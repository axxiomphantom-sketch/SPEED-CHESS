import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, FileText, PenLine, Search } from 'lucide-react';
import { api, ApiError, formatDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Badge, Button, Card, Empty, Field, Loading, Modal, Tabs } from '../components/ui';

interface Article { id: string; slug: string; title: string; summary: string; category: string; views: number; created_at: string; author: string | null }

export function Content() {
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'read' | 'write'>('read');
  const [drafts, setDrafts] = useState<any[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ title: '', summary: '', body: '', category: 'strategy', publish: true });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canCreate = ['coach', 'admin', 'moderator'].includes(user?.role ?? '');

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (query.trim()) params.set('q', query.trim());
    api.get<{ articles: Article[]; categories: any[] }>(`/content?${params.toString()}`)
      .then(d => { setArticles(d.articles); setCategories(d.categories); })
      .catch(() => setArticles([]));
  }, [category, query]);

  useEffect(() => {
    if (user && canCreate) api.get<{ articles: any[] }>('/content/mine/drafts').then(d => setDrafts(d.articles)).catch(() => setDrafts([]));
  }, [user, canCreate, notice]);

  const publish = async () => {
    setError('');
    try {
      await api.post('/content', form);
      setComposing(false);
      setForm({ title: '', summary: '', body: '', category: 'strategy', publish: true });
      setNotice('Article saved. Published articles appear in the content centre immediately.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save the article.'); }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><FileText size={13} style={{ verticalAlign: -2 }} /> Content</div>
          <h1>Content centre</h1>
          <p>Articles, guides and analysis written by approved creators. Every published piece is reviewed by a moderator before it appears in the library.</p>
        </div>
        {canCreate && <Button onClick={() => setComposing(true)} icon={<PenLine size={16} />}>Write an article</Button>}
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {canCreate && (
        <Tabs value={tab} onChange={setTab} label="Content sections" tabs={[
          { id: 'read', label: 'Library', count: articles?.length },
          { id: 'write', label: 'My articles', count: drafts?.length },
        ]} />
      )}

      {tab === 'read' && (
        <>
          <div className="row wrap mb-2" style={{ marginBottom: 16, gap: 8 }}>
            <div className="search-box" style={{ maxWidth: 300 }}>
              <Search size={15} />
              <input className="input" placeholder="Search articles" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search articles" />
            </div>
            <button type="button" className={`chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>All</button>
            {categories.map(c => (
              <button key={c.category} type="button" className={`chip ${category === c.category ? 'active' : ''}`} onClick={() => setCategory(c.category)}>
                {c.category} <span className="tiny muted">{c.count}</span>
              </button>
            ))}
          </div>
          {articles === null ? <Loading rows={3} /> : articles.length === 0 ? (
            <Empty icon={<FileText size={26} />} title="No articles yet">
              Published articles appear here. Approved creators can write the first one.
            </Empty>
          ) : (
            <div className="grid grid-auto">
              {articles.map(article => (
                <Card key={article.id} hover>
                  <Badge tone="purple">{article.category}</Badge>
                  <h3 style={{ margin: '8px 0 4px', fontSize: '1rem' }}>{article.title}</h3>
                  <p className="small muted" style={{ minHeight: 48 }}>{article.summary}</p>
                  <div className="row-between tiny muted">
                    <span>{article.author ?? 'SPEED CHESS'}</span>
                    <span className="row" style={{ gap: 4 }}><Eye size={11} /> {article.views}</span>
                  </div>
                  <Link to={`/content/${article.slug}`} className="btn btn-secondary btn-sm btn-block mt-2">Read article</Link>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'write' && (
        !user ? <Alert tone="info">Sign in to write content.</Alert> : !canCreate ? (
          <Alert tone="info" title="Creator access required">
            Only approved creators can publish articles. Request creator access from Settings → Account.
          </Alert>
        ) : drafts === null ? <Loading rows={2} /> : drafts.length === 0 ? (
          <Empty icon={<PenLine size={24} />} title="You have not written anything yet" action={<Button onClick={() => setComposing(true)}>Start writing</Button>}>
            Drafts and published articles will be listed here.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {drafts.map(draft => (
                  <tr key={draft.id}>
                    <td style={{ fontWeight: 600 }}>{draft.title}</td>
                    <td className="muted">{draft.category}</td>
                    <td><Badge tone={draft.status === 'published' ? 'success' : draft.status === 'pending' ? 'warning' : 'muted'}>{draft.status}</Badge></td>
                    <td className="muted tiny">{formatDate(draft.updated_at ?? draft.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>{draft.status === 'published' && <Link to={`/content/${draft.slug}`} className="btn btn-sm btn-secondary">View</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Modal open={composing} onClose={() => setComposing(false)} title="Write an article" width={720}
        footer={<><Button variant="secondary" onClick={() => setComposing(false)}>Cancel</Button><Button onClick={publish}>Save article</Button></>}>
        <Field label="Title" htmlFor="ar-title"><input id="ar-title" className="input" maxLength={140} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Summary" htmlFor="ar-sum" hint="One or two sentences shown in the library."><input id="ar-sum" className="input" maxLength={300} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} /></Field>
        <Field label="Body" htmlFor="ar-body" hint="Markdown: ## headings, **bold**, - lists and tables are supported.">
          <textarea id="ar-body" className="textarea" style={{ minHeight: 240, fontFamily: 'ui-monospace, monospace', fontSize: '.82rem' }} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
        </Field>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Category" htmlFor="ar-cat">
            <select id="ar-cat" className="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {['strategy', 'openings', 'endgames', 'tactics', 'beginners', 'news'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Visibility" htmlFor="ar-pub">
            <select id="ar-pub" className="select" value={form.publish ? 'publish' : 'draft'} onChange={e => setForm({ ...form, publish: e.target.value === 'publish' })}>
              <option value="publish">Publish (queued for review)</option>
              <option value="draft">Save as draft</option>
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
