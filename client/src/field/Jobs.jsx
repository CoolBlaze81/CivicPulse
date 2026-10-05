// Field worker: today's jobs (design p.10, empty p.21).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { getLocation, useApi } from '../lib/hooks.js';
import { meters, STAGE_LABEL } from '../lib/format.js';
import { Icon, Spinner, StatusPill, ErrorNote } from '../components/ui.jsx';
import { CrewArt } from '../components/Illustrations.jsx';
import MapView from '../components/MapView.jsx';

export default function Jobs() {
  const { user } = useAuth();
  const [here, setHere] = useState(null);
  const [showMap, setShowMap] = useState(false);
  useEffect(() => { getLocation().then(setHere); }, []);
  const q = here ? `?lat=${here.lat}&lng=${here.lng}` : '';
  const { data, error, reload } = useApi(here ? `/field/jobs${q}` : null, { interval: 30000 });

  const jobs = data?.jobs || [];
  const crew = user?.crew;
  return (
    <>
      <div className="row between">
        <div className="stack tight" style={{ gap: 2 }}>
          <span className="small muted">{crew?.name} · {user?.department?.name}</span>
          <h1>Today’s jobs</h1>
        </div>
        <span className="pill CLOSED">On duty</span>
      </div>
      <ErrorNote error={error} onRetry={reload} hasData={!!data} />
      {!data ? <Spinner /> : (
        <>
          <div className="stat-row">
            <div className="stat"><b>{data.counts.assigned}</b><span className="small muted">Assigned</span></div>
            <div className="stat"><b>{data.counts.in_progress}</b><span className="small muted">In progress</span></div>
            <div className="stat"><b>{data.counts.done_today}</b><span className="small muted">Done today</span></div>
          </div>
          {jobs.length > 0 && (
            <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowMap(!showMap)}>
              <Icon name="route" size={16} /> {showMap ? 'Hide map' : 'Show jobs on map'}
            </button>
          )}
          {showMap && (
            <div style={{ height: 260, borderRadius: 16, overflow: 'hidden' }}>
              <MapView center={here} zoom={14} dot={here}
                markers={jobs.map((j) => ({ id: j.incident_id, lat: j.latitude, lng: j.longitude, label: j.priority, variant: j.priority === 'P1' ? 'red' : j.priority === 'P2' ? 'hot' : '' }))} />
            </div>
          )}
          {jobs.length === 0 ? (
            <div className="card stack center empty-card">
              <CrewArt />
              <h3>No jobs assigned</h3>
              <p className="muted">Nothing is assigned to {crew?.name} right now. New jobs show up here and in your alerts.</p>
              <button type="button" className="btn ghost" onClick={reload}><Icon name="refresh" size={16} /> Refresh</button>
            </div>
          ) : (
            <div className="stack">
              {jobs.map((j) => (
                <Link key={j.incident_id} to={`/field/jobs/${j.incident_id}`} className="card stack tight" style={{ textDecoration: 'none', color: 'inherit', gap: 6 }}>
                  <div className="row between">
                    <span className="row" style={{ gap: 8 }}>
                      <span className={`pill plain`} style={{ background: j.priority === 'P1' ? 'var(--st-reopened-bg)' : j.priority === 'P2' ? 'var(--pulse-50)' : '#efece4', color: `var(--${j.priority.toLowerCase()})` }}>{j.priority}</span>
                      <span className="mono small muted">{j.code}</span>
                    </span>
                    {j.distance_m != null && <span className="mono small muted">{meters(j.distance_m)}</span>}
                  </div>
                  <b style={{ fontSize: 17 }}>{j.title}</b>
                  <span className="small muted">{j.address}</span>
                  <span className="row wrap" style={{ gap: 8 }}>
                    <StatusPill status={j.status} />
                    <span className="small muted">{STAGE_LABEL[j.work_stage] || 'Not started'}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          {data.reopened.length > 0 && (
            <section className="stack tight">
              <span className="eyebrow">Reopened after your crew’s fix</span>
              {data.reopened.map((j) => (
                <div key={j.incident_id} className="card row between">
                  <div className="stack tight" style={{ gap: 2 }}><b>{j.title}</b><span className="mono small muted">{j.code} · waiting for reassignment</span></div>
                  <StatusPill status="REOPENED" />
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
