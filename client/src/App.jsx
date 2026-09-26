import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { ROLE_HOME } from './lib/format.js';
import { Spinner } from './components/ui.jsx';
import { NotFound, Forbidden, SessionExpired } from './components/ErrorPages.jsx';

import CitizenLogin from './citizen/Login.jsx';
import CitizenLayout from './citizen/Layout.jsx';
import CitizenHome from './citizen/Home.jsx';
import NewReport from './citizen/NewReport.jsx';
import ReportReceived from './citizen/ReportReceived.jsx';
import IncidentView from './citizen/IncidentView.jsx';
import Verify from './citizen/Verify.jsx';
import Updates from './citizen/Updates.jsx';
import Nearby from './citizen/Nearby.jsx';
import MyReports from './citizen/MyReports.jsx';
import Profile from './citizen/Profile.jsx';

import FieldLayout from './field/Layout.jsx';
import Jobs from './field/Jobs.jsx';
import Job from './field/Job.jsx';
import JobDone from './field/JobDone.jsx';
import FieldAlerts from './field/Alerts.jsx';

import StaffLogin from './staff/Login.jsx';
import StaffLayout from './staff/Layout.jsx';
import Incidents from './staff/Incidents.jsx';
import IncidentDetail from './staff/IncidentDetail.jsx';
import MatchReview from './staff/MatchReview.jsx';
import Verification from './staff/Verification.jsx';
import Analytics from './staff/Analytics.jsx';
import Workload from './staff/Workload.jsx';
import Resources from './staff/Resources.jsx';
import Departments from './staff/Departments.jsx';
import Users from './staff/Users.jsx';
import StaffNotifications from './staff/Notifications.jsx';

// Only lets the given roles in; others see the 403 page (design p.34).
function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner />;
  if (!user) {
    const staff = !roles.includes('CITIZEN');
    return <Navigate to={staff ? '/staff/login' : '/login'} replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(user.role)) return <Forbidden />;
  return children;
}

function Root() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (user && user.role !== 'CITIZEN') return <Navigate to={ROLE_HOME[user.role]} replace />;
  return (
    <Guard roles={['CITIZEN']}>
      <CitizenLayout><CitizenHome /></CitizenLayout>
    </Guard>
  );
}

const citizen = (el, opts) => (
  <Guard roles={['CITIZEN']}><CitizenLayout {...opts}>{el}</CitizenLayout></Guard>
);
const field = (el, opts) => (
  <Guard roles={['FIELD_WORKER']}><FieldLayout {...opts}>{el}</FieldLayout></Guard>
);
const staff = (roles, el) => (
  <Guard roles={roles}><StaffLayout>{el}</StaffLayout></Guard>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/login" element={<CitizenLogin />} />
      <Route path="/report/new" element={citizen(<NewReport />, { tabs: false })} />
      <Route path="/report/:id/received" element={citizen(<ReportReceived />, { tabs: false })} />
      <Route path="/incident/:id" element={citizen(<IncidentView />)} />
      <Route path="/incident/:id/verify" element={citizen(<Verify />, { tabs: false })} />
      <Route path="/updates" element={citizen(<Updates />)} />
      <Route path="/nearby" element={citizen(<Nearby />)} />
      <Route path="/reports" element={citizen(<MyReports />)} />
      <Route path="/profile" element={citizen(<Profile />)} />

      <Route path="/staff/login" element={<StaffLogin />} />

      <Route path="/field" element={field(<Jobs />)} />
      <Route path="/field/jobs/:id" element={field(<Job />, { tabs: false })} />
      <Route path="/field/jobs/:id/done" element={field(<JobDone />, { tabs: false })} />
      <Route path="/field/alerts" element={field(<FieldAlerts />)} />

      <Route path="/officer" element={staff(['OFFICER'], <Incidents />)} />
      <Route path="/officer/incidents/:id" element={staff(['OFFICER'], <IncidentDetail />)} />
      <Route path="/officer/match-review" element={staff(['OFFICER'], <MatchReview />)} />
      <Route path="/officer/verification" element={staff(['OFFICER'], <Verification />)} />
      <Route path="/officer/assignments" element={staff(['OFFICER'], <Incidents mode="assignments" />)} />
      <Route path="/officer/analytics" element={staff(['OFFICER'], <Analytics />)} />
      <Route path="/officer/notifications" element={staff(['OFFICER'], <StaffNotifications />)} />

      <Route path="/dept" element={staff(['DEPT_HEAD'], <Workload />)} />
      <Route path="/dept/resources" element={staff(['DEPT_HEAD'], <Resources />)} />
      <Route path="/dept/incidents" element={staff(['DEPT_HEAD'], <Incidents mode="all" />)} />
      <Route path="/dept/incidents/:id" element={staff(['DEPT_HEAD'], <IncidentDetail />)} />
      <Route path="/dept/analytics" element={staff(['DEPT_HEAD'], <Analytics />)} />
      <Route path="/dept/notifications" element={staff(['DEPT_HEAD'], <StaffNotifications />)} />

      <Route path="/admin" element={staff(['ADMIN'], <Analytics />)} />
      <Route path="/admin/departments" element={staff(['ADMIN'], <Departments />)} />
      <Route path="/admin/incidents" element={staff(['ADMIN'], <Incidents mode="all" />)} />
      <Route path="/admin/incidents/:id" element={staff(['ADMIN'], <IncidentDetail />)} />
      <Route path="/admin/users" element={staff(['ADMIN'], <Users />)} />

      <Route path="/session-expired" element={<SessionExpired />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
