// Report received (design p.5).
import { Link, useLocation, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { Spinner } from '../components/ui.jsx';
import { SentArt } from '../components/Illustrations.jsx';

export default function ReportReceived() {
  const { id } = useParams();
  const { state } = useLocation();
  const { data: report } = useApi(`/reports/${id}`);
  if (!report) return <Spinner />;

  const count = report.report_count || 1;
  const joined = report.incident_id && count > 1;
  const inProgress = ['ASSIGNED', 'IN_PROGRESS'].includes(report.incident_status);
  const review = !report.incident_id;

  return (
    <div className="done-screen">
      <SentArt className="done-art" />
      <div className="stack tight">
        <h1>Report received</h1>
        <span className="mono muted">{report.code}</span>
      </div>
      <p style={{ fontSize: 17 }}>
        {review && 'An officer is checking whether this matches a problem someone already reported nearby. You’ll get an update either way.'}
        {joined && <>Joined to <span className="mono">{report.incident_code}</span> · <b>{report.incident_title}</b>. You’re one of {count} people who reported it.</>}
        {!review && !joined && <>This opened a new incident, <span className="mono">{report.incident_code}</span>. We’ll let you know when it’s assigned.</>}
        {state?.decision === 'LINKED' && state?.score ? <span className="muted small"> (matched automatically, {Math.round(state.score * 100)}%)</span> : null}
      </p>
      <div className="card stack">
        <b>What happens next</b>
        {[
          inProgress ? 'A crew is already working on it — you’ll see each update.' : 'An officer checks the category and priority and assigns a crew.',
          'When they mark it resolved, you get “after” photos.',
          `You${count > 1 ? ' and the other reporters' : ''} have 72 hours to confirm or reopen.`,
        ].map((t, i) => (
          <div key={t} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="avatar" style={{ background: 'var(--navy-50)', color: 'var(--navy)', width: 28, height: 28, fontSize: 13 }}>{i + 1}</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
      <div className="stack">
        {report.incident_id && <Link to={`/incident/${report.incident_id}`} className="btn primary lg block">Track incident</Link>}
        <Link to="/" className="btn ghost lg block">Done</Link>
      </div>
    </div>
  );
}
