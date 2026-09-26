// Field work: jobs, progress and resolution proof (SRS 4.6, FR-33..FR-38;
// Level 2 DFD process 5.0).
import { getDb, nowIso, tx } from '../db.js';
import { changeStatus, decorateIncident, HttpError, incidentCode, incidentSummarySql, requireIncident } from './incidents.js';
import { distanceMeters } from './geo.js';
import { notifyCitizens, notifyOfficers } from './notifications.js';
import { requestVerification } from './verification.js';

export const STAGES = ['EN_ROUTE', 'ON_SITE', 'WORKING', 'RESOLVED'];
const STAGE_TEXT = { EN_ROUTE: 'Crew is on the way', ON_SITE: 'Crew is on site', WORKING: 'Crew started work', RESOLVED: 'Crew marked it fixed' };

export async function jobsForCrew(crewId) {
  const rows = await getDb()
    .prepare(
      incidentSummarySql(`a.crew_id = ? AND i.status IN ('ASSIGNED','IN_PROGRESS')`) +
        ` ORDER BY i.priority, i.opened_at`
    )
    .all(crewId);
  return rows.map(decorateIncident);
}

export async function doneToday(crewId, at = nowIso()) {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  const row = await getDb()
    .prepare(
      `SELECT COUNT(*) n FROM work_update w JOIN "user" u ON u.user_id = w.field_worker_id
       WHERE u.crew_id = ? AND w.stage = 'RESOLVED' AND w.created_at >= ?`
    )
    .get(crewId, start.toISOString());
  return row.n;
}

async function requireCrewJob(incidentId, worker) {
  const inc = await requireIncident(incidentId);
  const current = await getDb().prepare('SELECT crew_id FROM assignment WHERE incident_id = ? AND is_current = 1').get(incidentId);
  if (!current || current.crew_id !== worker.crew_id) {
    throw new HttpError(403, `${incidentCode(incidentId)} is not assigned to your crew.`, 'FORBIDDEN');
  }
  return inc;
}

export async function canViewJob(incidentId, worker) {
  const row = await getDb()
    .prepare('SELECT 1 FROM assignment WHERE incident_id = ? AND crew_id = ? LIMIT 1')
    .get(incidentId, worker.crew_id);
  return !!row;
}

// Progress update (FR-34). RESOLVED needs a note; a photo is recommended.
export async function updateProgress(incidentId, worker, { stage, note, photoUrl, latitude, longitude }, at = nowIso()) {
  return tx(async () => {
    if (!STAGES.includes(stage)) throw new HttpError(422, 'Unknown work stage.');
    const inc = await requireCrewJob(incidentId, worker);
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(inc.status)) {
      throw new HttpError(409, `${incidentCode(incidentId)} is ${inc.status.toLowerCase().replace('_', ' ')}; progress can't be updated.`);
    }
    if (stage === 'RESOLVED' && !String(note || '').trim()) {
      throw new HttpError(422, 'Add a short work note describing what was fixed.');
    }
    const lat = latitude != null && latitude !== '' ? Number(latitude) : null;
    const lng = longitude != null && longitude !== '' ? Number(longitude) : null;
    const db = getDb();
    await db.prepare(
      `INSERT INTO work_update (incident_id, field_worker_id, stage, note, photo_url, latitude, longitude, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(incidentId, worker.user_id, stage, String(note || '').trim() || null, photoUrl || null, lat, lng, at);
    await db.prepare('UPDATE incident SET work_stage = ? WHERE incident_id = ?').run(stage, incidentId);

    if (stage === 'RESOLVED') {
      await db.prepare('UPDATE incident SET resolved_at = ? WHERE incident_id = ?').run(at, incidentId);
      await changeStatus(incidentId, 'AWAITING_VERIFICATION', { by: worker.user_id, reason: 'Marked resolved by crew; waiting for citizen verification', at });
      const { requested } = await requestVerification(incidentId, { at });
      if (requested === 0) {
        await notifyOfficers(incidentId, { type: 'OFFICER_VERIFY', at, message: `${incidentCode(incidentId)} resolved but has no reporters to ask. Check the proof.` });
        await db.prepare('UPDATE incident SET needs_officer_verification = 1 WHERE incident_id = ?').run(incidentId);
      }
    } else {
      if (inc.status === 'ASSIGNED') await changeStatus(incidentId, 'IN_PROGRESS', { by: worker.user_id, reason: STAGE_TEXT[stage], at });
      await notifyCitizens(incidentId, { type: 'PROGRESS', at, message: `${STAGE_TEXT[stage]}: ${inc.title}.` });
    }
    return requireIncident(incidentId);
  });
}

// "Taken 6 m from your pin" on the proof.
export async function proofDistance(incidentId) {
  const db = getDb();
  const inc = await requireIncident(incidentId);
  const proof = await db
    .prepare(`SELECT * FROM work_update WHERE incident_id = ? AND stage = 'RESOLVED' ORDER BY created_at DESC LIMIT 1`)
    .get(incidentId);
  if (!proof) return null;
  const assigned = (await db
    .prepare('SELECT MAX(assigned_at) t FROM assignment WHERE incident_id = ? AND assigned_at <= ?')
    .get(incidentId, proof.created_at)).t;
  return {
    ...proof,
    distance_m: proof.latitude != null
      ? Math.round(distanceMeters({ lat: inc.latitude, lng: inc.longitude }, { lat: proof.latitude, lng: proof.longitude }))
      : null,
    after_assignment: assigned ? proof.created_at >= assigned : false,
  };
}
