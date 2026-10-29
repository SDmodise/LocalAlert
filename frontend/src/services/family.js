import { API_URL, apiRequest } from './api';
import { getToken } from './auth';

export async function getMyFamilyGroup() {
  return apiRequest('/family-groups/mine', { token: await getToken() });
}

export async function createFamilyGroup(groupName) {
  const data = await apiRequest('/family-groups', {
    method: 'POST',
    token: await getToken(),
    body: { group_name: groupName },
  });
  return data.group;
}

function filePart(asset, fallbackName) {
  const type = asset.mimeType || 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : 'jpg';
  return { uri: asset.uri, type, name: asset.fileName || `${fallbackName}.${ext}` };
}

// fields: full_name, date_of_birth (YYYY-MM-DD), gender, physical_description, id_number?
// photo / idDocument: assets returned by expo-image-picker (idDocument is optional)
export async function addFamilyProfile(groupId, fields, photo, idDocument) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  form.append('photo', filePart(photo, 'photo'));
  if (idDocument) form.append('id_document', filePart(idDocument, 'id-document')); // optional

  const data = await apiRequest(`/family-groups/${groupId}/profiles`, {
    method: 'POST',
    token: await getToken(),
    body: form,
  });
  return data.profile;
}

export function profilePhotoUrl(memberId) {
  return `${API_URL}/family-members/${memberId}/photo`;
}

// Families the signed-in user is linked to (read-only): [{ group_name, administrator, profiles, members }]
export async function getLinkedFamilies() {
  const data = await apiRequest('/family-groups/linked', { token: await getToken() });
  return data.groups;
}

// Family administrator: remove a profile (and its photo and ID document). Needs the PIN.
export async function removeProfile(memberId, pin) {
  return apiRequest(`/family-members/${memberId}`, { method: 'DELETE', token: await getToken(), body: { pin } });
}

// Family administrator: edit a profile. Needs the PIN.
// fields: { full_name?, physical_description?, id_number? }
// files:  { photo?, idDocument? } (expo-image-picker assets)
// Returns the updated profile.
export async function updateProfile(memberId, fields, files, pin) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  form.append('pin', pin);
  if (files?.photo) form.append('photo', filePart(files.photo, 'photo'));
  if (files?.idDocument) form.append('id_document', filePart(files.idDocument, 'id-document'));
  const data = await apiRequest(`/family-members/${memberId}`, { method: 'PATCH', token: await getToken(), body: form });
  return data.profile;
}

// The ID document image (family administrator only).
export function idDocumentUrl(memberId) {
  return `${API_URL}/family-members/${memberId}/id-document`;
}

// Family administrator: unlink a family member.
export async function removeLinkedMember(groupId, userId) {
  return apiRequest(`/family-groups/${groupId}/links/${userId}`, { method: 'DELETE', token: await getToken() });
}

// Linked family member: leave a family group.
export async function leaveFamily(groupId) {
  return apiRequest(`/family-groups/${groupId}/links/me`, { method: 'DELETE', token: await getToken() });
}
