// Citizen home (design p.3, empty state p.13).
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi } from '../lib/hooks.js';
import { durationDays, ago } from '../lib/format.js';
import { Brand, Icon, Photo, Spinner, StatusPill, ErrorNote } from '../components/ui.jsx';
import { OutboxBanner } from '../components/Outbox.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function ReportRow({ r }) {
  const others = (r.report_count || 1) - 1;
  const target = r.incident_id ? (r.awaiting_me ? `/incident/${r.incident_id}/verify` : `/incident/${r.incident_id}`) : null;
  const body = (
    <>
      <Photo src={r.photo_url} className="thumb" />
      <div className="grow stack tight" style={{ gap: 4 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <b className="grow">{r.incident_title || r.description}</b>
          <span className="muted small" style={{ whiteSpace: 'nowrap' }}>{ago(r.submitted_at)}</span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {r.incident_id ? (
            <StatusPill status={r.incident_status} awaitingYou={r.awaiting_me}
              label={r.incident_status === 'CLOSED' && r.closure_type === 'OFFICER' ? 'Closed · officer-verified' : undefined} />
          ) : (
            <span className="pill REPORTED">Being checked</span>
          )}
          <span className="muted small">
            {r.incident_status === 'CLOSED' && r.closed_at
              ? `Fixed in ${durationDays(r.first_report_at || r.submitted_at, r.closed_at)}`
              : others > 0 ? `+${others} other${others > 1 ? 's' : ''} reported this` : r.incident_id ? 'Only you so far' : 'Matching with nearby reports'}
          </span>
        </div>
      </div>
    </>
  );
  return target ? <Link to={target} className="list-item">{body}</Link> : <div className="list-item">{body}</div>;
}

export default function CitizenHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/reports/mine', { interval: 30000, offline: true });
  const reports = data || [];
  const needsCheck = [];
  const seen = new Set();
  for (const r of reports) {
    if (r.awaiting_me && !seen.has(r.incident_id)) { seen.add(r.incident_id); needsCheck.push(r); }
  }
  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <>
      <div className="row between desk-hide">
        <Brand />
        <Link to="/updates" className="icon-btn" aria-label="Updates" style={{ position: 'relative' }}>
          <Icon name="bell" />
          {user?.unread > 0 && <span className="dot" style={{ position: 'absolute', top: 8, right: 10, width: 9, height: 9, borderRadius: 9, background: 'var(--pulse)' }} />}
        </Link>
      </div>
      <h2>{reports.length ? greeting() : 'Welcome'}, {firstName}</h2>

      <div className="desk-cols">
      <div>
      <div className="hero-card">
        <h2>Spotted something<br />broken?</h2>
        <Link to="/report/new" className="btn lg block"><Icon name="camera" /> Report an issue</Link>
        <span style={{ opacity: 0.8 }}>Photo + location. Takes under a minute.</span>
      </div>

      <OutboxBanner />
      <ErrorNote error={error} onRetry={reload} hasData={!!data} />

      {needsCheck.map((r) => (
        <div key={r.incident_id} className="card warn stack">
          <div className="row between"><span className="eyebrow" style={{ color: 'var(--pulse)' }}>Needs your check</span><span className="mono small">{r.incident_code}</span></div>
          <p className="bold">The crew says “{r.incident_title}” is fixed. Is it?</p>
          <Link to={`/incident/${r.incident_id}/verify`} className="btn primary">Review proof</Link>
        </div>
      ))}
      </div>

      <div>
      {loading && !data ? <Spinner /> : reports.length === 0 ? (
        <div className="card stack center" style={{ padding: 28 }}>
          <h3>No reports yet</h3>
          <p className="muted">When you report something, you’ll follow it here — from the first photo to the crew’s fix.</p>
          <Link to="/nearby" className="btn ghost">See what’s already reported nearby</Link>
        </div>
      ) : (
        <section className="stack tight">
          <div className="row between"><h3>Your reports</h3><Link to="/reports" className="link-btn">See all</Link></div>
          <div className="card" style={{ padding: '4px 16px' }}>
            {reports.slice(0, 4).map((r) => <ReportRow key={r.report_id} r={r} />)}
          </div>
        </section>
      )}
      </div>
      </div>
    </>
  );
}
