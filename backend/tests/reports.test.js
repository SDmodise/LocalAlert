// Reports for Family Administrators: GET /api/reports/family and /api/reports/alerts/:id
const { BE } = require('./setup');
const bcrypt = require(BE + '/node_modules/bcrypt');
const jwt = require(BE + '/node_modules/jsonwebtoken');
const pool = require(BE + '/src/config/database');
const app = require(BE + '/src/app');
const Alert = require(BE + '/src/models/Alert');

let pass = 0, failn = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('  ok  ', name); } else { failn++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); } };
const BASE = 'http://localhost:5074/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

(async () => {
  const server = app.listen(5074);
  const q = (s, v) => pool.query(s, v);
  const tag = Date.now();
  const role = async (n) => (await q('SELECT role_id FROM roles WHERE role_name=$1', [n])).rows[0].role_id;
  const ADMIN = await role('Family Administrator'), COMM = await role('Community Member');
  const pinHash = await bcrypt.hash('1234', 10);
  await q(`DELETE FROM alerts WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE 'reporttest-%')`);
  await q(`DELETE FROM family_groups WHERE admin_user_id IN (SELECT user_id FROM users WHERE email LIKE 'reporttest-%')`);
  await q(`DELETE FROM users WHERE email LIKE 'reporttest-%'`);
  const mk = async (name, roleId) => {
    const id = (await q(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, pin_hash, municipality_id, current_municipality_id)
      VALUES ($1,$2,'Test',$3,'x',$4,1,1) RETURNING user_id`, [roleId, name, `reporttest-${name}-${tag}@x.co`, pinHash])).rows[0].user_id;
    return { id, token: jwt.sign({ sub: id, role: roleId === ADMIN ? 'Family Administrator' : 'Community Member' }, process.env.JWT_SECRET) };
  };
  const A = await mk('Admin', ADMIN);
  const B = await mk('Other', ADMIN);
  const C = await mk('Neighbour', COMM);
  const N = await mk('NoFamily', ADMIN);

  const g = (await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'Report Family') RETURNING group_id`, [A.id])).rows[0].group_id;
  await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'Other Family')`, [B.id]);
  await q(`INSERT INTO family_links (group_id, user_id) VALUES ($1,$2)`, [g, C.id]);
  const prof = async (name, status) => (await q(`INSERT INTO family_members (group_id, full_name, date_of_birth, gender, physical_description, verification_status)
      VALUES ($1,$2,'2016-05-01','Female','Short',$3) RETURNING member_id`, [g, name, status])).rows[0].member_id;
  const P1 = await prof('Naledi Report', 'verified');
  const P2 = await prof('Sipho Report', 'verified');
  await prof('Pending Report', 'pending');

  const now = Date.now();
  const make = async (member) => {
    const r = await call('POST', '/alerts', A.token, { member_id: member, latitude: -25.55, longitude: 28.10, last_seen_place: 'Mall',
      last_seen_time: new Date(now - 20 * 60000).toISOString(), clothing_description: 'Red jersey', pin: '1234' });
    return r.data && r.data.alert && r.data.alert.alert_id;
  };
  const a1 = await make(P1);
  const a2 = await make(P2);
  check('two alerts created', !!a1 && !!a2);

  // a1: two sightings, moves to Level 2, then found 8 hours after it was reported.
  await q(`INSERT INTO sighting_reports (alert_id, user_id, description, latitude, longitude) VALUES ($1,$2,'Near the taxi rank',-25.56,28.11),($1,$2,'At the shop',NULL,NULL)`, [a1, C.id]);
  await q(`UPDATE alerts SET last_escalated_at = last_escalated_at - interval '7 hours', created_at = created_at - interval '8 hours' WHERE alert_id = $1`, [a1]);
  await Alert.escalateIfDue(a1, 360);
  let r = await call('POST', `/alerts/${a1}/resolve`, A.token, { pin: '1234' });
  check('a1 marked found', r.status === 200, r);

  console.log('Family report');
  r = await call('GET', '/reports/family');
  check('needs login', r.status === 401);
  r = await call('GET', '/reports/family', C.token);
  check('community member 403', r.status === 403, r);
  r = await call('GET', '/reports/family', N.token);
  check('admin without a family: 404 with advice', r.status === 404 && /Create your family group/.test(r.data.message), r);
  r = await call('GET', '/reports/family', A.token);
  const rep = r.data && r.data.report;
  check('admin gets the report', r.status === 200 && rep.group_name === 'Report Family', r);
  const s = rep.summary;
  check('profiles 3, verified 2, linked 1', s.profiles === 3 && s.verified_profiles === 2 && s.linked_members === 1, s);
  check('alerts 2: 1 active, 1 found', s.alerts === 2 && s.active === 1 && s.found === 1 && s.still_missing === 0, s);
  check('sightings 2', s.sightings === 2, s);
  check('average time to found about 8 hours', s.average_hours_to_found >= 7.9 && s.average_hours_to_found <= 8.2, s);
  check('people alerted counted', s.people_alerted >= 1, s);
  check('levels reached: 2 alerts at L1, 1 at L2, none at L3', rep.by_level[0].alerts === 2 && rep.by_level[1].alerts === 1 && rep.by_level[2].alerts === 0, rep.by_level);
  const row = rep.alerts.find((x) => x.alert_id === a1);
  check('per-alert row: found, level 2, 2 sightings, reporter', row && row.status === 'resolved' && row.escalation_level === 2 && row.sightings === 2 && /Admin/.test(row.reported_by), row);
  r = await call('GET', '/reports/family', B.token);
  check("other family's report does not include these alerts", r.status === 200 && r.data.report.alerts.length === 0, r.data);

  console.log('Alert report');
  r = await call('GET', `/reports/alerts/${a1}`, A.token);
  const ar = r.data && r.data.report;
  check('alert report 200', r.status === 200 && ar.alert.child_name === 'Naledi Report', r);
  const events = (ar.timeline || []).map((t) => t.event).join(' | ');
  check('timeline: reported, Level 2, found, in order', /^Reported missing/.test(events) && /Level 2/.test(events) && /found/.test(events)
    && events.indexOf('Level 2') < events.indexOf('found'), events);
  check('sightings listed with distance when there is a place', ar.sightings.length === 2 && ar.sightings[0].km_from_last_seen > 0 && ar.sightings[1].km_from_last_seen === null, ar.sightings);
  check('people alerted by level', Array.isArray(ar.people_alerted.by_level) && ar.people_alerted.by_level.length === 4 && ar.people_alerted.family >= 1, ar.people_alerted);
  r = await call('GET', `/reports/alerts/${a1}`, B.token);
  check("another family's administrator cannot read it (404)", r.status === 404, r);
  r = await call('GET', '/reports/alerts/not-an-id', A.token);
  check('bad id 404', r.status === 404, r);

  await q(`DELETE FROM alerts WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE 'reporttest-%')`);
  await q(`DELETE FROM family_groups WHERE admin_user_id IN (SELECT user_id FROM users WHERE email LIKE 'reporttest-%')`);
  await q(`DELETE FROM users WHERE email LIKE 'reporttest-%'`);
  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end(); process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
