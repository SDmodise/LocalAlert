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
// photo / idDocument: assets returned by expo-image-picker
export async function addFamilyProfile(groupId, fields, photo, idDocument) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  form.append('photo', filePart(photo, 'photo'));
  form.append('id_document', filePart(idDocument, 'id-document'));

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
