// In-app notifications (design p.7, FR-46..FR-49). Shared by citizens and field workers.
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../lib/hooks.js';
import { Icon, Spinner } from '../components/ui.jsx';

function stamp(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function NotificationList({ linkFor, back = true }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { data, reload } = useApi('/notifications', { interval: 20000 });
  if (!data) return <Spinner />;
  const today = new Date().toDateString();
  const groups = [
    ['Today', data.items.filter((n) => new Date(n.created_at).toDateString() === today)],
    ['Earlier', data.items.filter((n) => new Date(n.created_at).toDateString() !== today)],
  ].filter(([, items]) => items.length);

  const readAll = async () => {
    await api('/notifications/read', { method: 'POST', body: {} });
    reload();
    refresh();
  };
  const open = async (n) => {
    if (!n.is_read) api('/notifications/read', { method: 'POST', body: { id: n.notification_id } }).then(() => refresh());
    const to = linkFor(n);
    if (to) navigate(to);
    else reload();
  };

  return (
    <>
      <div className="page-head">
        {back && <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Icon name="back" /></button>}
        <h1 className="grow">Updates</h1>
        {data.unread > 0 && <button type="button" className="link-btn" onClick={readAll}>Mark all read</button>}
      </div>
      {groups.length === 0 && <p className="muted">Nothing yet. Updates on your reports show up here.</p>}
      {groups.map(([label, items]) => (
        <section key={label} className="stack tight">
          <span className="eyebrow">{label}</span>
          <div className="card" style={{ padding: '4px 16px' }}>
            {items.map((n) => (
              <button type="button" key={n.notification_id} className="list-item" onClick={() => open(n)}
                style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, flex: 'none', alignSelf: 'flex-start', marginTop: 7, background: n.is_read ? 'transparent' : 'var(--pulse)' }} />
                <span className="grow stack tight" style={{ gap: 3 }}>
                  <span style={{ fontWeight: n.is_read ? 400 : 600 }}>{n.message}</span>
                  <span className="mono tiny muted">{n.incident_id ? `INC-${n.incident_id}` : n.report_id ? `RPT-${n.report_id}` : ''} · {stamp(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function Updates() {
  return (
    <NotificationList
      linkFor={(n) => {
        if (n.type === 'VERIFY_REQUEST') return `/incident/${n.incident_id}/verify`;
        if (n.incident_id) return `/incident/${n.incident_id}`;
        if (n.report_id) return `/report/${n.report_id}/received`;
        return null;
      }}
    />
  );
}

export function BackHome() {
  return <Link to="/" className="btn ghost block">Back to home</Link>;
}
