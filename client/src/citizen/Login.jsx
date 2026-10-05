// Citizen sign-in with mobile number + 6-digit code (design p.2, p.12).
// SMS is out of scope (SRS 2.5), so the code is shown on screen.
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLE_HOME } from '../lib/format.js';
import { Brand, Icon } from '../components/ui.jsx';
import { CityArt } from '../components/Illustrations.jsx';
import { PhoneShell } from './Layout.jsx';

const STEPS = ['Snap a photo, drop a pin', 'We join you with neighbours who saw it too', 'You confirm the fix before it’s closed'];

// Phones: one column. Computers: navy intro panel beside the form.
function LoginFrame({ children, intro }) {
  return (
    <PhoneShell wide>
      <div className="cit-login">
        <section className={`cit-login-hero ${intro ? '' : 'desk-only-hero'}`}>
          <CityArt className="login-art" />
          <Brand />
          <h1>Report it once.<br />Watch it get fixed.</h1>
          <ol className="stack">
            {STEPS.map((t, i) => (
              <li key={t} className="row" style={{ '--i': i }}><span className="avatar">{i + 1}</span><span className="bold">{t}</span></li>
            ))}
          </ol>
        </section>
        <section className="cit-login-form">{children}</section>
      </div>
    </PhoneShell>
  );
}

function OtpBoxes({ value, onChange, bad }) {
  const refs = useRef([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  const set = (i, d) => {
    const next = digits.slice();
    next[i] = d || ' ';
    onChange(next.join('').replace(/\s+$/, ''));
  };
  return (
    <div className={`otp ${bad ? 'bad' : ''}`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          value={d.trim()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) { onChange(v.slice(0, 6)); refs.current[Math.min(5, v.length - 1)]?.focus(); return; }
            set(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus(); }}
        />
      ))}
    </div>
  );
}

export default function CitizenLogin() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [demo, setDemo] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const send = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const out = await api('/auth/otp', { method: 'POST', body: { phone } });
      setDemo(out.demo_code);
      setIsNew(out.is_new);
      setCode('');
      setStep('code');
      setResendIn(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const out = await api('/auth/otp/verify', { method: 'POST', body: { phone, code, name } });
      signIn(out.token, out.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      if (/too many|expired|new code/i.test(err.message)) setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'code') {
    return (
      <LoginFrame>
        <form className="stack loose" onSubmit={verify}>
          <h1>Enter the code</h1>
          <p className="muted">
            Sent to +91 {phone.replace(/\D/g, '').slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2')} ·{' '}
            <button type="button" className="link-btn" onClick={() => setStep('phone')}>Change</button>
          </p>
          {demo && (
            <div className="banner demo">
              Demo mode: SMS is out of scope for this prototype, so here is your code: <b className="mono">{demo}</b>
            </div>
          )}
          <OtpBoxes value={code} onChange={setCode} bad={!!error && /match/.test(error)} />
          {isNew && (
            <label className="field">
              Your name <span className="hint">New here? This creates your account.</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav Mehta" autoComplete="name" />
            </label>
          )}
          {error && <p className="error-text" role="alert">{error}</p>}
          <p className="muted small">
            Didn't get it?{' '}
            {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, '0')}` : <button type="button" className="link-btn" onClick={send}>Resend code</button>}
          </p>
          <button className="btn primary lg block" disabled={busy || code.length !== 6 || (isNew && !name.trim())}>Verify</button>
        </form>
      </LoginFrame>
    );
  }

  return (
    <LoginFrame intro>
      <div className="stack loose">
        <div className="stack tight">
          <h2>Sign in with your mobile</h2>
          <p className="muted small login-sub">Report problems on your street in North Delhi and follow them until they're fixed.</p>
        </div>
        <form className="stack" onSubmit={send}>
          <label className="field">
            Mobile number
            <div className="row">
              <span className="input" style={{ width: 70, display: 'grid', placeItems: 'center' }}>+91</span>
              <input className="input" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
            </div>
            <span className="hint login-hint">We’ll send a 6-digit code. New here? This creates your account.</span>
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn primary lg block" disabled={busy || phone.replace(/\D/g, '').length < 10}>{busy ? 'Sending…' : 'Send code'}</button>
        </form>
        <div className="or-divider"><span>or</span></div>
        <Link to="/staff/login" className="staff-entry">
          <span className="staff-entry-icon"><Icon name="building" size={22} /></span>
          <span className="grow stack tight" style={{ gap: 1 }}>
            <b>Municipal staff sign in</b>
            <span className="small muted">Officers, departments, field crews and admins</span>
          </span>
          <Icon name="chevron" size={18} />
        </Link>
      </div>
    </LoginFrame>
  );
}
