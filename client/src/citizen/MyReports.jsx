// All of a citizen's reports (FR-57), with filters, a summary and a guide to
// what each status means.
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { ErrorNote, Icon, Spinner, Tabs } from '../components/ui.jsx';
import { AllClearArt, ReportsArt, SearchArt } from '../components/Illustrations.jsx';
import { ReportRow } from './Home.jsx';
import { OutboxBanner, useOutbox } from '../components/Outbox.jsx';

const GUIDE = [
  ['REPORTED', 'Reported', 'We have it. An officer checks the category and priority.'],
  ['LINKED', 'Linked', 'Neighbours reported the same problem. Together it counts for more.'],
  ['ASSIGNED', 'Assigned', 'A department and crew have the job.'],
  ['IN_PROGRESS', 'In progress', 'The crew is on the way or working on it.'],
  ['AWAITING_VERIFICATION', 'Awaiting verification', 'The crew says it’s fixed. Reporters have 72 hours to confirm.'],
  ['CLOSED', 'Closed', 'Reporters (or an officer) confirmed the fix.'],
  ['REOPENED', 'Reopened', 'The fix didn’t hold. It goes back to a crew.'],
];

export default function MyReports() {
  const { data, error, reload } = useApi('/reports/mine', { offline: true });
  const { state } = useLocation();
  const { items } = useOutbox();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [guide, setGuide] = useState(false);

  const groups = useMemo(() => {
    const all = data || [];
    return {
      all,
      open: all.filter((r) => r.incident_status !== 'CLOSED'),
      check: all.filter((r) => r.awaiting_me),
      closed: all.filter((r) => r.incident_status === 'CLOSED'),
    };
  }, [data]);
  const term = q.trim().toLowerCase();
  const list = groups[filter].filter((r) => !term || [r.incident_title, r.description, r.address, r.code, r.incident_code, r.category_name]
    .some((x) => String(x || '').toLowerCase().includes(term)));

  // Only while the report is still waiting; once it's sent the list shows it.
  const queued = state?.queued && items.length > 0 && (
    <div className="banner ok" role="status"><b>Saved on your phone.</b> We’ll send it as soon as you’re back online.</div>
  );

  return (
    <>
      <div className="row between">
        <div className="stack tight" style={{ gap: 0 }}>
          <h1>Your reports</h1>
          <span className="muted small">{data ? `${data.length} report${data.length === 1 ? '' : 's'} · tap one to follow it` : 'Loading…'}</span>
        </div>
        <Link to="/report/new" className="btn primary sm desk-hide" aria-label="New report"><Icon name="plus" size={16} /> New</Link>
      </div>
      {queued}
      <OutboxBanner />
      <ErrorNote error={error} onRetry={reload} hasData={!!data} />

      {!data ? (error ? null : <Spinner />) : (
        <div className="desk-cols">
          <div>
            <div className="summary-tiles">
              <button type="button" className={`summary-tile ${filter === 'open' ? 'on' : ''}`} onClick={() => setFilter('open')}>
                <b>{groups.open.length}</b><span>Open</span>
              </button>
              <button type="button" className={`summary-tile warn ${filter === 'check' ? 'on' : ''}`} onClick={() => setFilter('check')}>
                <b>{groups.check.length}</b><span>Need your check</span>
              </button>
              <button type="button" className={`summary-tile good ${filter === 'closed' ? 'on' : ''}`} onClick={() => setFilter('closed')}>
                <b>{groups.closed.length}</b><span>Fixed</span>
              </button>
            </div>

            {data.length > 0 && (
              <>
                <Tabs value={filter} onChange={setFilter} tabs={[
                  ['all', 'All', groups.all.length], ['open', 'Open', groups.open.length],
                  ['check', 'To check', groups.check.length], ['closed', 'Closed', groups.closed.length],
                ]} />
                <label className="search">
                  <Icon name="search" size={18} />
                  <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your reports" aria-label="Search your reports" />
                </label>
              </>
            )}

            {data.length === 0 ? (
              <div className="card stack center empty-card">
                <ReportsArt />
                <h3>You haven’t reported anything yet</h3>
                <p className="muted">Potholes, broken streetlights, overflowing bins, leaking pipes: if it’s broken on your street, report it here and follow it until it’s fixed.</p>
                <Link to="/report/new" className="btn primary"><Icon name="camera" size={18} /> Report an issue</Link>
              </div>
            ) : list.length === 0 ? (
              <div className="card stack center empty-card">
                {term ? <SearchArt /> : <AllClearArt />}
                <p className="muted">{term ? 'No reports match that search.' : filter === 'check' ? 'Nothing needs your check right now.' : 'Nothing in this list.'}</p>
                <button type="button" className="link-btn" onClick={() => { setFilter('all'); setQ(''); }}>Show all reports</button>
              </div>
            ) : (
              <div className="card" style={{ padding: '4px 16px' }}>{list.map((r) => <ReportRow key={r.report_id} r={r} />)}</div>
            )}
          </div>

          <div>
            <Link to="/report/new" className="card report-cta">
              <span className="report-cta-icon"><Icon name="camera" size={24} /></span>
              <span className="grow stack tight" style={{ gap: 2 }}>
                <b>Report something new</b>
                <span className="small muted">Photo + pin. Under a minute.</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
            <Link to="/nearby" className="card report-cta">
              <span className="report-cta-icon violet"><Icon name="map" size={24} /></span>
              <span className="grow stack tight" style={{ gap: 2 }}>
                <b>Already reported nearby?</b>
                <span className="small muted">Tap “I see it too” to add your voice.</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>

            <section className="card stack">
              <button type="button" className="row between guide-toggle" onClick={() => setGuide(!guide)} aria-expanded={guide}>
                <b className="row" style={{ gap: 8 }}><Icon name="info" size={18} /> What the statuses mean</b>
                <Icon name="chevron" size={18} style={{ transform: guide ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {guide && (
                <div className="stack" style={{ gap: 10 }}>
                  {GUIDE.map(([status, label, text]) => (
                    <div key={status} className="stack tight" style={{ gap: 3 }}>
                      <span className={`pill ${status}`} style={{ alignSelf: 'flex-start' }}>{label}</span>
                      <span className="small muted">{text}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="card tip-card stack tight">
              <b className="row" style={{ gap: 8 }}><Icon name="star" size={18} /> Tip</b>
              <span className="small">Clear photos taken in daylight, with a landmark in the frame, help crews find and fix problems faster.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
