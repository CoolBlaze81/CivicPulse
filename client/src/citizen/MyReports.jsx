// All of a citizen's reports (FR-57).
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { Spinner } from '../components/ui.jsx';
import { ReportRow } from './Home.jsx';

export default function MyReports() {
  const { data } = useApi('/reports/mine');
  if (!data) return <Spinner />;
  const open = data.filter((r) => r.incident_status !== 'CLOSED');
  const closed = data.filter((r) => r.incident_status === 'CLOSED');
  return (
    <>
      <h1>Your reports</h1>
      {data.length === 0 && (
        <div className="card stack center">
          <p className="muted">You haven’t reported anything yet.</p>
          <Link to="/report/new" className="btn primary">Report an issue</Link>
        </div>
      )}
      {open.length > 0 && (
        <section className="stack tight">
          <span className="eyebrow">Open · {open.length}</span>
          <div className="card" style={{ padding: '4px 16px' }}>{open.map((r) => <ReportRow key={r.report_id} r={r} />)}</div>
        </section>
      )}
      {closed.length > 0 && (
        <section className="stack tight">
          <span className="eyebrow">Closed · {closed.length}</span>
          <div className="card" style={{ padding: '4px 16px' }}>{closed.map((r) => <ReportRow key={r.report_id} r={r} />)}</div>
        </section>
      )}
    </>
  );
}
