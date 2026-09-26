// AssignmentService: crew suggestion by zone and workload, and recording
// assignments with history (SRS 4.5, Level 2 DFD process 4.0).
import { getDb, nowIso, tx } from '../db.js';
import { changeStatus, HttpError, incidentCode, logEvent, requireIncident } from './incidents.js';
import { PRIORITY_LABELS } from './classification.js';
import { notifyCitizens, notifyCrew, notifyDepartmentHead } from './notifications.js';

// Active jobs a crew is carrying.
export async function crewLoad(crewId) {
  const row = await getDb()
    .prepare(
      `SELECT COUNT(*) n FROM assignment a JOIN incident i ON i.incident_id = a.incident_id
       WHERE a.crew_id = ? AND a.is_current = 1 AND i.status IN ('ASSIGNED','IN_PROGRESS')`
    )
    .get(crewId);
  return row.n;
}

export async function crewsForDepartment(departmentId) {
  const crews = await getDb().prepare('SELECT * FROM crew WHERE department_id = ? ORDER BY name').all(departmentId);
  const out = [];
  for (const c of crews) out.push({ ...c, load: await crewLoad(c.crew_id), wards: c.zone.split(',').map(Number) });
  return out;
}

// On-duty crew covering the ward with the most spare capacity; if none
// covers the ward, the least loaded on-duty crew in the department.
export async function suggestCrew(departmentId, ward) {
  const crews = (await crewsForDepartment(departmentId)).filter((c) => c.availability === 'ON_DUTY' && c.load < c.max_load);
  const spare = (c) => c.max_load - c.load;
  const inZone = crews.filter((c) => c.wards.includes(ward)).sort((a, b) => spare(b) - spare(a));
  if (inZone.length) return { ...inZone[0], reason: `Covers Ward ${ward} · ${inZone[0].load}/${inZone[0].max_load} jobs` };
  const any = crews.sort((a, b) => spare(b) - spare(a))[0];
  return any ? { ...any, reason: `Least loaded crew on duty · ${any.load}/${any.max_load} jobs` } : null;
}

// Officer triage: confirm or change category and priority (FR-25).
export async function classify(incidentId, { categoryId, priority, title }, by, at = nowIso()) {
  const db = getDb();
  const inc = await requireIncident(incidentId);
  const changes = [];
  if (categoryId && Number(categoryId) !== inc.category_id) {
    const cat = await db.prepare('SELECT name FROM category WHERE category_id = ?').get(Number(categoryId));
    if (!cat) throw new HttpError(422, 'Unknown category.');
    changes.push(`category → ${cat.name}`);
  }
  if (priority && !PRIORITY_LABELS[priority]) throw new HttpError(422, 'Priority must be P1, P2, P3 or P4.');
  if (priority && priority !== inc.priority) changes.push(`priority → ${priority} ${PRIORITY_LABELS[priority]}`);
  if (title && title.trim() && title.trim() !== inc.title) changes.push('title updated');
  await db.prepare('UPDATE incident SET category_id = ?, priority = ?, title = ?, triaged = 1 WHERE incident_id = ?').run(
    Number(categoryId) || inc.category_id, priority || inc.priority, (title && title.trim()) || inc.title, incidentId
  );
  await logEvent(incidentId, changes.length ? `Classified by officer: ${changes.join(', ')}` : 'Classification confirmed by officer', { by, at });
}

// Assign department and crew (FR-28..FR-32). Department heads may only
// assign within their own department.
export async function assign(incidentId, { departmentId, crewId }, actor, at = nowIso()) {
  return tx(async () => {
    const db = getDb();
    const inc = await requireIncident(incidentId);
    const dept = await db.prepare('SELECT * FROM department WHERE department_id = ?').get(Number(departmentId) || 0);
    if (!dept) throw new HttpError(422, 'Choose a department.');
    if (actor.role === 'DEPT_HEAD' && actor.department_id !== dept.department_id) {
      throw new HttpError(403, 'You can only assign crews in your own department.', 'FORBIDDEN');
    }
    if (['CLOSED', 'AWAITING_VERIFICATION'].includes(inc.status)) {
      throw new HttpError(409, `${incidentCode(incidentId)} is ${inc.status === 'CLOSED' ? 'closed' : 'waiting for verification'} and can't be reassigned now.`);
    }
    let crew = null;
    if (crewId) {
      crew = await db.prepare('SELECT * FROM crew WHERE crew_id = ?').get(Number(crewId));
      if (!crew || crew.department_id !== dept.department_id) throw new HttpError(422, 'That crew is not in the chosen department.');
      if (crew.availability !== 'ON_DUTY') throw new HttpError(409, `${crew.name} is not on duty.`);
    }

    await db.prepare('UPDATE assignment SET is_current = 0 WHERE incident_id = ? AND is_current = 1').run(incidentId);
    await db.prepare(
      `INSERT INTO assignment (incident_id, department_id, crew_id, assigned_by, is_current, assigned_at) VALUES (?, ?, ?, ?, 1, ?)`
    ).run(incidentId, dept.department_id, crew?.crew_id || null, actor.user_id, at);
    await db.prepare('UPDATE incident SET department_id = ?, triaged = 1, work_stage = NULL WHERE incident_id = ?').run(dept.department_id, incidentId);

    const fresh = await requireIncident(incidentId);
    const who = crew ? `${dept.name} · ${crew.name}` : dept.name;
    if (crew) {
      await changeStatus(incidentId, 'ASSIGNED', { by: actor.user_id, reason: `Assigned to ${who}, priority ${fresh.priority} ${PRIORITY_LABELS[fresh.priority]}`, at });
      await notifyCrew(crew.crew_id, {
        type: 'NEW_JOB', incidentId, at,
        message: `New job ${incidentCode(incidentId)} (${fresh.priority} ${PRIORITY_LABELS[fresh.priority]}): ${fresh.title}.`,
      });
      await notifyCitizens(incidentId, {
        type: 'ASSIGNED', at,
        message: `${fresh.title} assigned to ${dept.name}, priority ${PRIORITY_LABELS[fresh.priority]}.`,
      });
    } else {
      await logEvent(incidentId, `Routed to ${dept.name}; waiting for a crew`, { by: actor.user_id, at });
    }
    if (actor.role !== 'DEPT_HEAD') {
      await notifyDepartmentHead(dept.department_id, {
        type: 'DEPT_ASSIGNED', incidentId, at,
        message: `${incidentCode(incidentId)} ${fresh.title} ${crew ? `assigned to ${crew.name}` : 'needs a crew'}.`,
      });
    }
    return fresh;
  });
}

export async function assignmentHistory(incidentId) {
  return getDb()
    .prepare(
      `SELECT a.*, d.name AS department_name, c.name AS crew_name, u.name AS assigned_by_name
       FROM assignment a JOIN department d ON d.department_id = a.department_id
       LEFT JOIN crew c ON c.crew_id = a.crew_id LEFT JOIN "user" u ON u.user_id = a.assigned_by
       WHERE a.incident_id = ? ORDER BY a.assigned_at DESC, a.assignment_id DESC`
    )
    .all(incidentId);
}
