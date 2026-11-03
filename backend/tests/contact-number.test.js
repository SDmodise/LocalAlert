// Number to call: the family administrator's number replaces SAPS on "I have seen them".
const path = require('path');
const { BE } = require('./setup');
const bcrypt = require(BE + '/node_modules/bcrypt');
const jwt = require(BE + '/node_modules/jsonwebtoken');
const pool = require(BE + '/src/config/database');
const app = require(BE + '/src/app');

let pass = 0, failn = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { failn++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
}
const ROOT = 'http://localhost:5081';
async function call(method, p, token, body) {
  const r = await fetch(ROOT + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

(async () => {
  const server = app.listen(5081);
  const q = (s, v) => pool.query(s, v);
  const tag = 'c' + Date.now();
  await q(`DELETE FROM alerts WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE 'contacttest-%')`);
  await q(`DELETE FROM family_groups WHERE admin_user_id IN (SELECT user_id FROM users WHERE email LIKE 'contacttest-%')`);
  await q(`DELETE FROM users WHERE email LIKE 'contacttest-%'`);
  const role = async (n) => (await q('SELECT role_id FROM roles WHERE role_name=$1', [n])).rows[0].role_id;
  const ADMIN = await role('Family Administrator'), COMM = await role('Community Member');
  const pinHash = await bcrypt.hash('1234', 10);
  const mk = async (name, roleId) => {
    const id = (await q(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, pin_hash, municipality_id, current_municipality_id)
      VALUES ($1,$2,'Test',$3,'x',$4,1,1) RETURNING user_id`, [roleId, name, `contacttest-${name}-${tag}@x.co`, pinHash])).rows[0].user_id;
    return { id, token: jwt.sign({ sub: id, role: roleId === ADMIN ? 'Family Administrator' : 'Community Member' }, process.env.JWT_SECRET) };
  };
  const A = await mk('Admin', ADMIN);
  const B = await mk('OtherAdmin', ADMIN);
  const U = await mk('Neighbour', COMM);
  const g = (await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'Contact Family') RETURNING group_id`, [A.id])).rows[0].group_id;
  const prof = async (name) => (await q(`INSERT INTO family_members (group_id, full_name, date_of_birth, gender, physical_description, photo_url, verification_status)
      VALUES ($1,$2,'2016-05-01','Female','Short braids','photos/d4639b39-a73e-42c9-aef0-144c6a715178.png','verified') RETURNING member_id`, [g, name])).rows[0].member_id;
  const base = (member, extra = {}) => ({ member_id: member, latitude: -25.55, longitude: 28.10, last_seen_place: 'Soshanguve Crossing Mall',
    last_seen_time: new Date(Date.now() - 30 * 60000).toISOString(), clothing_description: 'Red school jersey', pin: '1234', ...extra });

  console.log('Creating an alert');
  const P1 = await prof('Naledi Contact');
  let r = await call('POST', '/alerts', A.token, base(P1, { contact_number: '12345' }));
  check('invalid number refused (no alert)', r.status === 400 && /valid South African phone number/.test(r.data.message), r);
  r = await call('POST', '/alerts', A.token, base(P1, { contact_number: '+27 82 123 4567' }));
  check('alert created with a number (+27 form accepted)', r.status === 201 && r.data.alert.contact_number === '0821234567', r);
  const id = r.data.alert?.alert_id;
  r = await call('GET', `/alerts/${id}`, U.token);
  check('people in the area see the number', r.status === 200 && r.data.alert.contact_number === '0821234567', r);

  const P2 = await prof('Kagiso Contact');
  r = await call('POST', '/alerts', A.token, base(P2, { contact_number: '' }));
  check('no number: contact_number is null (SAPS)', r.status === 201 && r.data.alert.contact_number === null, r);
  const id2 = r.data.alert.alert_id;
  const P3 = await prof('Lindi Contact');
  r = await call('POST', '/alerts', A.token, base(P3, { contact_number: '(012) 345-6789' }));
  check('landline accepted', r.status === 201 && r.data.alert.contact_number === '0123456789', r);

  console.log('Changing the number');
  r = await call('PATCH', `/alerts/${id}/contact`, U.token, { contact_number: '0831112222', pin: '1234' });
  check('community member cannot change it', r.status === 403, r);
  r = await call('PATCH', `/alerts/${id}/contact`, B.token, { contact_number: '0831112222', pin: '1234' });
  check("another family's admin cannot change it", r.status === 403 || r.status === 404, r);
  r = await call('PATCH', `/alerts/${id}/contact`, A.token, { contact_number: '0831112222', pin: '9999' });
  check('wrong PIN refused', r.status === 403 && /PIN/.test(r.data.message), r);
  r = await call('PATCH', `/alerts/${id}/contact`, A.token, { contact_number: 'abc', pin: '1234' });
  check('invalid number refused', r.status === 400, r);
  r = await call('PATCH', `/alerts/${id}/contact`, A.token, { contact_number: '083 111 2222', pin: '1234' });
  check('changed with PIN', r.status === 200 && r.data.alert.contact_number === '0831112222', r);
  r = await call('PATCH', `/alerts/${id2}/contact`, A.token, { contact_number: '', pin: '1234' });
  check('cleared: back to SAPS', r.status === 200 && r.data.alert.contact_number === null && /SAPS/.test(r.data.message), r);

  console.log('Shared page');
  const share = async (alertId) => {
    const s = await call('POST', `/alerts/${alertId}/share`, A.token);
    return fetch(ROOT + '/a/' + s.data.code).then((x) => x.text());
  };
  let html = await share(id);
  check('button calls the family number', html.includes('href="tel:0831112222"') && html.includes('I have seen them · Call 083 111 2222'), html.slice(0, 200));
  check('SAPS still offered for emergencies', html.includes('href="tel:10111"') && /In an emergency, call SAPS/.test(html));
  check('preview text uses the number', /If you see them, call 083 111 2222/.test(html));
  html = await share(id2);
  check('no number: button calls SAPS', html.includes('href="tel:10111"') && html.includes('I have seen them · Call SAPS (10111)'));

  console.log('Resolved');
  await call('POST', `/alerts/${id}/resolve`, A.token, { pin: '1234' });
  r = await call('PATCH', `/alerts/${id}/contact`, A.token, { contact_number: '0831112222', pin: '1234' });
  check('cannot change after found', r.status === 409, r);

  await q(`DELETE FROM alerts WHERE created_by = $1`, [A.id]);
  await q(`DELETE FROM family_groups WHERE admin_user_id = $1`, [A.id]);
  await q(`DELETE FROM users WHERE email LIKE 'contacttest-%'`);
  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
