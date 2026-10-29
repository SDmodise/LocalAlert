import { apiRequest } from './api';
import { getToken } from './auth';

export const QR_PREFIX = 'localalert:join:';

async function call(path, options = {}) {
  return apiRequest(path, { ...options, token: await getToken() });
}

// Family administrator
export async function createQrInvitation(groupId) {
  return call(`/family-groups/${groupId}/invitations`, { method: 'POST', body: { method: 'qr' } });
}

export async function sendInvitation(groupId, contact) {
  return call(`/family-groups/${groupId}/invitations`, { method: 'POST', body: { method: 'invite', contact } });
}

// The person being linked
export async function getMyInvitations() {
  const data = await call('/invitations/mine');
  return data.invitations;
}

export async function previewQrCode(code) {
  const data = await call(`/invitations/preview?code=${encodeURIComponent(code)}`);
  return data.invitation;
}

export async function acceptQrCode(code) {
  return call('/invitations/accept', { method: 'POST', body: { code } });
}

export async function acceptInvitation(invitationId) {
  return call('/invitations/accept', { method: 'POST', body: { invitation_id: invitationId } });
}

export async function declineInvitation(invitationId) {
  return call(`/invitations/${invitationId}/decline`, { method: 'POST' });
}
