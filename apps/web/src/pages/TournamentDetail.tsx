import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, Clock, Play, Trophy, Users } from 'lucide-react';
import { api, ApiError, formatDateTime } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Badge, Button, Card, CardHead, Empty, Loading, Tabs } from '../components/ui';

export function TournamentDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'standings' | 'pairings' | 'info'>('standings');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<any>(`/tournaments/${slug}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tournament not found.');
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const act = async (path: string, success: string) => {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/tournaments/${data.tournament.id}/${path}`);
      setNotice(success);
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  if (error && !data) return <div className="page"><Alert tone="error" title="Tournament unavailable">{error}</Alert><Link to="/tournaments" className="btn btn-secondary mt-2">All tournaments</Link></div>;
  if (!data) return <div className="page"><Loading rows={3} /></div>;

  const t = data.tournament;
  const rounds = [...new Set<number>(data.pairings.map((p: any) => p.round))].sort((a, b) => a - b);
  const myPairing = data.pairings.find((p: any) => p.round === data.currentRound && (p.white?.id === user?.id || p.black?.id === user?.id));

  return (
    <div className="page">
      <div className="row-between wrap mb-2">
        <Link to="/tournaments" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> All tournaments</Link>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone={t.status === 'ongoing' ? 'success' : t.status === 'completed' ? 'muted' : 'purple'}>{t.status}</Badge>
          <Badge tone="muted">{t.format}</Badge>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="hero-panel mb-2" style={{ marginBottom: 18 }}>
        <div className="row-between wrap" style={{ gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(1.4rem, 2.6vw, 1.9rem)', marginBottom: 6 }}>{t.name}</h1>
            <p className="small muted" style={{ maxWidth: 640, margin: 0 }}>{t.description}</p>
            <div className="row wrap mt-2" style={{ gap: 16 }}>
              <span className="small"><Calendar size={13} style={{ verticalAlign: -2 }} /> {formatDateTime(t.startsAt)}</span>
              <span className="small"><Clock size={13} style={{ verticalAlign: -2 }} /> {t.timeControl} {t.category}</span>
              <span className="small"><Users size={13} style={{ verticalAlign: -2 }} /> {t.players}/{t.maxPlayers}</span>
              <span className="small">Organiser: {t.organizer ?? 'SPEED CHESS'}</span>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {t.registered ? <Badge tone="success"><Check size={12} /> Registered</Badge> : t.canRegister && !t.full ? (
              <Button onClick={() => act('register', 'Registration confirmed.')} loading={busy}>Register</Button>
            ) : t.full ? <Badge tone="error">Full</Badge> : <Badge tone="muted">Registration closed</Badge>}
            {t.isOrganizer && (
              <>
                <Button variant="secondary" onClick={() => act('rounds', 'Pairings generated and games opened.')} loading={busy}>Start next round</Button>
                <Button variant="ghost" onClick={() => act('advance', 'Tournament advanced.')} loading={busy}>Check completion</Button>
              </>
            )}
          </div>
        </div>
        {myPairing && (
          <div className="panel mt-2 row-between">
            <div>
              <strong>Your pairing · round {myPairing.round}, board {myPairing.board}</strong>
              <div className="small muted">{myPairing.white?.name} (White) vs {myPairing.black?.name} (Black)</div>
            </div>
            {myPairing.gameId ? <Link to={`/play/game/${myPairing.gameId}`} className="btn btn-primary btn-sm"><Play size={14} /> Open game</Link> : <Badge tone="muted">Awaiting game</Badge>}
          </div>
        )}
      </section>

      <Tabs value={tab} onChange={setTab} label="Tournament sections" tabs={[
        { id: 'standings', label: 'Standings', count: data.standings.length },
        { id: 'pairings', label: 'Pairings', count: data.pairings.length },
        { id: 'info', label: 'Rules & format' },
      ]} />

      {tab === 'standings' && (
        data.standings.length === 0 ? <Empty icon={<Trophy size={24} />} title="No players yet">Standings appear as soon as players register.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Player</th><th>Points</th><th>Tiebreak</th><th>Seed</th></tr></thead>
              <tbody>
                {data.standings.map((row: any, index: number) => (
                  <tr key={row.user_id}>
                    <td className="muted">{index + 1}</td>
                    <td>
                      <Link to={`/players/${row.username}`} style={{ fontWeight: 600 }}>{row.username}</Link>
                      {row.user_id === user?.id && <span className="tiny muted"> (you)</span>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{row.points}</td>
                    <td className="muted">{row.tiebreak ?? 0}</td>
                    <td className="muted">{row.seed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'pairings' && (
        data.pairings.length === 0 ? <Empty icon={<Trophy size={24} />} title="Pairings not published yet">
          {t.isOrganizer ? 'Use “Start next round” to generate pairings and open every game.' : 'The organiser publishes pairings when the tournament begins.'}
        </Empty> : (
          <div className="stack">
            {rounds.map(round => (
              <Card key={round}>
                <CardHead title={`Round ${round}`} action={<Badge tone="muted">{data.pairings.filter((p: any) => p.round === round).length} boards</Badge>} />
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Board</th><th>White</th><th>Black</th><th>Result</th><th /></tr></thead>
                    <tbody>
                      {data.pairings.filter((p: any) => p.round === round).map((pairing: any) => (
                        <tr key={pairing.id}>
                          <td className="muted">{pairing.board}</td>
                          <td>{pairing.white?.name ?? '—'}</td>
                          <td>{pairing.black?.name ?? 'bye'}</td>
                          <td>{pairing.result ? <Badge tone={pairing.result === 'bye' ? 'muted' : 'success'}>{pairing.result === 'draw' ? '½–½' : pairing.result === 'bye' ? 'bye' : pairing.result === 'white' ? '1–0' : '0–1'}</Badge> : <span className="tiny muted">in progress</span>}</td>
                          <td style={{ textAlign: 'right' }}>{pairing.gameId && <Link to={`/play/game/${pairing.gameId}`} className="btn btn-sm btn-ghost">Open</Link>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'info' && (
        <div className="grid grid-2">
          <Card>
            <CardHead title="Format" />
            <div className="stack" style={{ gap: 8, fontSize: '.88rem' }}>
              {[['System', t.format], ['Rounds', String(t.rounds)], ['Time control', `${t.timeControl} ${t.category}`],
                ['Players', `${t.players} of ${t.maxPlayers}`], ['Starts', formatDateTime(t.startsAt)],
                ['Registration closes', formatDateTime(t.registrationDeadline)], ['Prize', t.prize ?? '—']].map(([label, value]) => (
                <div className="row-between" key={label}><span className="muted">{label}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span></div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHead title="Rules" />
            <p className="small" style={{ color: '#cfcfd9', whiteSpace: 'pre-wrap' }}>{t.rules ?? 'Standard SPEED CHESS fair play rules apply: no engine assistance, no outside help, and respect for your opponents.'}</p>
            <Alert tone="info">Tiebreaks use Buchholz (the sum of your opponents' scores) so head-to-head results alone never decide a prize.</Alert>
          </Card>
        </div>
      )}
    </div>
  );
}
