// Operational analytics (design p.33, FR-50..FR-56). Officers and admins
// see the whole city; department heads see their own department.
import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { WARD_NAMES } from '../lib/format.js';
import { useApi, useNarrow } from '../lib/hooks.js';
import { Spinner, Tabs } from '../components/ui.jsx';

// Single-series line: weekly median days to close. Hover shows the value.
function WeeklyChart({ points }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 200, L = 34, R = 12, T = 12, B = 26;
  const vals = points.map((p) => p.median_days).filter((v) => v != null);
  const max = Math.max(2, Math.ceil(Math.max(...vals, 0) / 2) * 2);
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const path = points.map((p, i) => (p.median_days == null ? null : `${x(i)},${y(p.median_days)}`)).filter(Boolean).join(' L');
  const ticks = [0, max / 2, max];
  const label = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly median days from first report to close">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#E3DFD5" strokeWidth="1" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5F6472">{t}d</text>
        </g>
      ))}
      {points.map((p, i) => (i % 2 === 0 ? <text key={p.week_start} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#5F6472">{label(p.week_start)}</text> : null))}
      {path && <path d={`M${path}`} fill="none" stroke="#1B2559" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => p.median_days != null && (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <rect x={x(i) - 20} y={T} width="40" height={H - T - B} fill="transparent" />
          <circle cx={x(i)} cy={y(p.median_days)} r={hover === i ? 5 : 4} fill="#1B2559" stroke="#fff" strokeWidth="2" />
        </g>
      ))}
      {hover != null && (
        <g pointerEvents="none">
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#5F6472" strokeDasharray="3 3" />
          <rect x={Math.min(x(hover) + 8, W - 130)} y={T} width="120" height="38" rx="6" fill="#14161C" />
          <text x={Math.min(x(hover) + 16, W - 122)} y={T + 16} fontSize="11" fill="#fff">Week of {label(points[hover].week_start)}</text>
          <text x={Math.min(x(hover) + 16, W - 122)} y={T + 31} fontSize="12" fontWeight="600" fill="#fff">{points[hover].median_days} days median</text>
        </g>
      )}
    </svg>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [ward, setWard] = useState('');
  const { data } = useApi(`/analytics?days=${days}${ward ? `&ward=${ward}` : ''}`);
  const isHead = user.role === 'DEPT_HEAD';
  const narrow = useNarrow();

  const head = (
    <div className="staff-head">
      <div className="stack tight" style={{ gap: 2 }}>
        <h1>{isHead ? 'Reports' : 'City pulse'}</h1>
        <span className="muted">{isHead ? user.department?.name : 'North Delhi · MetroServe Municipal Operations Authority'}</span>
      </div>
      <div className="row wrap filters">
        <Tabs value={days} onChange={setDays} tabs={[[7, '7 days'], [30, '30 days'], [90, 'Quarter']]} />
        <select className="input ward-select" value={ward} onChange={(e) => setWard(e.target.value)} aria-label="Ward">
          <option value="">All wards</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Ward {i + 1} · {WARD_NAMES[i + 1]}</option>)}
        </select>
      </div>
    </div>
  );
  if (!data) return <>{head}<Spinner /></>;

  const maxCat = Math.max(1, ...data.by_category.map((c) => c.n));
  const d = data.duplicates;
  const workload = isHead ? data.department_workload.filter((w) => w.department_id === user.department_id) : data.department_workload;

  return (
    <>
      {head}
      <div className="kpis">
        <div className="kpi"><span className="muted small">Reports received</span><b>{data.reports_received.toLocaleString()}</b>
          <span className="small muted">{data.reports_change_pct == null ? 'no earlier data' : `${data.reports_change_pct >= 0 ? '+' : ''}${data.reports_change_pct}% vs previous ${days} days`}</span></div>
        <div className="kpi"><span className="muted small">Incidents opened</span><b>{data.incidents_opened.toLocaleString()}</b><span className="small muted">after consolidation</span></div>
        <div className="kpi accent"><span className="muted small">Reports per incident</span><b>{data.reports_per_incident ?? '—'}</b><span className="small muted">avg. voices per problem</span></div>
        <div className="kpi"><span className="muted small">Median time to close</span><b>{data.median_close_days ?? '—'}<small style={{ fontSize: 18 }}> d</small></b>
          <span className="small muted">{data.median_close_days_prev != null ? `${data.median_close_days <= data.median_close_days_prev ? 'down' : 'up'} from ${data.median_close_days_prev} d` : 'first report → close'}</span></div>
        <div className="kpi"><span className="muted small">Reopen rate</span><b>{data.reopen_rate_pct ?? '—'}{data.reopen_rate_pct != null && <small style={{ fontSize: 18 }}>%</small>}</b><span className="small muted">citizens rejected the fix</span></div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="muted small">Total reports · incidents</span><b style={{ fontSize: 26 }}>{data.totals.reports.toLocaleString()} · {data.totals.incidents.toLocaleString()}</b></div>
        <div className="kpi"><span className="muted small">Open now</span><b style={{ fontSize: 26 }}>{Object.entries(data.status_counts).filter(([s]) => s !== 'CLOSED').reduce((a, [, n]) => a + n, 0)}</b></div>
        <div className="kpi"><span className="muted small">High priority open (P1–P2)</span><b style={{ fontSize: 26 }}>{data.high_priority_open}</b></div>
        <div className="kpi"><span className="muted small">Awaiting verification · reopened</span><b style={{ fontSize: 26 }}>{data.status_counts.AWAITING_VERIFICATION || 0} · {data.status_counts.REOPENED || 0}</b></div>
        <div className="kpi"><span className="muted small">Closed: citizen · officer-verified</span><b style={{ fontSize: 26 }}>{data.closures.citizen_verified} · {data.closures.officer_verified}</b></div>
      </div>

      <div className="two-col wide-left">
        <div className="card stack">
          <h3>Median time from first report to close</h3>
          <span className="small muted">Weekly, last 12 weeks</span>
          <div className="chart-wrap"><WeeklyChart points={data.weekly_median_close} /></div>
        </div>
        <div className="card stack">
          <h3>Incidents by category</h3>
          {data.by_category.length === 0 && <span className="muted">No incidents in this range.</span>}
          {data.by_category.map((c) => (
            <div key={c.name} className="hbar" title={`${c.name}: ${c.n}`}>
              <span>{c.name}</span>
              <span className="track"><span className="fill" style={{ display: 'block', width: `${(c.n / maxCat) * 100}%` }} /></span>
              <span className="mono small">{c.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="two-col wide-left">
        <div className="panel">
          <div className="panel-body" style={{ paddingBottom: 0 }}><h3>Department workload</h3></div>
          <table className="table stackable">
            <thead><tr><th>Department</th><th>Open</th><th>Overdue</th><th>Median close</th><th>Reopened</th></tr></thead>
            <tbody>
              {workload.map((w) => (
                <tr key={w.department_id}>
                  <td className="bold cell-main">{w.name}</td><td data-label="Open">{w.open}</td>
                  <td data-label="Overdue" style={{ color: w.overdue ? 'var(--st-reopened)' : undefined }}>{w.overdue}</td>
                  <td data-label="Median close">{w.median_close_days != null ? `${w.median_close_days} d` : '—'}</td><td data-label="Reopened">{w.reopened}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card stack">
          <h3>Duplicate handling avoided</h3>
          <p><b style={{ fontFamily: 'var(--font-display)', fontSize: 30 }}>{d.linked_to_existing.toLocaleString()}</b> reports linked to an existing incident</p>
          <div className="stack tight small">
            <div className="row between"><span>Auto-linked (≥ 90%)</span><b>{d.auto}</b></div>
            <div className="row between"><span>Officer-reviewed</span><b>{d.officer}</b></div>
            <div className="row between"><span>Joined by the reporter</span><b>{d.citizen}</b></div>
            <div className="row between"><span>Waiting for match review</span><b>{d.pending_review}</b></div>
          </div>
          <p className="small muted">Officer overrides on auto-links: {d.override_rate_pct ?? 0}% — worth watching as the matching rules are tuned.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ paddingBottom: 0 }}><h3>By ward</h3></div>
        {narrow ? (
          <div className="ward-grid">
            {data.by_ward.map((w) => (
              <button type="button" key={w.ward} className={`ward-tile ${String(ward) === String(w.ward) ? 'on' : ''}`} onClick={() => setWard(String(ward) === String(w.ward) ? '' : String(w.ward))}>
                <span className="small muted">{WARD_NAMES[w.ward] || `Ward ${w.ward}`}</span>
                <b>{w.opened}</b>
                <span className="tiny muted">{w.open_now} still open</span>
              </button>
            ))}
          </div>
        ) : (
          <table className="table">
            <thead><tr><th>Ward</th><th>Area</th><th>Incidents opened in range</th><th>Still open</th></tr></thead>
            <tbody>
              {data.by_ward.map((w) => <tr key={w.ward}><td>Ward {w.ward}</td><td>{WARD_NAMES[w.ward] || ''}</td><td>{w.opened}</td><td>{w.open_now}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
