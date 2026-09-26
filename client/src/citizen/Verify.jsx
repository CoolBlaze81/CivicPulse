// Citizen verification (design p.9, outcomes p.18 and p.19).
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formOf } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../lib/hooks.js';
import { dayMonth, when, timeLeft, meters } from '../lib/format.js';
import { Icon, Photo, Spinner } from '../components/ui.jsx';
import { LoadError } from '../components/ErrorPages.jsx';

function Outcome({ inc, result, fixed, feedback }) {
  const closed = result.outcome === 'CLOSED';
  const reopened = result.outcome === 'REOPENED';
  return (
    <div className="done-screen">
      <div className={`done-icon ${fixed ? '' : 'warn'}`}><Icon name={fixed ? 'check' : 'refresh'} size={34} stroke={2.2} /></div>
      {fixed ? (
        <>
          <h1>{closed ? 'Thanks — it’s closed' : 'Thanks for checking'}</h1>
          <p style={{ fontSize: 17 }}>
            You confirmed “{inc.title}” is fixed.{' '}
            {closed ? `${result.fixed} of ${result.total} neighbours agreed, so ${inc.code} is now closed.`
              : `We’re waiting for the other reporters (${result.responded} of ${result.total} answered). The majority decides.`}
          </p>
        </>
      ) : (
        <>
          <h1>{reopened ? 'Reopened — back in the queue' : 'Thanks — we’ve noted it'}</h1>
          <p style={{ fontSize: 17 }}>
            {reopened ? 'Your note went to the officer for this ward. The incident is reopened and will be reassigned. We’ll update you when a crew is on it.'
              : `Your answer counts. The other reporters have until the window closes (${result.responded} of ${result.total} answered); a tie reopens it.`}
          </p>
          {feedback && <div className="card"><p>“{feedback}”</p><span className="mono small muted">{inc.code} · your feedback</span></div>}
        </>
      )}
      <div className="stack">
        <Link to={`/incident/${inc.incident_id}`} className="btn primary lg block">{fixed ? 'See the incident' : 'Track incident'}</Link>
        <Link to="/" className="btn ghost lg block">Back to home</Link>
      </div>
    </div>
  );
}

export default function Verify() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { data: inc, error, reload } = useApi(`/citizen/incidents/${id}`);
  const [feedback, setFeedback] = useState('');
  const [photo, setPhoto] = useState(null);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const [answer, setAnswer] = useState(null);
  const fileRef = useRef();

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!inc) return <Spinner />;
  if (result) return <Outcome inc={inc} result={result} fixed={answer} feedback={feedback} />;

  const v = inc.verification;
  const open = inc.status === 'AWAITING_VERIFICATION' && v.mine && !v.mine.response && !inc.needs_officer_verification;
  const before = inc.my_reports.find((r) => r.photo_url) || inc.my_reports[0];

  const respond = async (fixed) => {
    if (!fixed && !feedback.trim()) { setErr("Tell us what's still wrong so the crew knows what to fix."); return; }
    setBusy(true);
    setErr(null);
    try {
      const out = await api(`/incidents/${id}/verify`, { method: 'POST', form: formOf({ fixed, feedback: feedback.trim() || undefined }, photo) });
      setAnswer(fixed);
      setResult(out);
      refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Icon name="back" /></button>
        <div className="stack tight" style={{ gap: 0 }}>
          <span className="mono small muted">{inc.code}</span>
          <b>{open ? 'Awaiting your verification' : 'Verification'}</b>
        </div>
      </div>
      <h1>Is it fixed?</h1>
      <p className="muted">{inc.title}{inc.address ? ` · ${inc.address}` : ''}</p>
      {open ? (
        <div className="row small" style={{ gap: 16 }}>
          <b style={{ color: 'var(--pulse)' }}>{timeLeft(v.expires_at)} to respond</b>
          <span className="muted">{v.responded} of {v.total} reporter{v.total > 1 ? 's' : ''} answered</span>
        </div>
      ) : (
        <div className="banner info">
          {v.mine?.response ? `You already answered: ${v.mine.response === 'FIXED' ? 'fixed' : 'not fixed'}.` : 'This incident is not waiting for your verification.'}
        </div>
      )}

      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="grow stack tight">
          <b className="small">Before</b>
          <Photo src={before?.photo_url} style={{ height: 150 }} />
          <span className="tiny muted">Your report · {dayMonth(before?.submitted_at)}</span>
        </div>
        <div className="grow stack tight">
          <b className="small">After</b>
          <Photo src={inc.proof?.photo_url} style={{ height: 150 }}>{!inc.proof?.photo_url && <span className="small">No photo</span>}</Photo>
          <span className="tiny muted">Crew proof · {when(inc.proof?.created_at)}</span>
        </div>
      </div>
      {inc.proof && (
        <div className="card stack tight">
          <p>“{inc.proof.note}”</p>
          <span className="small muted">{inc.crew_name}{inc.department_name ? ` · ${inc.department_name}` : ''}</span>
          {inc.proof.distance_m != null && <span className="small" style={{ color: 'var(--st-closed)', fontWeight: 600 }}><Icon name="pin" size={14} /> Taken {meters(inc.proof.distance_m)} from the incident pin</span>}
        </div>
      )}

      {open && (
        <>
          <label className="field">
            Tell us more <span className="hint">Needed if it’s not fixed</span>
            <textarea className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="e.g. It flickers and goes off after 10 PM." />
          </label>
          <div className="row">
            <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()}><Icon name="camera" size={16} /> {photo ? 'Change photo' : 'Add a photo'}</button>
            {photoUrl && <Photo src={photoUrl} className="thumb" />}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
          </div>
          {err && <p className="error-text" role="alert">{err}</p>}
          <button type="button" className="btn primary lg block" disabled={busy} onClick={() => respond(true)}>Yes, it’s fixed — close it</button>
          <button type="button" className="btn danger lg block" disabled={busy} onClick={() => respond(false)}>Not fixed — reopen</button>
        </>
      )}
    </>
  );
}
