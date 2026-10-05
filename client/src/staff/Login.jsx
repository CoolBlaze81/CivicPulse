// Staff sign-in (design p.24, error p.28).
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLE_HOME } from '../lib/format.js';
import { Brand } from '../components/ui.jsx';

const DEMO = [
  ['Officer', 'Incident triage', 'OFF-101'],
  ['Department', 'Workload board', 'DEP-ROADS'],
  ['Field worker', 'Today’s jobs', 'CREW-R-4'],
  ['Municipal admin', 'City analytics', 'ADM-001'],
];

export default function StaffLogin() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const out = await api('/auth/staff', { method: 'POST', body: { staff_id: staffId, password } });
      signIn(out.token, out.user);
      navigate(ROLE_HOME[out.user.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-split">
      <div className="login-left">
        <Brand light />
        <h1>One incident.<br />Every report behind it.</h1>
        <p style={{ opacity: 0.8, fontSize: 17, maxWidth: 440 }}>Staff workspace for the MetroServe Municipal Operations Authority, North Delhi: officers, departments, field crews and administrators.</p>
        <div className="role-map">
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }}>Where each role lands · demo ID</span>
          {DEMO.map(([role, lands, id]) => (
            <div key={role}>
              <span>{role} <span style={{ opacity: 0.6 }}>→ {lands}</span></span>
              <button type="button" className="mono" style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setStaffId(id); setPassword('civicpulse'); }}>{id}</button>
            </div>
          ))}
        </div>
      </div>
      <div className="login-right">
        <form className="stack loose" onSubmit={submit}>
          <div className="stack tight">
            <h2 style={{ fontSize: 30 }}>Staff sign in</h2>
            <p className="muted">Your role is set by MSMO. You’ll land in your own workspace.</p>
          </div>
          {error && <div className="banner error" role="alert">{error}</div>}
          <label className="field">Staff ID
            <input className={`input mono ${error ? 'bad' : ''}`} value={staffId} onChange={(e) => setStaffId(e.target.value)} autoComplete="username" placeholder="OFF-101" />
          </label>
          <label className="field">
            <span className="row between">Password <span className="hint small">Forgot? Ask your MSMO administrator.</span></span>
            <input className={`input ${error ? 'bad' : ''}`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="btn primary lg block" disabled={busy || !staffId || !password}>Sign in</button>
          <p className="small muted">Demo password for every staff account: <span className="mono">civicpulse</span>. Tap a demo ID to fill it in. <Link to="/login">Citizen sign-in</Link></p>
        </form>
      </div>
    </div>
  );
}
