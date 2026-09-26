// AnalyticsService: operational measures (SRS 4.9, FR-50..FR-56).
import { getDb, nowIso } from '../db.js';

// Response targets used to flag overdue work, by priority.
export const SLA_DAYS = { P1: 1, P2: 3, P3: 7, P4: 14 };

const DAY = 86400000;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// filters: { days, ward, departmentId }
export async function kpis({ days = 30, ward = null, departmentId = null } = {}, at = nowIso()) {
  const db = getDb();
  const now = Date.parse(at);
  const from = new Date(now - days * DAY).toISOString();
  const prevFrom = new Date(now - 2 * days * DAY).toISOString();

  const incWhere = ['1=1'];
  const incArgs = [];
  if (ward) { incWhere.push('i.ward = ?'); incArgs.push(Number(ward)); }
  if (departmentId) { incWhere.push('i.department_id = ?'); incArgs.push(Number(departmentId)); }
  const W = incWhere.join(' AND ');

  const count = async (sql, ...args) => (await db.prepare(sql).get(...args)).n;
  const reportsIn = (a, b) =>
    count(
      `SELECT COUNT(*) n FROM report r LEFT JOIN incident i ON i.incident_id = r.incident_id
       WHERE r.submitted_at >= ? AND r.submitted_at < ? AND ${W}`,
      a, b, ...incArgs
    );
  const reportsNow = await reportsIn(from, at);
  const reportsPrev = await reportsIn(prevFrom, from);

  const incidentsOpened = await count(`SELECT COUNT(*) n FROM incident i WHERE i.opened_at >= ? AND ${W}`, from, ...incArgs);
  const linkedIncidents = await count(
    `SELECT COUNT(DISTINCT r.incident_id) n FROM report r JOIN incident i ON i.incident_id = r.incident_id WHERE r.submitted_at >= ? AND ${W}`,
    from, ...incArgs
  );

  const closeDays = async (a, b) =>
    (await db.prepare(
      `SELECT (julianday(i.closed_at) - julianday((SELECT MIN(submitted_at) FROM report r WHERE r.incident_id = i.incident_id))) AS d
       FROM incident i WHERE i.status = 'CLOSED' AND i.closed_at >= ? AND i.closed_at < ? AND ${W}`
    ).all(a, b, ...incArgs)).map((r) => r.d).filter((d) => d != null);
  const medianClose = median(await closeDays(from, at));
  const medianClosePrev = median(await closeDays(prevFrom, from));

  // Verification decisions in range: how many ended in reopen.
  const decisions = await db
    .prepare(
      `SELECT h.to_status, COUNT(*) n FROM status_history h JOIN incident i ON i.incident_id = h.incident_id
       WHERE h.from_status = 'AWAITING_VERIFICATION' AND h.to_status IN ('CLOSED','REOPENED') AND h.changed_at >= ? AND ${W}
       GROUP BY h.to_status`
    )
    .all(from, ...incArgs);
  const reopenedN = decisions.find((d) => d.to_status === 'REOPENED')?.n || 0;
  const decidedN = decisions.reduce((s, d) => s + d.n, 0);

  // Weekly median time to close, last 12 weeks.
  const weekly = [];
  for (let w = 11; w >= 0; w -= 1) {
    const end = new Date(now - w * 7 * DAY);
    const start = new Date(end.getTime() - 7 * DAY);
    weekly.push({ week_start: start.toISOString().slice(0, 10), median_days: round1(median(await closeDays(start.toISOString(), end.toISOString()))) });
  }

  const byCategory = await db
    .prepare(
      `SELECT c.name, COUNT(*) n FROM incident i JOIN category c ON c.category_id = i.category_id
       WHERE i.opened_at >= ? AND ${W} GROUP BY c.name ORDER BY n DESC`
    )
    .all(from, ...incArgs);

  const byWard = await db
    .prepare(
      `SELECT i.ward, COUNT(*) opened,
         SUM(CASE WHEN i.status != 'CLOSED' THEN 1 ELSE 0 END) open_now
       FROM incident i WHERE i.opened_at >= ? AND ${W} GROUP BY i.ward ORDER BY i.ward`
    )
    .all(from, ...incArgs);

  const statusCounts = (await db
    .prepare(`SELECT i.status, COUNT(*) n FROM incident i WHERE ${W} GROUP BY i.status`)
    .all(...incArgs))
    .reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {});
  const highPriorityOpen = await count(
    `SELECT COUNT(*) n FROM incident i WHERE i.status != 'CLOSED' AND i.priority IN ('P1','P2') AND ${W}`,
    ...incArgs
  );
  const totals = {
    reports: await count(`SELECT COUNT(*) n FROM report r LEFT JOIN incident i ON i.incident_id = r.incident_id WHERE ${W}`, ...incArgs),
    incidents: await count(`SELECT COUNT(*) n FROM incident i WHERE ${W}`, ...incArgs),
  };

  const dup = await db
    .prepare(
      `SELECT r.link_method, COUNT(*) n, SUM(r.auto_link_overridden) overridden
       FROM report r LEFT JOIN incident i ON i.incident_id = r.incident_id
       WHERE r.submitted_at >= ? AND ${W} GROUP BY r.link_method`
    )
    .all(from, ...incArgs);
  const dupN = (m) => dup.find((d) => d.link_method === m)?.n || 0;
  const overridden = await count(
    `SELECT COUNT(*) n FROM report r LEFT JOIN incident i ON i.incident_id = r.incident_id
     WHERE r.auto_link_overridden = 1 AND r.submitted_at >= ? AND ${W}`,
    from, ...incArgs
  );
  const autoTotal = dupN('AUTO') + overridden;

  const closures = (await db
    .prepare(
      `SELECT i.closure_type, COUNT(*) n FROM incident i WHERE i.status = 'CLOSED' AND i.closed_at >= ? AND ${W} GROUP BY i.closure_type`
    )
    .all(from, ...incArgs))
    .reduce((acc, r) => ({ ...acc, [r.closure_type]: r.n }), {});

  return {
    range_days: days,
    reports_received: reportsNow,
    reports_change_pct: reportsPrev ? Math.round(((reportsNow - reportsPrev) / reportsPrev) * 100) : null,
    incidents_opened: incidentsOpened,
    reports_per_incident: linkedIncidents ? round1(reportsNow / linkedIncidents) : null,
    median_close_days: round1(medianClose),
    median_close_days_prev: round1(medianClosePrev),
    reopen_rate_pct: decidedN ? round1((reopenedN / decidedN) * 100) : null,
    weekly_median_close: weekly,
    by_category: byCategory,
    by_ward: byWard,
    status_counts: statusCounts,
    high_priority_open: highPriorityOpen,
    totals,
    duplicates: {
      linked_to_existing: dupN('AUTO') + dupN('OFFICER') + dupN('CITIZEN'),
      auto: dupN('AUTO'),
      officer: dupN('OFFICER'),
      citizen: dupN('CITIZEN'),
      new_incidents: dupN('NEW'),
      pending_review: await count('SELECT COUNT(*) n FROM match_review WHERE decision IS NULL'),
      override_rate_pct: autoTotal ? round1((overridden / autoTotal) * 100) : null,
    },
    closures: { citizen_verified: closures.CITIZEN || 0, officer_verified: closures.OFFICER || 0 },
    department_workload: await departmentWorkload({ days, ward }, at),
  };
}

export async function departmentWorkload({ days = 30, ward = null } = {}, at = nowIso()) {
  const db = getDb();
  const now = Date.parse(at);
  const from = new Date(now - days * DAY).toISOString();
  const wardSql = ward ? ' AND i.ward = ?' : '';
  const wardArgs = ward ? [Number(ward)] : [];
  const out = [];
  for (const d of await db.prepare('SELECT * FROM department ORDER BY name').all()) {
    const open = await db
      .prepare(`SELECT i.priority, i.opened_at FROM incident i WHERE i.department_id = ? AND i.status != 'CLOSED'${wardSql}`)
      .all(d.department_id, ...wardArgs);
    const overdue = open.filter((i) => now - Date.parse(i.opened_at) > SLA_DAYS[i.priority] * DAY).length;
    const closeDays = (await db
      .prepare(
        `SELECT (julianday(i.closed_at) - julianday(i.opened_at)) d FROM incident i
         WHERE i.department_id = ? AND i.status = 'CLOSED' AND i.closed_at >= ?${wardSql}`
      )
      .all(d.department_id, from, ...wardArgs))
      .map((r) => r.d);
    const { n: reopened } = await db
      .prepare(
        `SELECT COUNT(*) n FROM status_history h JOIN incident i ON i.incident_id = h.incident_id
         WHERE i.department_id = ? AND h.to_status = 'REOPENED' AND h.from_status != 'REOPENED' AND h.changed_at >= ?${wardSql}`
      )
      .get(d.department_id, from, ...wardArgs);
    out.push({
      department_id: d.department_id,
      name: d.name,
      open: open.length,
      critical: open.filter((i) => i.priority === 'P1').length,
      overdue,
      median_close_days: round1(median(closeDays)),
      reopened,
    });
  }
  return out;
}
