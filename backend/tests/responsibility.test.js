// Shared responsibility ("Hand over responsibility"): the administrator shares chosen
// verified profiles with a linked member (or someone new via QR/invite); they can then
// report those profiles missing with their own PIN. The administrator can change or end it.
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
const BASE = 'http://localhost:5082/api';
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

(async () => {
  const server = app.listen(5082);
  const q = (s, v) => pool.query(s, v);
  const tag = 'r' + Date.now();
  await q(`DELETE FROM alerts WHERE created_by IN (SELECT user_id FROM users WHERE email LIKE 'resptest-%')`);
  await q(`DELETE FROM family_groups WHERE admin_user_id IN (SELECT user_id FROM users WHERE email LIKE 'resptest-%')`);
  await q(`DELETE FROM users WHERE email LIKE 'resptest-%'`);
  const role = async (n) => (await q('SELECT role_id FROM roles WHERE role_name=$1', [n])).rows[0].role_id;
  const ADMIN = await role('Family Administrator'), COMM = await role('Community Member');
  const mk = async (name, roleId, pin) => {
    const email = `resptest-${name}-${tag}@x.co`;
    const id = (await q(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, pin_hash, municipality_id, current_municipality_id)
      VALUES ($1,$2,'Test',$3,'x',$4,1,1) RETURNING user_id`, [roleId, name, email, pin ? await bcrypt.hash(pin, 10) : null])).rows[0].user_id;
    return { id, email, token: jwt.sign({ sub: id, role: roleId === ADMIN ? 'Family Administrator' : 'Community Member' }, process.env.JWT_SECRET) };
  };
  const A = await mk('Admin', ADMIN, '1234');
  const F = await mk('Linked', COMM, null);    // linked family member, no PIN yet
  const N = await mk('Newcomer', COMM, null);  // not linked yet
  const X = await mk('OtherAdmin', ADMIN, '1111');
  const g = (await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'Share Family') RETURNING group_id`, [A.id])).rows[0].group_id;
  await q(`INSERT INTO family_groups (admin_user_id, group_name) VALUES ($1,'Other Family')`, [X.id]);
  await q(`INSERT INTO family_links (group_id, user_id) VALUES ($1,$2)`, [g, F.id]);
  const prof = async (name, status) => (await q(`INSERT INTO family_members (group_id, full_name, date_of_birth, gender, physical_description, photo_url, verification_status)
      VALUES ($1,$2,'2016-05-01','Female','Short braids','photos/d4639b39-a73e-42c9-aef0-144c6a715178.png',$3) RETURNING member_id`, [g, name, status])).rows[0].member_id;
  const P1 = await prof('Lerato Share', 'verified');
  const P2 = await prof('Kagiso Share', 'verified');
  const P3 = await prof('Pending Share', 'pending');
  const alertBody = (member, pin) => ({ member_id: member, latitude: -25.55, longitude: 28.10, last_seen_place: 'Mall',
    last_seen_time: new Date(Date.now() - 600000).toISOString(), clothing_description: 'Red jersey', pin });

  console.log('Asking a linked member');
  let r = await call('POST', `/family-groups/${g}/invitations`, F.token, { method: 'member', with_responsibility: true, user_id: F.id, member_ids: [P1], pin: '1234' });
  check('only the administrator can hand over', r.status === 403, r);
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'member', with_responsibility: true, user_id: F.id, member_ids: [], pin: '1234' });
  check('must choose at least one profile', r.status === 400, r);
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'member', with_responsibility: true, user_id: F.id, member_ids: [P3], pin: '1234' });
  check('pending (unverified) profiles cannot be shared', r.status === 400 && /verified/.test(r.data.message), r);
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'member', with_responsibility: true, user_id: N.id, member_ids: [P1], pin: '1234' });
  check('only linked members can be chosen from the list', r.status === 400, r);
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'member', with_responsibility: true, user_id: F.id, member_ids: [P1], pin: '9999' });
  check('wrong admin PIN refused', r.status === 403, r);
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'member', with_responsibility: true, user_id: F.id, member_ids: [P1], pin: '1234' });
  check('request sent', r.status === 201, r);
  const req1 = r.data.invitation.invitation_id;
  r = await call('GET', '/family-groups/mine', A.token);
  check('admin sees the pending request with the profile', r.data.responsibility_requests.length === 1 && r.data.responsibility_requests[0].to === 'Linked Test' && r.data.responsibility_requests[0].profile_names[0] === 'Lerato Share', r.data.responsibility_requests);

  console.log('Accepting');
  r = await call('GET', '/invitations/mine', F.token);
  const mine = r.data.invitations.find((i) => i.invitation_id === req1);
  check('linked member sees it, with the profile, and that they need to create a PIN',
    mine && mine.with_responsibility && mine.profiles.map((p) => p.full_name).join() === 'Lerato Share' && r.data.has_pin === false, r.data);
  r = await call('POST', '/invitations/accept', F.token, { invitation_id: req1 });
  check('accepting without a PIN asks to create one', r.status === 400 && r.data.code === 'NEEDS_PIN', r);
  r = await call('POST', '/invitations/accept', F.token, { invitation_id: req1, pin: '2468' });
  check('accepted (PIN created)', r.status === 200 && /Lerato Share/.test(r.data.message), r);
  r = await call('GET', '/users/me', F.token);
  check('now has a PIN and can report', r.data.user.has_pin && r.data.user.can_report && r.data.user.reporting_groups[0].role === 'shared', r.data.user);
  r = await call('GET', '/users/me/reportable-profiles', F.token);
  check('can report only the shared profile', r.data.profiles.length === 1 && r.data.profiles[0].member_id === P1 && !r.data.profiles[0].is_own_family, r.data);
  r = await call('GET', '/users/me/reportable-profiles', A.token);
  check('admin can report every profile of the family', r.data.profiles.filter((p) => p.group_name === 'Share Family').length === 3, r.data);
  r = await call('GET', '/family-groups/mine', A.token);
  check('admin sees what is shared with whom; request no longer pending',
    r.data.members.find((m) => m.user_id === F.id).shared_profile_ids.join() === P1 && r.data.responsibility_requests.length === 0, r.data.members);

  console.log('Reporting');
  r = await call('POST', '/alerts', F.token, alertBody(P2, '2468'));
  check('cannot report a profile that was not shared', r.status === 403, r);
  r = await call('POST', '/alerts', F.token, alertBody(P1, '0000'));
  check('own PIN is checked', r.status === 403 && /PIN/.test(r.data.message), r);
  r = await call('POST', '/alerts', F.token, alertBody(P1, '2468'));
  check('reports the shared profile missing', r.status === 201 && r.data.alert.can_resolve === true, r);
  const alertId = r.data.alert?.alert_id;
  const told = (await q(`SELECT 1 FROM notifications WHERE alert_id=$1 AND user_id=$2 AND recipient_type='family'`, [alertId, A.id])).rowCount;
  check('the administrator is told about the alert', told === 1);
  r = await call('PATCH', `/alerts/${alertId}/contact`, F.token, { contact_number: '0821112222', pin: '2468' });
  check('can change the number to call', r.status === 200, r);
  r = await call('POST', `/alerts/${alertId}/resolve`, F.token, { pin: '2468' });
  check('can mark as found', r.status === 200, r);
  r = await call('PUT', '/users/me/pin', F.token, { current_pin: '2468', new_pin: '1357' });
  check('can change their own PIN', r.status === 200, r);

  console.log('Changing and ending');
  r = await call('PUT', `/family-groups/${g}/responsibility/${F.id}`, X.token, { member_ids: [P1, P2], pin: '1111' });
  check("another family's admin cannot change it", r.status === 403, r);
  r = await call('PUT', `/family-groups/${g}/responsibility/${F.id}`, A.token, { member_ids: [P1, P3], pin: '1234' });
  check('cannot add an unverified profile', r.status === 400, r);
  r = await call('PUT', `/family-groups/${g}/responsibility/${F.id}`, A.token, { member_ids: [P1, P2], pin: '1234' });
  check('admin shares a second profile', r.status === 200, r);
  r = await call('GET', '/users/me/reportable-profiles', F.token);
  check('now two profiles', r.data.profiles.length === 2, r.data);
  r = await call('PUT', `/family-groups/${g}/responsibility/${F.id}`, A.token, { member_ids: [], pin: '1234' });
  check('admin ends it (empty list)', r.status === 200 && /ended/.test(r.data.message), r);
  r = await call('GET', '/users/me', F.token);
  check('no longer can report', r.data.user.can_report === false, r.data.user);
  r = await call('POST', '/alerts', F.token, alertBody(P1, '1357'));
  check('reporting refused after it ended', r.status === 403, r);

  console.log('Someone new by QR code');
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'qr', with_responsibility: true, member_ids: [P2], pin: '1234' });
  check('QR code with shared responsibility', r.status === 201 && r.data.qr_value, r);
  const code = r.data.qr_value;
  r = await call('GET', `/invitations/preview?code=${encodeURIComponent(code)}`, N.token);
  check('preview shows it shares Kagiso and that a PIN is needed', r.data.invitation.with_responsibility && r.data.invitation.profiles[0].full_name === 'Kagiso Share' && r.data.has_pin === false, r.data);
  r = await call('POST', '/invitations/accept', N.token, { code, pin: '8642' });
  check('newcomer joins and can report Kagiso', r.status === 200, r);
  r = await call('GET', '/users/me/reportable-profiles', N.token);
  check('newcomer can report only Kagiso', r.data.profiles.length === 1 && r.data.profiles[0].member_id === P2, r.data);
  r = await call('GET', '/family-groups/linked', N.token);
  check('their Family tab shows what is shared', r.data.groups[0].shared_profile_ids.join() === P2, r.data);

  console.log('Invite by email (someone already linked)');
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'invite', contact: F.email, with_responsibility: true, member_ids: [P1], pin: '1234' });
  check('invite sent', r.status === 201, r);
  const inv2 = r.data.invitation.invitation_id;
  r = await call('GET', '/invitations/mine', F.token);
  check('linked member sees it although already linked (has a PIN now)', r.data.invitations.some((i) => i.invitation_id === inv2) && r.data.has_pin === true, r.data);
  r = await call('POST', '/invitations/accept', F.token, { invitation_id: inv2, pin: '0000' });
  check('existing PIN is checked when accepting', r.status === 403, r);
  r = await call('POST', '/invitations/accept', F.token, { invitation_id: inv2, pin: '1357' });
  check('accepted with their PIN', r.status === 200, r);

  console.log('Cancel, decline, expire');
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'member', with_responsibility: true, user_id: F.id, member_ids: [P2], pin: '1234' });
  const req3 = r.data.invitation.invitation_id;
  r = await call('DELETE', `/family-groups/${g}/responsibility-requests/${req3}`, A.token);
  check('admin cancels a pending request', r.status === 200, r);
  r = await call('GET', '/invitations/mine', F.token);
  check('cancelled request disappears', !r.data.invitations.some((i) => i.invitation_id === req3));
  r = await call('DELETE', `/family-groups/${g}/responsibility-requests/${req3}`, A.token);
  check('cannot cancel twice', r.status === 404, r);
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'member', with_responsibility: true, user_id: F.id, member_ids: [P2], pin: '1234' });
  const req4 = r.data.invitation.invitation_id;
  r = await call('POST', `/invitations/${req4}/decline`, F.token);
  check('member declines', r.status === 200 && (await q(`SELECT status FROM family_invitations WHERE invitation_id=$1`, [req4])).rows[0].status === 'declined', r);
  r = await call('POST', `/family-groups/${g}/invitations`, A.token, { method: 'member', with_responsibility: true, user_id: F.id, member_ids: [P2], pin: '1234' });
  const req5 = r.data.invitation.invitation_id;
  await q(`UPDATE family_invitations SET expires_at = CURRENT_TIMESTAMP - interval '1 minute' WHERE invitation_id=$1`, [req5]);
  r = await call('POST', '/invitations/accept', F.token, { invitation_id: req5, pin: '1357' });
  check('expired after 24 hours', r.status === 410, r);

  console.log('Stepping down, leaving');
  r = await call('DELETE', `/family-groups/${g}/responsibility/me`, N.token);
  check('newcomer steps down', r.status === 200, r);
  r = await call('GET', '/users/me/reportable-profiles', N.token);
  check('nothing left to report', r.data.profiles.length === 0, r.data);
  r = await call('GET', '/users/me/reportable-profiles', F.token);
  check('linked member still shares Lerato', r.data.profiles.length === 1, r.data);
  r = await call('DELETE', `/family-groups/${g}/links/${F.id}`, A.token);
  check('admin removes the linked member', r.status === 200, r);
  r = await call('GET', '/users/me/reportable-profiles', F.token);
  check('removing them ends the shared responsibility too', r.data.profiles.length === 0, r.data);
  check('nothing left in the table', (await q(`SELECT 1 FROM shared_responsibility WHERE user_id=$1`, [F.id])).rowCount === 0);

  await q(`DELETE FROM alerts WHERE member_id IN ($1,$2,$3)`, [P1, P2, P3]);
  await q(`DELETE FROM family_groups WHERE admin_user_id IN ($1,$2)`, [A.id, X.id]);
  await q(`DELETE FROM users WHERE email LIKE 'resptest-%'`);
  console.log(`\n${pass} passed, ${failn} failed`);
  server.close(); await pool.end();
  process.exit(failn ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
