import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/ui.jsx';
import { OutboxSender } from '../components/Outbox.jsx';

export function PhoneShell({ children, tabs, bar }) {
  useEffect(() => {
    document.body.classList.add('phone-body');
    return () => document.body.classList.remove('phone-body');
  }, []);
  return (
    <div className="phone">
      <main className={`phone-main ${tabs ? '' : 'no-tabs'}`}>{children}</main>
      {tabs && bar}
    </div>
  );
}

export default function CitizenLayout({ children, tabs = true }) {
  const { user } = useAuth();
  const bar = (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end><Icon name="home" />Home</NavLink>
      <NavLink to="/nearby"><Icon name="map" />Nearby</NavLink>
      <NavLink to="/reports"><Icon name="list" />Reports</NavLink>
      <NavLink to="/profile">{user?.unread > 0 && <span className="dot" />}<Icon name="user" />Profile</NavLink>
    </nav>
  );
  return (
    <PhoneShell tabs={tabs} bar={bar}>
      <OutboxSender />
      {children}
    </PhoneShell>
  );
}
