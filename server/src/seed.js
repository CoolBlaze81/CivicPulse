// Demo data for the fictional MetroServe Municipal Operations Authority.
// Builds ~100 days of history through the real services (so status
// history, notifications and analytics are consistent), then the live
// scenarios shown in the design mockups.
//
//   npm run seed          wipe and rebuild the demo database
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, getDb, openDb } from './db.js';
import { hashPassword } from './auth.js';
import { wardCenter, wardFor } from './services/geo.js';
import { submitReport } from './services/reports.js';
import { attachReport, createIncidentFromReport, changeStatus } from './services/incidents.js';
import { decide, pendingReviews } from './services/matchReview.js';
import { assign, classify, suggestCrew } from './services/assignment.js';
import { updateProgress } from './services/fieldwork.js';
import { recordResponse, evaluate as evaluateVerification, officerVerify, sweepExpired } from './services/verification.js';
import { refreshRecommendations } from './services/classification.js';

export const DEMO_PASSWORD = 'civicpulse';

// Deterministic random numbers so every seed gives the same data.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260926);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);
const HOUR = 3600000;
const DAY = 24 * HOUR;

const CATEGORIES = [
  ['Pothole', 'P3'], ['Damaged road', 'P3'], ['Road collapse', 'P1'], ['Footpath', 'P3'], ['Road markings', 'P4'],
  ['Waste', 'P3'], ['Streetlight', 'P3'], ['Drainage', 'P3'], ['Water leakage', 'P3'], ['Public property', 'P4'],
];

const DEPARTMENTS = [
  { name: 'Roads & Highways', code: 'R', head: ['S. Menon', 'DEP-ROADS'], categories: ['Pothole', 'Damaged road', 'Road collapse', 'Footpath', 'Road markings'] },
  { name: 'Solid Waste Management', code: 'S', head: ['F. Shaikh', 'DEP-WASTE'], categories: ['Waste'] },
  { name: 'Electrical Services', code: 'E', head: ['V. Rao', 'DEP-ELEC'], categories: ['Streetlight'] },
  { name: 'Water Supply & Sewerage', code: 'W', head: ['M. Kulkarni', 'DEP-WATER'], categories: ['Water leakage', 'Drainage'] },
  { name: 'Public Works', code: 'P', head: ['J. Thomas', 'DEP-WORKS'], categories: ['Public property'] },
];

// [name, members, skills, zone, availability, max_load]
const CREWS = {
  R: [
    ['Crew R-1', 4, 'Patching, resurfacing', '7,8', 'ON_DUTY', 5], ['Crew R-2', 5, 'Excavation, cave-in repair', '9', 'ON_DUTY', 5],
    ['Crew R-3', 3, 'Patching', '10', 'ON_DUTY', 5], ['Crew R-4', 4, 'Patching, resurfacing', '11,12', 'ON_DUTY', 5],
    ['Crew R-5', 3, 'Kerbs, footpaths', '8', 'ON_DUTY', 5], ['Crew R-6', 4, 'Speed-breakers, markings', '12', 'ON_DUTY', 5],
    ['Crew R-7', 3, 'Patching', '1,2,3,4,5,6', 'ON_DUTY', 5], ['Crew R-8', 4, 'Excavation', '10,11,12', 'ON_LEAVE', 5],
  ],
  S: [['Crew S-1', 6, 'Collection, bins', '1,2,3,4,5,6', 'ON_DUTY', 6], ['Crew S-2', 6, 'Collection, bins', '7,8,9', 'ON_DUTY', 6], ['Crew S-3', 5, 'Bulk waste', '10,11,12', 'ON_DUTY', 6]],
  E: [['Crew E-1', 3, 'Streetlights', '1,2,3,4,5,6', 'ON_DUTY', 5], ['Crew E-2', 3, 'Streetlights, junction boxes', '7,8,11,12', 'ON_DUTY', 5], ['Crew E-3', 3, 'Streetlights', '9,10', 'OFF_SHIFT', 5]],
  W: [
    ['Crew W-1', 4, 'Pipes, mains', '1,2,3,4,5,6,7', 'ON_DUTY', 5], ['Crew W-2', 4, 'Pipes, mains', '8,9,10,11,12', 'ON_DUTY', 5],
    ['Crew D-3', 4, 'Drain clearing', '7,8,9,10,11,12', 'ON_DUTY', 5], ['Crew D-4', 4, 'Drain clearing', '1,2,3,4,5,6', 'ON_DUTY', 5],
  ],
  P: [['Crew P-1', 3, 'Signage, fencing', '1,2,3,4,5,6', 'ON_DUTY', 5], ['Crew P-2', 3, 'Benches, bus stops, signage', '7,8,9,10,11,12', 'ON_DUTY', 5]],
};

const EQUIPMENT = {
  R: [['Asphalt patcher', 3, 2], ['Excavator (JCB)', 2, 1], ['Road roller', 2, 2], ['Barricade sets', 4, 3]],
  S: [['Compactor truck', 4, 3], ['Tipper', 2, 2]],
  E: [['Aerial lift', 2, 1], ['Cable fault locator', 1, 1]],
  W: [['Suction jetting machine', 2, 1], ['Pipe repair kit', 5, 4]],
  P: [['Utility van', 2, 2]],
};

const STREETS = {
  1: ['Hill Rd', 'Temple St'], 2: ['University Rd', 'Park Ave'], 3: ['Lake Rd', 'Mill St'], 4: ['Airport Rd', 'Cantonment Rd'],
  5: ['Nehru Marg', 'Fort Rd'], 6: ['Bazaar Rd', 'Station Approach'], 7: ['Ring Rd', 'Gandhi Nagar Main Rd'], 8: ['Canal Rd', 'Shivaji Path'],
  9: ['Station Rd', 'Sector 9 Park Rd'], 10: ['Tilak Marg', 'MG Rd'], 11: ['Market St', 'Old Bazaar Rd'], 12: ['Sector 12 Main Rd', 'Lakeview Ln'],
};

// Phrases citizens use, per category. {s} = street.
const PHRASES = {
  Pothole: ['Deep pothole on {s}, bikes swerving around it', 'Big hole in the road near {s}', 'Pothole getting bigger on {s}', 'Huge pothole outside the shops on {s}'],
  'Damaged road': ['Road surface broken and uneven on {s}', 'Cracked road near {s} junction', 'Damaged road, asphalt coming off on {s}'],
  'Road collapse': ['Road has caved in on {s}', 'Road sinking near {s}, dangerous pit'],
  Footpath: ['Broken footpath slab on {s}', 'Footpath tiles missing near {s}', 'Kerb stones broken on {s}'],
  'Road markings': ['Zebra crossing markings faded on {s}', 'Lane markings gone on {s}', 'Speed breaker has no paint on {s}'],
  Waste: ['Garbage bin overflowing on {s}', 'Garbage dumped on the roadside at {s}', 'Waste not collected for days near {s}', 'Overflowing bin smells, {s}'],
  Streetlight: ['Streetlight not working on {s}', 'Street light off at night near {s}, very dark', 'Streetlight flickering on {s}'],
  Drainage: ['Drain blocked on {s}, water stagnant', 'Blocked gutter overflowing near {s}', 'Clogged drain on {s} after rain'],
  'Water leakage': ['Water pipe leaking on {s}', 'Water leak from pipeline near {s}', 'Leaking tap wasting water at {s}'],
  'Public property': ['Bench broken at the bus stop on {s}', 'Signboard fallen near {s}', 'Railing damaged on {s}'],
};

// Days from first report to resolution, by category (median-ish).
const RESOLVE_DAYS = {
  Pothole: 2.6, 'Damaged road': 3.5, 'Road collapse': 1.2, Footpath: 4.5, 'Road markings': 6, Waste: 1.2,
  Streetlight: 3.2, Drainage: 3.8, 'Water leakage': 3, 'Public property': 5,
};

const FIRST = ['Aditi', 'Rohan', 'Priya', 'Kabir', 'Sneha', 'Arjun', 'Meera', 'Vikram', 'Ananya', 'Ishaan', 'Neha', 'Siddharth', 'Pooja',
  'Rahul', 'Kavya', 'Dev', 'Tanvi', 'Nikhil', 'Riya', 'Aman', 'Zoya', 'Harsh', 'Divya', 'Omkar', 'Farah', 'Yash', 'Sana', 'Karan',
  'Lata', 'Manish', 'Nisha', 'Pranav', 'Rekha', 'Samir', 'Uma', 'Varun', 'Asha', 'Gaurav', 'Hema', 'Irfan'];
const LAST = ['Sharma', 'Patil', 'Iyer', 'Khan', 'Deshmukh', 'Joshi', 'Nair', 'Gupta', 'Kulkarni', 'Reddy', 'Pawar', 'Das', 'Bose', 'Pillai'];

function reset() {
  const file = process.env.CIVICPULSE_DB || path.join(DATA_DIR, 'civicpulse.db');
  const db = getDb();
  if (file === ':memory:') {
    db.exec(`PRAGMA foreign_keys = OFF;
      DELETE FROM notification; DELETE FROM verification_request; DELETE FROM work_update; DELETE FROM assignment;
      DELETE FROM status_history; DELETE FROM match_review; DELETE FROM report; DELETE FROM incident; DELETE FROM otp_code;
      DELETE FROM equipment; DELETE FROM user; DELETE FROM crew; DELETE FROM department_category; DELETE FROM category;
      DELETE FROM department; DELETE FROM sqlite_sequence; PRAGMA foreign_keys = ON;`);
    return db;
  }
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  return openDb(file);
}

function jitter(point, meters) {
  const dLat = (between(-1, 1) * meters) / 111320;
  const dLng = (between(-1, 1) * meters) / (111320 * Math.cos((point.lat * Math.PI) / 180));
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}

function randomPointInWard(ward) {
  const c = wardCenter(ward);
  for (;;) {
    const p = { lat: c.lat + between(-0.009, 0.009), lng: c.lng + between(-0.009, 0.009) };
    if (wardFor(p) === ward) return p;
  }
}

export function seed({ now = Date.now(), historyDays = 100 } = {}) {
  const db = reset();
  const iso = (t) => new Date(t).toISOString();
  const pw = hashPassword(DEMO_PASSWORD);
  db.exec("INSERT INTO sqlite_sequence (name, seq) VALUES ('incident', 1000), ('report', 8000)");

  // ---- reference data ----
  const catId = {};
  for (const [name, p] of CATEGORIES) {
    catId[name] = Number(db.prepare('INSERT INTO category (name, default_priority) VALUES (?, ?)').run(name, p).lastInsertRowid);
  }
  const deptId = {};
  const crewIds = {};
  const insertUser = db.prepare(
    `INSERT INTO user (name, phone, staff_id, password_hash, role, department_id, crew_id, wards, home_area, created_at)
     VALUES (@name, @phone, @staff_id, @password_hash, @role, @department_id, @crew_id, @wards, @home_area, @created_at)`
  );
  const user = (u) => Number(insertUser.run({
    phone: null, staff_id: null, password_hash: null, department_id: null, crew_id: null, wards: null, home_area: null,
    created_at: iso(now - (historyDays + 30) * DAY), ...u,
  }).lastInsertRowid);

  for (const d of DEPARTMENTS) {
    const id = Number(db.prepare('INSERT INTO department (name, short_code) VALUES (?, ?)').run(d.name, d.code).lastInsertRowid);
    deptId[d.name] = id;
    for (const c of d.categories) db.prepare('INSERT INTO department_category VALUES (?, ?)').run(id, catId[c]);
    for (const [name, members, skills, zone, availability, maxLoad] of CREWS[d.code]) {
      const crewId = Number(
        db.prepare('INSERT INTO crew (department_id, name, members, zone, skills, availability, max_load) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, name, members, zone, skills, availability, maxLoad).lastInsertRowid
      );
      crewIds[name] = crewId;
      user({ name: `${name} lead`, staff_id: `CREW-${name.split(' ')[1]}`, password_hash: pw, role: 'FIELD_WORKER', crew_id: crewId });
    }
    for (const [name, total, avail] of EQUIPMENT[d.code]) {
      db.prepare('INSERT INTO equipment (department_id, name, total_units, available_units) VALUES (?, ?, ?, ?)').run(id, name, total, avail);
    }
    const headId = user({ name: d.head[0], staff_id: d.head[1], password_hash: pw, role: 'DEPT_HEAD', department_id: id });
    db.prepare('UPDATE department SET head_user_id = ? WHERE department_id = ?').run(headId, id);
  }
  // Rename crew leads to people so notifications read naturally.
  const crewLeadNames = ['Ravi Kumar', 'Sunil Jadhav', 'Imran Shaikh', 'Ganesh More', 'Prakash Naik', 'Dinesh Yadav', 'Ajay Salunkhe', 'Mohan Lal',
    'Salim Ansari', 'Rajesh Pal', 'Kiran Bhosale', 'Anil Gawde', 'Ramesh Babu', 'Suresh Kamble', 'Vijay Thakur', 'Nitin Chavan', 'Arif Sayyed',
    'Deepak Shinde', 'Mahesh Patil', 'Santosh Rane'];
  db.prepare("SELECT user_id FROM user WHERE role = 'FIELD_WORKER' ORDER BY user_id").all()
    .forEach((u, i) => db.prepare('UPDATE user SET name = ? WHERE user_id = ?').run(crewLeadNames[i % crewLeadNames.length], u.user_id));

  const officer = user({ name: 'R. Kapoor', staff_id: 'OFF-101', password_hash: pw, role: 'OFFICER', wards: '7,8,9,10,11,12' });
  const officer2 = user({ name: 'N. Iyer', staff_id: 'OFF-102', password_hash: pw, role: 'OFFICER', wards: '1,2,3,4,5,6' });
  user({ name: 'A. Desai', staff_id: 'ADM-001', password_hash: pw, role: 'ADMIN' });

  const aarav = user({ name: 'Aarav Mehta', phone: '9876543210', role: 'CITIZEN', home_area: 'Sector 14' });
  const citizens = [];
  for (let i = 0; i < 60; i += 1) {
    citizens.push(user({ name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`, phone: `98${String(20000000 + i * 7919).slice(0, 8)}`, role: 'CITIZEN' }));
  }
  const officerFor = (ward) => (ward >= 7 ? officer : officer2);
  const actor = (id) => db.prepare('SELECT * FROM user WHERE user_id = ?').get(id);
  const crewLead = (crewId) => db.prepare("SELECT * FROM user WHERE crew_id = ? AND role = 'FIELD_WORKER'").get(crewId);

  // ---- synthetic history ----
  // Incidents start through the matching engine, then go through the full
  // lifecycle. Resolution gets faster over the period (a visible trend).
  const categoryWeights = [
    ['Pothole', 26], ['Waste', 20], ['Streetlight', 15], ['Drainage', 11], ['Water leakage', 10], ['Damaged road', 7],
    ['Footpath', 4], ['Public property', 3], ['Road markings', 3], ['Road collapse', 1],
  ];
  const weightedCategory = () => {
    let x = rand() * categoryWeights.reduce((s, c) => s + c[1], 0);
    for (const [c, w] of categoryWeights) { x -= w; if (x <= 0) return c; }
    return 'Pothole';
  };

  const events = [];
  const nIncidents = Math.round(historyDays * 3.2);
  for (let k = 0; k < nIncidents; k += 1) {
    const start = now - between(historyDays, 1.5) * DAY;
    const category = weightedCategory();
    const ward = 1 + Math.floor(rand() * 12);
    const street = pick(STREETS[ward]);
    const point = randomPointInWard(ward);
    const reports = 1 + Math.floor(rand() ** 2.2 * 5);
    events.push({ start, category, ward, street, point, reports });
  }
  events.sort((a, b) => a.start - b.start);

  const reviewTruth = new Map(); // report_id -> intended incident_id
  const lifecycle = [];

  for (const ev of events) {
    let incidentId = null;
    const text = () => pick(PHRASES[ev.category]).replace('{s}', ev.street);
    const address = `${Math.floor(between(2, 120))} ${ev.street}`;
    for (let j = 0; j < ev.reports; j += 1) {
      const at = ev.start + (j === 0 ? 0 : between(0.2, 30) * HOUR * j ** 0.5);
      const p = jitter(ev.point, j === 0 ? 0 : 45);
      const out = submitReport(pick(citizens), {
        description: text(), category_id: catId[ev.category], latitude: p.lat, longitude: p.lng, address,
      }, { at: iso(at) });
      if (j === 0) {
        incidentId = out.incident_id ?? out.candidate_incident_id;
        if (out.decision === 'REVIEW') {
          // First report looked like an older incident: officer says new.
          const rev = db.prepare('SELECT review_id FROM match_review WHERE report_id = ?').get(out.report_id);
          incidentId = decide(rev.review_id, { decision: 'NEW_INCIDENT' }, officerFor(ev.ward), iso(at + 2 * HOUR)).incident_id;
        } else if (out.decision === 'LINKED') {
          incidentId = null; // joined an older incident; nothing new to run
          break;
        }
      } else if (out.decision === 'REVIEW') {
        reviewTruth.set(out.report_id, incidentId);
        const rev = db.prepare('SELECT review_id, candidate_incident_id FROM match_review WHERE report_id = ?').get(out.report_id);
        const d = rev.candidate_incident_id === incidentId ? { decision: 'LINK' } : { decision: 'OTHER', otherIncidentId: incidentId };
        decide(rev.review_id, d, officerFor(ev.ward), iso(at + between(0.5, 5) * HOUR));
      } else if (out.decision === 'NEW') {
        // Engine missed it; the officer links it during triage via review.
      }
    }
    if (incidentId) lifecycle.push({ ...ev, incidentId });
  }

  for (const ev of lifecycle) {
    const inc = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(ev.incidentId);
    if (!inc || inc.status === 'CLOSED') continue;
    const age = (now - ev.start) / DAY;
    const officerId = officerFor(ev.ward);
    const progress = 1 - age / historyDays; // 0 = oldest, 1 = newest
    const speed = 1.35 - 0.6 * progress; // older work was slower
    const resolveAfter = RESOLVE_DAYS[ev.category] * speed * between(0.55, 1.5) * DAY;
    const tAssign = ev.start + between(1, 10) * HOUR;
    if (tAssign > now - 2 * HOUR) continue; // still waiting for triage
    const deptIdFor = refreshRecommendations(ev.incidentId).departmentId;
    classify(ev.incidentId, {}, officerId, iso(tAssign - 10 * 60000));
    const crew = suggestCrew(deptIdFor, ev.ward);
    if (!crew) continue;
    assign(ev.incidentId, { departmentId: deptIdFor, crewId: crew.crew_id }, actor(officerId), iso(tAssign));
    const worker = crewLead(crew.crew_id);
    const tWork = tAssign + Math.min(resolveAfter * 0.4, between(2, 20) * HOUR);
    if (tWork > now) continue;
    updateProgress(ev.incidentId, worker, { stage: 'WORKING' }, iso(tWork));
    const tResolved = ev.start + resolveAfter;
    if (tResolved > now - 1 * HOUR) continue;
    const proof = jitter({ lat: inc.latitude, lng: inc.longitude }, 12);
    updateProgress(ev.incidentId, worker, {
      stage: 'RESOLVED', note: 'Work completed and site cleared.', latitude: proof.lat, longitude: proof.lng,
    }, iso(tResolved));

    // Verification: most reporters answer within a day; a few never do.
    const reqs = db.prepare('SELECT * FROM verification_request WHERE incident_id = ? AND response IS NULL').all(ev.incidentId);
    const silent = rand() < 0.1;
    const failed = rand() < 0.065;
    let t = tResolved;
    for (const r of reqs) {
      if (silent || rand() < 0.25) continue;
      t += between(1, 20) * HOUR;
      if (t > now) break;
      const cur = db.prepare('SELECT status FROM incident WHERE incident_id = ?').get(ev.incidentId);
      if (cur.status !== 'AWAITING_VERIFICATION') break;
      recordResponse(ev.incidentId, r.citizen_id, {
        fixed: !failed, feedback: failed ? 'Still not fixed, the problem came back.' : null,
      }, iso(t));
    }
    const expiry = tResolved + 72 * HOUR;
    if (expiry <= now) {
      evaluateVerification(ev.incidentId, { at: iso(expiry) });
      const cur = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(ev.incidentId);
      if (cur.needs_officer_verification && expiry + 5 * HOUR <= now) {
        officerVerify(ev.incidentId, { close: true }, officerId, iso(expiry + between(1, 5) * HOUR));
      }
    }
    // Reopened ones get a second round with another crew visit.
    const after = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(ev.incidentId);
    if (after.status === 'REOPENED') {
      const lastChange = db.prepare("SELECT MAX(changed_at) t FROM status_history WHERE incident_id = ?").get(ev.incidentId).t;
      const tRe = Date.parse(lastChange) + between(3, 12) * HOUR;
      const tFix = tRe + between(0.5, 2) * DAY;
      if (tFix + 30 * HOUR < now) {
        const crew2 = suggestCrew(after.department_id, ev.ward) || crew;
        assign(ev.incidentId, { departmentId: after.department_id, crewId: crew2.crew_id }, actor(officerId), iso(tRe));
        const w2 = crewLead(crew2.crew_id);
        updateProgress(ev.incidentId, w2, { stage: 'RESOLVED', note: 'Redone properly after citizen feedback.', latitude: proof.lat, longitude: proof.lng }, iso(tFix));
        const reqs2 = db.prepare(
          `SELECT * FROM verification_request WHERE incident_id = ? AND response IS NULL
           AND round = (SELECT MAX(round) FROM verification_request WHERE incident_id = ?)`
        ).all(ev.incidentId, ev.incidentId);
        let t2 = tFix;
        for (const r of reqs2) {
          t2 += between(1, 10) * HOUR;
          const cur = db.prepare('SELECT status FROM incident WHERE incident_id = ?').get(ev.incidentId);
          if (t2 > now || cur.status !== 'AWAITING_VERIFICATION') break;
          recordResponse(ev.incidentId, r.citizen_id, { fixed: true }, iso(t2));
        }
      }
    }
  }
  // Anything whose window has already run out is settled "as of now".
  sweepExpired(iso(now));
  // History reviews older than a day were handled by officers.
  for (const rev of pendingReviews()) {
    if (Date.parse(rev.created_at) < now - DAY) decide(rev.review_id, { decision: 'LINK' }, officer, iso(Date.parse(rev.created_at) + 3 * HOUR));
  }
  // History notifications are old news.
  db.prepare('UPDATE notification SET is_read = 1 WHERE created_at < ?').run(iso(now - 2 * DAY));

  seedScenarios({ db, now, iso, catId, crewIds, deptId, officer, aarav, citizens, actor, crewLead });

  const counts = db.prepare(`SELECT (SELECT COUNT(*) FROM incident) incidents, (SELECT COUNT(*) FROM report) reports,
    (SELECT COUNT(*) FROM user) users`).get();
  return counts;
}

// ---- the live scenarios from the design mockups ----------------------------
function seedScenarios({ db, now, iso, catId, crewIds, deptId, officer, aarav, citizens, actor, crewLead }) {
  const home = wardCenter(11); // Aarav lives in Sector 14, Ward 11
  let ci = 0;
  const nextCitizen = () => citizens[(ci++ * 7) % citizens.length];

  // Inserts one report at a point and links it (or opens the incident).
  function report(citizenId, { category, text, point, address, at, incidentId = null, method = 'AUTO', score = null }) {
    const info = db
      .prepare(
        `INSERT INTO report (citizen_id, category_id, description, latitude, longitude, address, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(citizenId, catId[category], text, point.lat, point.lng, address, iso(at));
    const rep = db.prepare('SELECT * FROM report WHERE report_id = ?').get(info.lastInsertRowid);
    if (incidentId) {
      attachReport(rep.report_id, incidentId, { method, score: score ?? (method === 'AUTO' ? between(0.9, 0.98) : null), at: iso(at) });
      return incidentId;
    }
    return createIncidentFromReport(rep, { by: citizenId, at: iso(at) }).incident_id;
  }

  function cluster({ category, title, texts, point, address, first, spreadHours, count, reporters = [] }) {
    let id = null;
    for (let i = 0; i < count; i += 1) {
      const at = first + (count === 1 ? 0 : (spreadHours * HOUR * i) / (count - 1));
      const who = reporters[i] ?? nextCitizen();
      const p = i === 0 ? point : jitter(point, 55);
      id = report(who, { category, text: texts[i % texts.length], point: p, address, at, incidentId: id, method: i % 5 === 3 ? 'OFFICER' : 'AUTO' });
    }
    db.prepare('UPDATE incident SET title = ? WHERE incident_id = ?').run(title, id);
    refreshRecommendations(id);
    return id;
  }

  const triageAndAssign = (id, crewName, at, priority) => {
    const inc = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(id);
    classify(id, { priority: priority || inc.priority }, officer, iso(at - 5 * 60000));
    const crew = db.prepare('SELECT * FROM crew WHERE name = ?').get(crewName);
    assign(id, { departmentId: crew.department_id, crewId: crew.crew_id }, actor(officer), iso(at));
    return crewLead(crew.crew_id);
  };

  // 1. Deep pothole, Ring Road: 12 reports, Aarav's among them, crew on site.
  const ringRoad = { lat: home.lat + 0.0021, lng: home.lng - 0.0017 };
  const pothole = cluster({
    category: 'Pothole', title: 'Deep pothole, Ring Road', point: ringRoad, address: '14 Ring Road, Sector 14',
    texts: ['Deep pothole on Ring Road, roughly a metre wide. Two-wheelers swerving into traffic.', 'Big pothole on Ring Road near the petrol pump',
      'Pothole on Ring Rd getting deeper every day', 'Huge hole in the left lane of Ring Road', 'Ring Road pothole, my scooter almost fell'],
    first: now - 2.6 * DAY, spreadHours: 40, count: 12, reporters: [undefined, undefined, aarav],
  });
  db.prepare('UPDATE incident SET description = ? WHERE incident_id = ?')
    .run('Roughly 1.2 m wide, deepest at the left lane edge. Two-wheelers swerving into traffic.', pothole);
  const r4 = triageAndAssign(pothole, 'Crew R-4', now - 1.2 * DAY, 'P2');
  updateProgress(pothole, r4, { stage: 'EN_ROUTE' }, iso(now - 5 * HOUR));
  updateProgress(pothole, r4, { stage: 'WORKING', note: 'Barricaded the lane, cutting the edges.' }, iso(now - 3 * HOUR));

  // 2. Streetlight on Lakeview Lane: resolved today, 1 of 4 answered.
  const lakeview = { lat: home.lat - 0.0016, lng: home.lng + 0.0024 };
  const light = cluster({
    category: 'Streetlight', title: 'Streetlight out, Lakeview Lane', point: lakeview, address: 'Lakeview Lane, near house no. 22',
    texts: ['Streetlight outside house 22 on Lakeview Lane is not working', 'Street light off at night on Lakeview Ln, very dark',
      'Lakeview Lane streetlight dead for a week'],
    first: now - 5 * DAY, spreadHours: 30, count: 4, reporters: [aarav],
  });
  const e2 = triageAndAssign(light, 'Crew E-2', now - 3.5 * DAY);
  updateProgress(light, e2, { stage: 'WORKING' }, iso(now - 1 * DAY));
  const lp = jitter(lakeview, 5);
  updateProgress(light, e2, {
    stage: 'RESOLVED', note: 'Replaced the LED fitting and the faulty junction box. Tested after dusk.', latitude: lp.lat, longitude: lp.lng,
  }, iso(now - 19.8 * HOUR));
  const lightReq = db.prepare('SELECT citizen_id FROM verification_request WHERE incident_id = ? AND citizen_id != ? LIMIT 1').get(light, aarav);
  recordResponse(light, lightReq.citizen_id, { fixed: true }, iso(now - 10 * HOUR));

  // 3. Overflowing bin, Sector 9 park: Aarav's, closed 3 weeks ago in 1.5 days.
  const binPoint = { lat: home.lat + 0.004, lng: home.lng + 0.0035 };
  const bin = cluster({
    category: 'Waste', title: 'Overflowing bin, Sector 9 park', point: binPoint, address: 'Sector 9 park gate',
    texts: ['Garbage bin overflowing at the Sector 9 park gate'], first: now - 21 * DAY, spreadHours: 0, count: 1, reporters: [aarav],
  });
  const s3 = triageAndAssign(bin, 'Crew S-3', now - 20.8 * DAY);
  updateProgress(bin, s3, { stage: 'RESOLVED', note: 'Bin emptied and area cleaned.', latitude: binPoint.lat, longitude: binPoint.lng }, iso(now - 19.6 * DAY));
  recordResponse(bin, aarav, { fixed: true }, iso(now - 19.5 * DAY));

  // 4. Officer triage queue (design p.25).
  const ward = (w, dLat, dLng) => { const c = wardCenter(w); return { lat: c.lat + dLat, lng: c.lng + dLng }; };
  cluster({
    category: 'Road collapse', title: 'Road cave-in near school gate', point: ward(9, 0.002, -0.001), address: 'Station Road, near Govt. School No. 4',
    texts: ['Road has caved in right outside the school gate, kids walking around it', 'Big hole opened up on Station Road, a bike almost fell in',
      'Road sinking near Govt School No. 4', 'Dangerous pit, no barricade, please send someone', 'Cave-in on Station Rd, water seeping from below',
      'School road damaged badly', 'Traffic diverted because of hole in road', 'Pit getting bigger, edges breaking', 'Near school gate the road collapsed'],
    first: now - 2 * HOUR, spreadHours: 1.9, count: 9,
  });
  cluster({
    category: 'Water leakage', title: 'Burst water main, flooding lane', point: ward(7, -0.003, 0.002), address: 'Gandhi Nagar, lane 3',
    texts: ['Water main burst, the whole lane is flooding', 'Burst pipe flooding Gandhi Nagar lane 3', 'Water gushing from the road, flooding houses'],
    first: now - 3 * HOUR, spreadHours: 2.5, count: 6,
  });
  cluster({
    category: 'Drainage', title: 'Blocked storm drain', point: ward(12, 0.001, 0.003), address: 'Sector 12 main road',
    texts: ['Storm drain blocked on Sector 12 main road, water stagnant', 'Blocked drain overflowing onto the main road'],
    first: now - 48 * 60000, spreadHours: 0.6, count: 3,
  });
  cluster({
    category: 'Streetlight', title: 'Four streetlights out in a row', point: ward(8, -0.002, -0.002), address: 'Canal Road',
    texts: ['Four streetlights not working in a row on Canal Road', 'Canal Rd completely dark at night, lights off'],
    first: now - 6 * HOUR, spreadHours: 4, count: 5,
  });
  cluster({
    category: 'Waste', title: 'Overflowing community bin', point: { lat: binPoint.lat + 0.0006, lng: binPoint.lng - 0.0005 }, address: 'Sector 9 park, back entrance',
    texts: ['Community bin overflowing at the back of Sector 9 park'], first: now - 2 * HOUR, spreadHours: 0.5, count: 2,
  });
  cluster({
    category: 'Footpath', title: 'Broken footpath slab', point: ward(10, 0.001, 0.001), address: 'Tilak Marg',
    texts: ['Footpath slab broken on Tilak Marg, people tripping'], first: now - 7 * HOUR, spreadHours: 0, count: 1,
  });
  cluster({
    category: 'Public property', title: 'Fallen signboard on divider', point: { lat: ringRoad.lat + 0.003, lng: ringRoad.lng - 0.004 }, address: 'Ring Road divider',
    texts: ['Signboard has fallen on the Ring Road divider'], first: now - 1 * HOUR, spreadHours: 0, count: 1,
  });
  cluster({
    category: 'Water leakage', title: 'Leaking public tap', point: ward(11, -0.004, -0.003), address: 'Old Bazaar',
    texts: ['Public tap leaking in Old Bazaar, water wasted all day'], first: now - 9 * HOUR, spreadHours: 2, count: 2,
  });

  // 5. Reopened by citizens: Market St patch failed.
  const market = { lat: home.lat - 0.0035, lng: home.lng - 0.003 };
  const patch = cluster({
    category: 'Pothole', title: 'Pothole patch failed again', point: market, address: 'Market St, Sector 11',
    texts: ['Pothole on Market Street', 'Market St pothole again after rain'], first: now - 9 * DAY, spreadHours: 20, count: 4,
  });
  const r1 = triageAndAssign(patch, 'Crew R-4', now - 8 * DAY, 'P2');
  updateProgress(patch, r1, { stage: 'RESOLVED', note: 'Cold patch applied.', latitude: market.lat, longitude: market.lng }, iso(now - 6 * DAY));
  const patchReqs = db.prepare('SELECT citizen_id FROM verification_request WHERE incident_id = ?').all(patch);
  recordResponse(patch, patchReqs[0].citizen_id, { fixed: false, feedback: 'The patch broke up again after one day of rain.' }, iso(now - 5.5 * DAY));
  recordResponse(patch, patchReqs[1].citizen_id, { fixed: false, feedback: 'Same hole is back.' }, iso(now - 5.2 * DAY));

  // Open manhole, Canal Rd: reopened, near Aarav for the Nearby map.
  const manhole = cluster({
    category: 'Drainage', title: 'Open manhole, Canal Rd', point: { lat: home.lat + 0.0018, lng: home.lng + 0.0016 }, address: 'Canal Road, Sector 14',
    texts: ['Open manhole on Canal Road, no cover', 'Manhole cover missing, dangerous at night'], first: now - 6 * DAY, spreadHours: 10, count: 2,
  });
  const d3 = triageAndAssign(manhole, 'Crew D-3', now - 5.5 * DAY, 'P1');
  updateProgress(manhole, d3, { stage: 'RESOLVED', note: 'Temporary cover placed.' }, iso(now - 4 * DAY));
  const mReqs = db.prepare('SELECT citizen_id FROM verification_request WHERE incident_id = ?').all(manhole);
  recordResponse(manhole, mReqs[0].citizen_id, { fixed: false, feedback: 'The temporary cover already moved, still open.' }, iso(now - 3.5 * DAY));

  // 6. Officer verification queue: no reporter answered in 72 h.
  const queue = [
    ['Drainage', 'Clogged drain, Canal Road', 'Canal Rd', ward(8, 0.003, 0.001), 'Crew D-3', 2, 'Drain cleared, silt removed and carted away.'],
    ['Water leakage', 'Leaking public tap', 'Old Bazaar', ward(11, 0.002, 0.004), 'Crew W-2', 1, 'Tap spindle and washer replaced.'],
    ['Public property', 'Broken bench at bus stop', 'Tilak Marg', ward(10, -0.002, 0.002), 'Crew P-2', 1, 'Bench slats replaced and bolted.'],
  ];
  for (const [category, title, address, point, crewName, count, note] of queue) {
    const id = cluster({ category, title, point, address, texts: [`${title}`], first: now - 8 * DAY, spreadHours: 6, count });
    const w = triageAndAssign(id, crewName, now - 7 * DAY);
    const pp = jitter(point, 4);
    updateProgress(id, w, { stage: 'RESOLVED', note, latitude: pp.lat, longitude: pp.lng }, iso(now - 75 * HOUR));
    evaluateVerification(id, { at: iso(now - 3 * HOUR) });
  }

  // 7. More live work for Crew R-4 and the Roads board.
  const cave = cluster({
    category: 'Road markings', title: 'Faded speed-breaker marking', point: { lat: lakeview.lat - 0.001, lng: lakeview.lng + 0.001 }, address: 'Lakeview Lane',
    texts: ['Speed breaker on Lakeview Lane has no paint, bikes hit it at speed'], first: now - 6 * DAY, spreadHours: 0, count: 1,
  });
  triageAndAssign(cave, 'Crew R-4', now - 5 * DAY);
  const sunk = cluster({
    category: 'Damaged road', title: 'Sunken manhole cover', point: ward(7, 0.001, -0.003), address: 'Ring Road, Ward 7',
    texts: ['Manhole cover sunk below the road level on Ring Road'], first: now - 1.2 * DAY, spreadHours: 0, count: 1,
  });
  triageAndAssign(sunk, 'Crew R-1', now - 1 * DAY);

  // 8. Match review queue: reports the engine was unsure about.
  const titled = (t) => db.prepare('SELECT * FROM incident WHERE title = ? ORDER BY incident_id DESC').get(t);
  const reviews = [
    ['Deep pothole, Ring Road', 'Pothole', 'Road broken outside HP petrol pump, my scooter tyre burst', 125, 14],
    ['Burst water main, flooding lane', 'Water leakage', 'Water on road in Gandhi Nagar since morning', 120, 22],
    ['Four streetlights out in a row', 'Streetlight', 'Streetlight not working near the bridge', 210, 60],
    ['Overflowing community bin', 'Waste', 'Garbage pile near park wall', 95, 120],
    ['Pothole patch failed again', 'Pothole', 'Road broken near temple, big hole with stones lying around', 160, 180],
  ];
  for (const [title, category, text, meters, minsAgo] of reviews) {
    const inc = titled(title);
    const p = { lat: inc.latitude + meters / 111320, lng: inc.longitude };
    const out = submitReport(nextCitizen(), { description: text, category_id: catId[category], latitude: p.lat, longitude: p.lng, address: inc.address }, { at: iso(now - minsAgo * 60000) });
    if (out.decision !== 'REVIEW') console.warn(`seed: expected a match review for "${text}", engine said ${out.decision} (${out.score})`);
  }

  // Aarav's notifications from the design, newest unread.
  db.prepare('UPDATE notification SET is_read = 1 WHERE user_id = ? AND created_at < ?').run(aarav, iso(now - 1.5 * DAY));
}

// CLI: node src/seed.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  openDb();
  const t = Date.now();
  const counts = seed();
  console.log(`Seeded ${counts.incidents} incidents, ${counts.reports} reports, ${counts.users} users in ${Date.now() - t} ms.`);
  console.log(`Staff password for every demo account: ${DEMO_PASSWORD}`);
}
