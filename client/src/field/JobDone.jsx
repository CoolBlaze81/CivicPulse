// "Sent for citizen check" (design p.20).
import { Link, useLocation, useParams } from 'react-router-dom';
import { Icon } from '../components/ui.jsx';

export default function JobDone() {
  const { id } = useParams();
  const { state } = useLocation();
  const inc = state?.incident;
  const next = state?.next_job;
  return (
    <div className="done-screen">
      <div className="done-icon navy"><Icon name="check" size={36} stroke={2.4} /></div>
      <h1>Sent for citizen check</h1>
      <p style={{ fontSize: 17 }}>
        <span className="mono">INC-{id}</span> is marked resolved.{' '}
        {inc?.report_count ? `The ${inc.report_count} ${inc.report_count > 1 ? 'people' : 'person'} who reported it have 72 hours to confirm.` : 'The reporters have 72 hours to confirm.'}{' '}
        If they reopen it, it comes back to your list.
      </p>
      {next ? (
        <div className="card stack tight">
          <span className="eyebrow">Next job</span>
          <b>{next.title}</b>
          <span className="mono small muted">{next.code}</span>
          <Link to={`/field/jobs/${next.incident_id}`} className="btn primary">View job</Link>
        </div>
      ) : (
        <p className="muted">No more jobs right now.</p>
      )}
      <Link to="/field" className="btn ghost lg block">Back to jobs</Link>
    </div>
  );
}
