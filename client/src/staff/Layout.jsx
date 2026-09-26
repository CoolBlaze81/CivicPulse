import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi } from '../lib/hooks.js';
import { initials } from '../lib/format.js';
import { Brand } from '../components/ui.jsx';

function subtitle(user) {
  if (user.role === 'OFFICER') return `Officer · Wards ${user.wards?.split(',').length > 1 ? `${user.wards.split(',')[0]}–${user.wards.split(',').slice(-1)}` : user.wards}`;
  if (user.role === 'DEPT_HEAD') return `Head · ${user.department?.name || ''}`;
  if (user.role === 'ADMIN') return 'Municipal Admin · MSMO';
  return '';
}

export default function StaffLayout({ children }) {
  const { user, signOut } = useAuth();
  const { data: counts } = useApi(user?.role === 'OFFICER' ? '/staff/counts' : null, { interval: 30000 });
  if (!user) return null;

  const badge = (n, hot) => (n ? <span className={`badge ${hot ? 'hot' : ''}`}>{n}</span> : null);
  const nav = {
    OFFICER: [
      ['/officer', 'Incidents', badge(counts?.triage)],
      ['/officer/match-review', 'Match review', badge(counts?.match_review, true)],
      ['/officer/assignments', 'Assignments', badge(counts?.needs_crew)],
      ['/officer/verification', 'Verification', badge(counts?.officer_verification)],
      ['/officer/analytics', 'Analytics'],
      ['/officer/notifications', 'Alerts', badge(user.unread, true)],
    ],
    DEPT_HEAD: [
      ['/dept', 'Workload'],
      ['/dept/resources', 'Crews & resources'],
      ['/dept/incidents', 'All incidents'],
      ['/dept/analytics', 'Reports'],
      ['/dept/notifications', 'Alerts', badge(user.unread, true)],
    ],
    ADMIN: [
      ['/admin', 'Analytics'],
      ['/admin/departments', 'Departments'],
      ['/admin/incidents', 'Incidents'],
      ['/admin/users', 'Users & roles'],
    ],
  }[user.role] || [];

  return (
    <div className="staff">
      <aside className="sidebar">
        <Brand to={nav[0]?.[0] || '/'} light />
        <nav aria-label="Workspace">
          {nav.map(([to, label, extra]) => (
            <NavLink key={to} to={to} end>{label}{extra}</NavLink>
          ))}
        </nav>
        <div className="me">
          <span className="avatar">{initials(user.name)}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="truncate" style={{ display: 'block' }}>{user.name}</b>
            <small>{subtitle(user)}</small>
            <button type="button" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="staff-main">{children}</main>
    </div>
  );
}
