// Field worker job detail: progress + resolution proof (design p.11, FR-33..FR-36).
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formOf } from '../api.js';
import { getLocation, useApi } from '../lib/hooks.js';
import { PRIORITY_LABEL, STAGE_LABEL, when } from '../lib/format.js';
import { Icon, Photo, Spinner } from '../components/ui.jsx';
import { LoadError } from '../components/ErrorPages.jsx';
import MapView from '../components/MapView.jsx';

const STAGES = ['EN_ROUTE', 'ON_SITE', 'WORKING', 'RESOLVED'];

export default function Job() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: inc, error, reload } = useApi(`/staff/incidents/${id}`);
  const [photo, setPhoto] = useState(null);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef();

  if (error) return <LoadError error={error} onRetry={reload} home="/field" />;
  if (!inc) return <Spinner />;

  const current = STAGES.indexOf(inc.work_stage);
  const active = ['ASSIGNED', 'IN_PROGRESS'].includes(inc.status);
  const photos = inc.reports.filter((r) => r.photo_url);

  const post = async (stage) => {
    setBusy(true);
    setErr(null);
    try {
      const pos = await getLocation({ timeout: 5000 });
      const loc = pos.source === 'gps' ? { latitude: pos.lat, longitude: pos.lng } : {};
      const out = await api(`/field/incidents/${id}/progress`, {
        method: 'POST', form: formOf({ stage, note: stage === 'RESOLVED' ? note : undefined, ...loc }, stage === 'RESOLVED' ? photo : null),
      });
      if (stage === 'RESOLVED') navigate(`/field/jobs/${id}/done`, { replace: true, state: out });
      else reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="map-hero">
        <MapView center={{ lat: inc.latitude, lng: inc.longitude }} zoom={17} dot={{ lat: inc.latitude, lng: inc.longitude }} interactive={false} />
        <button type="button" className="icon-btn" onClick={() => navigate('/field')} aria-label="Back"><Icon name="back" /></button>
      </div>
      <div className="sheet">
        <span className="mono small muted">{inc.code} · {inc.priority} {PRIORITY_LABEL[inc.priority]}</span>
        <h1>{inc.title}</h1>
        <p>{inc.description}</p>
        <p className="small muted">{inc.address}</p>
        <a className="btn ghost sm" style={{ alignSelf: 'flex-start' }} target="_blank" rel="noreferrer"
          href={`https://www.openstreetmap.org/directions?to=${inc.latitude}%2C${inc.longitude}`}><Icon name="route" size={16} /> Directions</a>

        <div className="card row">
          <div className="avatars">
            {photos.slice(0, 3).map((r) => <span key={r.report_id} style={{ backgroundImage: `url(${r.photo_url})`, backgroundSize: 'cover' }} />)}
            {inc.report_count > Math.min(3, photos.length) && <span className="more">+{inc.report_count - Math.min(3, photos.length)}</span>}
          </div>
          <p className="small">{inc.report_count} citizen report{inc.report_count > 1 ? 's' : ''} linked · {photos.length} photo{photos.length === 1 ? '' : 's'}</p>
        </div>
        <details className="card">
          <summary className="bold" style={{ cursor: 'pointer' }}>What citizens said</summary>
          <ul className="stack tight" style={{ paddingLeft: 18, marginTop: 10 }}>
            {inc.reports.map((r) => <li key={r.report_id}>“{r.description}”</li>)}
          </ul>
        </details>

        <h3>Progress</h3>
        <div className="stack tight">
          {STAGES.slice(0, 3).map((s, i) => (
            <button type="button" key={s} disabled={!active || busy || i <= current} onClick={() => post(s)}
              className={`crew-option ${i <= current ? 'on' : ''}`} style={{ textAlign: 'left' }}>
              <span className="row"><Icon name={i <= current ? 'check' : 'chevron'} size={18} />{STAGE_LABEL[s]}</span>
              <span className="small muted">{i <= current ? 'Done' : i === current + 1 ? 'Tap to update' : ''}</span>
            </button>
          ))}
        </div>

        {active ? (
          <>
            <h3>Resolution proof</h3>
            <div className="row" style={{ alignItems: 'stretch' }}>
              <Photo src={photoUrl} className="grow" style={{ height: 140 }}>{!photo && <span className="small muted" style={{ padding: 12, textAlign: 'center' }}>Location is recorded with the photo</span>}</Photo>
              <button type="button" className="card" style={{ width: 120, borderStyle: 'dashed', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
                <span className="stack tight center"><Icon name="camera" size={26} /><b className="small">Take “after” photo</b></span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </div>
            <label className="field">Work note
              <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was fixed, materials used" />
            </label>
            {err && <p className="error-text" role="alert">{err}</p>}
            <button type="button" className="btn primary lg block" disabled={busy || !note.trim()} onClick={() => post('RESOLVED')}>
              <Icon name="check" /> Mark resolved
            </button>
            {!photo && <p className="small muted center">A photo helps citizens verify the fix quickly.</p>}
          </>
        ) : (
          <div className="banner info">This job is {inc.status === 'AWAITING_VERIFICATION' ? 'waiting for citizen verification' : inc.status.toLowerCase().replace('_', ' ')}.</div>
        )}

        {inc.work_updates.length > 0 && (
          <>
            <h3>Log</h3>
            <ul className="timeline">
              {inc.work_updates.map((w) => (
                <li key={w.update_id}><b>{STAGE_LABEL[w.stage]}</b>{w.note && <div>{w.note}</div>}<div className="small muted">{when(w.created_at)} · {w.worker_name}</div></li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
