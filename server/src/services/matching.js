// MatchingEngine: decides whether a new report belongs to an existing
// incident (SRS 4.3, BR-02, BR-12; Level 2 DFD process 2.0).
//
// Score = weighted average of the available signals, each 0..1:
//   distance  0.40  1 within 25 m, falling to 0 at SEARCH_RADIUS_M
//   category  0.25  1 same category, 0.5 same department, else 0
//   text      0.20  word overlap with the incident and its linked reports
//   time      0.15  1 within a day of the latest report, 0 after 14 days
// Photo similarity is listed in the ER diagram but needs image analysis,
// which the SRS leaves optional (OR-05); it is recorded as null and its
// weight is not counted.
import { getDb, nowIso } from '../db.js';
import { distanceMeters, boundingBox } from './geo.js';
import { textSimilarity } from './text.js';
import { OPEN_STATUSES } from './incidents.js';

export const AUTO_LINK_THRESHOLD = 0.9; // BR-12
export const CANDIDATE_THRESHOLD = 0.6; // below this a report opens a new incident
export const SEARCH_RADIUS_M = 300;

const WEIGHTS = { distance: 0.4, category: 0.25, text: 0.2, time: 0.15 };

function distanceScore(d) {
  if (d <= 25) return 1;
  if (d >= SEARCH_RADIUS_M) return 0;
  return 1 - (d - 25) / (SEARCH_RADIUS_M - 25);
}

function timeScore(hours) {
  if (hours <= 24) return 1;
  if (hours >= 24 * 14) return 0;
  return 1 - (hours - 24) / (24 * 13);
}

async function sameDepartment(catA, catB) {
  const row = await getDb()
    .prepare(
      `SELECT 1 FROM department_category a JOIN department_category b ON a.department_id = b.department_id
       WHERE a.category_id = ? AND b.category_id = ? LIMIT 1`
    )
    .get(catA, catB);
  return !!row;
}

// Open incidents near a point (FR-16, OR-03).
export async function findCandidates({ latitude, longitude }, { radius = SEARCH_RADIUS_M, excludeIds = [] } = {}) {
  const box = boundingBox({ lat: latitude, lng: longitude }, radius);
  const rows = await getDb()
    .prepare(
      `SELECT * FROM incident
       WHERE status IN (${OPEN_STATUSES.map(() => '?').join(',')})
         AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`
    )
    .all(...OPEN_STATUSES, box.minLat, box.maxLat, box.minLng, box.maxLng);
  return rows
    .filter((r) => !excludeIds.includes(r.incident_id))
    .map((r) => ({ ...r, distance_m: distanceMeters({ lat: latitude, lng: longitude }, { lat: r.latitude, lng: r.longitude }) }))
    .filter((r) => r.distance_m <= radius);
}

export async function score(report, incident) {
  const db = getDb();
  const linked = await db.prepare('SELECT description, submitted_at FROM report WHERE incident_id = ?').all(incident.incident_id);
  const texts = [incident.title, incident.description, ...linked.map((r) => r.description)];
  const text = Math.max(0, ...texts.map((t) => textSimilarity(report.description, t)));

  const latest = Math.max(Date.parse(incident.opened_at), ...linked.map((r) => Date.parse(r.submitted_at)));
  const submitted = Date.parse(report.submitted_at || nowIso());
  const gapHours = Math.max(0, (submitted - latest) / 3600000);

  let category = 0;
  if (report.category_id === incident.category_id) category = 1;
  else if (await sameDepartment(report.category_id, incident.category_id)) category = 0.5;

  const distance_m = incident.distance_m ?? distanceMeters(
    { lat: report.latitude, lng: report.longitude },
    { lat: incident.latitude, lng: incident.longitude }
  );

  const parts = {
    distance: distanceScore(distance_m),
    category,
    text: Math.min(1, text * 1.6), // short texts rarely share many words; scale up
    time: timeScore(gapHours),
  };
  let total = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) total += parts[k] * w;

  // Two different kinds of problem are never the same incident.
  if (category === 0) total = Math.min(total, CANDIDATE_THRESHOLD - 0.01);

  return {
    score: Math.round(total * 100) / 100,
    signals: {
      distance_m: Math.round(distance_m),
      category: category === 1 ? 'same' : category === 0.5 ? 'related' : 'different',
      text: Math.round(text * 100) / 100,
      photo: null,
      time_gap_h: Math.round(gapHours * 10) / 10,
    },
  };
}

// Best candidate and what to do with it (Level 2 DFD 2.3).
export async function evaluate(report, options = {}) {
  const candidates = [];
  for (const inc of await findCandidates(report, options)) candidates.push({ incident: inc, ...(await score(report, inc)) });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || null;
  let decision = 'NEW';
  if (best && best.score >= AUTO_LINK_THRESHOLD) decision = 'AUTO_LINK';
  else if (best && best.score >= CANDIDATE_THRESHOLD) decision = 'REVIEW';
  return { decision, best, candidates: candidates.slice(0, 5) };
}
