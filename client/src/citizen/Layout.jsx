import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Avatar, Brand, Icon } from '../components/ui.jsx';
import { OutboxSender } from '../components/Outbox.jsx';

export function PhoneShell({ children, tabs, bar, wide }) {
  useEffect(() => {
    document.body.classList.add('phone-body');
    return () => document.body.classList.remove('phone-body');
  }, []);
  return (
    <div className="phone">
      {tabs && bar}
      <main className={`phone-main ${tabs ? '' : 'no-tabs'} ${wide ? 'wide' : ''}`}>{children}</main>
    </div>
  );
}

// On phones the nav is a bottom tab bar; on computers the same element is a
// top header with the brand, an Updates link and a "Report an issue" button.
export default function CitizenLayout({ children, tabs = true }) {
  const { user } = useAuth();
  const bar = (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        <span className="desk-only brand-slot"><Brand /></span>
        <NavLink to="/" end><Icon name="home" />Home</NavLink>
        <NavLink to="/nearby"><Icon name="map" />Nearby</NavLink>
        <NavLink to="/reports"><Icon name="list" />Reports</NavLink>
        <NavLink to="/updates">{user?.unread > 0 && <span className="tab-badge">{user.unread > 9 ? '9+' : user.unread}</span>}<Icon name="bell" />Updates</NavLink>
        <NavLink to="/profile">{user?.avatar_url ? <Avatar user={user} size={22} className="tab-avatar" /> : <Icon name="user" />}Profile</NavLink>
        <NavLink to="/report/new" className="desk-only cta"><Icon name="camera" />Report an issue</NavLink>
      </div>
    </nav>
  );
  return (
    <PhoneShell tabs={tabs} bar={bar}>
      <OutboxSender />
      {children}
    </PhoneShell>
  );
}
