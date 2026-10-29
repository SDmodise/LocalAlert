// Forgot password: request a code, reset with it, and old logins are signed out.
const path = require('path');
const { BE } = require('./setup');
// Pretend email is set up and capture what would be sent instead of sending it.
process.env.SMTP_HOST = 'smtp.test'; process.env.SMTP_USER = 'test@localalert.test'; process.env.SMTP_PASS = 'x';
const emailService = require(BE + '/src/services/emailService');
const sent = [];
emailService.sendPasswordResetCode = async (m) => { sent.push({ type: 'code', ...m }); return true; };
emailService.sendPasswordChangedEmail = async (m) => { sent.push({ type: 'changed', ...m }); return true; };

const bcrypt = require(BE + '/node_modules/bcrypt');
const pool = require(BE + '/src/config/database');
const app = require(BE + '/src/app');

let pass = 0, failn = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { failn++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
}
const BASE = 'http://localhost:5078/api';
async function call(method, p, body, token) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const lastCode = () => sent.filter((m) => m.type === 'code').at(-1);
// Lets the test ask for another code without waiting a minute.
const ageCodes = (userId) => pool.query(`UPDATE password_reset_codes SET created_at = created_at - interval '2 minutes' WHERE user_id = $1`, [userId]);

(async () => {
  const server = app.listen(5078);
  const q = (s, v) => pool.query(s, v);
  const tag = Date.now();
  await q(`DELETE FROM users WHERE email LIKE 'resettest-%'`);
  const email = `resettest-${tag}@x.co`;
  const role = (await q(`SELECT role_id FROM roles WHERE role_name = 'Community Member'`)).rows[0].role_id;
  const userId = (await q(`INSERT INTO users (role_id, first_name, last_name, email, password_hash) VALUES ($1,'Thandi','Test',$2,$3) RETURNING user_id`,
    [role, email, await bcrypt.hash('OldPass123', 10)])).rows[0].user_id;

  console.log('Ask for a code');
  let r = await call('POST', '/auth/forgot-password', { email: 'nobody-' + tag + '@x.co' });
  const generic = r.data && r.data.message;
  check('unknown email: same reply, nothing sent', r.status === 200 && /6-digit code/.test(generic) && sent.length === 0, r);
  r = await call('POST', '/auth/forgot-password', { email: 'not-an-email' });
  check('invalid email is refused', r.status === 400, r);
  const old = await call('POST', '/auth/login', { email, password: 'OldPass123' });
  check('can log in with the old password first', old.status === 200 && old.data.token, old);
  r = await call('POST', '/auth/forgot-password', { email: email.toUpperCase() });
  await new Promise((ok) => setTimeout(ok, 50));
  check('known email (any capitals): same reply, code emailed', r.status === 200 && r.data.message === generic && sent.length === 1 && lastCode().to === email && /^\d{6}$/.test(lastCode().code), [r, sent]);
  check('email has the first name and 15 minutes', lastCode().firstName === 'Thandi' && lastCode().minutes === 15);
  const stored = (await q(`SELECT code_hash FROM password_reset_codes WHERE user_id = $1`, [userId])).rows;
  check('only a hash of the code is stored', stored.length === 1 && stored[0].code_hash !== lastCode().code && stored[0].code_hash.startsWith('$2'));
  r = await call('POST', '/auth/forgot-password', { email });
  check('asking again within a minute sends nothing new', r.status === 200 && sent.length === 1, sent.length);

  console.log('Reset');
  const code = lastCode().code;
  const wrong = code === '000000' ? '111111' : '000000';
  r = await call('POST', '/auth/reset-password', { email, code: wrong, new_password: 'NewPass456' });
  check('wrong code: 4 tries left', r.status === 400 && /4 tries left/.test(r.data.message), r);
  r = await call('POST', '/auth/reset-password', { email, code, new_password: 'short' });
  check('weak new password is refused (code not used up)', r.status === 400 && /8 characters/.test(r.data.message), r);
  r = await call('POST', '/auth/reset-password', { email, code: '12345', new_password: 'NewPass456' });
  check('code must be 6 digits', r.status === 400 && /6-digit/.test(r.data.message), r);
  r = await call('POST', '/auth/reset-password', { email, code: code.slice(0, 3) + ' ' + code.slice(3), new_password: 'NewPass456' });
  check('right code (spaces ignored) changes the password', r.status === 200 && /password has been changed/.test(r.data.message), r);
  await new Promise((ok) => setTimeout(ok, 50));
  check('"password changed" email sent', sent.at(-1).type === 'changed' && sent.at(-1).to === email);
  r = await call('GET', '/users/me', null, old.data.token);
  check('old login is signed out', r.status === 401, r);
  r = await fetch(`${BASE}/municipalities`).then((x) => ({ status: x.status }));
  check('public routes still work', r.status === 200);
  r = await call('POST', '/auth/login', { email, password: 'OldPass123' });
  check('old password no longer works', r.status === 401, r);
  const fresh = await call('POST', '/auth/login', { email, password: 'NewPass456' });
  check('new password works', fresh.status === 200 && fresh.data.token, fresh);
  r = await call('GET', '/users/me', null, fresh.data.token);
  check('new login works on signed-in routes', r.status === 200, r);
  r = await call('POST', '/auth/reset-password', { email, code, new_password: 'Another789' });
  check('a code works only once', r.status === 400 && /expired or has already been used/.test(r.data.message), r);

  console.log('Limits');
  await ageCodes(userId);
  await call('POST', '/auth/forgot-password', { email });
  await new Promise((ok) => setTimeout(ok, 50));
  const code2 = lastCode().code;
  check('a new code can be asked for after a minute', sent.filter((m) => m.type === 'code').length === 2);
  const bad = code2 === '999999' ? '888888' : '999999';
  for (let i = 0; i < 4; i++) await call('POST', '/auth/reset-password', { email, code: bad, new_password: 'NewPass789' });
  r = await call('POST', '/auth/reset-password', { email, code: bad, new_password: 'NewPass789' });
  check('5th wrong code locks it', r.status === 429 && /Too many wrong codes/.test(r.data.message), r);
  r = await call('POST', '/auth/reset-password', { email, code: code2, new_password: 'NewPass789' });
  check('after 5 wrong tries even the right code is refused', r.status === 429, r);

  await ageCodes(userId);
  await call('POST', '/auth/forgot-password', { email });
  await new Promise((ok) => setTimeout(ok, 50));
  const code3 = lastCode().code;
  await ageCodes(userId);
  await call('POST', '/auth/forgot-password', { email });
  await new Promise((ok) => setTimeout(ok, 50));
  const code4 = lastCode().code;
  r = await call('POST', '/auth/reset-password', { email, code: code3, new_password: 'NewPass789' });
  check('asking for a new code cancels the older one', code3 === code4 || r.status === 400, r);
  await q(`UPDATE password_reset_codes SET expires_at = CURRENT_TIMESTAMP - interval '1 minute' WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  r = await call('POST', '/auth/reset-password', { email, code: code4, new_password: 'NewPass789' });
  check('an expired code is refused', r.status === 400 && /expired/.test(r.data.message), r);

  const before = sent.filter((m) => m.type === 'code').length;
  await q(`INSERT INTO password_reset_codes (user_id, code_hash, expires_at, created_at)
           SELECT $1, 'x', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP - interval '5 minutes' FROM generate_series(1, 5)`, [userId]);
  r = await call('POST', '/auth/forgot-password', { email });
  check('at most 5 codes an hour', r.status === 200 && sent.filter((m) => m.type === 'code').length === before, r);

  r = await call('POST', '/auth/reset-password', { email: 'nobody-' + tag + '@x.co', code: '123456', new_password: 'NewPass789' });
  check('unknown email on reset: same "expired" reply', r.status === 400 && /expired/.test(r.data.message), r);

  console.log('Deleted account');
  await q(`DELETE FROM users WHERE user_id = $1`, [userId]);
  r = await call('GET', '/users/me', null, fresh.data.token);
  check('token of a deleted account is refused', r.status === 401, r);

  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
