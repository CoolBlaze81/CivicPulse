// In-app notifications (design p.7, FR-46..FR-49). Shared by citizens and field workers.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../lib/hooks.js';
import { Icon, ErrorNote, Spinner, Tabs } from '../components/ui.jsx';
import { AllClearArt, BellArt } from '../components/Illustrations.jsx';

function stamp(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Icon, colour and short label per notification type.
const KIND = {
  REPORT_RECEIVED: ['inbox', 'navy', 'Report received'], REPORT_LINKED: ['link', 'violet', 'Joined an incident'],
  ASSIGNED: ['users', 'blue', 'Crew assigned'], DEPT_ASSIGNED: ['building', 'blue', 'Routed to department'],
  PROGRESS: ['wrench', 'amber', 'Work update'], VERIFY_REQUEST: ['eye', 'pulse', 'Your check needed'],
  CLOSED: ['check', 'green', 'Closed'], REOPENED: ['refresh', 'red', 'Reopened'],
  NEW_INCIDENT: ['alert', 'violet', 'New incident'], MATCH_REVIEW: ['link', 'violet', 'Match review'],
  OFFICER_VERIFY: ['shield', 'teal', 'Needs officer check'], NEW_JOB: ['wrench', 'pulse', 'New job'],
};

export function NotificationList({ linkFor, back = true, title = 'Updates', emptyText = 'Updates on your reports show up here: when a crew is assigned, when work starts, and when it’s time to check the fix.' }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [only, setOnly] = useState('all');
  const { data, error, reload } = useApi('/notifications', { interval: 20000 });
  if (!data) return error ? <ErrorNote error={error} onRetry={reload} /> : <Spinner />;
  const items = only === 'unread' ? data.items.filter((n) => !n.is_read) : data.items;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups = [
    ['Today', items.filter((n) => new Date(n.created_at).toDateString() === today)],
    ['Yesterday', items.filter((n) => new Date(n.created_at).toDateString() === yesterday)],
    ['Earlier', items.filter((n) => ![today, yesterday].includes(new Date(n.created_at).toDateString()))],
  ].filter(([, list]) => list.length);

  const readAll = async () => {
    await api('/notifications/read', { method: 'POST', body: {} });
    reload();
    refresh();
  };
  const open = async (n) => {
    if (!n.is_read) api('/notifications/read', { method: 'POST', body: { id: n.notification_id } }).then(() => { refresh(); reload(); });
    const to = linkFor(n);
    if (to) navigate(to);
  };

  return (
    <>
      <div className="page-head">
        {back && <button type="button" className="icon-btn desk-hide" onClick={() => navigate(-1)} aria-label="Back"><Icon name="back" /></button>}
        <div className="grow stack tight" style={{ gap: 0 }}>
          <h1>{title}</h1>
          <span className="muted small">{data.unread ? `${data.unread} unread` : 'You’re all caught up'}</span>
        </div>
        {data.unread > 0 && <button type="button" className="btn ghost sm" onClick={readAll}><Icon name="check" size={16} /> Mark all read</button>}
      </div>
      {data.items.length > 0 && (
        <Tabs value={only} onChange={setOnly} tabs={[['all', 'All', data.items.length], ['unread', 'Unread', data.unread]]} />
      )}
      {data.items.length === 0 ? (
        <div className="card stack center empty-card">
          <BellArt />
          <h3>No updates yet</h3>
          <p className="muted">{emptyText}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card stack center empty-card">
          <AllClearArt />
          <h3>All caught up</h3>
          <p className="muted">You’ve read every update.</p>
          <button type="button" className="link-btn" onClick={() => setOnly('all')}>Show all updates</button>
        </div>
      ) : (
        groups.map(([label, list]) => (
          <section key={label} className="stack tight">
            <span className="eyebrow">{label}</span>
            <div className="card notif-list">
              {list.map((n) => {
                const [icon, tone, kind] = KIND[n.type] || ['bell', 'navy', 'Update'];
                return (
                  <button type="button" key={n.notification_id} className={`notif ${n.is_read ? '' : 'unread'}`} onClick={() => open(n)}>
                    <span className={`notif-icon tone-${tone}`}><Icon name={icon} size={18} /></span>
                    <span className="grow stack tight" style={{ gap: 3, minWidth: 0 }}>
                      <span className="row between" style={{ gap: 8 }}>
                        <span className="tiny bold notif-kind">{kind}</span>
                        <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{stamp(n.created_at)}</span>
                      </span>
                      <span className="notif-msg">{n.message}</span>
                      {(n.incident_id || n.report_id) && <span className="mono tiny muted">{n.incident_id ? `INC-${n.incident_id}` : `RPT-${n.report_id}`}</span>}
                    </span>
                    {!n.is_read && <span className="unread-dot" aria-label="Unread" />}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}

export default function Updates() {
  return (
    <NotificationList
      back={false}
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
