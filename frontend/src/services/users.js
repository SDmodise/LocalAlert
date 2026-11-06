import * as Location from 'expo-location';
import { apiRequest } from './api';
import { getToken } from './auth';

export async function getMyProfile() {
  const data = await apiRequest('/users/me', { token: await getToken() });
  return data.user;
}

// Sends the phone's position once so the backend can set the current
// municipality (FR36). Only the municipality is saved.
export async function updateMyLocation(latitude, longitude) {
  const data = await apiRequest('/users/me/location', {
    method: 'PUT',
    token: await getToken(),
    body: { latitude, longitude },
  });
  return data.user;
}

// Refreshes the current municipality when location permission was already
// given. Never shows a permission prompt (askPermission = false).
export async function refreshCurrentMunicipality({ askPermission = false } = {}) {
  const permission = askPermission
    ? await Location.requestForegroundPermissionsAsync()
    : await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return { status: 'no-permission' };

  const position =
    (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ||
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));

  const user = await updateMyLocation(position.coords.latitude, position.coords.longitude);
  return { status: 'updated', user };
}

// Permanently deletes the signed-in account (needs the password).
export async function deleteMyAccount(password) {
  return apiRequest('/users/me', { method: 'DELETE', token: await getToken(), body: { password } });
}

// Family Administrators: changes the PIN, confirmed with the current PIN
// ({ currentPin }) or, if it was forgotten, with the password ({ password }).
export async function changeMyPin({ currentPin, password, newPin }) {
  const body = password ? { password, new_pin: newPin } : { current_pin: currentPin, new_pin: newPin };
  return apiRequest('/users/me/pin', { method: 'PUT', token: await getToken(), body });
}

// Profiles this person may report missing: their own family's, and those shared with them.
export async function getReportableProfiles() {
  const data = await apiRequest('/users/me/reportable-profiles', { token: await getToken() });
  return data.profiles;
}

// Sets the home municipality: { municipalityId } chosen from the list, or
// { useLocation: true } for "I'm home now" (where the phone is now becomes home).
export async function setHomeMunicipality({ municipalityId, useLocation } = {}) {
  let body = { municipality_id: municipalityId };
  if (useLocation) {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Allow LocalAlert to use your location in your phone settings, or choose your municipality from the list.');
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    body = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  }
  return apiRequest('/users/me/home-municipality', { method: 'PUT', token: await getToken(), body });
}
