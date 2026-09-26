// Nearby map (design p.8): open incidents within 1 km, "I see it too".
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, formOf } from '../api.js';
import { useAuth } from '../auth.jsx';
import { getLocation, useApi } from '../lib/hooks.js';
import { meters } from '../lib/format.js';
import { Spinner, StatusPill, Toast } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';

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
      <div style={{ height: 340, margin: '-20px -20px 0', position: 'relative' }}>
        <MapView center={here} zoom={15} dot={here} radius={1000}
          markers={list.map((i) => ({ id: i.incident_id, lat: i.latitude, lng: i.longitude, label: i.report_count, variant: variant(i), onClick: () => setSelected(i.incident_id) }))} />
      </div>
      {here.source === 'demo' && <div className="banner demo small">Showing the demo neighbourhood (Sector 14, MetroServe) because your device is {here.reason === 'outside' ? 'outside the demo city' : 'not sharing its location'}.</div>}
      <div className="row" style={{ gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {Object.keys(FILTERS).map((f) => (
          <button type="button" key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="row between">
        <b>{list.length} open within 1 km</b>
        <span className="small muted">Pin number = reports</span>
      </div>
      {!data ? <Spinner /> : list.length === 0 ? (
        <p className="muted">Nothing open nearby. <Link to="/report/new">Report an issue</Link></p>
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
      <Toast msg={toast} />
    </>
  );
}
