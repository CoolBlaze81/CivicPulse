// New report (design p.4, validation p.14, location p.15, offline p.16).
// Photo, description, category and location are required (FR-09, FR-10,
// FR-12; the photo is required by project decision, design p.14). Without a
// connection the report is queued on the phone and sent later.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formOf } from '../api.js';
import { compressImage } from '../lib/image.js';
import { outboxAvailable, queueReport } from '../lib/outbox.js';
import { useAuth } from '../auth.jsx';
import { DEMO_HOME, getLocation, useApi } from '../lib/hooks.js';
import { meters, STATUS_LABEL } from '../lib/format.js';
import { Icon, Photo } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';

function LocationPicker({ start, onDone, onCancel }) {
  const [p, setP] = useState(start);
  return (
    <div className="picker">
      <div className="row picker-top">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back"><Icon name="back" /></button>
        <h3>Pick the spot on the map</h3>
      </div>
      <div style={{ flex: 1 }}>
        <MapView center={start} zoom={17} dot={p} onPick={setP} />
      </div>
      <div className="stack picker-bottom">
        <p className="muted small">Tap or click the map where the problem is. <span className="mono">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span></p>
        <button type="button" className="btn primary lg block" onClick={() => onDone(p)}>Use this spot</button>
      </div>
    </div>
  );
}

export default function NewReport() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const { data: meta } = useApi('/meta');
  // Categories are remembered so the form still works offline.
  const categories = useMemo(() => {
    if (meta?.categories) {
      try { localStorage.setItem('civicpulse.categories', JSON.stringify(meta.categories)); } catch { /* ignore */ }
      return meta.categories;
    }
    try { return JSON.parse(localStorage.getItem('civicpulse.categories')) || []; } catch { return []; }
  }, [meta]);

  const [photo, setPhoto] = useState(null);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  const [description, setDescription] = useState('');
  const [params] = useSearchParams();
  // Shortcut tiles on the home screen open this with ?category=<id>.
  const [categoryId, setCategoryId] = useState(() => Number(params.get('category')) || null);
  const [suggested, setSuggested] = useState([]);
  const [loc, setLoc] = useState(null);
  const [locState, setLocState] = useState('locating');
  const [address, setAddress] = useState('');
  const [addressTyped, setAddressTyped] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [match, setMatch] = useState(null);
  const [dismissed, setDismissed] = useState(null);
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    let live = true;
    getLocation().then((p) => {
      if (!live) return;
      setLoc(p);
      setLocState(p.source === 'gps' ? 'gps' : p.reason);
    });
    return () => { live = false; };
  }, []);

  // Street address from the GPS fix, unless the citizen typed their own.
  useEffect(() => {
    if (!loc || addressTyped || !['gps', 'map'].includes(loc.source)) return undefined;
    let live = true;
    api(`/geocode/reverse?lat=${loc.lat}&lng=${loc.lng}`)
      .then((out) => { if (live && out.address) setAddress(out.address); })
      .catch(() => { /* the citizen can type a landmark */ });
    return () => { live = false; };
  }, [loc, addressTyped]);

  const pickPhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhoto(await compressImage(file));
    setPhotoBusy(false);
    setProblems((ps) => ps.filter((p) => p.field !== 'photo'));
  };

  // Suggest categories from what the citizen typed (rule-based classifier).
  useEffect(() => {
    if (description.trim().length < 4) { setSuggested([]); return undefined; }
    const t = setTimeout(async () => {
      try {
        const s = await api('/reports/suggest', { method: 'POST', body: { description } });
        setSuggested(s);
        if (!categoryId && s[0]) setCategoryId(s[0].category_id);
      } catch { /* suggestions are optional */ }
    }, 350);
    return () => clearTimeout(t);
  }, [description]); // eslint-disable-line react-hooks/exhaustive-deps

  // "This looks already reported" check.
  useEffect(() => {
    if (!loc || !categoryId) { setMatch(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        const out = await api('/reports/check', {
          method: 'POST', body: { description, category_id: categoryId, latitude: loc.lat, longitude: loc.lng },
        });
        setMatch(out.match);
      } catch { setMatch(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [loc, categoryId, description]);

  const chips = useMemo(() => {
    const top = suggested.map((s) => categories.find((c) => c.category_id === s.category_id)).filter(Boolean);
    const rest = categories.filter((c) => !top.includes(c));
    return [...top, ...rest];
  }, [categories, suggested]);

  const problem = (field) => problems.find((p) => p.field === field);

  const submit = async (joinId) => {
    setBusy(true);
    setError(null);
    setProblems([]);
    const local = [];
    if (!photo) local.push({ field: 'photo', message: 'Add a photo of the problem.' });
    if (description.trim().length < 5) local.push({ field: 'description', message: 'Describe the problem in a few words.' });
    if (!categoryId) local.push({ field: 'category', message: 'Choose what kind of problem this is.' });
    if (!loc) local.push({ field: 'location', message: 'Add a location. Pick it on the map if GPS is off.' });
    if (local.length) { setProblems(local); setBusy(false); window.scrollTo(0, 0); return; }
    const fields = {
      description, category_id: categoryId, latitude: loc.lat, longitude: loc.lng, address,
      join_incident_id: joinId, not_incident_id: !joinId && dismissed ? dismissed : undefined,
    };
    try {
      const out = await api('/reports', { method: 'POST', form: formOf(fields, photo) });
      refresh();
      navigate(`/report/${out.report_id}/received`, { replace: true, state: out });
    } catch (e) {
      if (e.code === 'OFFLINE' && outboxAvailable()) {
        try {
          await queueReport(user.user_id, JSON.parse(JSON.stringify(fields)), photo);
          navigate('/reports', { replace: true, state: { queued: true } });
          return;
        } catch { /* fall through and show the offline error */ }
      }
      if (e.problems) setProblems(e.problems);
      setError(e.message);
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  };

  if (picking) {
    return <LocationPicker start={loc || DEMO_HOME} onCancel={() => setPicking(false)}
      onDone={(p) => { setLoc({ ...p, source: 'map' }); setLocState('map'); setPicking(false); }} />;
  }

  const showMatch = match && match.incident_id !== dismissed;
  const locLine = {
    gps: `GPS · accurate to ${loc?.accuracy ?? '?'} m`,
    map: 'Picked on the map',
    outside: 'Demo location in Kamla Nagar (you are outside North Delhi). Pick the spot on the map.',
    denied: 'Location is off, so we used the demo location. Pick the spot on the map.',
    unavailable: "GPS couldn't get a fix. Using the demo location; pick the spot on the map.",
    unsupported: 'This browser has no GPS. Pick the spot on the map.',
    locating: 'Finding your location…',
  }[locState];

  return (
    <>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Icon name="back" /></button>
        <h1>New report</h1>
      </div>

      {(problems.length > 0 || error) && (
        <div className="banner error" role="alert">
          <b>{problems.length > 0 ? `${problems.length} thing${problems.length > 1 ? 's' : ''} to fix before we can send this.` : error}</b>
          {problems.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{problems.map((p) => <li key={p.field}>{p.message}</li>)}</ul>}
        </div>
      )}

      <div className="desk-cols">
      <div>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <Photo src={photoUrl} className="grow" style={{ height: 150, ...(problem('photo') ? { outline: '2px solid var(--st-reopened)' } : {}) }}>
          <span className="tag"><Icon name="image" size={16} />{photoBusy ? 'Preparing…' : photo ? 'Your photo' : 'Photo (required)'}</span>
        </Photo>
        <button type="button" className={`card ${problem('photo') ? 'danger' : ''}`} style={{ width: 110, borderStyle: 'dashed', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          onClick={() => fileRef.current?.click()}>
          <span className="stack tight center"><Icon name="camera" size={26} /><b>{photo ? 'Change' : 'Add'}</b></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => pickPhoto(e.target.files?.[0])} />
      </div>
      {problem('photo') && <p className="error-text" style={{ marginTop: -8 }}>{problem('photo').message}</p>}

      <label className="field">
        What’s wrong?
        <textarea className={`input ${problem('description') ? 'bad' : ''}`} value={description} maxLength={1000}
          onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Deep pothole in the left lane, two-wheelers swerving into traffic" />
      </label>

      <div className="stack tight">
        <div className="row between">
          <b>What is it?</b>
          {suggested.length > 0 && <span className="small" style={{ color: 'var(--violet)', fontWeight: 600 }}><Icon name="sparkle" size={14} /> Suggested from your description</span>}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          {chips.slice(0, suggested.length ? Math.max(3, suggested.length) : categories.length).map((c) => (
            <button type="button" key={c.category_id} className={`chip ${categoryId === c.category_id ? 'on' : ''}`} onClick={() => setCategoryId(c.category_id)}>{c.name}</button>
          ))}
          {suggested.length > 0 && chips.length > 3 && (
            <select className="chip" value="" onChange={(e) => setCategoryId(Number(e.target.value))} aria-label="Other category">
              <option value="">Other…</option>
              {chips.slice(Math.max(3, suggested.length)).map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          )}
        </div>
        {problem('category') && <p className="error-text">{problem('category').message}</p>}
      </div>
      </div>

      <div className="stick">

      <div className={`card loc-card ${problem('location') ? 'danger' : ''}`} style={{ padding: 12 }}>
        <div className="row">
          <div className="loc-thumb">
            <MapView center={loc} zoom={16} dot={loc} interactive={false} />
          </div>
          <div className="grow stack tight" style={{ gap: 2 }}>
            <input className="input" style={{ minHeight: 36, padding: '6px 10px' }} value={address}
              onChange={(e) => { setAddress(e.target.value); setAddressTyped(true); }}
              placeholder="Landmark or address (optional)" aria-label="Landmark or address" />
            <span className="mono tiny muted">{locLine}</span>
          </div>
          <button type="button" className="link-btn" onClick={() => setPicking(true)}>Edit</button>
        </div>
      </div>

      {showMatch && (
        <div className="card violet stack">
          <b style={{ color: 'var(--violet)' }} className="row"><Icon name="link" size={18} /> This looks already reported</b>
          <div className="row">
            <Photo className="thumb" />
            <div className="stack tight" style={{ gap: 2 }}>
              <b>{match.title}</b>
              <span className="small muted">{meters(match.distance_m)} away · {match.report_count} report{match.report_count > 1 ? 's' : ''} · <span style={{ color: 'var(--st-progress)', fontWeight: 600 }}>{STATUS_LABEL[match.status]}</span></span>
            </div>
          </div>
          <div className="row">
            <button type="button" className="btn violet grow" disabled={busy || photoBusy} onClick={() => submit(match.incident_id)}>Add my report to it</button>
            <button type="button" className="btn ghost" style={{ borderColor: '#cfc3f5', color: 'var(--violet)' }} onClick={() => setDismissed(match.incident_id)}>Different issue</button>
          </div>
        </div>
      )}

      <button type="button" className="btn primary lg block" disabled={busy || photoBusy} onClick={() => submit(null)} style={{ marginTop: 'auto' }}>
        {busy ? 'Sending…' : showMatch ? 'Submit as new report' : 'Send report'}
      </button>
      </div>
      </div>
    </>
  );
}
