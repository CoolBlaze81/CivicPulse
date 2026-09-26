import { NotificationList } from '../citizen/Updates.jsx';

export default function FieldAlerts() {
  return <NotificationList back={false} linkFor={(n) => (n.incident_id ? `/field/jobs/${n.incident_id}` : null)} />;
}
