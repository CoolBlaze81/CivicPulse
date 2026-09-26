// Department workload board (design p.31).
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { timeAgo } from '../lib/format.js';
import { Meter, Priority, Spinner } from '../components/ui.jsx';

function JobCard({ i, sub }) {
  return (
    <Link to={`/dept/incidents/${i.incident_id}`} className="job">
      <div className="row between"><Priority p={i.priority} code showLabel={false} /><span className="mono tiny muted">{i.code}</span></div>
      <b>{i.title}</b>
      <div className="row between small muted"><span>{sub}</span><span>{timeAgo(i.opened_at)}</span></div>
    </Link>
  );
}

export default function Workload() {
  const { data } = useApi('/department/board', { interval: 30000 });
  if (!data) return <Spinner />;
  const { summary, columns, crews, department } = data;
  const onDuty = crews.filter((c) => c.availability === 'ON_DUTY');

  const cols = [
    ['Needs a crew', columns.needs_crew, (i) => (i.status === 'REOPENED' ? 'Reopened by citizen' : i.suggested_crew ? `Suggested: ${i.suggested_crew}` : 'Unassigned')],
    ['Crew assigned', columns.assigned, (i) => i.crew_name],
    ['In progress', columns.in_progress, (i) => `${i.crew_name}${i.work_stage === 'ON_SITE' || i.work_stage === 'WORKING' ? ' · on site' : ''}`],
    ['Awaiting citizen', columns.awaiting, (i) => `Resolved by ${i.crew_name?.replace('Crew ', '')}`],
  ];

  return (
    <>
      <div className="staff-head">
        <div className="stack tight" style={{ gap: 2 }}>
          <span className="muted">{department.name}</span>
          <h1>Workload</h1>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span className="muted">Open</span><b>{summary.open}</b></div>
        <div className="kpi accent"><span className="muted">Critical</span><b>{summary.critical}</b></div>
        <div className="kpi"><span className="muted">Reopened</span><b>{summary.reopened}</b></div>
        <div className="kpi"><span className="muted">Overdue</span><b>{summary.overdue}</b></div>
        <div className="kpi"><span className="muted">Avg. to resolve (30 d)</span><b>{summary.avg_resolve_days ?? '—'}{summary.avg_resolve_days != null && <small style={{ fontSize: 18 }}> d</small>}</b></div>
      </div>
      <div className="board">
        {cols.map(([label, items, sub]) => (
          <div key={label} className="col">
            <div className="col-head"><span>{label}</span><span className="muted">{items.length}</span></div>
            {items.length === 0 && <span className="small muted" style={{ padding: 4 }}>Nothing here</span>}
            {items.map((i) => <JobCard key={i.incident_id} i={i} sub={sub(i)} />)}
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-body">
          <div className="row between"><h3>Crews on duty</h3><span className="muted">{onDuty.length} of {crews.length}</span></div>
          <div className="kpis">
            {crews.map((c) => (
              <div key={c.crew_id} className="kpi" style={{ opacity: c.availability === 'ON_DUTY' ? 1 : 0.55 }}>
                <div className="row between"><b style={{ fontSize: 17, margin: 0 }}>{c.name}</b><span className="mono small">{c.load}/{c.max_load}</span></div>
                <span className="small muted">Wards {c.zone.replaceAll(',', ', ')}{c.availability !== 'ON_DUTY' ? ` · ${c.availability.replace('_', ' ').toLowerCase()}` : ''}</span>
                <div style={{ marginTop: 8 }}><Meter load={c.load} max={c.max_load} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
