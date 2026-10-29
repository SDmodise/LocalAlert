/*
Login, logout and the saved session (JWT token and basic user details).
*/
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';

const TOKEN_KEY = 'localalert.token';
const USER_KEY = 'localalert.user';

// Reads the expiry time (seconds) from the token without verifying it.
// The backend still verifies every token; this only avoids showing a
// signed-in screen with an expired session.
function tokenExpiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded)).exp || null;
  } catch {
    return null;
  }
}

async function saveSession(data) {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, data.token],
    [USER_KEY, JSON.stringify(data.user)],
  ]);
  return data.user;
}

export async function login(email, password) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password },
  });
  return saveSession(data);
}

// details: first_name, last_name, email, phone_number, password, role,
// pin (Family Administrator only), privacy_consent, latitude?, longitude?
export async function register(details) {
  const data = await apiRequest('/auth/register', { method: 'POST', body: details });
  return saveSession(data);
}

export async function getSession() {
  const [[, token], [, userJson]] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
  if (!token || !userJson) return null;

  const exp = tokenExpiry(token);
  if (exp && exp * 1000 <= Date.now()) {
    await logout();
    return null;
  }

  return { token, user: JSON.parse(userJson) };
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function logout() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}
