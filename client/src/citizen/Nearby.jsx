// Nearby map (design p.8): open incidents within 1 km, "I see it too".
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, formOf } from '../api.js';
import { useAuth } from '../auth.jsx';
import { DEMO_AREA, getLocation, useApi } from '../lib/hooks.js';
import { meters } from '../lib/format.js';
import { Spinner, StatusPill, Toast } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';
import { MapArt } from '../components/Illustrations.jsx';

// Filter chips group categories the way citizens think about them.
const FILTERS = {
  All: null,
  Roads: ['Pothole', 'Damaged road', 'Road collapse', 'Footpath', 'Road markings'],
  Water: ['Water leakage', 'Drainage'],
  Lights: ['Streetlight'],
  Waste: ['Waste'],
  Other: ['Public property'],
};

export default function Nearby() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const [here, setHere] = useState(null);
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState(params.get('see') ? Number(params.get('see')) : null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { getLocation().then(setHere); }, []);
  const { data, reload } = useApi(here ? `/incidents/nearby?lat=${here.lat}&lng=${here.lng}&radius=1000` : null);
  const list = useMemo(
    () => (data || []).filter((i) => !FILTERS[filter] || FILTERS[filter].includes(i.category_name)),
    [data, filter]
  );

  const seeToo = async (inc) => {
    setBusy(inc.incident_id);
    try {
      const out = await api('/reports', {
        method: 'POST',
        form: formOf({
          description: `I see it too: ${inc.title}`, category_id: inc.category_id, latitude: inc.latitude, longitude: inc.longitude,
          address: inc.address, join_incident_id: inc.incident_id,
        }),
      });
      refresh();
      navigate(`/report/${out.report_id}/received`, { state: out });
    } catch (e) {
      setToast(e.message);
      setTimeout(() => setToast(null), 3000);
      reload();
    } finally {
      setBusy(null);
    }
  };

  if (!here) return <Spinner />;
  const variant = (i) => (i.status === 'REOPENED' ? 'red' : i.report_count >= 5 ? 'hot' : '');

  return (
    <>
      <div className="desk-cols map-left">
      <div className="stick">
      <div className="nearby-map">
        <MapView center={here} zoom={15} dot={here} radius={1000}
          markers={list.map((i) => ({ id: i.incident_id, lat: i.latitude, lng: i.longitude, label: i.report_count, variant: variant(i), onClick: () => setSelected(i.incident_id) }))} />
      </div>
      </div>
      <div>
      {here.source === 'demo' && <div className="banner demo small">Showing the demo neighbourhood ({DEMO_AREA}) because your device is {here.reason === 'outside' ? 'outside North Delhi' : 'not sharing its location'}.</div>}
      <div className="row chip-scroll" style={{ gap: 8, paddingBottom: 4 }}>
        {Object.keys(FILTERS).map((f) => (
          <button type="button" key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="row between">
        <b>{list.length} open within 1 km</b>
        <span className="small muted">Pin number = reports</span>
      </div>
      {!data ? <Spinner /> : list.length === 0 ? (
        <div className="card stack center empty-card">
          <MapArt />
          <h3>{filter === 'All' ? 'Nothing open within 1 km' : `No ${filter.toLowerCase()} problems open nearby`}</h3>
          <p className="muted">Spotted something? You could be the first to report it.</p>
          <Link to="/report/new" className="btn primary">Report an issue</Link>
        </div>
      ) : (
        <div className="stack">
          {[...list].sort((a, b) => (a.incident_id === selected ? -1 : b.incident_id === selected ? 1 : 0)).map((i) => (
            <div key={i.incident_id} className="card row" style={i.incident_id === selected ? { borderColor: 'var(--navy)' } : undefined}>
              <Link to={`/incident/${i.incident_id}`} className="grow stack tight" style={{ textDecoration: 'none', color: 'inherit', gap: 4 }}>
                <div className="row between"><b>{i.title}</b></div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <StatusPill status={i.status} />
                  <span className="small muted">{meters(i.distance_m)} · {i.report_count} report{i.report_count > 1 ? 's' : ''}</span>
                </div>
              </Link>
              {i.mine ? <span className="small muted">You reported</span> : (
                <button type="button" className="btn outline sm" disabled={busy === i.incident_id} onClick={() => seeToo(i)}>I see it too</button>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
      </div>
      <Toast msg={toast} />
    </>
  );
}
