// Incident detail for staff: linked reports, classify, assign (design p.29),
// plus history, work log and verification state.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useNarrow, useToast } from '../lib/hooks.js';
import { meters, PRIORITY_HINT, PRIORITY_LABEL, STAGE_LABEL, timeAgo, timeLeft, when, ROLE_LABEL } from '../lib/format.js';
import { Icon, Meter, Photo, Priority, Spinner, StatusPill, Tabs, Toast } from '../components/ui.jsx';
import { LoadError } from '../components/ErrorPages.jsx';
import MapView from '../components/MapView.jsx';
import { RecommendationCard } from './Incidents.jsx';

const LINK_TEXT = { NEW: 'first report', AUTO: 'auto-linked', OFFICER: 'officer-linked', CITIZEN: 'reporter confirmed match' };

export function VerificationBox({ inc, onChange, canAct }) {
  const v = inc.verification;
  const [busy, setBusy] = useState(false);
  const act = async (path, body) => {
    setBusy(true);
    try { await api(path, { method: 'POST', body }); await onChange(); } finally { setBusy(false); }
  };
  if (inc.status !== 'AWAITING_VERIFICATION' && !v.total) return null;
  return (
    <div className="card stack">
      <div className="row between"><h3>Citizen verification</h3>{v.expires_at && <span className="small muted">{timeLeft(v.expires_at)}</span>}</div>
      <p className="small">{v.responded} of {v.total} reporter{v.total === 1 ? '' : 's'} answered · {v.fixed} fixed · {v.notFixed} not fixed. The majority decides; a tie reopens.</p>
      {v.responses?.filter((r) => r.feedback).map((r, i) => (
        <div key={i} className="banner error small">“{r.feedback}” <span className="muted">— {r.citizen_name}</span></div>
      ))}
      {canAct && inc.status === 'AWAITING_VERIFICATION' && (
        inc.needs_officer_verification ? (
          <div className="stack tight">
            <p className="small bold">No reporter answered in 72 h. Check the proof and decide.</p>
            <div className="row wrap">
              <button type="button" className="btn primary" disabled={busy} onClick={() => act(`/staff/incidents/${inc.incident_id}/officer-verify`, { close: true })}>Close as officer-verified</button>
              <button type="button" className="btn danger" disabled={busy} onClick={() => act(`/staff/incidents/${inc.incident_id}/officer-verify`, { close: false, reason: 'Officer rejected the resolution proof' })}>Reopen and reassign</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} disabled={busy}
            title="Demo helper: ends the 72-hour window now" onClick={() => act(`/staff/incidents/${inc.incident_id}/end-verification-window`)}>
            End window now (demo)
          </button>
        )
      )}
    </div>
  );
}

export function ProofCard({ inc }) {
  const p = inc.proof;
  if (!p) return null;
  const before = inc.reports.find((r) => r.photo_url);
  return (
    <div className="card stack">
      <h3>Resolution proof</h3>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="grow stack tight"><Photo src={before?.photo_url} style={{ height: 130 }} /><span className="tiny muted">Before · citizen</span></div>
        <div className="grow stack tight"><Photo src={p.photo_url} style={{ height: 130 }}>{!p.photo_url && <span className="small">No photo</span>}</Photo><span className="tiny muted">After · {when(p.created_at)}</span></div>
      </div>
      <p>“{p.note}”</p>
      <dl className="kv small">
        <div><dt>Proof location</dt><dd>{p.distance_m != null ? `${meters(p.distance_m)} from incident pin` : 'Not recorded'}</dd></div>
        <div><dt>Taken after assignment</dt><dd>{p.after_assignment ? 'Yes' : 'No'}</dd></div>
        <div><dt>New reports since resolution</dt><dd>{inc.new_reports_since_resolution || 'None'}</dd></div>
      </dl>
    </div>
  );
}

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: inc, error, reload } = useApi(`/staff/incidents/${id}`);
  const { data: meta } = useApi('/meta');
  const [toast, showToast] = useToast();
  const [categoryId, setCategoryId] = useState(null);
  const [priority, setPriority] = useState(null);
  const [title, setTitle] = useState('');
  const [deptId, setDeptId] = useState(null);
  const [crewId, setCrewId] = useState(null);
  const [crews, setCrews] = useState([]);
  const [suggested, setSuggested] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { hash } = useLocation();
  const [tab, setTab] = useState(hash === '#reports' ? 'reports' : 'overview');
  const narrow = useNarrow();

  const isOfficer = user.role === 'OFFICER';
  const isHead = user.role === 'DEPT_HEAD';

  useEffect(() => {
    if (!inc) return;
    setCategoryId(inc.category_id);
    setPriority(inc.priority);
    setTitle(inc.title);
    const d = inc.department_id || inc.rec_department_id;
    setDeptId(d);
    setCrews(inc.crews);
    setSuggested(inc.suggested_crew);
    setCrewId(inc.crew_id || inc.suggested_crew?.crew_id || null);
  }, [inc]);

  // Changing the category re-suggests the department that handles it.
  const onCategory = (cid) => {
    setCategoryId(cid);
    const dc = meta?.department_categories.find((x) => x.category_id === cid);
    if (dc && dc.department_id !== deptId) onDept(dc.department_id);
  };
  const onDept = async (did) => {
    setDeptId(did);
    setCrewId(null);
    const out = await api(`/staff/departments/${did}/crews?ward=${inc.ward}`);
    setCrews(out.crews);
    setSuggested(out.suggested);
    setCrewId(out.suggested?.crew_id || null);
  };

  if (error) return <LoadError error={error} onRetry={reload} home={{ OFFICER: '/officer', DEPT_HEAD: '/dept', ADMIN: '/admin/incidents' }[user.role]} />;
  if (!inc || !meta) return <Spinner />;

  const canAssign = (isOfficer || (isHead && user.department_id === deptId)) && !['CLOSED', 'AWAITING_VERIFICATION'].includes(inc.status);
  const crew = crews.find((c) => c.crew_id === crewId);

  const unlink = async (reportId) => {
    try {
      const out = await api(`/staff/reports/${reportId}/unlink`, { method: 'POST' });
      showToast(`Unlinked. It is now ${out.code}.`);
      reload();
    } catch (e) { showToast(e.message); }
  };

  const assign = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/staff/incidents/${inc.incident_id}/assign`, {
        method: 'POST',
        body: { department_id: deptId, crew_id: crewId, ...(isOfficer ? { category_id: categoryId, priority, title } : {}) },
      });
      showToast(crew ? `Assigned to ${crew.name}. The crew and reporters were notified.` : 'Routed to the department.');
      reload();
      if (narrow) setTab('overview');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const saveClassification = async () => {
    setBusy(true);
    try {
      await api(`/staff/incidents/${inc.incident_id}/classify`, { method: 'POST', body: { category_id: categoryId, priority, title } });
      showToast('Classification saved.');
      reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const sidePanels = (
    <>
      {(inc.needs_triage || inc.status === 'REOPENED') && <RecommendationCard inc={{ ...inc, suggested_crew: suggested }} />}

      {isOfficer && inc.status !== 'CLOSED' && (
        <div className="card stack">
          <div className="row between"><h3>Classify</h3><span className="small muted">{inc.triaged ? 'Reviewed' : 'Pre-filled by system'}</span></div>
          <label className="field">Title<input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field">Category
            <select className="input" value={categoryId || ''} onChange={(e) => onCategory(Number(e.target.value))}>
              {meta.categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </label>
          <div className="stack tight">
            <b className="small">Priority</b>
            <div className="prio-seg">
              {['P1', 'P2', 'P3', 'P4'].map((p) => (
                <button type="button" key={p} className={priority === p ? 'on' : ''} onClick={() => setPriority(p)} title={PRIORITY_HINT[p]}>{p}</button>
              ))}
            </div>
            <span className="small muted">{PRIORITY_LABEL[priority]} · {PRIORITY_HINT[priority]}</span>
          </div>
          {!canAssign && <button type="button" className="btn outline" disabled={busy} onClick={saveClassification}>Save classification</button>}
        </div>
      )}

      {canAssign ? (
        <div className="card stack">
          <h3>Assign</h3>
          <label className="field">Department
            <select className="input" value={deptId || ''} disabled={isHead} onChange={(e) => onDept(Number(e.target.value))}>
              {meta.departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
            </select>
          </label>
          <b className="small">Crew · current load</b>
          <div className="stack tight">
            {crews.map((c) => {
              const off = c.availability !== 'ON_DUTY';
              return (
                <label key={c.crew_id} className={`crew-option ${crewId === c.crew_id ? 'on' : ''}`} style={off ? { opacity: 0.5 } : undefined}>
                  <span className="row" style={{ minWidth: 0 }}>
                    <input type="radio" name="crew" disabled={off} checked={crewId === c.crew_id} onChange={() => setCrewId(c.crew_id)} />
                    <span className="stack tight" style={{ gap: 0, minWidth: 0 }}>
                      <b>{c.name}{suggested?.crew_id === c.crew_id ? <span className="small" style={{ color: 'var(--violet)' }}> · suggested</span> : ''}</b>
                      <span className="tiny muted">Wards {c.zone} · {off ? c.availability.replace('_', ' ').toLowerCase() : c.skills}</span>
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6, flex: 'none' }}><Meter load={c.load} max={c.max_load} /><span className="mono tiny">{c.load}/{c.max_load}</span></span>
                </label>
              );
            })}
          </div>
          {suggested && <span className="small muted">{suggested.reason}</span>}
          {err && <p className="error-text">{err}</p>}
          <button type="button" className="btn primary lg" disabled={busy || !deptId} onClick={assign}>
            {crew ? `Assign to ${crew.name} & notify` : 'Route to department'}
          </button>
        </div>
      ) : (
        <div className="card stack tight">
          <h3>Assignment</h3>
          <dl className="kv">
            <div><dt>Department</dt><dd>{inc.department_name || '—'}</dd></div>
            <div><dt>Crew</dt><dd>{inc.crew_name || '—'}</dd></div>
            <div><dt>Priority</dt><dd><Priority p={inc.priority} /></dd></div>
            <div><dt>Work stage</dt><dd>{STAGE_LABEL[inc.work_stage] || '—'}</dd></div>
          </dl>
          {isHead && inc.department_id !== user.department_id && <p className="small muted">This incident belongs to another department.</p>}
        </div>
      )}
      {user.role === 'ADMIN' && <p className="small muted">Municipal admins can view incidents but not change them.</p>}
    </>
  );

  const reportsPanel = (
    <section className="panel" id="reports">
      <div className="panel-body" style={{ paddingBottom: 6 }}>
        <h3>Linked reports <span className="muted">{inc.reports.length}</span></h3>
        <p className="small muted">Each report stays traceable.{isOfficer && ' Unlink one if the match is wrong; it becomes its own incident.'}</p>
      </div>
      {inc.reports.map((r) => (
        <div key={r.report_id} className="report-item">
          <Photo src={r.photo_url} className="thumb" />
          <div className="grow stack tight" style={{ gap: 3, minWidth: 0 }}>
            <span>“{r.description}”</span>
            <span className="small muted">
              <span className="mono">{r.code}</span> · {LINK_TEXT[r.link_method] || 'waiting'}{r.match_score != null && r.link_method !== 'NEW' ? ` ${Math.round(r.match_score * 100)}%` : ''} · {r.citizen_name} · {when(r.submitted_at)}
            </span>
          </div>
          {isOfficer && inc.reports.length > 1 && inc.status !== 'CLOSED' && (
            <button type="button" className="btn ghost sm" onClick={() => unlink(r.report_id)}>Unlink</button>
          )}
        </div>
      ))}
    </section>
  );

  const historyPanel = (
    <>
      <section className="card stack">
        <h3>Status history</h3>
        <ul className="timeline">
          {inc.history.map((h) => (
            <li key={h.history_id}>
              <b>{h.from_status !== h.to_status && h.from_status ? <><StatusPill status={h.to_status} /> </> : null}{h.reason}</b>
              <div className="small muted">{when(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name} (${ROLE_LABEL[h.changed_by_role]})` : ' · system'}</div>
            </li>
          ))}
        </ul>
      </section>
      {inc.assignments.length > 0 && (
        <div className="card stack tight">
          <h3>Assignment history</h3>
          {inc.assignments.map((a) => (
            <div key={a.assignment_id} className="small">
              <b>{a.department_name}{a.crew_name ? ` · ${a.crew_name}` : ''}</b>{a.is_current ? ' (current)' : ''}
              <div className="muted">{when(a.assigned_at)} · by {a.assigned_by_name || 'system'}</div>
            </div>
          ))}
        </div>
      )}
      {inc.work_updates.length > 0 && (
        <div className="card stack tight">
          <h3>Work log</h3>
          {inc.work_updates.map((w) => (
            <div key={w.update_id} className="small">
              <b>{STAGE_LABEL[w.stage]}</b> · {w.crew_name || w.worker_name}{w.note ? ` — ${w.note}` : ''}
              <div className="muted">{when(w.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const overviewPanel = (
    <>
      <div className="panel" style={{ height: narrow ? 200 : 240 }}>
        <MapView center={{ lat: inc.latitude, lng: inc.longitude }} zoom={17}
          markers={inc.reports.map((r) => ({ id: r.report_id, lat: r.latitude, lng: r.longitude, label: '', variant: 'hot' }))}
          dot={{ lat: inc.latitude, lng: inc.longitude }} />
      </div>
      <div className="card">
        <dl className="kv facts">
          <div><dt>Category</dt><dd>{inc.category_name}</dd></div>
          <div><dt>Priority</dt><dd><Priority p={inc.priority} /></dd></div>
          <div><dt>Department</dt><dd>{inc.department_name || '—'}</dd></div>
          <div><dt>Crew</dt><dd>{inc.crew_name || '—'}{inc.work_stage ? ` · ${STAGE_LABEL[inc.work_stage]}` : ''}</dd></div>
          <div><dt>Reports</dt><dd>{inc.report_count}</dd></div>
          <div><dt>Opened</dt><dd>{when(inc.opened_at)}</dd></div>
        </dl>
        {inc.description && <p className="small" style={{ marginTop: 12 }}>{inc.description}</p>}
      </div>
      {narrow && (inc.needs_triage || inc.status === 'REOPENED') && canAssign && (
        <button type="button" className="btn primary lg block" onClick={() => setTab('assign')}>Review recommendation & assign</button>
      )}
      <ProofCard inc={inc} />
      <VerificationBox inc={inc} onChange={reload} canAct={isOfficer} />
    </>
  );

  const tabs = [
    ['overview', 'Overview'],
    ['reports', 'Reports', inc.reports.length],
    ...(narrow ? [['assign', canAssign ? 'Assign' : 'Assignment']] : []),
    ['history', 'History'],
  ];
  const shown = !narrow && tab === 'assign' ? 'overview' : tab;

  return (
    <>
      <div className="detail-head">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Icon name="back" /></button>
        <div className="grow stack tight" style={{ gap: 4, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="mono small muted">{inc.code} · {inc.category_name}</span>
            <StatusPill incident={inc} />
          </div>
          <h1 className="detail-title">{inc.title}</h1>
          <span className="muted small">{inc.address} · Ward {inc.ward} · {inc.report_count} report{inc.report_count > 1 ? 's' : ''} · opened {timeAgo(inc.opened_at)} ago</span>
        </div>
      </div>

      <Tabs value={shown} onChange={setTab} tabs={tabs} className="fit" />

      <div className={narrow ? 'stack loose' : 'split'}>
        <div className="stack loose">
          {shown === 'overview' && overviewPanel}
          {shown === 'reports' && reportsPanel}
          {shown === 'history' && historyPanel}
          {shown === 'assign' && sidePanels}
        </div>
        {!narrow && <aside className="stack sticky">{sidePanels}</aside>}
      </div>
      <Toast msg={toast} />
    </>
  );
}
