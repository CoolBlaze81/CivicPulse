// VerificationService (SRS 4.7, FR-39..FR-45, FR-61..FR-63, BR-05, BR-06,
// BR-10, BR-11; Level 2 DFD process 6.0).
//
// When a crew marks an incident resolved, every citizen with a linked
// report gets a request that stays open for WINDOW_HOURS. The majority of
// responses decides; a tie reopens. The outcome is decided early once the
// remaining responses can no longer change it. With no responses when the
// window closes, the incident goes to the officer verification queue.
import { getDb, nowIso, tx } from '../db.js';
import { changeStatus, HttpError, incidentCode, logEvent, requireIncident } from './incidents.js';
import { incidentCitizens, notify, notifyCitizens, notifyCrew, notifyOfficers, notifyDepartmentHead } from './notifications.js';

export const WINDOW_HOURS = Number(process.env.VERIFICATION_WINDOW_HOURS || 72);

async function currentRound(incidentId) {
  return (await getDb().prepare('SELECT COALESCE(MAX(round), 0) r FROM verification_request WHERE incident_id = ?').get(incidentId)).r;
}

export async function roundRequests(incidentId, round) {
  if (round == null) round = await currentRound(incidentId);
  return getDb()
    .prepare(
      `SELECT v.*, u.name AS citizen_name FROM verification_request v JOIN "user" u ON u.user_id = v.citizen_id
       WHERE v.incident_id = ? AND v.round = ? ORDER BY v.request_id`
    )
    .all(incidentId, round);
}

// Called when the field worker marks the incident resolved (6.1).
export async function requestVerification(incidentId, { at = nowIso() } = {}) {
  const db = getDb();
  const round = (await currentRound(incidentId)) + 1;
  const expires = new Date(Date.parse(at) + WINDOW_HOURS * 3600000).toISOString();
  const citizens = await incidentCitizens(incidentId);
  const inc = await requireIncident(incidentId);
  const insert = db.prepare(
    `INSERT INTO verification_request (incident_id, citizen_id, round, sent_at, expires_at) VALUES (?, ?, ?, ?, ?)`
  );
  for (const c of citizens) {
    await insert.run(incidentId, c, round, at, expires);
    await notify(c, {
      type: 'VERIFY_REQUEST', incidentId, at,
      message: `${inc.title} marked fixed. Check the proof and tell us if it's really fixed. You have ${WINDOW_HOURS} h.`,
    });
  }
  return { round, expires_at: expires, requested: citizens.length };
}

function tally(requests) {
  const fixed = requests.filter((r) => r.response === 'FIXED').length;
  const notFixed = requests.filter((r) => r.response === 'NOT_FIXED').length;
  return { fixed, notFixed, responded: fixed + notFixed, total: requests.length, pending: requests.length - fixed - notFixed };
}

async function closeIncident(incidentId, type, { by = null, reason, at }) {
  const db = getDb();
  await db.prepare('UPDATE incident SET closure_type = ?, closed_at = ?, needs_officer_verification = 0 WHERE incident_id = ?').run(type, at, incidentId);
  await changeStatus(incidentId, 'CLOSED', { by, reason, at });
  const inc = await requireIncident(incidentId);
  await notifyCitizens(incidentId, {
    type: 'CLOSED', at,
    message: type === 'CITIZEN'
      ? `${inc.title} is closed after reporters confirmed the fix.`
      : `${inc.title} was closed by an officer after checking the crew's proof.`,
  });
}

// BR-06: back into the queue for reassignment. The crew's assignment ends.
export async function reopenIncident(incidentId, { by = null, reason, at = nowIso() }) {
  const db = getDb();
  const inc = await requireIncident(incidentId);
  const current = await db.prepare('SELECT * FROM assignment WHERE incident_id = ? AND is_current = 1').get(incidentId);
  await db.prepare('UPDATE assignment SET is_current = 0 WHERE incident_id = ? AND is_current = 1').run(incidentId);
  await db.prepare('UPDATE incident SET resolved_at = NULL, work_stage = NULL, needs_officer_verification = 0 WHERE incident_id = ?').run(incidentId);
  // Requests still open in this round are no longer needed.
  await db.prepare(
    `UPDATE verification_request SET expires_at = ? WHERE incident_id = ? AND round = ? AND response IS NULL AND expires_at > ?`
  ).run(at, incidentId, await currentRound(incidentId), at);
  await changeStatus(incidentId, 'REOPENED', { by, reason, at });
  await notifyCitizens(incidentId, { type: 'REOPENED', at, message: `${inc.title} was reopened and will be reassigned.` });
  await notifyOfficers(incidentId, { type: 'REOPENED', at, message: `${incidentCode(incidentId)} ${inc.title} reopened: ${reason}` });
  if (current?.crew_id) await notifyCrew(current.crew_id, { type: 'REOPENED', incidentId, at, message: `${incidentCode(incidentId)} was reopened after verification.` });
  if (inc.department_id) await notifyDepartmentHead(inc.department_id, { type: 'REOPENED', incidentId, at, message: `${incidentCode(incidentId)} ${inc.title} reopened and needs a crew.` });
}

// Decide the outcome if it is settled (6.3). Returns the outcome or null.
export async function evaluate(incidentId, { at = nowIso() } = {}) {
  const inc = await requireIncident(incidentId);
  if (inc.status !== 'AWAITING_VERIFICATION') return null;
  const requests = await roundRequests(incidentId);
  const t = tally(requests);
  const expired = requests.length === 0 || requests.every((r) => Date.parse(r.expires_at) <= Date.parse(at));

  // Early decision: even if every pending reporter answered the other way,
  // the result would not change. (A tie reopens, so "fixed" needs a strict majority.)
  const settledFixed = t.fixed > t.notFixed + t.pending;
  const settledNotFixed = t.responded > 0 && t.fixed + t.pending <= t.notFixed;

  if (settledFixed || (expired && t.responded > 0 && t.fixed > t.notFixed)) {
    await closeIncident(incidentId, 'CITIZEN', { reason: `Citizen-verified: ${t.fixed} of ${t.responded} said fixed`, at });
    return 'CLOSED';
  }
  if (settledNotFixed || (expired && t.responded > 0 && t.fixed <= t.notFixed)) {
    const why = t.fixed === t.notFixed ? `tie (${t.fixed}–${t.notFixed})` : `${t.notFixed} of ${t.responded} said not fixed`;
    await reopenIncident(incidentId, { reason: `Verification: ${why}`, at });
    return 'REOPENED';
  }
  if (expired && t.responded === 0 && !inc.needs_officer_verification) {
    await getDb().prepare('UPDATE incident SET needs_officer_verification = 1 WHERE incident_id = ?').run(incidentId);
    await logEvent(incidentId, `No reporter responded within ${WINDOW_HOURS} h; sent to officer verification`, { at });
    await notifyOfficers(incidentId, { type: 'OFFICER_VERIFY', at, message: `${incidentCode(incidentId)} ${inc.title}: no reporter responded. Check the proof.` });
    return 'OFFICER_QUEUE';
  }
  return null;
}

// Citizen answers (6.2). feedback/photo required when not fixed? Feedback is
// strongly encouraged; the SRS says "where required", so a note is required
// for NOT_FIXED and a photo is optional.
export async function recordResponse(incidentId, citizenId, { fixed, feedback, photoUrl }, at = nowIso()) {
  return tx(async () => {
    const db = getDb();
    const inc = await requireIncident(incidentId);
    if (inc.status !== 'AWAITING_VERIFICATION') throw new HttpError(409, 'This incident is not waiting for verification any more.');
    const req = await db
      .prepare('SELECT * FROM verification_request WHERE incident_id = ? AND citizen_id = ? AND round = ?')
      .get(incidentId, citizenId, await currentRound(incidentId));
    if (!req) throw new HttpError(403, 'Only citizens who reported this incident can verify it.', 'FORBIDDEN');
    if (req.response) throw new HttpError(409, 'You already answered for this incident.');
    if (Date.parse(req.expires_at) <= Date.parse(at)) throw new HttpError(409, 'The 72-hour window for this incident has closed.');
    if (!fixed && !String(feedback || '').trim()) throw new HttpError(422, "Tell us what's still wrong so the crew knows what to fix.");
    await db.prepare('UPDATE verification_request SET response = ?, feedback = ?, proof_photo_url = ?, responded_at = ? WHERE request_id = ?')
      .run(fixed ? 'FIXED' : 'NOT_FIXED', String(feedback || '').trim() || null, photoUrl || null, at, req.request_id);
    await logEvent(incidentId, `A reporter said ${fixed ? 'it is fixed' : `it is not fixed${feedback ? `: “${String(feedback).trim()}”` : ''}`}`, { by: citizenId, at });
    const outcome = await evaluate(incidentId, { at });
    const t = tally(await roundRequests(incidentId));
    return { outcome, ...t };
  });
}

// Officer decision when no citizen responded (FR-63, BR-11).
export async function officerVerify(incidentId, { close, reason }, officerId, at = nowIso()) {
  return tx(async () => {
    const inc = await requireIncident(incidentId);
    if (inc.status !== 'AWAITING_VERIFICATION' || !inc.needs_officer_verification) {
      throw new HttpError(409, 'This incident is not in the officer verification queue.');
    }
    if (close) await closeIncident(incidentId, 'OFFICER', { by: officerId, reason: 'Closed · officer-verified after checking proof', at });
    else await reopenIncident(incidentId, { by: officerId, reason: reason || 'Officer rejected the resolution proof', at });
    return requireIncident(incidentId);
  });
}

// Close any windows that have run out. Runs on a timer and before reads.
export async function sweepExpired(at = nowIso()) {
  const due = await getDb()
    .prepare(
      `SELECT DISTINCT i.incident_id FROM incident i JOIN verification_request v ON v.incident_id = i.incident_id
       WHERE i.status = 'AWAITING_VERIFICATION' AND i.needs_officer_verification = 0 AND v.expires_at <= ?`
    )
    .all(at);
  for (const { incident_id } of due) await tx(() => evaluate(incident_id, { at }));
  return due.length;
}

export async function verificationState(incidentId, citizenId = null) {
  const requests = await roundRequests(incidentId);
  const mine = citizenId ? requests.find((r) => r.citizen_id === citizenId) : null;
  return {
    round: requests[0]?.round || 0,
    expires_at: requests[0]?.expires_at || null,
    ...tally(requests),
    mine: mine ? { response: mine.response, feedback: mine.feedback, responded_at: mine.responded_at } : null,
    responses: citizenId ? undefined : requests.map((r) => ({
      citizen_name: r.citizen_name, response: r.response, feedback: r.feedback, proof_photo_url: r.proof_photo_url, responded_at: r.responded_at,
    })),
  };
}

// Officer verification queue plus incidents still inside their window.
export async function officerQueue(at = nowIso()) {
  await sweepExpired(at);
  const db = getDb();
  const incidents = await db
    .prepare(
      `SELECT i.*, c.name AS category_name, cr.name AS crew_name, d.name AS department_name
       FROM incident i JOIN category c ON c.category_id = i.category_id
       LEFT JOIN assignment a ON a.incident_id = i.incident_id AND a.is_current = 1
       LEFT JOIN crew cr ON cr.crew_id = a.crew_id LEFT JOIN department d ON d.department_id = i.department_id
       WHERE i.status = 'AWAITING_VERIFICATION' ORDER BY i.resolved_at`
    )
    .all();
  const rows = [];
  for (const i of incidents) rows.push({ ...i, code: incidentCode(i.incident_id), verification: await verificationState(i.incident_id) });
  const dayAgo = new Date(Date.parse(at) - 24 * 3600000).toISOString();
  const { n: decidedToday } = await db
    .prepare(
      `SELECT COUNT(*) n FROM status_history WHERE changed_at >= ? AND from_status = 'AWAITING_VERIFICATION' AND to_status IN ('CLOSED','REOPENED')`
    )
    .get(dayAgo);
  return {
    needs_officer: rows.filter((r) => r.needs_officer_verification),
    in_window: rows.filter((r) => !r.needs_officer_verification),
    decided_today: decidedToday,
  };
}
