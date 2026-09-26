import { useAuth } from '../auth.jsx';
import { NotificationList } from '../citizen/Updates.jsx';

export default function StaffNotifications() {
  const { user } = useAuth();
  const base = user.role === 'DEPT_HEAD' ? '/dept/incidents' : '/officer/incidents';
  return (
    <div style={{ maxWidth: 720 }} className="stack">
      <NotificationList back={false} linkFor={(n) => {
        if (n.type === 'MATCH_REVIEW') return '/officer/match-review';
        if (n.type === 'OFFICER_VERIFY') return '/officer/verification';
        return n.incident_id ? `${base}/${n.incident_id}` : null;
      }} />
    </div>
  );
}
