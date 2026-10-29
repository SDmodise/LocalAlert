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
const BASE = 'http://localhost:5073/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, type: r.headers.get('content-type') };
}

(async () => {
  const server = app.listen(5073);
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


  const fs = require('fs');
  const png = fs.readFileSync(UPLOADS + '/photos/d4639b39-a73e-42c9-aef0-144c6a715178.png');
  async function form(p, token, fields, photo, mime = 'image/png') {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    if (photo) fd.append('photo', new Blob([photo], { type: mime }), 'p.png');
    const r = await fetch(BASE + p, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    return { status: r.status, data: await r.json().catch(() => null) };
  }
  const files = () => fs.readdirSync(UPLOADS + '/alert_photos').length;

  console.log('New photo when reporting');
  const before = files();
  let r = await form('/alerts', A.token, { ...good, pin: '0000' }, png);
  check('wrong PIN: rejected', r.status === 403, r);
  await new Promise((ok) => setTimeout(ok, 200));
  check('rejected upload is deleted', files() === before, [before, files()]);
  r = await form('/alerts', A.token, { ...good, pin: '1234' }, Buffer.from('not an image'), 'application/pdf');
  check('non-image photo rejected', r.status === 400, r);
  r = await form('/alerts', A.token, good, png);
  check('alert created with new photo (multipart)', r.status === 201 && r.data.alert.has_photo, r);
  const id = r.data.alert.alert_id;
  check('photo saved in uploads/alert_photos', files() === before + 1);
  const stored = (await q(`SELECT a.photo_url, fm.photo_url AS profile_photo FROM alerts a JOIN family_members fm ON fm.member_id=a.member_id WHERE a.alert_id=$1`, [id])).rows[0];
  check('alert uses the new photo, profile photo unchanged', stored.photo_url.startsWith('alert_photos/') && stored.profile_photo.startsWith('photos/'), stored);
  let pr = await fetch(`${BASE}/alerts/${id}/photo`, { headers: { Authorization: 'Bearer ' + U1.token } });
  check('recipient sees the new photo', pr.status === 200 && /image/.test(pr.headers.get('content-type')));
  r = await call('GET', '/alerts', U2.token);
  check('list shows has_photo for every recipient', r.data.alerts.find(a => a.alert_id === id)?.has_photo === true);
  r = await call('POST', `/alerts/${id}/resolve`, A.token, { pin: '1234' }); check('resolved (to free the profile)', r.status === 200);
  r = await call('POST', '/alerts', A.token, good);
  check('JSON (existing photo) still works', r.status === 201 && r.data.alert.has_photo, r);
  const id2 = r.data.alert.alert_id;
  check('uses profile photo', (await q(`SELECT photo_url FROM alerts WHERE alert_id=$1`, [id2])).rows[0].photo_url.startsWith('photos/'));

  console.log('Notifications');
  r = await call('GET', '/notifications', U1.token);
  check('list notifications', r.status === 200 && Array.isArray(r.data.notifications) && r.data.notifications.length >= 3, r.data);
  const n0 = r.data.notifications[0];
  check('newest first, with alert info and photo flag', n0.alert_id === id2 && n0.notification_type === 'alert' && n0.child_name === 'Lerato Mokoena' && n0.has_photo === true && n0.is_read === false, n0);
  check('has resolved notification for first alert', r.data.notifications.some(n => n.alert_id === id && n.notification_type === 'resolved'));
  check('created_at is a real recent time', Math.abs(new Date(n0.created_at) - Date.now()) < 120e3, n0.created_at);
  const unread = r.data.unread_count;
  check('unread count matches', unread === r.data.notifications.filter(n => !n.is_read).length, unread);
  r = await call('GET', '/notifications/unread-count', U1.token); check('unread-count endpoint', r.data.unread_count === unread);
  r = await call('POST', '/notifications/read', U1.token, { ids: [n0.notification_id] });
  check('mark one read', r.status === 200 && r.data.marked === 1 && r.data.unread_count === unread - 1, r.data);
  r = await call('POST', '/notifications/read', U2.token, { ids: [n0.notification_id] });
  check("cannot mark someone else's notification", r.status === 200 && r.data.marked === 0);
  r = await call('GET', `/alerts/${id}`, U1.token);
  r = await call('GET', '/notifications', U1.token);
  check('opening an alert marks its notifications read', r.data.notifications.filter(n => n.alert_id === id).every(n => n.is_read));
  r = await call('POST', '/notifications/read', U1.token, { all: true });
  check('mark all read', r.data.unread_count === 0);
  r = await call('POST', '/notifications/read', U1.token, {}); check('empty request 400', r.status === 400);
  r = await call('GET', '/notifications', null); check('needs login', r.status === 401);
  r = await call('GET', '/notifications', A.token);
  check('family admin gets sighting/escalation-type notices only, not own alert', r.status === 200 && !r.data.notifications.some(n => n.notification_type === 'alert'));

  console.log('Linked family');
  r = await call('GET', '/family-groups/linked', F.token);
  const fam = r.data.groups?.[0];
  check('linked member sees the family', r.status === 200 && r.data.groups.length === 1 && fam.group_name === 'Test Family' && fam.administrator === 'Admin Test', r.data);
  check('with its profiles (incl. pending)', fam.profiles.length === 2 && fam.profiles.some(p => p.full_name === 'Lerato Mokoena' && p.has_photo), fam.profiles);
  check('no ID numbers or document paths exposed', !JSON.stringify(fam).includes('id_documents/') && !JSON.stringify(fam).includes('photos/'));
  pr = await fetch(`${BASE}/family-members/${fam.profiles[0].member_id}/photo`, { headers: { Authorization: 'Bearer ' + F.token } });
  check('linked member can load profile photos', pr.status === 200);
  r = await call('GET', '/family-groups/linked', U1.token); check('unlinked user: empty list', r.status === 200 && r.data.groups.length === 0);
  r = await call('GET', '/family-groups/mine', F.token); check('linked member still cannot use admin endpoint', r.status === 403);

  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
