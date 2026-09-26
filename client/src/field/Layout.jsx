import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Brand, Icon } from '../components/ui.jsx';
import { PhoneShell } from '../citizen/Layout.jsx';

export default function FieldLayout({ children, tabs = true }) {
  const { user, signOut } = useAuth();
  const bar = (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        <span className="desk-only brand-slot"><Brand to="/field" /></span>
        <NavLink to="/field" end><Icon name="list" />Jobs</NavLink>
        <NavLink to="/field/alerts">{user?.unread > 0 && <span className="dot" />}<Icon name="bell" />Alerts</NavLink>
        <a href="#signout" onClick={(e) => { e.preventDefault(); signOut(); }}><Icon name="user" />Sign out</a>
      </div>
    </nav>
  );
  return <PhoneShell tabs={tabs} bar={bar}>{children}</PhoneShell>;
}
