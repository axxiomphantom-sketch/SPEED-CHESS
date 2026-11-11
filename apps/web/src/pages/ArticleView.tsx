import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Flag, User } from 'lucide-react';
import { api, ApiError, formatDate } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Badge, Button, Card, Field, Loading, Modal } from '../components/ui';
import { Markdown } from '../components/Markdown';

export function ArticleView() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [article, setArticle] = useState<any>(null);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('inappropriate-content');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.get<{ article: any }>(`/content/${slug}`)
      .then(d => setArticle(d.article))
      .catch(err => setError(err instanceof ApiError ? err.message : 'Article not found.'));
  }, [slug]);

  const report = async () => {
    try {
      await api.post('/reports', { targetType: 'article', targetId: article.id, reason, details });
      setReporting(false);
      setNotice('Report submitted. A moderator will review this article.');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not submit the report.'); }
  };

  if (error) return <div className="page"><Alert tone="error">{error}</Alert><Link to="/content" className="btn btn-secondary mt-2">Back to content</Link></div>;
  if (!article) return <div className="page"><Loading rows={3} /></div>;

  return (
    <div className="page" style={{ maxWidth: 840 }}>
      <Link to="/content" className="btn btn-ghost btn-sm mb-2"><ArrowLeft size={15} /> Content centre</Link>
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <Badge tone="purple">{article.category}</Badge>
        {article.status !== 'published' && <Badge tone="warning">{article.status}</Badge>}
      </div>
      <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', lineHeight: 1.2 }}>{article.title}</h1>
      <div className="row wrap" style={{ gap: 14, margin: '10px 0 18px' }}>
        <span className="small muted row" style={{ gap: 5 }}><User size={13} /> {article.author ?? 'SPEED CHESS'}</span>
        <span className="small muted row" style={{ gap: 5 }}><Eye size={13} /> {article.views} views</span>
        <span className="small muted">{formatDate(article.created_at)}</span>
      </div>
      <Card>
        <Markdown source={article.body} />
      </Card>
      <div className="row-between mt-3">
        <Link to="/content" className="btn btn-secondary btn-sm">More articles</Link>
        {user && (
          <Button variant="ghost" size="sm" onClick={() => setReporting(true)} icon={<Flag size={14} />}>Report this article</Button>
        )}
      </div>

      <Modal open={reporting} onClose={() => setReporting(false)} title="Report this article"
        footer={<><Button variant="secondary" onClick={() => setReporting(false)}>Cancel</Button><Button onClick={report}>Submit report</Button></>}>
        <Field label="Reason" htmlFor="r-reason">
          <select id="r-reason" className="select" value={reason} onChange={e => setReason(e.target.value)}>
            <option value="inappropriate-content">Inappropriate content</option>
            <option value="spam">Spam or advertising</option>
            <option value="harassment">Harassment</option>
            <option value="cheating">Encourages cheating</option>
            <option value="other">Something else</option>
          </select>
        </Field>
        <Field label="Details (optional)" htmlFor="r-details"><textarea id="r-details" className="textarea" value={details} onChange={e => setDetails(e.target.value)} /></Field>
        <Alert tone="info">Reports are reviewed by a moderator. Repeated false reports may be actioned.</Alert>
      </Modal>
    </div>
  );
}
