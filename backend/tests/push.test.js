// Lock-screen notifications: phones register a token, and every new notification row
// (via the database trigger) becomes a push to Expo, with no personal details in it.
const path = require('path');
const http = require('http');
const { BE } = require('./setup');

// A stand-in for Expo's push server.
const received = [];
let ticketFor = () => ({ status: 'ok', id: 'x' });
const expo = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const batch = JSON.parse(body);
    received.push(batch);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: batch.map((m) => ticketFor(m)) }));
  });
});
process.env.EXPO_PUSH_URL = 'http://localhost:5091/--/api/v2/push/send';

const bcrypt = require(BE + '/node_modules/bcrypt');
const jwt = require(BE + '/node_modules/jsonwebtoken');
const pool = require(BE + '/src/config/database');
const app = require(BE + '/src/app');
const push = require(BE + '/src/services/pushService');

let pass = 0, failn = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { failn++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
}
const BASE = 'http://localhost:5080/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const allMessages = () => received.flat();

(async () => {
  await new Promise((ok) => expo.listen(5091, ok));
  const server = app.listen(5080);
  await push.start();
  const q = (s, v) => pool.query(s, v);
  const tag = 'p' + Date.now();
  await q(`DELETE FROM alerts WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE 'pushtest-%')`);
  await q(`DELETE FROM family_groups WHERE admin_user_id IN (SELECT user_id FROM users WHERE email LIKE 'pushtest-%')`);
  await q(`DELETE FROM users WHERE email LIKE 'pushtest-%'`);
  const role = async (n) => (await q('SELECT role_id FROM roles WHERE role_name=$1', [n])).rows[0].role_id;
  const ADMIN = await role('Family Administrator'), COMM = await role('Community Member');
  const pinHash = await bcrypt.hash('1234', 10);
  // A municipality nobody else lives in, so only this test's users are in Level 1.
  const muni = (await q(`SELECT municipality_id FROM municipalities m
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.municipality_id = m.municipality_id OR u.current_municipality_id = m.municipality_id)
      ORDER BY municipality_id LIMIT 1`)).rows[0].municipality_id;
  const mk = async (name, roleId) => {
    const id = (await q(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, pin_hash, municipality_id, current_municipality_id)
      VALUES ($1,$2,'Test',$3,'x',$4,$5,$5) RETURNING user_id`, [roleId, name, `pushtest-${name}-${tag}@x.co`, pinHash, muni])).rows[0].user_id;
    return { id, token: jwt.sign({ sub: id, role: roleId === ADMIN ? 'Family Administrator' : 'Community Member' }, process.env.JWT_SECRET) };
  };
  const A = await mk('Admin', ADMIN);
  const F = await mk('Family', COMM);
  const U1 = await mk('U1', COMM);
  const U2 = await mk('U2', COMM);
  const U3 = await mk('U3', COMM); // no phone registered
  const g = (await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'Push Family') RETURNING group_id`, [A.id])).rows[0].group_id;
  await q(`INSERT INTO family_links (group_id, user_id) VALUES ($1,$2)`, [g, F.id]);
  const P = (await q(`INSERT INTO family_members (group_id, full_name, date_of_birth, gender, physical_description, photo_url, verification_status)
      VALUES ($1,'Naledi Pushtest','2016-05-01','Female','Short braids','photos/d4639b39-a73e-42c9-aef0-144c6a715178.png','verified') RETURNING member_id`, [g])).rows[0].member_id;

  console.log('Registering phones');
  const tok = (n) => `ExponentPushToken[${tag}${n}]`;
  let r = await call('PUT', '/users/me/push-token', null, { token: tok('a'), platform: 'android' });
  check('needs login', r.status === 401, r);
  r = await call('PUT', '/users/me/push-token', U1.token, { token: 'not-a-token' });
  check('invalid token refused', r.status === 400, r);
  for (const [u, n] of [[U1, 'u1'], [U2, 'u2'], [F, 'f'], [A, 'a']]) {
    r = await call('PUT', '/users/me/push-token', u.token, { token: tok(n), platform: 'android' });
  }
  check('tokens saved', r.status === 200 && (await q(`SELECT count(*)::int n FROM push_tokens WHERE token LIKE $1`, [`%${tag}%`])).rows[0].n === 4);
  r = await call('PUT', '/users/me/push-token', U2.token, { token: tok('u1'), platform: 'android' });
  check('a phone that logs in as someone else moves to that account',
    (await q(`SELECT user_id FROM push_tokens WHERE token=$1`, [tok('u1')])).rows[0].user_id === U2.id);
  await call('PUT', '/users/me/push-token', U1.token, { token: tok('u1'), platform: 'android' }); // back to U1

  console.log('New alert');
  const Alert = require(BE + '/src/models/Alert');
  const created = await Alert.create({
    created_by: A.id, member_id: P, municipality_id: muni, child_name: 'Naledi Pushtest', age: 10, gender: 'Female', description: 'Short braids', latitude: -25.5, longitude: 28.1,
    last_seen_place: 'Secret Street 12', last_seen_time: new Date(Date.now() - 600000), clothing_description: 'Red jersey', photo_url: null,
  }).catch((e) => ({ error: e.message }));
  check('alert created through the model', created && !created.error, created);
  await wait(900);
  const msgs = allMessages();
  const to = (n) => msgs.filter((m) => m.to === tok(n));
  check('people in the area got a push', to('u1').length === 1 && to('u2').length === 1, msgs.map((m) => m.to));
  check('area wording', to('u1')[0]?.title === '⚠️ Missing person near you');
  check('linked family got a family push', to('f').length === 1 && to('f')[0].title === '⚠️ Family alert', to('f'));
  check('the reporter gets no push for their own alert', to('a').length === 0);
  check('all in one request (batched)', received.length === 1, received.length);
  const text = JSON.stringify(msgs);
  check('no name, place or clothing in any push', !/Naledi|Pushtest|Secret Street|Red jersey/.test(text), text.slice(0, 300));
  const alertId = created.alert_id || created.alert?.alert_id;
  check('push carries the alert id and type, on the "alerts" channel, high priority',
    msgs.every((m) => m.data.alertId === alertId && m.data.type === 'alert' && m.channelId === 'alerts' && m.priority === 'high' && m.sound === 'default'), msgs[0]);

  console.log('Other notification types');
  received.length = 0;
  await q(`INSERT INTO notifications (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level)
           VALUES ($1,$2,'t','m','spotted_report','family',1), ($3,$2,'t','m','escalation','family',2), ($4,$2,'t','m','resolved','area',2)`,
          [A.id, alertId, F.id, U1.id]);
  await wait(900);
  const m2 = allMessages();
  check('sighting -> admin', m2.some((m) => m.to === tok('a') && m.title === 'New sighting reported'));
  check('escalation -> family', m2.some((m) => m.to === tok('f') && m.title === 'The search has widened'));
  check('found -> area', m2.some((m) => m.to === tok('u1') && m.title === 'Found safe'));
  received.length = 0;
  await q(`INSERT INTO notifications (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level)
           VALUES ($1,$2,'t','m','resolved','area',2)`, [U3.id, alertId]);
  await wait(900);
  check('user without a phone: nothing sent', received.length === 0, received);

  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query(`INSERT INTO notifications (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level)
                      VALUES ($1,$2,'t','m','resolved','area',2)`, [U2.id, alertId]);
  await client.query('ROLLBACK'); client.release();
  await wait(900);
  check('cancelled (rolled back) notification: nothing sent', received.length === 0, received);

  console.log('Phones that no longer exist');
  ticketFor = (m) => (m.to === tok('u2') ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'x' });
  await q(`INSERT INTO notifications (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level)
           VALUES ($1,$2,'t','m','resolved','area',2)`, [U2.id, alertId]);
  await wait(900);
  check('token removed when Expo says the phone is gone', (await q(`SELECT 1 FROM push_tokens WHERE token=$1`, [tok('u2')])).rowCount === 0);
  ticketFor = () => ({ status: 'ok', id: 'x' });

  console.log('Log out');
  r = await call('DELETE', '/users/me/push-token', null, { token: tok('u1') });
  check('log out removes the phone (no login needed)', r.status === 200 && (await q(`SELECT 1 FROM push_tokens WHERE token=$1`, [tok('u1')])).rowCount === 0, r);
  received.length = 0;
  await q(`INSERT INTO notifications (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level)
           VALUES ($1,$2,'t','m','resolved','area',2)`, [U1.id, alertId]);
  await wait(900);
  check('logged-out phone gets nothing', received.length === 0);

  console.log('Family invitation');
  await call('PUT', '/users/me/push-token', U3.token, { token: tok('u3'), platform: 'android' });
  received.length = 0;
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'invite', contact: `pushtest-U3-${tag}@x.co` });
  check('invitation created, message points to the Family tab', r.status === 201 && /Family tab/.test(r.data.message), r);
  await wait(400);
  const inv = allMessages().filter((m) => m.to === tok('u3'));
  check('invited user gets a "Family invitation" push', inv.length === 1 && inv[0].title === 'Family invitation' && inv[0].data.type === 'invitation', allMessages());
  check('invitation push has no names', !/Push Family|Admin/.test(JSON.stringify(inv)));
  received.length = 0;
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'invite', contact: `nobody-${tag}@x.co` });
  await wait(400);
  check('invitation to someone without an account: no push', r.status === 201 && received.length === 0, received);

  console.log('Expo unreachable');
  const saved = process.env.EXPO_PUSH_URL;
  process.env.EXPO_PUSH_URL = 'http://localhost:1/unreachable';
  const res = await push.send([{ to: tok('f'), title: 't', body: 'b' }]).catch((e) => ({ threw: e.message }));
  check('Expo unreachable: reported as failed, never crashes', res && res.threw === undefined && res.failed === 1 && res.sent === 0, res);
  process.env.EXPO_PUSH_URL = saved;

  await q(`DELETE FROM alerts WHERE created_by = $1`, [A.id]);
  await q(`DELETE FROM family_groups WHERE admin_user_id = $1`, [A.id]);
  await q(`DELETE FROM users WHERE email LIKE 'pushtest-%'`);
  console.log(`\n${pass} passed, ${failn} failed`);
  await push.stop(); server.close(); expo.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
