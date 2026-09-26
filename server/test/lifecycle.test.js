// End-to-end rules from the SRS: consolidation (BR-02, BR-12), verification
// (BR-05, BR-06, BR-10, BR-11), role checks (FR-04, NFR-10) and login lockout.
process.env.CIVICPULSE_DB = ':memory:';
process.env.CIVICPULSE_UPLOAD_DIR = new URL('../data/test-uploads', import.meta.url).pathname;

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { openDb, getDb } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { submitReport } = await import('../src/services/reports.js');
const { textSimilarity } = await import('../src/services/text.js');
const { score, AUTO_LINK_THRESHOLD, CANDIDATE_THRESHOLD } = await import('../src/services/matching.js');
const { assign } = await import('../src/services/assignment.js');
const { updateProgress } = await import('../src/services/fieldwork.js');
const { recordResponse, evaluate, officerVerify } = await import('../src/services/verification.js');
const { recommendPriority, recommendCategory } = await import('../src/services/classification.js');
const { createApp } = await import('../src/app.js');

let db;
let server;
let base;
const HOUR = 3600000;
const iso = (t) => new Date(t).toISOString();
// A quiet spot far from the demo data.
const spot = { lat: 18.62, lng: 73.99 };
const cat = (name) => db.prepare('SELECT category_id FROM category WHERE name = ?').get(name).category_id;
const citizen = (i) => db.prepare("SELECT user_id FROM user WHERE role = 'CITIZEN' ORDER BY user_id LIMIT 1 OFFSET ?").get(i).user_id;
const user = (staffId) => db.prepare('SELECT * FROM user WHERE staff_id = ?').get(staffId);

before(async () => {
  openDb(':memory:');
  seed({ historyDays: 5 });
  db = getDb();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server?.close());

function report(i, text, { category = 'Pothole', dLatM = 0, at = Date.now(), ...rest } = {}) {
  return submitReport(citizen(i), {
    description: text, category_id: cat(category), latitude: spot.lat + dLatM / 111320, longitude: spot.lng, address: '5 Test Rd', ...rest,
  }, { at: iso(at) });
}

// Takes an incident to AWAITING_VERIFICATION through the real services.
function resolve(incidentId, at) {
  const crew = db.prepare("SELECT * FROM crew WHERE name = 'Crew R-7'").get();
  assign(incidentId, { departmentId: crew.department_id, crewId: crew.crew_id }, user('OFF-101'), iso(at));
  const worker = db.prepare('SELECT * FROM user WHERE crew_id = ?').get(crew.crew_id);
  updateProgress(incidentId, worker, { stage: 'RESOLVED', note: 'Fixed' }, iso(at + HOUR));
}

test('text similarity folds synonyms', () => {
  assert.ok(textSimilarity('big hole on the road', 'deep pothole') > 0);
  assert.equal(textSimilarity('garbage bin overflowing', 'streetlight not working'), 0);
});

test('classification suggests categories and raises priority for danger words', () => {
  assert.equal(recommendCategory('streetlight flickering at night')[0].name, 'Streetlight');
  const p = recommendPriority({ categoryId: cat('Pothole'), texts: ['pothole outside the school gate'] });
  assert.equal(p.priority, 'P1');
  assert.match(p.reasons[0], /school/);
});

test('a first report opens an incident; a near-identical one auto-links (BR-12)', () => {
  const t = Date.now() - 2 * HOUR;
  const first = report(0, 'Deep pothole on Test Road near the bakery', { at: t });
  assert.equal(first.decision, 'NEW');
  const second = report(1, 'Huge pothole on Test Road by the bakery', { dLatM: 15, at: t + HOUR });
  assert.equal(second.decision, 'LINKED');
  assert.equal(second.incident_id, first.incident_id);
  assert.ok(second.score >= AUTO_LINK_THRESHOLD);
  const inc = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(first.incident_id);
  assert.equal(inc.report_count, 2);
  assert.equal(inc.status, 'LINKED');
});

test('an uncertain match waits for officer review, and a different category never matches', () => {
  const base = report(2, 'Water pipe leaking on Test Road', { category: 'Water leakage', dLatM: 1000 });
  const maybe = report(3, 'Road is wet here', { category: 'Water leakage', dLatM: 1120 });
  assert.equal(maybe.decision, 'REVIEW');
  assert.equal(maybe.candidate_incident_id, base.incident_id);
  assert.ok(maybe.score >= CANDIDATE_THRESHOLD && maybe.score < AUTO_LINK_THRESHOLD);

  const inc = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(base.incident_id);
  const other = { description: 'Water pipe leaking', category_id: cat('Streetlight'), latitude: inc.latitude, longitude: inc.longitude, submitted_at: iso(Date.now()) };
  assert.ok(score(other, inc).score < CANDIDATE_THRESHOLD);
});

test('invalid reports are rejected with a list of problems (FR-15)', () => {
  assert.throws(() => submitReport(citizen(0), { description: 'x' }), (e) => e.status === 422 && e.problems.length === 3);
});

test('majority of reporters confirms: closed as citizen-verified (BR-10)', () => {
  const t = Date.now() - 10 * HOUR;
  const a = report(4, 'Pothole A on Test Lane', { dLatM: 3000, at: t });
  report(5, 'Pothole A on Test Lane again', { dLatM: 3005, at: t + 1000 });
  report(6, 'Pothole A still on Test Lane', { dLatM: 3010, at: t + 2000 });
  resolve(a.incident_id, t + HOUR);
  recordResponse(a.incident_id, citizen(4), { fixed: true }, iso(t + 3 * HOUR));
  const out = recordResponse(a.incident_id, citizen(5), { fixed: true }, iso(t + 4 * HOUR));
  assert.equal(out.outcome, 'CLOSED'); // 2 of 3 already a majority
  const inc = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(a.incident_id);
  assert.equal(inc.status, 'CLOSED');
  assert.equal(inc.closure_type, 'CITIZEN');
});

test('a tie reopens the incident and ends the crew assignment (BR-06)', () => {
  const t = Date.now() - 10 * HOUR;
  const a = report(7, 'Pothole B on Test Street', { dLatM: 5000, at: t });
  report(8, 'Pothole B on Test Street too', { dLatM: 5005, at: t + 1000 });
  resolve(a.incident_id, t + HOUR);
  recordResponse(a.incident_id, citizen(7), { fixed: true }, iso(t + 3 * HOUR));
  assert.throws(() => recordResponse(a.incident_id, citizen(8), { fixed: false }, iso(t + 4 * HOUR)), /what's still wrong/);
  const out = recordResponse(a.incident_id, citizen(8), { fixed: false, feedback: 'Still there' }, iso(t + 4 * HOUR));
  assert.equal(out.outcome, 'REOPENED');
  const current = db.prepare('SELECT COUNT(*) n FROM assignment WHERE incident_id = ? AND is_current = 1').get(a.incident_id).n;
  assert.equal(current, 0);
});

test('no responses in 72 h goes to the officer, who closes it as officer-verified (BR-11)', () => {
  const t = Date.now() - 100 * HOUR;
  const a = report(9, 'Pothole C on Test Avenue', { dLatM: 7000, at: t });
  resolve(a.incident_id, t + HOUR);
  assert.equal(evaluate(a.incident_id, { at: iso(t + 10 * HOUR) }), null); // window still open
  assert.equal(evaluate(a.incident_id, { at: iso(t + 80 * HOUR) }), 'OFFICER_QUEUE');
  officerVerify(a.incident_id, { close: true }, user('OFF-101').user_id);
  const inc = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(a.incident_id);
  assert.equal(inc.status, 'CLOSED');
  assert.equal(inc.closure_type, 'OFFICER');
});

async function call(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('citizen signs in with a phone code and can report through the API', async () => {
  const otp = await call('/auth/otp', { method: 'POST', body: { phone: '9000000001' } });
  assert.equal(otp.status, 200);
  assert.equal(otp.body.is_new, true);
  const wrong = await call('/auth/otp/verify', { method: 'POST', body: { phone: '9000000001', code: otp.body.demo_code === '123456' ? '654321' : '123456', name: 'Test' } });
  assert.equal(wrong.status, 401);
  const ok = await call('/auth/otp/verify', { method: 'POST', body: { phone: '9000000001', code: otp.body.demo_code, name: 'Test Citizen' } });
  assert.equal(ok.status, 200);
  const token = ok.body.token;
  const rep = await call('/reports', {
    token, method: 'POST',
    body: { description: 'Streetlight out on Test Road', category_id: cat('Streetlight'), latitude: spot.lat - 0.05, longitude: spot.lng },
  });
  assert.equal(rep.status, 201);
  const mine = await call('/reports/mine', { token });
  assert.equal(mine.body.length, 1);
  // Citizens can't reach staff endpoints (FR-07).
  assert.equal((await call('/staff/incidents', { token })).status, 403);
});

test('role checks: a department head cannot assign in another department', async () => {
  const login = await call('/auth/staff', { method: 'POST', body: { staff_id: 'DEP-WASTE', password: 'civicpulse' } });
  const token = login.body.token;
  const roads = db.prepare("SELECT department_id FROM department WHERE name = 'Roads & Highways'").get().department_id;
  const inc = db.prepare("SELECT incident_id FROM incident WHERE status != 'CLOSED' LIMIT 1").get();
  const res = await call(`/staff/incidents/${inc.incident_id}/assign`, { token, method: 'POST', body: { department_id: roads } });
  assert.equal(res.status, 403);
  assert.equal((await call('/staff/match-reviews', { token })).status, 403);
});

test('staff accounts lock after repeated wrong passwords', async () => {
  let last;
  for (let i = 0; i < 5; i += 1) last = await call('/auth/staff', { method: 'POST', body: { staff_id: 'OFF-102', password: 'nope' } });
  assert.equal(last.status, 423);
  const right = await call('/auth/staff', { method: 'POST', body: { staff_id: 'OFF-102', password: 'civicpulse' } });
  assert.equal(right.status, 423);
});
