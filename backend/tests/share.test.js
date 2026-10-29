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
const BASE = 'http://localhost:5069/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, type: r.headers.get('content-type') };
}

(async () => {
  const server = app.listen(5069);
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


  const raw = async (path, headers={}) => { const r = await fetch('http://localhost:5069' + path, { headers, redirect: 'manual' }); return { status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), text: r.headers.get('content-type')?.includes('text') ? await r.text() : null }; };
  const Other = await mk('Outsider', COMM, JHB, JHB);   // never received the alert
  let r = await call('POST', '/alerts', A.token, good); const id = r.data.alert.alert_id; check('alert created', r.status === 201);

  console.log('Share link');
  r = await call('POST', `/alerts/${id}/share`, Other.token); check('outsider cannot get a share link 403', r.status === 403, r);
  r = await call('POST', `/alerts/${id}/share`, null); check('no login 401', r.status === 401);
  r = await call('POST', `/alerts/${id}/share`, U1.token);
  check('recipient gets link', r.status === 200 && /^http:\/\/localhost:5069\/a\/[A-Za-z0-9_-]{11}$/.test(r.data.url), r.data);
  const code = r.data.code, url = r.data.url;
  check('message has name and link, no coordinates', r.data.message.includes('Lerato Mokoena') && r.data.message.includes(url) && !r.data.message.includes('-25.55'), r.data.message);
  r = await call('POST', `/alerts/${id}/share`, A.token); check('same code for everyone', r.data.code === code);
  r = await call('POST', `/alerts/${id}/share`, F.token); check('family can share', r.status === 200 && r.data.code === code);
  process.env.PUBLIC_BASE_URL = 'https://localalert-sdmodise.loca.lt/';
  r = await call('POST', `/alerts/${id}/share`, U1.token); check('PUBLIC_BASE_URL used for link', r.data.url === `https://localalert-sdmodise.loca.lt/a/${code}`, r.data.url);
  r = await fetch(`http://localhost:5069/api/alerts/${id}/share`, { method: 'POST', headers: { Authorization: 'Bearer ' + U1.token, 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'x.trycloudflare.com' } }).then(x => x.json());
  check('PUBLIC_BASE_URL wins over proxy host', r.url.startsWith('https://localalert-sdmodise.loca.lt'), r.url);
  delete process.env.PUBLIC_BASE_URL;
  r = await fetch(`http://localhost:5069/api/alerts/${id}/share`, { method: 'POST', headers: { Authorization: 'Bearer ' + U1.token, 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'abc.trycloudflare.com' } }).then(x => x.json());
  check('behind a tunnel: https + tunnel host', r.url === `https://abc.trycloudflare.com/a/${code}`, r.url);

  console.log('Public page');
  let p = await raw(`/a/${code}`);
  check('page 200 html, no-cache', p.status === 200 && /text\/html/.test(p.type) && /no-cache/.test(p.cache), p);
  check('title + og tags', p.text.includes('<title>MISSING: Lerato Mokoena, ') && p.text.includes('property="og:title"') && p.text.includes(`property="og:image" content="http://localhost:5069/a/${code}/photo"`) && p.text.includes('summary_large_image'));
  check('shows place, wearing, description, SAPS, app link', ['Soshanguve Crossing Mall','Red school jersey','Small, braided hair','tel:10111',`localalert://a/${code}`].every(t => p.text.includes(t)));
  check('no coordinates / internal id / DOB on page', !p.text.includes('-25.55') && !p.text.includes(id) && !p.text.includes('2017-03-15'));
  check('times shown in SAST', /\d{2}:\d{2}/.test(p.text));
  const ph = await raw(`/a/${code}/photo`); check('public photo while missing', ph.status === 200 && /image/.test(ph.type), ph);
  check('bad code 404 page', (await raw('/a/bad!code')).status === 404 && (await raw('/a/AAAAAAAAAAA')).status === 404);
  // escaping
  await q(`UPDATE alerts SET clothing_description = '<script>alert(1)</script> red top' WHERE alert_id=$1`, [id]);
  p = await raw(`/a/${code}`); check('user text is escaped', !p.text.includes('<script>alert(1)') && p.text.includes('&lt;script&gt;'));
  // live: level change shows immediately
  await q(`UPDATE alerts SET escalation_level = 3 WHERE alert_id=$1`, [id]);
  p = await raw(`/a/${code}`); check('page is live (level 3 shows)', p.text.includes('LEVEL 3'));

  console.log('Follow in app');
  r = await call('GET', `/alerts/${id}`, Other.token); check('outsider has no access before', r.status === 403);
  r = await call('POST', `/alerts/shared/${code}/follow`, Other.token);
  check('follow returns alert id', r.status === 200 && r.data.alert_id === id && r.data.status === 'active', r.data);
  r = await call('GET', `/alerts/${id}`, Other.token); check('outsider can now open it', r.status === 200 && r.data.alert.relation === 'recipient');
  r = await call('POST', `/alerts/shared/${code}/follow`, Other.token); check('follow twice is fine', r.status === 200);
  check('one notification for follower', (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id=$1 AND user_id=$2`, [id, Other.id])).rows[0].c === 1);
  r = await call('POST', `/alerts/shared/${code}/follow`, A.token); check('creator follow: no extra notification', r.status === 200 && (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id=$1 AND user_id=$2`, [id, A.id])).rows[0].c === 0);
  r = await call('POST', `/alerts/shared/nope123456/follow`, Other.token); check('bad code follow 404', r.status === 404);

  console.log('After found');
  r = await call('POST', `/alerts/${id}/resolve`, A.token, { pin: '1234' }); check('resolved', r.status === 200);
  check('follower told it is found', (await q(`SELECT count(*)::int c FROM notifications WHERE alert_id=$1 AND user_id=$2 AND notification_type='resolved'`, [id, Other.id])).rows[0].c === 1);
  p = await raw(`/a/${code}`);
  check('page says found safe, no photo/details', p.status === 200 && p.text.includes('has been found') && !p.text.includes('og:image') && !p.text.includes('Red school jersey') && !p.text.includes('/photo'));
  check('photo link now 404', (await raw(`/a/${code}/photo`)).status === 404);
  r = await call('POST', `/alerts/${id}/share`, U1.token); check('cannot share a found alert 409', r.status === 409, r);
  const New = await mk('Late', COMM, JHB, JHB);
  r = await call('POST', `/alerts/shared/${code}/follow`, New.token);
  check('late follower: told resolved, no notification row', r.status === 200 && r.data.status === 'resolved' && (await q(`SELECT count(*)::int c FROM notifications WHERE user_id=$1`, [New.id])).rows[0].c === 0, r.data);

  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
