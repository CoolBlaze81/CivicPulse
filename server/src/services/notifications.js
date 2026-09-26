// NotificationService: in-app notifications only (SRS 4.8, BR-07).
import { getDb, nowIso } from '../db.js';

export async function notify(userId, { type, message, incidentId = null, reportId = null, at = nowIso() }) {
  if (!userId) return;
  await getDb()
    .prepare(
      `INSERT INTO notification (user_id, incident_id, report_id, type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, incidentId, reportId, type, message, at);
}

// Every citizen with a report linked to the incident.
export async function incidentCitizens(incidentId) {
  const rows = await getDb().prepare('SELECT DISTINCT citizen_id FROM report WHERE incident_id = ?').all(incidentId);
  return rows.map((r) => r.citizen_id);
}

export async function notifyCitizens(incidentId, payload) {
  for (const id of await incidentCitizens(incidentId)) await notify(id, { ...payload, incidentId });
}

// Officers whose wards cover the incident (or all officers if none match).
export async function notifyOfficers(incidentId, payload) {
  const db = getDb();
  const inc = await db.prepare('SELECT ward FROM incident WHERE incident_id = ?').get(incidentId);
  const officers = await db.prepare(`SELECT user_id, wards FROM "user" WHERE role = 'OFFICER' AND deleted = 0`).all();
  const covering = officers.filter((o) => (o.wards || '').split(',').map(Number).includes(inc?.ward));
  for (const o of covering.length ? covering : officers) await notify(o.user_id, { ...payload, incidentId });
}

export async function notifyDepartmentHead(departmentId, payload) {
  const head = await getDb().prepare('SELECT head_user_id FROM department WHERE department_id = ?').get(departmentId);
  if (head?.head_user_id) await notify(head.head_user_id, payload);
}

export async function notifyCrew(crewId, payload) {
  const members = await getDb().prepare(`SELECT user_id FROM "user" WHERE crew_id = ? AND role = 'FIELD_WORKER'`).all(crewId);
  for (const m of members) await notify(m.user_id, payload);
}

export async function listFor(userId, limit = 100) {
  return getDb()
    .prepare('SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT ?')
    .all(userId, limit);
}

export async function unreadCount(userId) {
  return (await getDb().prepare('SELECT COUNT(*) n FROM notification WHERE user_id = ? AND is_read = 0').get(userId)).n;
}

export async function markRead(userId, id) {
  const db = getDb();
  if (id) await db.prepare('UPDATE notification SET is_read = 1 WHERE user_id = ? AND notification_id = ?').run(userId, id);
  else await db.prepare('UPDATE notification SET is_read = 1 WHERE user_id = ?').run(userId);
}
