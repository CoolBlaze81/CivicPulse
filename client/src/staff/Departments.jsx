// Admin: departments overview (read-only).
import { useApi } from '../lib/hooks.js';
import { Meter, ErrorNote, Spinner } from '../components/ui.jsx';

export default function Departments() {
  const { data, error, reload } = useApi('/admin/departments');
  if (!data) return error ? <ErrorNote error={error} onRetry={reload} /> : <Spinner />;
  return (
    <>
      <div className="staff-head"><h1>Departments</h1></div>
      <div className="stack loose">
        {data.map((d) => (
          <div key={d.department_id} className="card stack">
            <div className="row between wrap" style={{ gap: 12 }}>
              <div className="stack tight" style={{ gap: 2, minWidth: 0 }}><h2>{d.name}</h2><span className="muted small">Head: {d.head_name || '—'} · handles {d.categories.join(', ')}</span></div>
              <div className="row wrap" style={{ gap: 20 }}>
                <span><b>{d.workload?.open ?? 0}</b> <span className="muted small">open</span></span>
                <span><b style={{ color: d.workload?.overdue ? 'var(--st-reopened)' : undefined }}>{d.workload?.overdue ?? 0}</b> <span className="muted small">overdue</span></span>
                <span><b>{d.workload?.median_close_days ?? '—'} d</b> <span className="muted small">median close</span></span>
              </div>
            </div>
            <div className="kpis">
              {d.crews.map((c) => (
                <div key={c.crew_id} className="kpi" style={{ padding: 12, opacity: c.availability === 'ON_DUTY' ? 1 : 0.55 }}>
                  <div className="row between"><b style={{ fontSize: 15, margin: 0, fontFamily: 'var(--font-body)' }}>{c.name}</b><span className="mono small">{c.load}/{c.max_load}</span></div>
                  <Meter load={c.load} max={c.max_load} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
