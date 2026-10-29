// Integration test for alert creation and escalation against the test database (see setup.js).
const path = require('path');
const { BE, UPLOADS } = require('./setup');
const bcrypt = require(BE + '/node_modules/bcrypt');
const jwt = require(BE + '/node_modules/jsonwebtoken');
const pool = require(BE + '/src/config/database');
const app = require(BE + '/src/app');
const escalation = require(BE + '/src/services/escalationService');
const Alert = require(BE + '/src/models/Alert');

let out;
let pass = 0, failn = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { failn++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
}
const BASE = 'http://localhost:5068/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, type: r.headers.get('content-type') };
}

(async () => {
  const server = app.listen(5068);
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


  const FormData = global.FormData, Blob = global.Blob;
  const fs = require('fs');
  const png = fs.readFileSync(UPLOADS + '/photos/d4639b39-a73e-42c9-aef0-144c6a715178.png');
  async function form(p, token, fields, withPhoto, mime='image/png') {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    if (withPhoto) fd.append('photo', new Blob([png], { type: mime }), 'p.png');
    const r = await fetch(BASE + p, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data };
  }
  const L1 = (await q(`SELECT user_id FROM users WHERE municipality_id=1 OR current_municipality_id=1`)).rows.length;

  let r = await call('POST', '/alerts', A.token, good);
  check('alert created', r.status === 201, r);
  const id = r.data.alert.alert_id;
  check('creator sees can_resolve + sightings_count 0', r.data.alert.can_resolve === true && r.data.alert.sightings_count === 0, r.data.alert);
  r = await call('GET', `/alerts/${id}`, U1.token);
  check('recipient: no can_resolve, no sightings_count', r.data.alert.can_resolve === false && r.data.alert.sightings_count === undefined, r.data.alert);
  r = await call('GET', `/alerts/${id}`, F.token);
  check('linked family: cannot resolve but sees count', r.data.alert.can_resolve === false && r.data.alert.sightings_count === 0, r.data.alert);

  console.log('Sightings');
  r = await form(`/alerts/${id}/sightings`, U1.token, {}, false); check('empty report 400', r.status === 400, r);
  r = await form(`/alerts/${id}/sightings`, U1.token, { description: 'x'.repeat(501) }, false); check('too long 400', r.status === 400, r);
  r = await form(`/alerts/${id}/sightings`, U1.token, { latitude: 'abc', longitude: 1 }, false); check('bad location 400', r.status === 400, r);
  r = await form(`/alerts/${id}/sightings`, U3.token, { description: 'Saw her' }, false); check('non-recipient 403', r.status === 403, r);
  r = await form(`/alerts/${id}/sightings`, U1.token, { description: 'Walking towards the taxi rank' }, false);
  check('description only 201', r.status === 201 && r.data.report.report_id, r);
  r = await form(`/alerts/${id}/sightings`, U2.token, { latitude: -25.535, longitude: 28.095 }, false); check('location only 201', r.status === 201, r);
  const before = fs.readdirSync(UPLOADS + '/sightings').length;
  r = await form(`/alerts/${id}/sightings`, U1.token, {}, true); check('photo only 201', r.status === 201, r);
  check('photo saved in uploads/sightings', fs.readdirSync(UPLOADS + '/sightings').length === before + 1);
  r = await form(`/alerts/${id}/sightings`, U1.token, { description: 'pdf' }, true, 'application/pdf'); check('non-image rejected 400', r.status === 400, r);
  const b2 = fs.readdirSync(UPLOADS + '/sightings').length;
  r = await form(`/alerts/${id}/sightings`, U3.token, { description: 'x' }, true); await new Promise((ok) => setTimeout(ok, 200)); check('rejected upload is deleted', r.status === 403 && fs.readdirSync(UPLOADS + '/sightings').length === b2, r);

  const famNotes = (await q(`SELECT user_id, message FROM notifications WHERE alert_id=$1 AND notification_type='spotted_report'`, [id])).rows;
  check('admin and linked family told of each report (3×2)', famNotes.length === 6 && famNotes.some(n => n.user_id === A.id) && famNotes.some(n => n.user_id === F.id), famNotes);
  check('message quotes description', famNotes.some(n => /U1 reported: "Walking towards the taxi rank"/.test(n.message)), famNotes.map(n=>n.message));

  r = await call('GET', `/alerts/${id}/sightings`, U1.token); check('recipient cannot list sightings 403', r.status === 403);
  r = await call('GET', `/alerts/${id}/sightings`, A.token);
  check('admin lists 3, newest first', r.status === 200 && r.data.sightings.length === 3 && new Date(r.data.sightings[0].reported_at) >= new Date(r.data.sightings[2].reported_at), r.data);
  const loc = r.data.sightings.find(s => s.latitude !== null);
  check('distance from last seen place ~1.8 km', loc && loc.distance_km > 1 && loc.distance_km < 3, loc);
  check('reported_at is now', Math.abs(new Date(r.data.sightings[0].reported_at) - Date.now()) < 60e3, r.data.sightings[0].reported_at);
  const ph = r.data.sightings.find(s => s.has_photo);
  let pr = await fetch(`${BASE}/alerts/${id}/sightings/${ph.report_id}/photo`, { headers: { Authorization: 'Bearer ' + F.token } });
  check('family loads sighting photo', pr.status === 200 && /image/.test(pr.headers.get('content-type')));
  pr = await fetch(`${BASE}/alerts/${id}/sightings/${ph.report_id}/photo`, { headers: { Authorization: 'Bearer ' + U1.token } });
  check('reporter (recipient) cannot load photos', pr.status === 403);
  r = await call('GET', `/alerts/${id}`, A.token); check('count now 3', r.data.alert.sightings_count === 3);

  console.log('Resolve');
  r = await call('POST', `/alerts/${id}/resolve`, U1.token, { pin: '1234' }); check('community member 403', r.status === 403);
  r = await call('POST', `/alerts/${id}/resolve`, B.token, { pin: '1234' }); check('other admin 403', r.status === 403, r);
  r = await call('POST', `/alerts/${id}/resolve`, A.token, { pin: '0000' }); check('wrong PIN 403', r.status === 403 && r.data.code === 'WRONG_PIN', r);
  check('still active after wrong PIN', (await q(`SELECT status FROM alerts WHERE alert_id=$1`, [id])).rows[0].status === 'active');
  r = await call('POST', `/alerts/${id}/resolve`, A.token, { pin: '1234' });
  check('resolved 200', r.status === 200 && r.data.alert.status === 'resolved' && r.data.alert.can_resolve === false && r.data.alert.resolved_at, r);
  check('resolved_at is now', Math.abs(new Date(r.data.alert.resolved_at) - Date.now()) < 60e3, r.data.alert.resolved_at);
  const res = (await q(`SELECT user_id, recipient_type FROM notifications WHERE alert_id=$1 AND notification_type='resolved'`, [id])).rows;
  check('everyone told (L1 recipients + family), not the admin', res.length === L1 - 1 + 1 && res.some(n => n.user_id === F.id && n.recipient_type === 'family') && !res.some(n => n.user_id === A.id), { got: res.length, L1 });
  check('no duplicate resolved notices', new Set(res.map(n => n.user_id)).size === res.length);
  r = await call('POST', `/alerts/${id}/resolve`, A.token, { pin: '1234' }); check('second resolve 409', r.status === 409, r);
  r = await form(`/alerts/${id}/sightings`, U1.token, { description: 'late' }, false); check('no sightings after found 409', r.status === 409, r);
  r = await call('GET', `/alerts/${id}/sightings`, A.token); check('family can still read reports', r.status === 200 && r.data.sightings.length === 3);
  const hist = (await q(`SELECT new_status, changed_by FROM alert_history WHERE alert_id=$1 ORDER BY updated_at`, [id])).rows;
  check('history records resolve by admin', hist.at(-1).new_status === 'resolved' && hist.at(-1).changed_by === A.id, hist);
  out = await escalation.runOnce();
  check('resolved not escalated', !out.some(x => x.alert_id === id));

  console.log('Still missing');
  r = await call('POST', '/alerts', A.token, good); const id2 = r.data.alert.alert_id; check('new alert after found ok', r.status === 201, r);
  await q(`UPDATE alerts SET created_at = created_at - interval '5 days 1 hour' WHERE alert_id=$1`, [id2]);
  out = await escalation.runOnce();
  r = await call('GET', `/alerts/${id2}`, U1.token); check('marked still_missing after 5 days', r.data.alert.status === 'still_missing', r.data.alert);
  const h2 = (await q(`SELECT old_status,new_status,changed_by FROM alert_history WHERE alert_id=$1 ORDER BY updated_at`, [id2])).rows;
  check('history active→still_missing by scheduler', h2.some(h => h.old_status === 'active' && h.new_status === 'still_missing' && h.changed_by === null), h2);
  r = await form(`/alerts/${id2}/sightings`, U1.token, { description: 'still looking' }, false); check('still missing accepts sightings', r.status === 201, r);
  r = await call('POST', '/alerts', A.token, good); check('still-missing counts as open (409 duplicate)', r.status === 409, r);
  r = await call('POST', `/alerts/${id2}/resolve`, A.token, { pin: '1234' }); check('still missing can be resolved', r.status === 200);
  r = await call('GET', '/alerts', U1.token);
  check('list orders open before resolved', r.data.alerts.findIndex(a => a.status === 'resolved') >= r.data.alerts.filter(a => a.status !== 'resolved').length, r.data.alerts.map(a=>a.status));

  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
