// Officer match review for reports the engine was unsure about (FR-21, BR-12).
import { getDb, nowIso, tx } from '../db.js';
import { attachReport, createIncidentFromReport, HttpError, incidentCode, reportCode } from './incidents.js';

export async function pendingReviews() {
  const rows = await getDb()
    .prepare(
      `SELECT m.*, r.description, r.photo_url, r.address, r.submitted_at, r.latitude, r.longitude,
              c.name AS category_name, i.title AS incident_title, i.description AS incident_description,
              i.report_count, i.status AS incident_status, i.opened_at AS incident_opened_at,
              i.latitude AS incident_latitude, i.longitude AS incident_longitude, ic.name AS incident_category_name,
              cr.name AS crew_name
       FROM match_review m
       JOIN report r ON r.report_id = m.report_id
       JOIN category c ON c.category_id = r.category_id
       JOIN incident i ON i.incident_id = m.candidate_incident_id
       JOIN category ic ON ic.category_id = i.category_id
       LEFT JOIN assignment a ON a.incident_id = i.incident_id AND a.is_current = 1
       LEFT JOIN crew cr ON cr.crew_id = a.crew_id
       WHERE m.decision IS NULL ORDER BY m.score DESC, m.created_at`
    )
    .all();
  return rows.map((m) => ({
      ...m,
      signals: JSON.parse(m.signals),
      report_code: reportCode(m.report_id),
      incident_code: incidentCode(m.candidate_incident_id),
    }));
}

// decision: LINK (to the candidate), NEW_INCIDENT, or OTHER (link to other_incident_id)
export async function decide(reviewId, { decision, otherIncidentId }, officerId, at = nowIso()) {
  return tx(async () => {
    const db = getDb();
    const review = await db.prepare('SELECT * FROM match_review WHERE review_id = ?').get(reviewId);
    if (!review) throw new HttpError(404, 'That match review no longer exists.');
    if (review.decision) throw new HttpError(409, 'Someone already decided this match.');
    const report = await db.prepare('SELECT * FROM report WHERE report_id = ?').get(review.report_id);

    let incidentId;
    if (decision === 'LINK') {
      incidentId = review.candidate_incident_id;
      await attachReport(report.report_id, incidentId, { method: 'OFFICER', score: review.score, by: officerId, at });
    } else if (decision === 'OTHER') {
      if (!otherIncidentId) throw new HttpError(422, 'Choose the incident to link this report to.');
      incidentId = Number(otherIncidentId);
      await attachReport(report.report_id, incidentId, { method: 'OFFICER', score: null, by: officerId, at });
    } else if (decision === 'NEW_INCIDENT') {
      incidentId = (await createIncidentFromReport(report, { by: officerId, at })).incident_id;
    } else {
      throw new HttpError(422, 'Unknown decision.');
    }
    await db.prepare('UPDATE match_review SET decision = ?, decided_incident_id = ?, officer_id = ?, decided_at = ? WHERE review_id = ?')
      .run(decision, incidentId, officerId, at, reviewId);
    return { review_id: reviewId, decision, incident_id: incidentId };
  });
}
