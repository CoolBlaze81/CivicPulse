// Incident list with triage side panel (design p.25, empty p.27).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi } from '../lib/hooks.js';
import { timeAgo } from '../lib/format.js';
import { Icon, Priority, Spinner, StatusPill, ErrorNote } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';

const TAB_SETS = {
  officer: [['triage', 'Needs triage'], ['assigned', 'Assigned'], ['in_progress', 'In progress'], ['awaiting', 'Awaiting verification'], ['reopened', 'Reopened']],
  assignments: [['assigned', 'Assigned'], ['in_progress', 'In progress'], ['reopened', 'Reopened · needs crew'], ['awaiting', 'Awaiting verification']],
  all: [['open', 'Open'], ['triage', 'Needs triage'], ['reopened', 'Reopened'], ['closed', 'Closed'], ['all', 'All']],
};
const BASE = { OFFICER: '/officer/incidents', DEPT_HEAD: '/dept/incidents', ADMIN: '/admin/incidents' };

export function RecommendationCard({ inc }) {
  return (
    <div className="reco">
      <h4><Icon name="sparkle" size={16} /> CivicPulse recommends</h4>
      <dl className="kv">
        <div><dt>Category</dt><dd>{inc.rec_category_name || inc.category_name}</dd></div>
        <div><dt>Priority</dt><dd className={`prio-text ${inc.rec_priority}`}>{inc.rec_priority} {({ P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' })[inc.rec_priority]}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>Department</dt><dd>{inc.rec_department_name || '—'}{inc.suggested_crew ? ` · ${inc.suggested_crew.name} free now` : ''}</dd></div>
      </dl>
      {inc.rec_reasons?.length > 0 && (
        <>
          <div className="divider" />
          <b className="small">Why {inc.rec_priority}</b>
          <ul className="reasons">{inc.rec_reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </>
      )}
    </div>
  );
}

export default function Incidents({ mode = 'officer' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tabs = TAB_SETS[mode];
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || tabs[0][0];
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);

  const { data, error, loading, reload } = useApi(`/staff/incidents?tab=${tab}&q=${encodeURIComponent(debounced)}`, { interval: 30000 });
  const list = data?.incidents || [];
  const selected = list.find((i) => i.incident_id === selectedId) || list[0];
  const { data: detail } = useApi(selected ? `/staff/incidents/${selected.incident_id}` : null);
  const base = BASE[user.role];
  const readOnly = user.role === 'ADMIN';
  const title = { officer: 'Incidents', assignments: 'Assignments', all: 'Incidents' }[mode];

  return (
    <>
      <div className="staff-head">
        <h1>{title}</h1>
        <label className="search">
          <Icon name="search" size={18} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, street, ward" aria-label="Search incidents" />
        </label>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {tabs.map(([key, label]) => (
          <button type="button" key={key} className={`chip ${tab === key ? 'on' : ''}`} onClick={() => { setParams({ tab: key }); setSelectedId(null); }}>
            {label}<span className="count">{data?.counts?.[key] ?? ''}</span>
          </button>
        ))}
      </div>
      <ErrorNote error={error} onRetry={reload} />
      <div className="split">
        <div className="panel">
          {loading && !data ? <Spinner /> : list.length === 0 ? (
            <div className="empty">
              <div className="done-icon"><Icon name="check" size={30} /></div>
              <h3>{tab === 'triage' ? 'Triage queue is clear' : 'Nothing here'}</h3>
              <p className="muted">{tab === 'triage' ? 'Every new incident has a category, priority and crew. New ones appear here as they come in.' : debounced ? 'No incidents match that search.' : 'No incidents in this list right now.'}</p>
              {mode === 'officer' && <Link to="/officer/match-review" className="link-btn">Check reports that need match review</Link>}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Incident</th><th>Priority</th><th className="hide-sm">Reports</th><th className="hide-sm">Age</th><th>Status</th></tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.incident_id} className={`clickable ${selected?.incident_id === i.incident_id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(i.incident_id)} onDoubleClick={() => navigate(`${base}/${i.incident_id}`)}>
                    <td className="mono">{i.code}</td>
                    <td>
                      <div className="title truncate">{i.title}</div>
                      <div className="sub">{[i.category_name, [i.address?.split(',')[0], `W${i.ward}`].filter(Boolean).join(', ')].join(' · ')}</div>
                    </td>
                    <td><Priority p={i.priority} /></td>
                    <td className="hide-sm"><span className="row" style={{ gap: 4 }}><Icon name="link" size={15} />{i.report_count}</span></td>
                    <td className="hide-sm" style={{ whiteSpace: 'nowrap' }}>{timeAgo(i.opened_at)}{i.overdue && <span title="Past its response target" style={{ color: 'var(--st-reopened)' }}> ●</span>}</td>
                    <td>{i.needs_crew ? <span className="pill TRIAGE">Needs a crew</span> : <StatusPill incident={i} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <aside className="panel sticky">
            <div className="panel-map">
              <MapView center={{ lat: selected.latitude, lng: selected.longitude }} zoom={16}
                markers={[{ id: 1, lat: selected.latitude, lng: selected.longitude, label: selected.report_count, variant: selected.priority === 'P1' ? 'red' : 'hot' }]} interactive={false} />
            </div>
            <div className="panel-body">
              <div className="row between">
                <span className="mono small muted">{selected.code} · opened {timeAgo(selected.opened_at)} ago</span>
                <StatusPill incident={selected} />
              </div>
              <h2>{selected.title}</h2>
              <p className="muted small">{selected.address} · Ward {selected.ward} · {selected.report_count} report{selected.report_count > 1 ? 's' : ''}</p>
              {detail && detail.incident_id === selected.incident_id && (selected.needs_triage || selected.status === 'REOPENED') ? (
                <RecommendationCard inc={detail} />
              ) : (
                <dl className="kv">
                  <div><dt>Category</dt><dd>{selected.category_name}</dd></div>
                  <div><dt>Priority</dt><dd><Priority p={selected.priority} /></dd></div>
                  <div><dt>Department</dt><dd>{selected.department_name || '—'}</dd></div>
                  <div><dt>Crew</dt><dd>{selected.crew_name || '—'}</dd></div>
                </dl>
              )}
              <div className="row">
                <Link to={`${base}/${selected.incident_id}`} className="btn primary grow">
                  {readOnly ? 'Open incident' : selected.needs_triage ? 'Review & assign' : 'Open incident'}
                </Link>
                <Link to={`${base}/${selected.incident_id}#reports`} className="btn ghost">Linked reports</Link>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
