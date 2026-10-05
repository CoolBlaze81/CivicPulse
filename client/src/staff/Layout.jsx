// Staff workspace shell. Computers: navy sidebar. Phones and tablets: a top
// bar with the page name, alerts and a menu button that opens the same
// navigation as a drawer.
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi } from '../lib/hooks.js';
import { Avatar, Brand, Icon, PulseMark } from '../components/ui.jsx';

function subtitle(user) {
  if (user.role === 'OFFICER') return `Officer · Wards ${user.wards?.split(',').length > 1 ? `${user.wards.split(',')[0]}–${user.wards.split(',').slice(-1)}` : user.wards}`;
  if (user.role === 'DEPT_HEAD') return `Head · ${user.department?.name || ''}`;
  if (user.role === 'ADMIN') return 'Municipal Admin · MSMO';
  return '';
}

export function navFor(user, counts) {
  const n = (x) => (x ? x : null);
  return {
    OFFICER: [
      ['/officer', 'Overview', 'grid'],
      ['/officer/incidents', 'Incidents', 'list', n(counts?.triage)],
      ['/officer/match-review', 'Match review', 'link', n(counts?.match_review), true],
      ['/officer/assignments', 'Assignments', 'users', n(counts?.needs_crew)],
      ['/officer/verification', 'Verification', 'shield', n(counts?.officer_verification)],
      ['/officer/analytics', 'Analytics', 'chart'],
      ['/officer/notifications', 'Alerts', 'bell', n(user.unread), true],
      ['/officer/account', 'My account', 'user'],
    ],
    DEPT_HEAD: [
      ['/dept', 'Workload', 'grid'],
      ['/dept/resources', 'Crews & resources', 'wrench'],
      ['/dept/incidents', 'All incidents', 'list'],
      ['/dept/analytics', 'Reports', 'chart'],
      ['/dept/notifications', 'Alerts', 'bell', n(user.unread), true],
      ['/dept/account', 'My account', 'user'],
    ],
    ADMIN: [
      ['/admin', 'City analytics', 'chart'],
      ['/admin/departments', 'Departments', 'building'],
      ['/admin/incidents', 'Incidents', 'list'],
      ['/admin/users', 'Users & roles', 'users'],
      ['/admin/activity', 'Activity log', 'clock'],
      ['/admin/account', 'My account', 'user'],
    ],
  }[user.role] || [];
}

function NavItems({ nav, onPick }) {
  return (
    <nav aria-label="Workspace">
      {nav.map(([to, label, icon, badge, hot]) => (
        <NavLink key={to} to={to} end onClick={onPick}>
          <span className="row" style={{ gap: 12 }}><Icon name={icon} size={19} />{label}</span>
          {badge ? <span className={`badge ${hot ? 'hot' : ''}`}>{badge}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}

function Me({ user, signOut, account }) {
  return (
    <div className="me">
      <Link to={account} aria-label="My account"><Avatar user={user} /></Link>
      <div className="grow" style={{ minWidth: 0 }}>
        <b className="truncate" style={{ display: 'block' }}>{user.name}</b>
        <small>{subtitle(user)}</small>
        <button type="button" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}

export default function StaffLayout({ children }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { data: counts } = useApi(user?.role === 'OFFICER' ? '/staff/counts' : null, { interval: 30000 });
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [open]);
  if (!user) return null;

  const nav = navFor(user, counts);
  const home = nav[0]?.[0] || '/';
  const account = nav.find((x) => x[1] === 'My account')?.[0] || home;
  const alerts = nav.find((x) => x[1] === 'Alerts');
  // The page name in the phone top bar: the longest nav path that matches.
  const current = [...nav].sort((a, b) => b[0].length - a[0].length).find(([to]) => location.pathname === to || location.pathname.startsWith(`${to}/`));
  const pending = nav.reduce((sum, x) => sum + (x[3] && x[1] !== 'Alerts' ? x[3] : 0), 0);

  return (
    <div className="staff">
      <aside className="sidebar">
        <Brand to={home} light />
        <NavItems nav={nav} />
        <Me user={user} signOut={signOut} account={account} />
      </aside>

      <header className="staff-topbar">
        <button type="button" className="topbar-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
          <Icon name="menu" size={22} />
          {pending > 0 && <span className="topbar-dot" />}
        </button>
        <Link to={home} className="topbar-title">
          <span className="mark-sm"><PulseMark size={18} /></span>
          <span className="stack tight" style={{ gap: 0, minWidth: 0 }}>
            <span className="topbar-brand">CivicPulse</span>
            <b className="truncate">{current?.[1] || 'Workspace'}</b>
          </span>
        </Link>
        {alerts && (
          <Link to={alerts[0]} className="topbar-btn" aria-label={`Alerts${user.unread ? `, ${user.unread} unread` : ''}`}>
            <Icon name="bell" size={21} />
            {user.unread > 0 && <span className="icon-badge">{user.unread > 9 ? '9+' : user.unread}</span>}
          </Link>
        )}
        <Link to={account} className="topbar-avatar" aria-label="My account"><Avatar user={user} size={36} /></Link>
      </header>

      {open && <div className="drawer-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`drawer ${open ? 'open' : ''}`} aria-label="Menu" aria-hidden={!open}>
        <div className="row between">
          <Brand to={home} light />
          <button type="button" className="topbar-btn light" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="x" size={22} /></button>
        </div>
        <NavItems nav={nav} onPick={() => setOpen(false)} />
        <Me user={user} signOut={signOut} account={account} />
      </aside>

      <main className="staff-main">{children}</main>
    </div>
  );
}
