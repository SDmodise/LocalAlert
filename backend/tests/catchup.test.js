// Integration test for alert creation and escalation against the test database (see setup.js).
const path = require('path');
const { BE, UPLOADS } = require('./setup');
const bcrypt = require(BE + '/node_modules/bcrypt');
const jwt = require(BE + '/node_modules/jsonwebtoken');
const pool = require(BE + '/src/config/database');
const app = require(BE + '/src/app');
const escalation = require(BE + '/src/services/escalationService');
const Alert = require(BE + '/src/models/Alert');

let pass = 0, failn = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { failn++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
}
const BASE = 'http://localhost:5072/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, type: r.headers.get('content-type') };
}

(async () => {
  const server = app.listen(5072);
  const q = (s, v) => pool.query(s, v);
  const tag = 't' + Date.now();
  const role = async (n) => (await q('SELECT role_id FROM roles WHERE role_name=$1', [n])).rows[0].role_id;
  const ADMIN = await role('Family Administrator'), COMM = await role('Community Member');
  const pinHash = await bcrypt.hash('1234', 10);
  // Isolate: remove users from earlier runs of this test only.
  await q(`DELETE FROM alerts WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE 'alerttest-%')`);
  await q(`DELETE FROM family_groups WHERE admin_user_id IN (SELECT user_id FROM users WHERE email LIKE 'alerttest-%')`);
  await q(`DELETE FROM users WHERE email LIKE 'alerttest-%'`);
  // Other existing users in the DB also receive alerts; count them so expectations are exact.
  const mk = async (name, roleId, home, current) => {
    const r = await q(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, pin_hash, municipality_id, current_municipality_id)
      VALUES ($1,$2,'Test',$3,'x',$4,$5,$6) RETURNING user_id`, [roleId, name, `alerttest-${name}-${tag}@x.co`, pinHash, home, current]);
    const id = r.rows[0].user_id;
    return { id, token: jwt.sign({ sub: id, role: roleId === ADMIN ? 'Family Administrator' : 'Community Member' }, process.env.JWT_SECRET) };
  };
  const TSH = 1, JHB = 2, EKU = 3, MOR = 7, MAD = 8, MOG = 9, LEK = 34;
  const A = await mk('Admin', ADMIN, TSH, TSH);
  const B = await mk('AdminB', ADMIN, JHB, JHB);
  const F = await mk('Family', COMM, JHB, JHB);
  const U1 = await mk('U1', COMM, TSH, TSH);
  const U2 = await mk('U2', COMM, EKU, TSH);   // visiting Tshwane
  const U3 = await mk('U3', COMM, MOR, MOR);
  const U4 = await mk('U4', COMM, LEK, LEK);
  const U5 = await mk('U5', COMM, null, null);

  const g = (await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'Test Family') RETURNING group_id`, [A.id])).rows[0].group_id;
  await q(`INSERT INTO family_links (group_id, user_id) VALUES ($1,$2)`, [g, F.id]);
  const prof = async (group, name, status) => (await q(`INSERT INTO family_members (group_id, full_name, date_of_birth, gender, physical_description, photo_url, id_document_url, verification_status)
      VALUES ($1,$2,'2017-03-15','Female','Small, braided hair','photos/d4639b39-a73e-42c9-aef0-144c6a715178.png','id_documents/0b4233c6-a485-4834-9ad5-2d902ea05349.png',$3) RETURNING member_id`, [group, name, status])).rows[0].member_id;
  const P = await prof(g, 'Lerato Mokoena', 'verified');
  const Ppending = await prof(g, 'Kagiso Mokoena', 'pending');
  const gB = (await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'B Family') RETURNING group_id`, [B.id])).rows[0].group_id;
  const PB = await prof(gB, 'Thabo B', 'verified');

  const now = new Date();
  const good = { member_id: P, latitude: -25.55, longitude: 28.10, last_seen_place: 'Soshanguve Crossing Mall',
                 last_seen_time: new Date(now - 30 * 60000).toISOString(), clothing_description: 'Red school jersey, grey skirt', pin: '1234' };


  const ids = Object.fromEntries((await q(`SELECT municipality_code c, municipality_id i FROM municipalities`)).rows.map(r => [r.c, r.i]));
  let r = await call('POST', '/alerts', A.token, good); const id = r.data.alert.alert_id; check('alert created in Tshwane', r.status === 201 && r.data.alert.municipality_name === 'City of Tshwane');
  const has = async (u) => (await call('GET', '/alerts', u.token)).data.alerts.some(a => a.alert_id === id);

  console.log('Joined after the alert');
  const Late = await mk('LateTSH', COMM, ids.TSH, ids.TSH);
  check('new Tshwane user sees the open alert', await has(Late));
  check('exactly one notification', (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id=$1 AND user_id=$2`, [id, Late.id])).rows[0].c === 1);
  check('seeing the list again adds nothing', (await has(Late)) && (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id=$1 AND user_id=$2`, [id, Late.id])).rows[0].c === 1);
  const Mor = await mk('LateMoretele', COMM, ids.NW371, ids.NW371);
  check('neighbour (Moretele) does not see it at Level 1', !(await has(Mor)));
  const Far = await mk('LateLekwa', COMM, ids.NW396, ids.NW396);
  check('Lekwa-Teemane does not see it at Level 1', !(await has(Far)));
  check('creator: no notification added', (await has(A)) && (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id=$1 AND user_id=$2`, [id, A.id])).rows[0].c === 0);
  check('linked family: still only the family notification', (await has(F)) && (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id=$1 AND user_id=$2 AND notification_type='alert'`, [id, F.id])).rows[0].c === 1);

  console.log('Moving into the area');
  const Mover = await mk('Mover', COMM, ids.NW396, ids.NW396);
  check('not covered before moving', !(await has(Mover)));
  r = await call('PUT', '/users/me/location', Mover.token, { latitude: -25.7479, longitude: 28.1878 });
  check('location update to Pretoria', r.status === 200 && r.data.user.current_municipality === 'City of Tshwane', r.data);
  check('delivered on arrival (without opening the list)', (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id=$1 AND user_id=$2`, [id, Mover.id])).rows[0].c === 1);

  console.log('After escalation');
  await q(`UPDATE alerts SET escalation_level = 2 WHERE alert_id=$1`, [id]);
  check('Moretele sees it at Level 2', await has(Mor));
  const n = (await q(`SELECT escalation_level FROM notifications WHERE alert_id=$1 AND user_id=$2`, [id, Mor.id])).rows[0];
  check('notification marked Level 2', n.escalation_level === 2, n);
  check('Lekwa-Teemane still not at Level 2', !(await has(Far)));
  await q(`UPDATE alerts SET escalation_level = 4 WHERE alert_id=$1`, [id]);
  check('everyone sees it at Level 4', await has(Far));

  console.log('Found alerts');
  r = await call('POST', `/alerts/${id}/resolve`, A.token, { pin: '1234' }); check('resolved', r.status === 200);
  const After = await mk('AfterFound', COMM, ids.TSH, ids.TSH);
  check('found alert not delivered to new users', !(await has(After)));

  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
