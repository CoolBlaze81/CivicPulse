// ClassificationService: rule-based category, priority and department
// recommendations (SRS 4.4, 4.5; FR-22..FR-27; TBD-03 allows rules).
import { getDb } from '../db.js';
import { containsAny } from './text.js';

// Keywords per category name. Order matters only for ties.
export const CATEGORY_KEYWORDS = {
  'Road collapse': ['cave-in', 'cave in', 'caved', 'collapse', 'sinkhole', 'sinking', 'road sank', 'subsid'],
  Pothole: ['pothole', 'pot hole', 'hole', 'pit', 'crater'],
  'Damaged road': ['damaged road', 'broken road', 'crack', 'road broken', 'uneven', 'asphalt', 'tar'],
  Footpath: ['footpath', 'sidewalk', 'pavement', 'kerb', 'curb', 'slab'],
  'Road markings': ['marking', 'zebra', 'lane line', 'speed breaker', 'speed-breaker', 'paint'],
  Waste: ['garbage', 'waste', 'trash', 'bin', 'dump', 'litter', 'rubbish', 'overflowing'],
  Streetlight: ['streetlight', 'street light', 'lamp', 'light', 'dark', 'bulb', 'flicker'],
  Drainage: ['drain', 'drainage', 'sewer', 'gutter', 'clog', 'blocked', 'stagnant', 'waterlogging', 'manhole'],
  'Water leakage': ['leak', 'burst', 'pipe', 'water main', 'tap', 'water supply', 'flooding'],
  'Public property': ['signboard', 'bench', 'bus stop', 'railing', 'park', 'statue', 'wall', 'fence', 'divider'],
};

// Words that point to a safety risk. Any hit makes an incident P1.
const DANGER_WORDS = [
  'school', 'hospital', 'child', 'kids', 'children', 'live wire', 'exposed wire', 'electrocut', 'spark',
  'shock', 'open manhole', 'cave-in', 'caved', 'collapse', 'fell', 'accident', 'injur', 'fire', 'gas',
  'no barricade', 'dangerous', 'flood',
];
// Words that suggest wide impact. A hit raises priority one level.
const IMPACT_WORDS = ['traffic', 'main road', 'highway', 'junction', 'market', 'many', 'whole street', 'blocked', 'swerv', 'bus'];

const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
export const PRIORITY_LABELS = { P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' };

const raise = (p, levels = 1) => PRIORITIES[Math.max(0, PRIORITIES.indexOf(p) - levels)];

export function listCategories() {
  return getDb().prepare('SELECT * FROM category ORDER BY name').all();
}

export function categoryByName(name) {
  return getDb().prepare('SELECT * FROM category WHERE name = ?').get(name);
}

// Returns categories ranked by keyword hits, best first, with a 0..1 confidence.
export function recommendCategory(text) {
  const lower = String(text || '').toLowerCase();
  const scored = Object.entries(CATEGORY_KEYWORDS)
    .map(([name, words]) => ({ name, hits: words.filter((w) => lower.includes(w)).length }))
    .filter((c) => c.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  const total = scored.reduce((s, c) => s + c.hits, 0);
  return scored.map((c) => {
    const cat = categoryByName(c.name);
    return { category_id: cat?.category_id, name: c.name, confidence: total ? c.hits / total : 0 };
  }).filter((c) => c.category_id);
}

// Priority for an incident from its category default, text of all linked
// reports, and how many independent reports arrived recently.
export function recommendPriority({ categoryId, texts = [], reportCount = 1, recentReportCount = reportCount }) {
  const db = getDb();
  const cat = db.prepare('SELECT * FROM category WHERE category_id = ?').get(categoryId);
  let priority = cat?.default_priority || 'P3';
  const reasons = [];
  const all = texts.join(' ');

  const danger = containsAny(all, DANGER_WORDS);
  if (danger.length) {
    priority = 'P1';
    reasons.push(`Safety risk mentioned: “${danger.slice(0, 2).join('”, “')}”`);
  }
  const impact = containsAny(all, IMPACT_WORDS);
  if (impact.length && priority !== 'P1') {
    priority = raise(priority);
    reasons.push(`Wide impact: “${impact[0]}”`);
  }
  if (recentReportCount >= 5) {
    priority = raise(priority);
    reasons.push(`${recentReportCount} independent reports in the last 24 hours`);
  } else if (reportCount >= 3) {
    reasons.push(`${reportCount} citizens reported this`);
  }
  if (!reasons.length) reasons.push(`Default for ${cat?.name || 'this category'}: ${PRIORITY_LABELS[priority]}`);
  return { priority, reasons };
}

// Department that lists this category in DEPARTMENT_CATEGORY (editable by dept heads).
export function recommendDepartment(categoryId) {
  return getDb()
    .prepare(
      `SELECT d.* FROM department d JOIN department_category dc ON dc.department_id = d.department_id
       WHERE dc.category_id = ? ORDER BY d.department_id LIMIT 1`
    )
    .get(categoryId);
}

// Recompute and store recommendations on an incident. Officer-set values
// (triaged incidents) are left alone; only the rec_* columns change.
export function refreshRecommendations(incidentId) {
  const db = getDb();
  const inc = db.prepare('SELECT * FROM incident WHERE incident_id = ?').get(incidentId);
  if (!inc) return null;
  const reports = db.prepare('SELECT description, category_id, submitted_at FROM report WHERE incident_id = ?').all(incidentId);
  const texts = [inc.title, inc.description, ...reports.map((r) => r.description)];

  // Majority category across linked reports, falling back to the incident's.
  const votes = new Map();
  for (const r of reports) votes.set(r.category_id, (votes.get(r.category_id) || 0) + 1);
  const recCategory = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || inc.category_id;

  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const recent = reports.filter((r) => Date.parse(r.submitted_at) >= dayAgo).length;
  const { priority, reasons } = recommendPriority({
    categoryId: recCategory,
    texts,
    reportCount: reports.length,
    recentReportCount: recent,
  });
  const dept = recommendDepartment(recCategory);

  db.prepare(
    `UPDATE incident SET rec_category_id = ?, rec_priority = ?, rec_department_id = ?, rec_reasons = ?
     WHERE incident_id = ?`
  ).run(recCategory, priority, dept?.department_id || null, JSON.stringify(reasons), incidentId);

  // Before an officer triages, the live values follow the recommendation.
  if (!inc.triaged) {
    db.prepare('UPDATE incident SET category_id = ?, priority = ?, department_id = ? WHERE incident_id = ?')
      .run(recCategory, priority, dept?.department_id || null, incidentId);
  }
  return { categoryId: recCategory, priority, departmentId: dept?.department_id, reasons };
}
