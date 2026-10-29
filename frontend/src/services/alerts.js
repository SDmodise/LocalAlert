import { API_URL, apiRequest } from './api';
import { getToken } from './auth';

// fields: member_id, latitude, longitude, last_seen_place, last_seen_time (ISO), clothing_description, pin
// Returns { alert, reach }.
// photo: optional expo-image-picker asset (a new photo); without it the profile photo is used.
export async function createAlert(fields, photo = null) {
  let body = fields;
  if (photo) {
    body = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) body.append(key, String(value));
    });
    const type = photo.mimeType || 'image/jpeg';
    body.append('photo', { uri: photo.uri, type, name: photo.fileName || `alert.${type === 'image/png' ? 'png' : 'jpg'}` });
  }
  return apiRequest('/alerts', { method: 'POST', token: await getToken(), body });
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

// Public share link (same for everyone). Returns { url, code, message }.
export async function getShareLink(alertId) {
  return apiRequest(`/alerts/${alertId}/share`, { method: 'POST', token: await getToken() });
}

// A shared link was opened in the app. Returns { alert_id, status, child_name }.
export async function followSharedAlert(code) {
  return apiRequest(`/alerts/shared/${encodeURIComponent(code)}/follow`, { method: 'POST', token: await getToken() });
}

// Finds the share code in a LocalAlert link:
//   localalert://a/<code>, https://<server>/a/<code>, exp://<host>/--/a/<code>
export function shareCodeFromUrl(url) {
  const match = /\/a\/([A-Za-z0-9_-]{6,16})(?:[/?#]|$)/.exec(String(url || '').replace(/^localalert:\/\//, 'localalert:///'));
  return match ? match[1] : null;
}
