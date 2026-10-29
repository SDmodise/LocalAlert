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
const BASE = 'http://localhost:5074/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, type: r.headers.get('content-type') };
}

(async () => {
  const server = app.listen(5074);
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
  const fsx = require('fs');
  const copy = (folder, name) => { const n = `del-${tag}-${Math.random().toString(36).slice(2)}.png`; fsx.copyFileSync(`${UPLOADS}/${folder}/${name}`, `${UPLOADS}/${folder}/${n}`); return `${folder}/${n}`; };
  const prof = async (group, name, status) => (await q(`INSERT INTO family_members (group_id, full_name, date_of_birth, gender, physical_description, photo_url, id_document_url, verification_status)
      VALUES ($1,$2,'2017-03-15','Female','Small, braided hair',$4,$5,$3) RETURNING member_id`, [group, name, status, copy('photos','d4639b39-a73e-42c9-aef0-144c6a715178.png'), copy('id_documents','0b4233c6-a485-4834-9ad5-2d902ea05349.png')])).rows[0].member_id;
  const P = await prof(g, 'Lerato Mokoena', 'verified');
  const Ppending = await prof(g, 'Kagiso Mokoena', 'pending');
  const gB = (await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'B Family') RETURNING group_id`, [B.id])).rows[0].group_id;
  const PB = await prof(gB, 'Thabo B', 'verified');

  const now = new Date();
  const good = { member_id: P, latitude: -25.55, longitude: 28.10, last_seen_place: 'Soshanguve Crossing Mall',
                 last_seen_time: new Date(now - 30 * 60000).toISOString(), clothing_description: 'Red school jersey, grey skirt', pin: '1234' };


  const fs = require('fs');
  const exists = (p) => fs.existsSync(`${UPLOADS}/${p}`);
  const del = async (p, token, body) => { const r = await fetch(BASE + p, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
  const files = async (memberId) => (await q(`SELECT photo_url, id_document_url FROM family_members WHERE member_id=$1`, [memberId])).rows[0];

  console.log('Remove profile');
  let r = await call('POST', '/alerts', A.token, good); const alertId = r.data.alert.alert_id; check('alert for Lerato open', r.status === 201);
  r = await del(`/family-members/${P}`, A.token, { pin: '1234' }); check('cannot remove while in open alert (409)', r.status === 409 && /Mark them as found/.test(r.data.message), r);
  r = await del(`/family-members/${Ppending}`, B.token, { pin: '1234' }); check("other admin can't remove (403)", r.status === 403, r);
  r = await del(`/family-members/${Ppending}`, F.token, { pin: '1234' }); check("linked member can't remove (403)", r.status === 403, r);
  const fp = await files(Ppending);
  r = await del(`/family-members/${Ppending}`, A.token); check('removal without PIN refused', r.status === 403 && r.data.code === 'WRONG_PIN', r);
  r = await del(`/family-members/${Ppending}`, A.token, { pin: '1234' }); check('admin removes pending profile with PIN', r.status === 200, r);
  await new Promise(ok => setTimeout(ok, 200));
  check('profile gone', !(await files(Ppending)));
  check('photo and ID document files deleted', !exists(fp.photo_url) && !exists(fp.id_document_url), fp);
  r = await del(`/family-members/${Ppending}`, A.token, { pin: '1234' }); check('second removal 404', r.status === 404);
  r = await call('POST', `/alerts/${alertId}/resolve`, A.token, { pin: '1234' }); check('resolve', r.status === 200);
  const fp2 = await files(P);
  r = await del(`/family-members/${P}`, A.token, { pin: '1234' }); check('can remove after found', r.status === 200, r);
  await new Promise(ok => setTimeout(ok, 200));
  const a = (await q(`SELECT member_id, photo_url, child_name FROM alerts WHERE alert_id=$1`, [alertId])).rows[0];
  check('closed alert kept, unlinked from profile and photo', a && a.member_id === null && a.photo_url === null && a.child_name === 'Lerato Mokoena', a);
  check('profile files deleted', !exists(fp2.photo_url) && !exists(fp2.id_document_url));
  r = await call('GET', `/alerts/${alertId}`, A.token); check('admin can still open the closed alert', r.status === 200, r);

  console.log('Linked members');
  r = await del(`/family-groups/${g}/links/${F.id}`, B.token); check("other admin can't unlink (403)", r.status === 403);
  r = await del(`/family-groups/${g}/links/${F.id}`, U1.token); check("community user can't unlink others (403)", r.status === 403);
  r = await del(`/family-groups/${g}/links/${F.id}`, A.token); check('admin removes linked member', r.status === 200, r);
  r = await call('GET', '/family-groups/linked', F.token); check('member no longer sees the family', r.data.groups.length === 0);
  r = await del(`/family-groups/${g}/links/${F.id}`, A.token); check('removing again 404', r.status === 404);
  await q(`INSERT INTO family_links (group_id, user_id) VALUES ($1,$2)`, [g, F.id]);
  r = await del(`/family-groups/${g}/links/me`, F.token); check('member can leave the family', r.status === 200 && /left/.test(r.data.message), r);
  r = await del(`/family-groups/${g}/links/me`, F.token); check('leaving twice 404', r.status === 404);

  console.log('Delete account');
  const P3 = await prof(g, 'Kagiso Mokoena', 'verified');
  await q(`INSERT INTO family_links (group_id, user_id) VALUES ($1,$2)`, [g, F.id]);
  r = await call('POST', '/alerts', A.token, { ...good, member_id: P3 }); const openId = r.data.alert.alert_id; check('open alert for Kagiso', r.status === 201, r);
  // a sighting by U1 on A's alert, and a sighting by A on B's alert
  r = await call('POST', '/alerts', B.token, { ...good, member_id: PB, latitude: -26.2, longitude: 28.04 }); const bAlert = r.data.alert.alert_id;
  await q(`INSERT INTO notifications (user_id, alert_id, title, message, notification_type, recipient_type) VALUES ($1,$2,'t','m','alert','area')`, [A.id, bAlert]);
  r = await call('POST', `/alerts/${bAlert}/sightings`, A.token, { description: 'Saw him at the mall' });
  check('A reported a sighting on B\'s alert', r.status === 201, r);
  r = await del('/users/me', A.token, { password: 'wrong' }); check('wrong password 403 (not 401)', r.status === 403 && r.data.message === 'Incorrect password.', r);
  r = await call('GET', '/users/me', A.token); check('still logged in after wrong password', r.status === 200);
  // test users were created with password_hash 'x': give A a real password
  await q(`UPDATE users SET password_hash=$2 WHERE user_id=$1`, [A.id, await bcrypt.hash('Passw0rd!x', 10)]);
  r = await del('/users/me', A.token, { password: 'Passw0rd!x' }); check('blocked while an alert is open (409)', r.status === 409, r);
  r = await call('POST', `/alerts/${openId}/resolve`, A.token, { pin: '1234' }); check('resolve open alert', r.status === 200);
  const p3 = await files(P3);
  const before = { users: (await q(`SELECT count(*)::int c FROM users`)).rows[0].c };
  r = await del('/users/me', A.token, { password: 'Passw0rd!x' }); check('account deleted', r.status === 200, r);
  await new Promise(ok => setTimeout(ok, 200));
  check('user row gone', (await q(`SELECT count(*)::int c FROM users WHERE user_id=$1`, [A.id])).rows[0].c === 0);
  check('exactly one user removed', (await q(`SELECT count(*)::int c FROM users`)).rows[0].c === before.users - 1);
  check('family group, profiles and links gone', (await q(`SELECT count(*)::int c FROM family_groups WHERE group_id=$1`, [g])).rows[0].c === 0 && !(await files(P3)) && (await q(`SELECT count(*)::int c FROM family_links WHERE group_id=$1`, [g])).rows[0].c === 0);
  check('their alerts and notifications gone', (await q(`SELECT count(*)::int c FROM alerts WHERE alert_id = ANY($1)`, [[alertId, openId]])).rows[0].c === 0 && (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id = ANY($1)`, [[alertId, openId]])).rows[0].c === 0);
  check('profile files deleted', !exists(p3.photo_url) && !exists(p3.id_document_url));
  const s = (await q(`SELECT user_id, description FROM sighting_reports WHERE alert_id=$1`, [bAlert])).rows;
  check("their sighting on B's alert kept for B, anonymously", s.length === 1 && s[0].user_id === null && s[0].description === 'Saw him at the mall', s);
  check("B's alert and family untouched", (await q(`SELECT count(*)::int c FROM alerts WHERE alert_id=$1`, [bAlert])).rows[0].c === 1 && (await q(`SELECT count(*)::int c FROM family_groups WHERE group_id=$1`, [gB])).rows[0].c === 1);
  check('linked member F still exists', (await q(`SELECT count(*)::int c FROM users WHERE user_id=$1`, [F.id])).rows[0].c === 1);
  r = await call('GET', '/users/me', A.token); check('old login no longer works', r.status === 401);
  // community member deletes
  await q(`UPDATE users SET password_hash=$2 WHERE user_id=$1`, [U1.id, await bcrypt.hash('Passw0rd!y', 10)]);
  r = await del('/users/me', U1.token, { password: 'Passw0rd!y' }); check('community member deletes account', r.status === 200, r);
  check('their notifications gone', (await q(`SELECT count(*)::int c FROM notifications WHERE user_id=$1`, [U1.id])).rows[0].c === 0);
  r = await del('/users/me', null, { password: 'x' }); check('needs login', r.status === 401);
  // lockout
  for (let i = 0; i < 5; i++) r = await del('/users/me', U2.token, { password: 'nope' });
  r = await del('/users/me', U2.token, { password: 'nope' }); check('locked after 5 wrong passwords (429)', r.status === 429, r);

  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
