// Citizen profile (design p.17).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { initials } from '../lib/format.js';
import { Icon } from '../components/ui.jsx';

export default function Profile() {
  const { user, refresh, signOut } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [area, setArea] = useState(user?.home_area || '');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!user) return null;

  const save = async (e) => {
    e.preventDefault();
    await api('/me', { method: 'PATCH', body: { name, home_area: area } });
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const del = async () => {
    await api('/me', { method: 'DELETE' });
    signOut();
  };
  const s = user.stats || {};

  return (
    <>
      <div className="row">
        <span className="avatar lg">{initials(user.name)}</span>
        <div className="stack tight" style={{ gap: 2 }}>
          <h2>{user.name}</h2>
          <span className="mono muted">+91 {user.phone?.replace(/(\d{5})(\d{5})/, '$1 $2')}</span>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat"><b>{s.reports || 0}</b><span className="small muted">Reports</span></div>
        <div className="stat"><b>{s.fixed || 0}</b><span className="small muted">Fixed</span></div>
        <div className="stat"><b>{s.verified || 0}</b><span className="small muted">Verified</span></div>
      </div>

      <Link to="/updates" className="card row" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Icon name="bell" />
        <b className="grow">Updates</b>
        {user.unread > 0 && <span className="pill AWAITING_YOU plain">{user.unread} new</span>}
        <Icon name="chevron" size={18} />
      </Link>

      <form className="stack" onSubmit={save}>
        <span className="eyebrow">Account</span>
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Home area<input className="input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Sector 14" /></label>
        <label className="field">Language<select className="input" defaultValue="en" disabled><option value="en">English</option></select></label>
        <button className="btn outline">{saved ? 'Saved' : 'Save changes'}</button>
      </form>

      <p className="small muted">Notifications are in-app only in this prototype (SMS and email are out of scope). You always get updates on your reports and verification requests.</p>

      <button type="button" className="btn ghost block" onClick={signOut}>Sign out</button>
      {!confirmDelete ? (
        <button type="button" className="link-btn" style={{ color: 'var(--st-reopened)' }} onClick={() => setConfirmDelete(true)}>Delete account</button>
      ) : (
        <div className="card danger stack">
          <p>Delete your account? Your reports stay on their incidents without your name or number, so the crews’ work stays traceable.</p>
          <div className="row">
            <button type="button" className="btn danger" onClick={del}>Delete account</button>
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        </div>
      )}
    </>
  );
}
