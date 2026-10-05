// Match review: reports the engine wasn't sure about (design p.26, BR-12).
import { useState } from 'react';
import { api } from '../api.js';
import { useApi, useNarrow, useToast } from '../lib/hooks.js';
import { meters, timeAgo, when, STATUS_LABEL } from '../lib/format.js';
import { Icon, Photo, ErrorNote, Spinner, Toast } from '../components/ui.jsx';
import { AllClearArt } from '../components/Illustrations.jsx';
import MapView from '../components/MapView.jsx';

export default function MatchReview() {
  const { data, error, reload } = useApi('/staff/match-reviews', { interval: 30000 });
  const [selectedId, setSelectedId] = useState(null);
  const [other, setOther] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const narrow = useNarrow();
  if (!data) return error ? <ErrorNote error={error} onRetry={reload} /> : <Spinner />;
  const m = data.find((x) => x.review_id === selectedId) || data[0];

  const decide = async (decision) => {
    setBusy(true);
    try {
      const out = await api(`/staff/match-reviews/${m.review_id}`, {
        method: 'POST', body: { decision, other_incident_id: decision === 'OTHER' ? other.replace(/\D/g, '') : undefined },
      });
      showToast(decision === 'NEW_INCIDENT' ? `Opened INC-${out.incident_id}.` : `${m.report_code} linked to INC-${out.incident_id}.`);
      setSelectedId(null);
      setShowOther(false);
      setOther('');
      reload();
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="staff-head">
        <div className="stack tight" style={{ gap: 2 }}>
          <h1>Match review</h1>
          <span className="muted">{data.length} report{data.length === 1 ? '' : 's'} the system wasn’t sure about · auto-link at 90%</span>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="panel empty">
          <AllClearArt />
          <h3>No matches to review</h3>
          <p className="muted">Reports scoring 90% or more link automatically; below 60% they open a new incident. Anything in between shows up here.</p>
        </div>
      ) : (
        <div className={narrow ? 'stack' : 'split'} style={narrow ? undefined : { gridTemplateColumns: '340px minmax(0, 1fr)' }}>
          <div className={`panel ${narrow ? 'queue-scroll' : ''}`}>
            {data.map((x) => (
              <button type="button" key={x.review_id} className={`queue-item ${x.review_id === m.review_id ? 'selected' : ''}`} onClick={() => setSelectedId(x.review_id)}>
                <div className="grow stack tight" style={{ gap: 3 }}>
                  <div className="row between"><span className="mono small">{x.report_code}</span><span className="score-badge">{Math.round(x.score * 100)}%</span></div>
                  <b className="truncate">{x.description}</b>
                  <span className="small muted">→ <span className="mono">{x.incident_code}</span> · {meters(x.signals.distance_m)} · {timeAgo(x.submitted_at)} ago</span>
                </div>
              </button>
            ))}
          </div>

          <div className="panel">
            <div className="panel-body">
              <div className="row between wrap" style={{ gap: 12 }}>
                <h2 style={{ fontSize: narrow ? 20 : undefined }}>Is this new report the same problem?</h2>
                <div className="row" style={{ gap: 10 }}><span className="confidence">{Math.round(m.score * 100)}%</span><span className="small muted" style={{ maxWidth: 130 }}>match confidence · auto-link at 90%</span></div>
              </div>
              <div className="compare">
                <div className="card grow stack tight">
                  <span className="eyebrow">New report · {m.report_code}</span>
                  <Photo src={m.photo_url} style={{ height: 110 }} />
                  <p>“{m.description}”</p>
                  <span className="small muted">{m.category_name} · {m.address || 'No address'} · {when(m.submitted_at)}</span>
                </div>
                <div className="card grow stack tight">
                  <span className="eyebrow">Candidate incident · {m.incident_code}</span>
                  <b>{m.incident_title}</b>
                  <p className="small">{m.incident_description}</p>
                  <span className="small muted">{m.incident_category_name} · {m.report_count} reports · first {when(m.incident_opened_at)} · {STATUS_LABEL[m.incident_status]}{m.crew_name ? ` · ${m.crew_name}` : ''}</span>
                </div>
              </div>
              <div style={{ height: 180, borderRadius: 14, overflow: 'hidden' }}>
                <MapView center={{ lat: m.incident_latitude, lng: m.incident_longitude }} zoom={16}
                  markers={[
                    { id: 'i', lat: m.incident_latitude, lng: m.incident_longitude, label: m.report_count, variant: 'hot' },
                    { id: 'r', lat: m.latitude, lng: m.longitude, label: '+' },
                  ]} />
              </div>
              <div className="stack tight">
                <b>Signals</b>
                <div className="signal">
                  <div><span className="small muted">Distance</span><b>{meters(m.signals.distance_m)}</b></div>
                  <div><span className="small muted">Category</span><b>{m.signals.category === 'same' ? `${m.category_name} =` : m.signals.category === 'related' ? 'Related' : 'Different'}</b></div>
                  <div><span className="small muted">Text similarity</span><b>{m.signals.text.toFixed(2)}</b></div>
                  <div><span className="small muted">Photo similarity</span><b>{m.signals.photo == null ? 'n/a' : m.signals.photo.toFixed(2)}</b></div>
                  <div><span className="small muted">Time gap</span><b>{m.signals.time_gap_h < 24 ? `${Math.round(m.signals.time_gap_h)} h` : `${Math.round(m.signals.time_gap_h / 24)} d`} after latest</b></div>
                </div>
              </div>
              {showOther && (
                <div className="row">
                  <input className="input mono" value={other} onChange={(e) => setOther(e.target.value)} placeholder="INC-1234" aria-label="Incident ID" />
                  <button type="button" className="btn primary" disabled={busy || !other.trim()} onClick={() => decide('OTHER')}>Link</button>
                </div>
              )}
              <div className="decide-row">
                <button type="button" className="btn primary" disabled={busy} onClick={() => decide('LINK')}>Link to {m.incident_code}</button>
                <button type="button" className="btn outline" disabled={busy} onClick={() => decide('NEW_INCIDENT')}>Create new incident</button>
                <button type="button" className="btn ghost" onClick={() => setShowOther(!showOther)}>Link to another…</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toast} />
    </>
  );
}
