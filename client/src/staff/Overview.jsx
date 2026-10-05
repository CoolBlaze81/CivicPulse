// Officer overview: what needs attention now, the most urgent incidents and
// how the last week went. Each card opens its own page.
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi } from '../lib/hooks.js';
import { timeAgo } from '../lib/format.js';
import { Icon, Priority, Spinner, StatusPill, ErrorNote } from '../components/ui.jsx';
import { AllClearArt } from '../components/Illustrations.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Overview() {
  const { user } = useAuth();
  const { data: counts, error, reload } = useApi('/staff/counts', { interval: 30000 });
  const { data: open } = useApi('/staff/incidents?tab=open', { interval: 60000 });
  const { data: week } = useApi('/analytics?days=7');

  const queues = [
    ['/officer/incidents', 'Needs triage', counts?.triage, 'list', 'New incidents waiting for a category, priority and crew', 'violet'],
    ['/officer/match-review', 'Match review', counts?.match_review, 'link', 'Reports the system wasn’t sure were duplicates', 'pulse'],
    ['/officer/assignments?tab=reopened', 'Needs a crew', counts?.needs_crew, 'users', 'Triaged or reopened incidents with no crew yet', 'blue'],
    ['/officer/verification', 'Officer check', counts?.officer_verification, 'shield', 'No reporter answered in 72 h; check the proof', 'teal'],
  ];
  const urgent = (open?.incidents || []).filter((i) => ['P1', 'P2'].includes(i.priority)).slice(0, 6);
  const overdue = (open?.incidents || []).filter((i) => i.overdue).length;
  const total = queues.reduce((s, q) => s + (q[2] || 0), 0);

  return (
    <>
      <div className="staff-head">
        <div className="stack tight" style={{ gap: 2 }}>
          <span className="muted">{greeting()}, {user.name.split(' ').slice(-1)[0]}</span>
          <h1>Overview</h1>
        </div>
        <Link to="/officer/incidents" className="btn primary"><Icon name="list" size={18} /> Open incident queue</Link>
      </div>
      <ErrorNote error={error} onRetry={reload} />

      {!counts ? <Spinner /> : (
        <div className="queue-cards">
          {queues.map(([to, label, n, icon, hint, tone]) => (
            <Link key={label} to={to} className={`queue-card ${n ? '' : 'quiet'}`}>
              <span className={`notif-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
              <b className="queue-n">{n ?? 0}</b>
              <span className="bold">{label}</span>
              <span className="small muted">{hint}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="two-col wide-left">
        <section className="panel">
          <div className="panel-body" style={{ paddingBottom: 8 }}>
            <div className="row between wrap">
              <h3>Most urgent open incidents</h3>
              {overdue > 0 && <span className="pill REOPENED plain">{overdue} past response target</span>}
            </div>
          </div>
          {!open ? <Spinner /> : urgent.length === 0 ? (
            <div className="empty"><AllClearArt /><h3>No critical or high-priority incidents open</h3></div>
          ) : (
            <div>
              {urgent.map((i) => (
                <Link key={i.incident_id} to={`/officer/incidents/${i.incident_id}`} className="urgent-row">
                  <Priority p={i.priority} showLabel={false} />
                  <span className="grow stack tight" style={{ gap: 2, minWidth: 0 }}>
                    <b className="truncate">{i.title}</b>
                    <span className="small muted truncate"><span className="mono">{i.code}</span> · {i.category_name} · W{i.ward} · {i.report_count} report{i.report_count > 1 ? 's' : ''} · {timeAgo(i.opened_at)} old</span>
                  </span>
                  <span className="urgent-status">{i.needs_crew ? <span className="pill TRIAGE">Needs a crew</span> : <StatusPill incident={i} />}</span>
                </Link>
              ))}
              <div className="panel-body" style={{ paddingTop: 10 }}><Link to="/officer/incidents?tab=assigned" className="link-btn small">See every open incident</Link></div>
            </div>
          )}
        </section>

        <section className="stack">
          <div className="card stack">
            <h3>Last 7 days</h3>
            {!week ? <Spinner /> : (
              <div className="mini-kpis">
                <div><b>{week.reports_received}</b><span>reports received</span></div>
                <div><b>{week.incidents_opened}</b><span>incidents opened</span></div>
                <div><b>{week.median_close_days ?? '—'}<small>{week.median_close_days != null ? ' d' : ''}</small></b><span>median time to close</span></div>
                <div><b>{week.reopen_rate_pct ?? 0}<small>%</small></b><span>reopened by citizens</span></div>
              </div>
            )}
            <Link to="/officer/analytics" className="link-btn small">Full analytics</Link>
          </div>
          <div className={`card stack tight ${total ? 'warn' : 'success'}`}>
            <b>{total ? `${total} item${total === 1 ? '' : 's'} waiting across your queues` : 'Every queue is clear'}</b>
            <span className="small">Match review and officer checks are only done by officers, so they don’t wait on anyone else.</span>
          </div>
        </section>
      </div>
    </>
  );
}
