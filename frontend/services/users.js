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
