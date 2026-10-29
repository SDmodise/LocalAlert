import { API_URL, apiRequest } from './api';
import { getToken } from './auth';

// fields: member_id, latitude, longitude, last_seen_place, last_seen_time (ISO), clothing_description, pin
// Returns { alert, reach }.
export async function createAlert(fields) {
  return apiRequest('/alerts', { method: 'POST', token: await getToken(), body: fields });
}

export async function listAlerts() {
  const data = await apiRequest('/alerts', { token: await getToken() });
  return data.alerts;
}

// Returns { alert, reach? } (reach only for the family).
export async function getAlert(alertId) {
  return apiRequest(`/alerts/${alertId}`, { token: await getToken() });
}

export function alertPhotoUrl(alertId) {
  return `${API_URL}/alerts/${alertId}/photo`;
}

// Family administrator: mark as found. Returns { alert, message }.
export async function resolveAlert(alertId, pin) {
  return apiRequest(`/alerts/${alertId}/resolve`, { method: 'POST', token: await getToken(), body: { pin } });
}

// Anyone who received the alert. At least one of description, location or photo.
// location: { latitude, longitude } or null; photo: expo-image-picker asset or null
export async function sendSighting(alertId, { description, location, photo }) {
  const form = new FormData();
  if (description) form.append('description', description);
  if (location) {
    form.append('latitude', String(location.latitude));
    form.append('longitude', String(location.longitude));
  }
  if (photo) {
    const type = photo.mimeType || 'image/jpeg';
    form.append('photo', { uri: photo.uri, type, name: photo.fileName || `sighting.${type === 'image/png' ? 'png' : 'jpg'}` });
  }
  return apiRequest(`/alerts/${alertId}/sightings`, { method: 'POST', token: await getToken(), body: form });
}

// Family only.
export async function listSightings(alertId) {
  const data = await apiRequest(`/alerts/${alertId}/sightings`, { token: await getToken() });
  return data.sightings;
}

export function sightingPhotoUrl(alertId, reportId) {
  return `${API_URL}/alerts/${alertId}/sightings/${reportId}/photo`;
}
