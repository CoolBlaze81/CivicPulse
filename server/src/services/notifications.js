// NotificationService: in-app notifications only (SRS 4.8, BR-07).
import { getDb, nowIso } from '../db.js';

export function notify(userId, { type, message, incidentId = null, reportId = null, at = nowIso() }) {
  if (!userId) return;
  getDb()
    .prepare(
      `INSERT INTO notification (user_id, incident_id, report_id, type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, incidentId, reportId, type, message, at);
}

// Every citizen with a report linked to the incident.
export function incidentCitizens(incidentId) {
  return getDb()
    .prepare('SELECT DISTINCT citizen_id FROM report WHERE incident_id = ?')
    .all(incidentId)
    .map((r) => r.citizen_id);
}

export function notifyCitizens(incidentId, payload) {
  for (const id of incidentCitizens(incidentId)) notify(id, { ...payload, incidentId });
}

// Officers whose wards cover the incident (or all officers if none match).
export function notifyOfficers(incidentId, payload) {
  const db = getDb();
  const inc = db.prepare('SELECT ward FROM incident WHERE incident_id = ?').get(incidentId);
  const officers = db.prepare("SELECT user_id, wards FROM user WHERE role = 'OFFICER' AND deleted = 0").all();
  const covering = officers.filter((o) => (o.wards || '').split(',').map(Number).includes(inc?.ward));
  for (const o of covering.length ? covering : officers) notify(o.user_id, { ...payload, incidentId });
}

export function notifyDepartmentHead(departmentId, payload) {
  const head = getDb().prepare('SELECT head_user_id FROM department WHERE department_id = ?').get(departmentId);
  if (head?.head_user_id) notify(head.head_user_id, payload);
}

export function notifyCrew(crewId, payload) {
  const members = getDb().prepare("SELECT user_id FROM user WHERE crew_id = ? AND role = 'FIELD_WORKER'").all(crewId);
  for (const m of members) notify(m.user_id, payload);
}

export function listFor(userId, limit = 100) {
  return getDb()
    .prepare('SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT ?')
    .all(userId, limit);
}

export function unreadCount(userId) {
  return getDb().prepare('SELECT COUNT(*) n FROM notification WHERE user_id = ? AND is_read = 0').get(userId).n;
}

export function markRead(userId, id) {
  const db = getDb();
  if (id) db.prepare('UPDATE notification SET is_read = 1 WHERE user_id = ? AND notification_id = ?').run(userId, id);
  else db.prepare('UPDATE notification SET is_read = 1 WHERE user_id = ?').run(userId);
}
