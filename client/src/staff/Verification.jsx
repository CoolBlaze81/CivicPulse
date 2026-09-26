// Officer verification queue (design p.30, FR-63, BR-11).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { timeAgo, timeLeft } from '../lib/format.js';
import { Icon, ErrorNote, Spinner } from '../components/ui.jsx';
import { ProofCard, VerificationBox } from './IncidentDetail.jsx';

export default function Verification() {
  const { data, error, reload } = useApi('/staff/verification', { interval: 30000 });
  const [tab, setTab] = useState('needs');
  const [selectedId, setSelectedId] = useState(null);
  const rows = tab === 'needs' ? data?.needs_officer || [] : data?.in_window || [];
  const selected = rows.find((r) => r.incident_id === selectedId) || rows[0];
  const { data: detail, reload: reloadDetail } = useApi(selected ? `/staff/incidents/${selected.incident_id}` : null);
  if (!data) return error ? <ErrorNote error={error} onRetry={reload} /> : <Spinner />;

  const after = async () => { setSelectedId(null); await reload(); await reloadDetail(); };

  return (
    <>
      <div className="staff-head">
        <div className="stack tight" style={{ gap: 2 }}>
          <h1>Verification</h1>
          <span className="muted">Every linked reporter gets 72 h to respond. The majority of responses decides; a tie reopens. No responses → you check the proof.</span>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className={`chip ${tab === 'needs' ? 'on' : ''}`} onClick={() => setTab('needs')}>No response — needs you<span className="count">{data.needs_officer.length}</span></button>
        <button type="button" className={`chip ${tab === 'window' ? 'on' : ''}`} onClick={() => setTab('window')}>In 72 h window<span className="count">{data.in_window.length}</span></button>
        <span className="chip" style={{ cursor: 'default' }}>Decided in the last day<span className="count">{data.decided_today}</span></span>
      </div>
      {rows.length === 0 ? (
        <div className="panel empty">
          <div className="done-icon"><Icon name="check" size={30} /></div>
          <h3>{tab === 'needs' ? 'Nothing needs your check' : 'No incidents in a verification window'}</h3>
        </div>
      ) : (
        <div className="split">
          <div className="panel">
            <table className="table">
              <thead><tr><th>ID</th><th>Incident</th><th>Resolved by</th><th>Asked</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.incident_id} className={`clickable ${selected?.incident_id === r.incident_id ? 'selected' : ''}`} onClick={() => setSelectedId(r.incident_id)}>
                    <td className="mono">{r.code}</td>
                    <td><div className="title">{r.title}</div><div className="sub">{[r.address, /ward/i.test(r.address || '') ? null : `Ward ${r.ward}`].filter(Boolean).join(', ')}</div></td>
                    <td><div>{r.crew_name}</div><div className="sub">{r.department_name}</div></td>
                    <td>
                      <div>{r.verification.total} reporter{r.verification.total === 1 ? '' : 's'}</div>
                      <div className="sub">{tab === 'needs' ? `resolved ${timeAgo(r.resolved_at)} ago` : `${r.verification.responded} answered · ${timeLeft(r.verification.expires_at)}`}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail && selected && detail.incident_id === selected.incident_id && (
            <aside className="stack sticky">
              <div className="card stack tight">
                <span className="mono small muted">{detail.code} · {tab === 'needs' ? `window closed` : timeLeft(detail.verification.expires_at)}</span>
                <h2>{detail.title}</h2>
                <span className="small muted">{detail.verification.responded} of {detail.verification.total} reporters responded</span>
                <Link to={`/officer/incidents/${detail.incident_id}`} className="link-btn small">Open full incident</Link>
              </div>
              <ProofCard inc={detail} />
              <VerificationBox inc={detail} onChange={after} canAct />
              <p className="small muted">Closing here records “Closed · officer-verified” — kept separate from citizen-verified closures in analytics.</p>
            </aside>
          )}
        </div>
      )}
    </>
  );
}
