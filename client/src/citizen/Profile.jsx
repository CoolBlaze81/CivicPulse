// Citizen profile (design p.17): picture, impact, account details.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../lib/hooks.js';
import { Icon, Toast } from '../components/ui.jsx';
import AvatarEditor from '../components/AvatarEditor.jsx';

export default function Profile() {
  const { user, refresh, signOut } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [area, setArea] = useState(user?.home_area || '');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, showToast] = useToast();
  useEffect(() => { setName(user?.name || ''); setArea(user?.home_area || ''); }, [user?.name, user?.home_area]);
  if (!user) return null;

  const dirty = name.trim() !== user.name || (area || '') !== (user.home_area || '');
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/me', { method: 'PATCH', body: { name, home_area: area } });
      await refresh();
      showToast('Saved.');
    } catch (err) { showToast(err.message); } finally { setBusy(false); }
  };
  const del = async () => {
    try {
      await api('/me', { method: 'DELETE' });
      signOut();
    } catch (err) { showToast(err.message); }
  };
  const everywhere = async () => {
    try {
      await api('/auth/signout-all', { method: 'POST' });
      signOut();
    } catch (err) { showToast(err.message); }
  };
  const s = user.stats || {};
  const since = user.created_at ? new Date(user.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' }) : null;

  return (
    <>
      <div className="profile-head card">
        <AvatarEditor onMessage={showToast} />
        <div className="stack tight" style={{ gap: 2, minWidth: 0 }}>
          <h2 className="truncate">{user.name}</h2>
          <span className="mono muted small">+91 {user.phone?.replace(/(\d{5})(\d{5})/, '$1 $2')}</span>
          <span className="small muted">{user.home_area ? `${user.home_area} · ` : ''}{since ? `Member since ${since}` : ''}</span>
        </div>
      </div>

      <div className="desk-cols">
        <div>
          <div className="stat-row">
            <div className="stat"><b>{s.reports || 0}</b><span className="small muted">Reports</span></div>
            <div className="stat"><b>{s.fixed || 0}</b><span className="small muted">Fixed</span></div>
            <div className="stat"><b>{s.verified || 0}</b><span className="small muted">Fixes checked</span></div>
          </div>

          <div className="card menu-list">
            <Link to="/updates" className="menu-row">
              <Icon name="bell" /><b className="grow">Updates</b>
              {user.unread > 0 && <span className="pill AWAITING_YOU plain">{user.unread} new</span>}
              <Icon name="chevron" size={18} />
            </Link>
            <Link to="/reports" className="menu-row"><Icon name="list" /><b className="grow">Your reports</b><Icon name="chevron" size={18} /></Link>
            <Link to="/nearby" className="menu-row"><Icon name="map" /><b className="grow">Problems near you</b><Icon name="chevron" size={18} /></Link>
          </div>

          <form className="card stack" onSubmit={save}>
            <span className="eyebrow">Account</span>
            <label className="field">Name<input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
            <label className="field">Home area <span className="hint">Helps us show what’s happening near you.</span>
              <input className="input" value={area} maxLength={80} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Kamla Nagar" />
            </label>
            <label className="field">Language<select className="input" defaultValue="en" disabled><option value="en">English</option></select></label>
            <button className="btn primary" disabled={busy || !dirty || name.trim().length < 2}>{busy ? 'Saving…' : 'Save changes'}</button>
          </form>
        </div>

        <div>
          <div className="card stack tight">
            <b className="row" style={{ gap: 8 }}><Icon name="bell" size={18} /> Notifications</b>
            <p className="small muted">You get in-app updates on your reports and when it’s time to check a fix. Text messages and email aren’t part of this prototype.</p>
          </div>
          <div className="card stack tight">
            <b className="row" style={{ gap: 8 }}><Icon name="shield" size={18} /> Privacy</b>
            <p className="small muted">Crews and officers see your name with your report. Other residents only see the problem, never who reported it.</p>
          </div>

          <div className="card stack">
            <button type="button" className="btn ghost block" onClick={signOut}><Icon name="logout" size={18} /> Sign out</button>
            <button type="button" className="btn ghost block" onClick={everywhere}>Sign out on all devices</button>
            {!confirmDelete ? (
              <button type="button" className="link-btn" style={{ color: 'var(--st-reopened)' }} onClick={() => setConfirmDelete(true)}>Delete account</button>
            ) : (
              <div className="card danger stack">
                <p>Delete your account? Your reports stay on their incidents without your name or number, so the crews’ work stays traceable.</p>
                <div className="row wrap">
                  <button type="button" className="btn danger" onClick={del}>Delete account</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Toast msg={toast} />
    </>
  );
}
