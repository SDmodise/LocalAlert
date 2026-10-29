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
const BASE = 'http://localhost:5066/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, type: r.headers.get('content-type') };
}

(async () => {
  const server = app.listen(5066);
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

  console.log('Validation');
  let r = await call('POST', '/alerts', U1.token, good); check('community member cannot create (403)', r.status === 403, r);
  r = await call('POST', '/alerts', null, good); check('no token 401', r.status === 401);
  r = await call('POST', '/alerts', A.token, { ...good, member_id: 'x' }); check('bad member 400', r.status === 400, r);
  r = await call('POST', '/alerts', A.token, { ...good, member_id: PB }); check("other family's profile 403", r.status === 403, r);
  r = await call('POST', '/alerts', A.token, { ...good, member_id: Ppending }); check('pending profile 400', r.status === 400 && /verified/.test(r.data.message), r);
  r = await call('POST', '/alerts', A.token, { ...good, latitude: 'abc' }); check('bad location 400', r.status === 400, r);
  r = await call('POST', '/alerts', A.token, { ...good, last_seen_time: new Date(+now + 3600e3).toISOString() }); check('future time 400', r.status === 400, r);
  r = await call('POST', '/alerts', A.token, { ...good, last_seen_time: 'yesterday' }); check('invalid time 400', r.status === 400, r);
  r = await call('POST', '/alerts', A.token, { ...good, clothing_description: 'x' }); check('clothing required 400', r.status === 400, r);
  r = await call('POST', '/alerts', A.token, { ...good, pin: '9999' }); check('wrong PIN 403 with attempts left', r.status === 403 && r.data.code === 'WRONG_PIN' && /4 attempts/.test(r.data.message), r);
  r = await call('POST', '/alerts', A.token, { ...good, latitude: 0, longitude: 0 }); check('outside coverage 422', r.status === 422, r);
  check('no alert rows yet', (await q('SELECT count(*)::int c FROM alerts WHERE created_by=$1', [A.id])).rows[0].c === 0);

  // Expected Level 1 recipients: every user (any test run) with home/current = TSH, except the admin and family.
  const expectL1 = (await q(`SELECT count(*)::int c FROM users WHERE (municipality_id=1 OR current_municipality_id=1) AND user_id NOT IN ($1,$2)`, [A.id, F.id])).rows[0].c;

  console.log('Create');
  r = await call('POST', '/alerts', A.token, good);
  check('created 201', r.status === 201, r);
  const alert = r.data.alert, reach = r.data.reach;
  check('alert fields', alert.child_name === 'Lerato Mokoena' && alert.age >= 8 && alert.escalation_level === 1 && alert.status === 'active' && alert.municipality_name === 'City of Tshwane' && alert.last_seen_place === 'Soshanguve Crossing Mall' && alert.relation === 'creator', alert);
  check('next escalation about 6 h away', Math.abs(new Date(alert.next_escalation_at) - (Date.now() + 6 * 3600e3)) < 120e3, alert.next_escalation_at);
  check('last seen time round-trips exactly', Math.abs(new Date(alert.last_seen_time) - new Date(good.last_seen_time)) < 1000, [alert.last_seen_time, good.last_seen_time]);
  check('created_at is now', Math.abs(new Date(alert.created_at) - Date.now()) < 60e3, alert.created_at);
  check('reach family = 1', reach.family === 1, reach);
  check('reach L1 users = all Tshwane users', reach.levels[0].users === expectL1 && reach.levels[0].status === 'sent' && reach.levels[0].municipalities[0] === 'City of Tshwane', { reach, expectL1 });
  check('reach L2 scheduled with all 10 Tshwane neighbours', reach.levels[1].status === 'scheduled' && reach.levels[1].municipalities.length === 10 && reach.levels[1].users === null, reach.levels[1]);
  check('reach L4 scheduled 18 h', Math.abs(new Date(reach.levels[3].scheduled_at) - (Date.now() + 18 * 3600e3)) < 120e3, reach.levels[3]);
  const notes = async (u) => (await q(`SELECT notification_type, recipient_type, escalation_level FROM notifications WHERE alert_id=$1 AND user_id=$2 ORDER BY created_at`, [alert.alert_id, u.id])).rows;
  check('family member got family alert', JSON.stringify(await notes(F)) === JSON.stringify([{ notification_type: 'alert', recipient_type: 'family', escalation_level: 1 }]), await notes(F));
  check('U1 (home TSH) got L1', (await notes(U1)).length === 1 && (await notes(U1))[0].escalation_level === 1);
  check('U2 (visiting TSH) got L1', (await notes(U2)).length === 1);
  check('U3 Moretele not yet', (await notes(U3)).length === 0);
  check('admin no notification', (await notes(A)).length === 0);
  const hist = (await q(`SELECT new_status,new_level,changed_by FROM alert_history WHERE alert_id=$1`, [alert.alert_id])).rows;
  check('history row', hist.length === 1 && hist[0].new_level === 1 && hist[0].changed_by === A.id, hist);
  r = await call('POST', '/alerts', A.token, good); check('second active alert for same person 409', r.status === 409, r);

  console.log('Read');
  r = await call('GET', '/alerts', U1.token); check('U1 lists alert as recipient', r.status === 200 && r.data.alerts.some((x) => x.alert_id === alert.alert_id && x.relation === 'recipient'), r.data);
  r = await call('GET', '/alerts', U3.token); check('U3 list excludes it', r.status === 200 && !r.data.alerts.some((x) => x.alert_id === alert.alert_id));
  r = await call('GET', '/alerts', F.token); check('family member sees it as family', r.data.alerts.some((x) => x.alert_id === alert.alert_id && x.relation === 'family'));
  r = await call('GET', `/alerts/${alert.alert_id}`, U3.token); check('U3 detail 403', r.status === 403);
  r = await call('GET', `/alerts/${alert.alert_id}`, U1.token); check('U1 detail without reach', r.status === 200 && !r.data.reach && r.data.alert.latitude === -25.55);
  r = await call('GET', `/alerts/${alert.alert_id}`, F.token); check('family detail has reach', r.status === 200 && r.data.reach && r.data.reach.family === 1);
  r = await call('GET', `/alerts/not-a-uuid`, U1.token); check('bad id 404', r.status === 404);
  r = await call('GET', `/alerts/${alert.alert_id}/photo`, U1.token); check('recipient can load photo', r.status === 200 && /image/.test(r.type), r.type);
  r = await call('GET', `/alerts/${alert.alert_id}/photo`, U3.token); check('non-recipient photo 403', r.status === 403);

  console.log('Escalation');
  let out = await escalation.runOnce(); check('nothing due straight away', !out.some((x) => x.alert_id === alert.alert_id), out);
  const backdate = () => q(`UPDATE alerts SET last_escalated_at = last_escalated_at - interval '6 hours 1 minute' WHERE alert_id=$1`, [alert.alert_id]);
  await backdate();
  out = await escalation.runOnce(); const e2 = out.find((x) => x.alert_id === alert.alert_id);
  check('escalated to L2', e2 && e2.new_level === 2, out);
  check('U3 Moretele got L2', (await notes(U3)).length === 1 && (await notes(U3))[0].escalation_level === 2, await notes(U3));
  check('U4 Lekwa-Teemane not yet', (await notes(U4)).length === 0);
  check('U1 not notified twice', (await notes(U1)).length === 1);
  check('family member got escalation notice', (await notes(F)).some((n) => n.notification_type === 'escalation' && n.escalation_level === 2), await notes(F));
  check('admin got escalation notice', (await notes(A)).some((n) => n.notification_type === 'escalation' && n.escalation_level === 2), await notes(A));
  out = await escalation.runOnce(); check('not escalated again within the interval', !out.some((x) => x.alert_id === alert.alert_id), out);
  let row = (await q(`SELECT escalation_level, last_escalated_at, created_at FROM alerts WHERE alert_id=$1`, [alert.alert_id])).rows[0];
  check('schedule kept on fixed rhythm', row.escalation_level === 2);

  // Two escalations at the same moment: only one may win.
  await backdate();
  const both = await Promise.all([Alert.escalateIfDue(alert.alert_id, 360), Alert.escalateIfDue(alert.alert_id, 360)]);
  check('parallel escalation only once', both.filter(Boolean).length === 1 && both.find(Boolean).new_level === 3, both);
  await backdate();
  out = await escalation.runOnce(); const e4 = out.find((x) => x.alert_id === alert.alert_id);
  check('escalated to L4', e4 && e4.new_level === 4, out);
  check('U4 Lekwa-Teemane got L4', (await notes(U4)).length === 1 && (await notes(U4))[0].escalation_level === 4);
  check('U5 (no municipality) got L4', (await notes(U5)).length === 1);
  await backdate();
  out = await escalation.runOnce(); check('no escalation past L4', !out.some((x) => x.alert_id === alert.alert_id));
  const h = (await q(`SELECT old_level,new_level,changed_by FROM alert_history WHERE alert_id=$1 ORDER BY updated_at`, [alert.alert_id])).rows;
  check('history 1→2→3→4 by scheduler', JSON.stringify(h.slice(1).map((x) => [x.old_level, x.new_level, x.changed_by])) === JSON.stringify([[1, 2, null], [2, 3, null], [3, 4, null]]), h);
  const dupes = (await q(`SELECT user_id FROM notifications WHERE alert_id=$1 AND notification_type='alert' GROUP BY user_id HAVING count(*)>1`, [alert.alert_id])).rows;
  check('nobody got the alert twice', dupes.length === 0);
  r = await call('GET', `/alerts/${alert.alert_id}`, A.token);
  check('reach after L4: all sent, no next escalation', r.data.reach.levels.every((l) => l.status === 'sent') && r.data.alert.next_escalation_at === null, r.data.reach);

  console.log('Resolved alerts are not escalated');
  r = await call('POST', '/alerts', B.token, { ...good, member_id: PB, latitude: -26.2, longitude: 28.04 });
  check('B created alert in JHB', r.status === 201 && r.data.alert.municipality_name === 'City of Johannesburg', r.data);
  const bId = r.data.alert.alert_id;
  await q(`UPDATE alerts SET status='resolved', resolved_at=now(), last_escalated_at = last_escalated_at - interval '7 hours' WHERE alert_id=$1`, [bId]);
  out = await escalation.runOnce(); check('resolved alert left alone', !out.some((x) => x.alert_id === bId), out);
  r = await call('GET', `/alerts/${bId}`, B.token); check('resolved reach shows not_needed', r.data.reach.levels[1].status === 'not_needed', r.data.reach);

  console.log('PIN lockout');
  const P2 = await prof(gB, 'Second B', 'verified');
  let last;
  for (let i = 0; i < 5; i++) last = await call('POST', '/alerts', B.token, { ...good, member_id: P2, pin: '0000' });
  check('5th wrong PIN locks (429)', last.status === 429, last);
  r = await call('POST', '/alerts', B.token, { ...good, member_id: P2 }); check('correct PIN refused while locked', r.status === 429, r);

  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
