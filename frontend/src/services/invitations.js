import { apiRequest } from './api';
import { getToken } from './auth';

export const QR_PREFIX = 'localalert:join:';

async function call(path, options = {}) {
  return apiRequest(path, { ...options, token: await getToken() });
}

// Extra fields when the invitation also shares responsibility for chosen profiles.
// share: { memberIds, pin } or undefined for a plain invitation.
const sharing = (share) => (share ? { with_responsibility: true, member_ids: share.memberIds, pin: share.pin } : {});

// Family administrator
export async function createQrInvitation(groupId, share) {
  return call(`/family-groups/${groupId}/invitations`, { method: 'POST', body: { method: 'qr', ...sharing(share) } });
}

export async function sendInvitation(groupId, contact, share) {
  return call(`/family-groups/${groupId}/invitations`, { method: 'POST', body: { method: 'invite', contact, ...sharing(share) } });
}

// Family administrator: ask someone already linked to share responsibility for the chosen profiles.
export async function requestResponsibility(groupId, userId, memberIds, pin) {
  return call(`/family-groups/${groupId}/invitations`, {
    method: 'POST',
    body: { method: 'member', user_id: userId, with_responsibility: true, member_ids: memberIds, pin },
  });
}

// The person being linked
export async function getMyInvitations() {
  const data = await call('/invitations/mine');
  return data.invitations;
}

// Invitations plus whether the user already has a PIN (accepting shared responsibility needs one).
export async function getMyInvitationsInfo() {
  const data = await call('/invitations/mine');
  return { invitations: data.invitations, hasPin: Boolean(data.has_pin) };
}

// The scanned invitation, with hasPin (whether the user already has a PIN).
export async function previewQrCode(code) {
  const data = await call(`/invitations/preview?code=${encodeURIComponent(code)}`);
  return { ...data.invitation, hasPin: Boolean(data.has_pin) };
}

// pin: only for shared responsibility (their PIN, or the new PIN they chose).
export async function acceptQrCode(code, pin) {
  return call('/invitations/accept', { method: 'POST', body: { code, ...(pin ? { pin } : {}) } });
}

export async function acceptInvitation(invitationId, pin) {
  return call('/invitations/accept', { method: 'POST', body: { invitation_id: invitationId, ...(pin ? { pin } : {}) } });
}

export async function declineInvitation(invitationId) {
  return call(`/invitations/${invitationId}/decline`, { method: 'POST' });
}
