/*
Small wrapper around fetch for the LocalAlert backend.

The backend URL comes from EXPO_PUBLIC_API_URL when it is set. Otherwise, during
development, it uses the address of the computer running Expo (the same machine
that runs the backend) on port 5000.
*/
import Constants from 'expo-constants';

const REQUEST_TIMEOUT_MS = 15000;

function defaultApiUrl() {
  // hostUri looks like "192.168.1.20:8081" when the app is opened from Expo.
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri ? hostUri.split(':')[0] : 'localhost';
  return `http://${host}:5000/api`;
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL || defaultApiUrl();

// Called when a signed-in request is rejected with 401 (expired or invalid session).
let unauthorizedHandler = null;
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status; // 0 means the server could not be reached
  }
}

export async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error.name === 'AbortError';
    throw new ApiError(
      timedOut
        ? 'LocalAlert is taking too long to respond. Please try again.'
        : "Can't reach LocalAlert. Check your internet connection and try again.",
      0
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response; handled below.
  }

  if (!response.ok) {
    if (response.status === 401 && token && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(
      data?.message || 'Something went wrong. Please try again.',
      response.status
    );
  }

  return data;
}
