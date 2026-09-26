import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/ui.jsx';
import { PhoneShell } from '../citizen/Layout.jsx';

export default function FieldLayout({ children, tabs = true }) {
  const { user, signOut } = useAuth();
  const bar = (
    <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      <NavLink to="/field" end><Icon name="list" />Jobs</NavLink>
      <NavLink to="/field/alerts">{user?.unread > 0 && <span className="dot" />}<Icon name="bell" />Alerts</NavLink>
      <a href="#signout" onClick={(e) => { e.preventDefault(); signOut(); }}><Icon name="user" />Sign out</a>
    </nav>
  );
  return <PhoneShell tabs={tabs} bar={bar}>{children}</PhoneShell>;
}
