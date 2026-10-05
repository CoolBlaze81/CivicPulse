// Citizen home (design p.3, empty state p.13): report button, what needs
// the citizen, quick category shortcuts, their reports, what's happening
// nearby and how the city is doing.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { DEMO_AREA, getLocation, useApi } from '../lib/hooks.js';
import { durationDays, ago, meters } from '../lib/format.js';
import { Avatar, Brand, Icon, Photo, Spinner, StatusPill, ErrorNote } from '../components/ui.jsx';
import { CityArt, ReportsArt } from '../components/Illustrations.jsx';
import { OutboxBanner } from '../components/Outbox.jsx';
import MapView from '../components/MapView.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Icon and tint per category, for shortcuts and lists.
export const CATEGORY_LOOK = {
  Pothole: ['road', '#F0642E'], 'Damaged road': ['road', '#B7791F'], 'Road collapse': ['alert', '#C0262D'], Footpath: ['route', '#6B7080'],
  'Road markings': ['road', '#2450C9'], Waste: ['waste', '#1F7A3A'], Streetlight: ['bulb', '#B7791F'], Drainage: ['drop', '#0F766E'],
  'Water leakage': ['drop', '#2450C9'], 'Public property': ['building', '#5B3CC4'],
};
const QUICK = ['Pothole', 'Waste', 'Streetlight', 'Water leakage', 'Drainage', 'Footpath'];
const QUICK_LABEL = { 'Water leakage': 'Water leak', Waste: 'Garbage' };

export function CategoryIcon({ name, size = 20 }) {
  const [icon, color] = CATEGORY_LOOK[name] || ['pin', '#1B2559'];
  return <span className="cat-icon" style={{ color, background: `${color}1a` }}><Icon name={icon} size={size} /></span>;
}

export function ReportRow({ r }) {
  const others = (r.report_count || 1) - 1;
  const target = r.incident_id ? (r.awaiting_me ? `/incident/${r.incident_id}/verify` : `/incident/${r.incident_id}`) : null;
  const body = (
    <>
      <Photo src={r.photo_url} className="thumb" />
      <div className="grow stack tight" style={{ gap: 4 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <b className="grow clamp-2">{r.incident_title || r.description}</b>
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
      {target && <Icon name="chevron" size={18} className="muted" />}
    </>
  );
  return target ? <Link to={target} className="list-item">{body}</Link> : <div className="list-item">{body}</div>;
}

function SectionHead({ title, to, link }) {
  return (
    <div className="row between section-head">
      <h3>{title}</h3>
      {to && <Link to={to} className="link-btn small">{link}</Link>}
    </div>
  );
}

export default function CitizenHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi('/reports/mine', { interval: 30000, offline: true });
  const { data: meta } = useApi('/meta');
  const [here, setHere] = useState(null);
  useEffect(() => { getLocation({ timeout: 6000 }).then(setHere); }, []);
  const { data: nearby } = useApi(here ? `/incidents/nearby?lat=${here.lat}&lng=${here.lng}&radius=1500` : null);
  const { data: overview } = useApi(here ? `/citizen/overview?lat=${here.lat}&lng=${here.lng}` : null, { offline: true });

  const reports = data || [];
  const needsCheck = [];
  const seen = new Set();
  for (const r of reports) {
    if (r.awaiting_me && !seen.has(r.incident_id)) { seen.add(r.incident_id); needsCheck.push(r); }
  }
  const firstName = user?.name?.split(' ')[0] || '';
  const s = user?.stats || {};
  const catByName = Object.fromEntries((meta?.categories || []).map((c) => [c.name, c]));
  const city = overview?.city;
  const near = (nearby || []).slice(0, 3);

  return (
    <>
      <div className="row between desk-hide">
        <Brand />
        <Link to="/updates" className="icon-btn" aria-label={`Updates${user?.unread ? `, ${user.unread} new` : ''}`} style={{ position: 'relative' }}>
          <Icon name="bell" />
          {user?.unread > 0 && <span className="icon-badge">{user.unread > 9 ? '9+' : user.unread}</span>}
        </Link>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <Link to="/profile" aria-label="Your profile"><Avatar user={user} size={46} /></Link>
        <div className="stack tight grow" style={{ gap: 0 }}>
          <span className="muted small">{greeting()}</span>
          <h2>{firstName ? `Hi, ${firstName}` : 'Welcome'}</h2>
        </div>
      </div>

      <div className="desk-cols">
        <div>
          <div className="hero-card hero-art">
            <div className="stack" style={{ gap: 12, position: 'relative', zIndex: 1 }}>
              <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>North Delhi · CivicPulse</span>
              <h2>Spotted something<br />broken?</h2>
              <span style={{ opacity: 0.85 }}>Snap a photo and drop a pin. It takes under a minute, and we tell you when it's fixed.</span>
              <Link to="/report/new" className="btn lg"><Icon name="camera" /> Report an issue</Link>
            </div>
            <CityArt className="hero-city" />
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

          <section className="stack tight">
            <SectionHead title="What did you spot?" />
            <div className="quick-grid">
              {QUICK.map((name) => (
                <Link key={name} to={catByName[name] ? `/report/new?category=${catByName[name].category_id}` : '/report/new'} className="quick-tile">
                  <CategoryIcon name={name} size={22} />
                  <span>{QUICK_LABEL[name] || name}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="stack tight">
            <SectionHead title="Your reports" to={reports.length ? '/reports' : null} link={`See all ${reports.length}`} />
            {loading && !data ? <Spinner /> : reports.length === 0 ? (
              <div className="card stack center empty-card">
                <ReportsArt />
                <h3>No reports yet</h3>
                <p className="muted">When you report something, you’ll follow it here, from the first photo to the crew’s fix.</p>
                <Link to="/report/new" className="btn primary">Make your first report</Link>
              </div>
            ) : (
              <div className="card" style={{ padding: '4px 16px' }}>
                {reports.slice(0, 3).map((r) => <ReportRow key={r.report_id} r={r} />)}
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="stack tight">
            <SectionHead title="Your impact" />
            <div className="stat-row">
              <div className="stat"><b>{s.reports || 0}</b><span className="small muted">Reports</span></div>
              <div className="stat"><b>{s.fixed || 0}</b><span className="small muted">Fixed</span></div>
              <div className="stat"><b>{s.verified || 0}</b><span className="small muted">Fixes checked</span></div>
            </div>
          </section>

          <section className="stack tight">
            <SectionHead title="Happening near you" to="/nearby" link="Open map" />
            <div className="card near-card">
              <Link to="/nearby" className="near-map" aria-label="Open the nearby map">
                <MapView center={here} zoom={14} dot={here} interactive={false}
                  markers={(nearby || []).map((i) => ({ id: i.incident_id, lat: i.latitude, lng: i.longitude, label: i.report_count, variant: i.status === 'REOPENED' ? 'red' : i.report_count >= 5 ? 'hot' : '' }))} />
              </Link>
              <div className="near-list">
                <span className="small muted">
                  {!here ? 'Finding your location…' : nearby ? `${nearby.length} open within 1.5 km` : 'Loading…'}
                  {here?.source === 'demo' ? ` of ${DEMO_AREA} (demo location)` : ''}
                </span>
                {near.map((i) => (
                  <Link key={i.incident_id} to={`/incident/${i.incident_id}`} className="near-row">
                    <CategoryIcon name={i.category_name} size={18} />
                    <span className="grow stack tight" style={{ gap: 0, minWidth: 0 }}>
                      <b className="truncate">{i.title}</b>
                      <span className="row wrap" style={{ gap: 6 }}>
                        <StatusPill status={i.status} />
                        <span className="small muted">{meters(i.distance_m)} · {i.report_count} report{i.report_count > 1 ? 's' : ''}{i.mine ? ' · yours' : ''}</span>
                      </span>
                    </span>
                    <Icon name="chevron" size={16} className="muted" />
                  </Link>
                ))}
                {nearby && nearby.length === 0 && <span className="small">Nothing open near you right now.</span>}
              </div>
            </div>
          </section>

          {city && (
            <section className="stack tight">
              <SectionHead title="North Delhi, last 30 days" />
              <div className="pulse-grid">
                <div className="pulse-tile good"><b>{city.fixed_30d}</b><span>problems fixed</span></div>
                <div className="pulse-tile"><b>{city.median_close_days ?? '—'}<small> days</small></b><span>typical time to fix</span></div>
                <div className="pulse-tile"><b>{city.reports_30d}</b><span>reports from residents</span></div>
                <div className="pulse-tile violet"><b>{city.joined_30d}</b><span>joined an existing issue</span></div>
              </div>
            </section>
          )}

          {overview?.recent_fixes?.length > 0 && (
            <section className="stack tight">
              <SectionHead title="Recently fixed near you" />
              <div className="card" style={{ padding: '4px 16px' }}>
                {overview.recent_fixes.slice(0, 3).map((i) => (
                  <Link key={i.incident_id} to={`/incident/${i.incident_id}`} className="list-item">
                    <span className="fixed-check"><Icon name="check" size={18} stroke={2.4} /></span>
                    <span className="grow stack tight" style={{ gap: 2, minWidth: 0 }}>
                      <b className="truncate">{i.title}</b>
                      <span className="small muted">Fixed {ago(i.closed_at)} · took {durationDays(i.opened_at, i.closed_at)} · {meters(i.distance_m)} away</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="card stack how-card">
            <h3>How CivicPulse works</h3>
            {[
              ['camera', 'Report it', 'A photo and a pin. We suggest the category from your words.'],
              ['link', 'Neighbours join in', 'Reports of the same problem become one incident, so it rises in priority.'],
              ['wrench', 'A crew fixes it', 'You see every step, from assignment to the crew on site.'],
              ['check', 'You confirm', 'It only closes once the people who reported it agree it’s fixed.'],
            ].map(([icon, title, text]) => (
              <div key={title} className="row how-step">
                <span className="how-icon"><Icon name={icon} size={18} /></span>
                <span className="stack tight" style={{ gap: 0 }}><b>{title}</b><span className="small muted">{text}</span></span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
