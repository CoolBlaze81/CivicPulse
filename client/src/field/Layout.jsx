import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Avatar, Brand, Icon } from '../components/ui.jsx';
import { PhoneShell } from '../citizen/Layout.jsx';

export default function FieldLayout({ children, tabs = true }) {
  const { user } = useAuth();
  const bar = (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        <span className="desk-only brand-slot"><Brand to="/field" /></span>
        <NavLink to="/field" end><Icon name="list" />Jobs</NavLink>
        <NavLink to="/field/alerts">{user?.unread > 0 && <span className="tab-badge">{user.unread > 9 ? '9+' : user.unread}</span>}<Icon name="bell" />Alerts</NavLink>
        <NavLink to="/field/account">{user?.avatar_url ? <Avatar user={user} size={22} className="tab-avatar" /> : <Icon name="user" />}Account</NavLink>
      </div>
    </nav>
  );
  return <PhoneShell tabs={tabs} bar={bar}>{children}</PhoneShell>;
}
