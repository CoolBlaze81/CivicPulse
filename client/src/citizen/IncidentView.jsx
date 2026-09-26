// Incident tracking for citizens (design p.6).
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { when, statusLabel, PRIORITY_LABEL, timeLeft } from '../lib/format.js';
import { Icon, Spinner, StatusPill } from '../components/ui.jsx';
import { LoadError } from '../components/ErrorPages.jsx';
import MapView from '../components/MapView.jsx';

const STEPS = ['Reported', 'Linked', 'Assigned', 'Working', 'Verify'];
function stepIndex(inc) {
  switch (inc.status) {
    case 'REPORTED': return 0;
    case 'LINKED': return 1;
    case 'ASSIGNED': return 2;
    case 'IN_PROGRESS': return 3;
    case 'AWAITING_VERIFICATION': return 4;
    case 'CLOSED': return 5;
    case 'REOPENED': return 2;
    default: return 0;
  }
}

// Plain-language line for a history entry.
export function describeEvent(e) {
  if (e.from_status === e.to_status || !e.from_status) return e.reason || 'Update';
  const map = {
    LINKED: 'More neighbours reported this',
    ASSIGNED: e.reason || 'Assigned to a crew',
    IN_PROGRESS: e.reason || 'Crew started work',
    AWAITING_VERIFICATION: 'Crew marked it fixed — waiting for reporters to check',
    CLOSED: e.reason?.startsWith('Closed · officer') ? 'Closed after an officer checked the proof' : 'Closed after reporters confirmed the fix',
    REOPENED: `Reopened${e.reason ? ` — ${e.reason.replace(/^Verification: /, '')}` : ''}`,
  };
  return map[e.to_status] || e.reason || statusLabel({ status: e.to_status });
}

export default function IncidentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: inc, error, reload } = useApi(`/citizen/incidents/${id}`, { interval: 30000 });
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!inc) return <Spinner />;

  const idx = stepIndex(inc);
  const others = inc.report_count - inc.my_reports.length;
  const canVerify = inc.status === 'AWAITING_VERIFICATION' && inc.verification.mine && !inc.verification.mine.response && !inc.needs_officer_verification;
  const mine = inc.my_reports[0];

  return (
    <>
      <div className="map-hero">
        <MapView center={{ lat: inc.latitude, lng: inc.longitude }} zoom={17} dot={{ lat: inc.latitude, lng: inc.longitude }} interactive={false} />
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Icon name="back" /></button>
      </div>
      <div className="sheet">
        <div className="row between">
          <StatusPill incident={inc} />
          <span className="mono muted">{inc.code}</span>
        </div>
        <h1>{inc.title}</h1>
        <p className="muted">
          {inc.department_name ? `${inc.department_name}${inc.crew_name ? ` · ${inc.crew_name}${inc.work_stage === 'ON_SITE' || inc.work_stage === 'WORKING' ? ' on site' : ''}` : ''}` : inc.address}
        </p>

        <div className="steps" aria-label={`Progress: ${statusLabel(inc)}`}>
          {STEPS.map((s, i) => (
            <div key={s} className={inc.status === 'REOPENED' && i === 4 ? 'bad' : i < idx ? 'done' : i === idx ? 'now' : ''}>{s}</div>
          ))}
        </div>

        {canVerify && (
          <div className="card warn stack">
            <b>The crew says this is fixed. Is it?</b>
            <span className="small muted">{timeLeft(inc.verification.expires_at)} · {inc.verification.responded} of {inc.verification.total} reporters answered</span>
            <Link to={`/incident/${inc.incident_id}/verify`} className="btn primary">Review proof</Link>
          </div>
        )}
        {inc.verification.mine?.response && inc.status === 'AWAITING_VERIFICATION' && (
          <div className="banner info">You said it’s {inc.verification.mine.response === 'FIXED' ? 'fixed' : 'not fixed'}. Waiting for the other reporters ({inc.verification.responded} of {inc.verification.total} answered).</div>
        )}

        <div className="card row">
          <div className="avatars">
            {inc.my_reports.length > 0 && <span>You</span>}
            {others > 0 && <span style={{ background: '#d9dcea' }} />}
            {others > 1 && <span style={{ background: '#e7e2d6' }} />}
            {others > 2 && <span className="more">+{others - 2}</span>}
          </div>
          <p><b>{inc.report_count} report{inc.report_count > 1 ? 's' : ''}</b> linked to this incident.{inc.my_reports.length > 0 && inc.status !== 'CLOSED' ? ' Your voice counts toward its priority.' : ''}</p>
        </div>

        <div className="row wrap small muted" style={{ gap: 16 }}>
          <span>{inc.category_name}</span>
          <span>Priority {inc.priority} {PRIORITY_LABEL[inc.priority]}</span>
          {inc.address && <span>{inc.address}</span>}
        </div>

        <h2>Updates</h2>
        <ul className="timeline">
          {inc.history.map((e, i) => (
            <li key={i}>
              <b>{describeEvent(e)}</b>
              <div className="muted small">{when(e.changed_at)}</div>
            </li>
          ))}
          {mine && (
            <li>
              <b>You reported this</b>
              <div className="muted small">{when(mine.submitted_at)} · <span className="mono">{mine.code}</span></div>
            </li>
          )}
        </ul>
        {inc.my_reports.length === 0 && inc.status !== 'CLOSED' && (
          <Link to={`/nearby?see=${inc.incident_id}`} className="btn ghost block">I see it too</Link>
        )}
      </div>
    </>
  );
}
