// Change PIN (Profile > Change PIN): with the current PIN, or with the password if the PIN is forgotten.
const path = require('path');
const { BE } = require('./setup');
process.env.SMTP_HOST = 'smtp.test'; process.env.SMTP_USER = 'test@localalert.test'; process.env.SMTP_PASS = 'x';
const emailService = require(BE + '/src/services/emailService');
const sent = [];
emailService.sendPinChangedEmail = async (m) => { sent.push(m); return true; };

const bcrypt = require(BE + '/node_modules/bcrypt');
const jwt = require(BE + '/node_modules/jsonwebtoken');
const pool = require(BE + '/src/config/database');
const app = require(BE + '/src/app');

let pass = 0, failn = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { failn++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
}
const BASE = 'http://localhost:5079/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

(async () => {
  const server = app.listen(5079);
  const q = (s, v) => pool.query(s, v);
  const tag = Date.now();
  await q(`DELETE FROM users WHERE email LIKE 'pintest-%'`);
  const roleId = async (n) => (await q('SELECT role_id FROM roles WHERE role_name = $1', [n])).rows[0].role_id;
  const mk = async (name, role, pin) => {
    const id = (await q(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, pin_hash) VALUES ($1,$2,'Test',$3,$4,$5) RETURNING user_id`,
      [await roleId(role), name, `pintest-${name}-${tag}@x.co`, await bcrypt.hash('Secret123', 10), pin ? await bcrypt.hash(pin, 10) : null])).rows[0].user_id;
    return { id, token: jwt.sign({ sub: id, role }, process.env.JWT_SECRET) };
  };
  const A = await mk('admin', 'Family Administrator', '1234');
  const B = await mk('admin2', 'Family Administrator', '1111');
  const C = await mk('member', 'Community Member', null);
  const pinIs = async (u, pin) => bcrypt.compare(pin, (await q('SELECT pin_hash FROM users WHERE user_id = $1', [u.id])).rows[0].pin_hash);

  console.log('With the current PIN');
  let r = await call('PUT', '/users/me/pin', null, { current_pin: '1234', new_pin: '5678' });
  check('not logged in: 401', r.status === 401, r);
  r = await call('PUT', '/users/me/pin', C.token, { current_pin: '1234', new_pin: '5678' });
  check('someone without a PIN cannot change one', r.status === 400 && /Set a PIN/.test(r.data.message), r);
  r = await call('PUT', '/users/me/pin', A.token, { current_pin: '1234', new_pin: '56a8' });
  check('new PIN must be 4 digits', r.status === 400 && /exactly 4 digits/.test(r.data.message), r);
  r = await call('PUT', '/users/me/pin', A.token, { current_pin: '9999', new_pin: '5678' });
  check('wrong current PIN: 4 attempts left', r.status === 403 && /4 attempts left/.test(r.data.message) && r.data.code === 'WRONG_PIN', r);
  r = await call('PUT', '/users/me/pin', A.token, { current_pin: '1234', new_pin: '1234' });
  check('same PIN refused', r.status === 400 && /different/.test(r.data.message), r);
  r = await call('PUT', '/users/me/pin', A.token, { current_pin: '1234', new_pin: '5678' });
  check('PIN changed', r.status === 200 && /PIN has been changed/.test(r.data.message) && await pinIs(A, '5678'), r);
  await new Promise((ok) => setTimeout(ok, 50));
  check('"PIN changed" email sent', sent.length === 1 && sent[0].to === `pintest-admin-${tag}@x.co` && sent[0].firstName === 'admin', sent);
  r = await call('PUT', '/users/me/pin', A.token, { current_pin: '1234', new_pin: '4321' });
  check('old PIN no longer works', r.status === 403, r);
  r = await call('PUT', '/users/me/pin', A.token, { current_pin: '5678', new_pin: '4321' });
  check('new PIN works (and the wrong tries before it are cleared)', r.status === 200 && await pinIs(A, '4321'), r);
  check('other admin unaffected', await pinIs(B, '1111'));

  console.log('Forgot PIN: use the password');
  for (let i = 0; i < 5; i++) r = await call('PUT', '/users/me/pin', B.token, { current_pin: '0000', new_pin: '2222' });
  check('5 wrong PINs lock PIN entry', r.status === 429, r);
  r = await call('PUT', '/users/me/pin', B.token, { current_pin: '1111', new_pin: '2222' });
  check('locked even with the right PIN', r.status === 429, r);
  r = await call('PUT', '/users/me/pin', B.token, { password: 'wrongpass1', new_pin: '2222' });
  check('wrong password: 403 (stays logged in)', r.status === 403 && /Incorrect password/.test(r.data.message), r);
  r = await call('PUT', '/users/me/pin', B.token, { password: 'Secret123', new_pin: '2222' });
  check('password changes the PIN while PIN entry is locked', r.status === 200 && await pinIs(B, '2222'), r);
  r = await call('PUT', '/users/me/pin', B.token, { current_pin: '2222', new_pin: '3333' });
  check('PIN lock is cleared after the change', r.status === 200 && await pinIs(B, '3333'), r);

  console.log('Password lockout');
  for (let i = 0; i < 4; i++) await call('PUT', '/users/me/pin', B.token, { password: 'nope12345', new_pin: '4444' });
  r = await call('PUT', '/users/me/pin', B.token, { password: 'nope12345', new_pin: '4444' });
  check('5 wrong passwords: locked', r.status === 429 && /15 minutes/.test(r.data.message), r);
  r = await call('PUT', '/users/me/pin', B.token, { password: 'Secret123', new_pin: '4444' });
  check('locked even with the right password', r.status === 429 && await pinIs(B, '3333'), r);
  r = await call('DELETE', '/users/me', B.token, { password: 'Secret123' });
  check('same lock applies to deleting the account', r.status === 429, r);

  await q(`DELETE FROM users WHERE email LIKE 'pintest-%'`);
  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
