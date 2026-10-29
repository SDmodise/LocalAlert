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
const BASE = 'http://localhost:5077/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, type: r.headers.get('content-type') };
}

(async () => {
  const server = app.listen(5077);
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
  function idFor(dob, female) { const base = dob.slice(2,4)+dob.slice(5,7)+dob.slice(8,10) + (female ? '0123' : '5123') + '0' + '8'; let sum = 0; for (let i = 0; i < 12; i++) { let d = +base[i]; if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; } return base + ((10 - sum % 10) % 10); }
  async function add(fields, files) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    for (const [k, buf] of Object.entries(files)) fd.append(k, new Blob([buf], { type: 'image/png' }), `${k}.png`);
    const r = await fetch(`${BASE}/family-groups/${g}/profiles`, { method: 'POST', headers: { Authorization: 'Bearer ' + A.token }, body: fd });
    return { status: r.status, data: await r.json().catch(() => null) };
  }
  const base = { full_name: 'Naledi Mokoena', date_of_birth: '2016-05-20', gender: 'Female', physical_description: 'Tall for her age, short hair' };

  console.log('ID document optional');
  let r = await add({ ...base, id_number: idFor('2016-05-20', true) }, { photo: png });
  check('valid ID, no document: verified', r.status === 201 && r.data.profile.verification_status === 'verified' && r.data.profile.has_id_document === false, r);
  const v = r.data.profile.member_id;
  r = await add({ ...base, full_name: 'Thato Mokoena' }, { photo: png });
  check('no ID, no document: pending', r.status === 201 && r.data.profile.verification_status === 'pending', r);
  const pend = r.data.profile.member_id;
  r = await add({ ...base, full_name: 'Bad Id', id_number: '8001015009087' }, { photo: png });
  check('invalid ID still rejected', r.status === 400, r);
  r = await add({ ...base, full_name: 'No Photo', id_number: idFor('2016-05-20', true) }, {});
  check('photo of the person still required', r.status === 400 && /photo/i.test(r.data.message), r);
  r = await add({ ...base, full_name: 'With Doc', id_number: idFor('2016-05-20', true) }, { photo: png, id_document: png });
  check('document can still be added', r.status === 201 && r.data.profile.has_id_document === true, r);
  let x = await fetch(`${BASE}/family-members/${v}/id-document?access_token=${A.token}`); check('no document: 404', x.status === 404);

  console.log('Verify later without a document');
  const fd = new FormData(); fd.append('id_number', idFor('2016-05-20', true)); fd.append('pin', '1234');
  x = await fetch(`${BASE}/family-members/${pend}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + A.token }, body: fd });
  const j = await x.json();
  check('pending profile verified by ID number alone', x.status === 200 && j.profile.verification_status === 'verified', j);

  console.log('Alert with a verified, document-free profile');
  r = await call('POST', '/alerts', A.token, { ...good, member_id: v });
  check('can be reported missing', r.status === 201, r);

  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
