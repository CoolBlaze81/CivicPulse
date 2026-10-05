// My account for staff and field crews: profile picture, name, password
// change and signing out of every device.
import { useEffect, useState } from 'react';
import { api, setToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../lib/hooks.js';
import { ROLE_LABEL, when } from '../lib/format.js';
import { Icon, Toast } from '../components/ui.jsx';
import AvatarEditor from '../components/AvatarEditor.jsx';

export default function Account() {
  const { user, refresh, signOut } = useAuth();
  const [toast, showToast] = useToast();
  const [name, setName] = useState(user?.name || '');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [pwErr, setPwErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(user?.name || ''); }, [user?.name]);
  if (!user) return null;

  const saveName = async (e) => {
    e.preventDefault();
    try {
      await api('/me', { method: 'PATCH', body: { name } });
      await refresh();
      showToast('Name saved.');
    } catch (err) { showToast(err.message); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    setPwErr(null);
    if (pw.next !== pw.again) { setPwErr('The new passwords don’t match.'); return; }
    setBusy(true);
    try {
      const out = await api('/me/password', { method: 'POST', body: { current_password: pw.current, new_password: pw.next } });
      setToken(out.token); // this device stays signed in; every other one is signed out
      setPw({ current: '', next: '', again: '' });
      showToast('Password changed. Other devices were signed out.');
    } catch (err) { setPwErr(err.message); } finally { setBusy(false); }
  };
  const everywhere = async () => {
    try {
      await api('/auth/signout-all', { method: 'POST' });
      signOut();
    } catch (err) { showToast(err.message); }
  };
  const scope = user.crew ? `${user.crew.name} · ${user.department?.name}` : user.department ? user.department.name : user.wards ? `Wards ${user.wards}` : 'Whole city';

  return (
    <div className="stack loose account-page">
      <div className="staff-head"><h1>My account</h1></div>
      <div className="card profile-head">
        <AvatarEditor onMessage={showToast} />
        <div className="stack tight" style={{ gap: 3, minWidth: 0 }}>
          <h2 className="truncate">{user.name}</h2>
          <span className="small muted">{ROLE_LABEL[user.role]} · <span className="mono">{user.staff_id}</span></span>
          <span className="small muted">{scope}</span>
          {user.last_login_at && <span className="tiny muted">Last sign-in {when(user.last_login_at)}</span>}
        </div>
      </div>

      <div className="two-col">
        <form className="card stack" onSubmit={saveName}>
          <h3>Profile</h3>
          <label className="field">Display name<input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field">Staff ID<input className="input mono" value={user.staff_id || ''} disabled /></label>
          <span className="small muted">Your role and staff ID are set by the MSMO administrator.</span>
          <button className="btn outline" disabled={name.trim() === user.name || name.trim().length < 2}>Save name</button>
        </form>

        <form className="card stack" onSubmit={changePw}>
          <h3 className="row" style={{ gap: 8 }}><Icon name="key" size={18} /> Change password</h3>
          <label className="field">Current password<input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label className="field">New password <span className="hint">At least 8 characters with a letter and a number.</span>
            <input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          <label className="field">Repeat new password<input className="input" type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></label>
          {pwErr && <p className="error-text" role="alert">{pwErr}</p>}
          <button className="btn primary" disabled={busy || !pw.current || !pw.next || !pw.again}>{busy ? 'Saving…' : 'Change password'}</button>
        </form>
      </div>

      <div className="card stack">
        <h3>Sessions</h3>
        <p className="small muted">Lost a phone or signed in on a shared computer? Sign out everywhere, then sign in again here.</p>
        <div className="row wrap">
          <button type="button" className="btn ghost" onClick={signOut}><Icon name="logout" size={18} /> Sign out</button>
          <button type="button" className="btn danger" onClick={everywhere}>Sign out on all devices</button>
        </div>
      </div>
      <Toast msg={toast} />
    </div>
  );
}
