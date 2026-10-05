// Admin: activity log of staff sign-ins and account changes.
import { useState } from 'react';
import { useApi } from '../lib/hooks.js';
import { ROLE_LABEL, when } from '../lib/format.js';
import { ErrorNote, Icon, Spinner, Tabs } from '../components/ui.jsx';

const TONE = {
  SIGN_IN_FAILED: 'amber', SIGN_IN_BLOCKED: 'red', ACCOUNT_LOCKED: 'red', STAFF_DISABLED: 'red',
  SIGN_IN: 'green', PASSWORD_CHANGED: 'navy', STAFF_PASSWORD_RESET: 'navy', STAFF_CREATED: 'violet', STAFF_ENABLED: 'green',
};
const ICON = {
  SIGN_IN: 'logout', SIGN_IN_FAILED: 'alert', SIGN_IN_BLOCKED: 'lock', ACCOUNT_LOCKED: 'lock', PASSWORD_CHANGED: 'key',
  STAFF_PASSWORD_RESET: 'key', STAFF_CREATED: 'plus', STAFF_DISABLED: 'x', STAFF_ENABLED: 'check', STAFF_UNLOCKED: 'lock',
};

export default function Activity() {
  const [kind, setKind] = useState('all');
  const { data, error, reload } = useApi(`/admin/audit?kind=${kind}`, { interval: 30000 });
  return (
    <>
      <div className="staff-head">
        <div className="stack tight" style={{ gap: 2 }}>
          <h1>Activity log</h1>
          <span className="muted">Staff sign-ins, locked accounts and account changes. Newest first.</span>
        </div>
      </div>
      <Tabs value={kind} onChange={setKind} tabs={[['all', 'Everything'], ['security', 'Security warnings']]} className="fit" />
      <ErrorNote error={error} onRetry={reload} />
      {!data ? <Spinner /> : data.length === 0 ? (
        <div className="panel empty"><h3>Nothing logged yet</h3><p className="muted">Sign-ins and account changes appear here.</p></div>
      ) : (
        <div className="panel">
          {data.map((a) => (
            <div key={a.audit_id} className="audit-row">
              <span className={`notif-icon tone-${TONE[a.action] || 'navy'}`}><Icon name={ICON[a.action] || 'info'} size={17} /></span>
              <div className="grow stack tight" style={{ gap: 2, minWidth: 0 }}>
                <span><b>{a.name || 'Unknown'}</b> <span className="muted small">{a.staff_id ? `${a.staff_id} · ${ROLE_LABEL[a.role] || ''}` : ''}</span></span>
                <span className="small">{a.label}{a.detail ? ` · ${a.detail}` : ''}</span>
              </div>
              <span className="tiny muted audit-when">{when(a.created_at)}{a.ip ? <><br /><span className="mono">{a.ip}</span></> : null}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
