/*
Small wrapper around fetch for the LocalAlert backend.

The backend URL comes from EXPO_PUBLIC_API_URL when it is set. Otherwise, during
development, it uses the address of the computer running Expo (the same machine
that runs the backend) on port 5000.
*/
import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

const REQUEST_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 60000;

// The computer running Expo, e.g. "192.168.1.20". Tries the Expo config first,
// then Expo Go's debugger address, then the address the app's code was loaded from.
function devHost() {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    NativeModules?.SourceCode?.scriptURL,
  ];
  for (const value of candidates) {
    const match = /^(?:\w+:\/\/)?([^/:]+)/.exec(value || '');
    if (match && match[1] !== 'localhost' && match[1] !== '127.0.0.1') return match[1];
  }
  return 'localhost';
}

function defaultApiUrl() {
  return `http://${devHost()}:5000/api`;
}

// True when the app was loaded through an Expo tunnel (e.g. "abc-8081.exp.direct")
// instead of the computer's local Wi-Fi address (e.g. "192.168.10.121").
function loadedThroughTunnel() {
  const host = devHost();
  return host !== 'localhost' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

// Which backend to use:
//  1. EXPO_PUBLIC_API_URL, if set, always wins (fixed address, e.g. a hosted server).
//  2. Opened through a tunnel (npm run remote): EXPO_PUBLIC_REMOTE_API_URL, the backend tunnel.
//  3. Otherwise (npm run lan, same Wi-Fi): the computer running Expo, port 5000.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.EXPO_PUBLIC_REMOTE_API_URL && loadedThroughTunnel()
    ? process.env.EXPO_PUBLIC_REMOTE_API_URL
    : defaultApiUrl());

// localtunnel (loca.lt) shows a warning page instead of the API unless this
// header is sent. Used for testing from other networks only.
export const TUNNEL_HEADERS = /\.loca\.lt\b/.test(API_URL) ? { 'bypass-tunnel-reminder': 'true' } : {};

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

// Photo uploads use XMLHttpRequest. From Expo SDK 58 the global fetch is
// expo/fetch, which cannot send React Native photo parts ({ uri, name, type })
// in FormData; XMLHttpRequest still uses React Native's own networking, which can.
function uploadRequest(url, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(Object.assign(new Error('Network request failed'), { name: 'TypeError' }));
    xhr.ontimeout = () => reject(Object.assign(new Error('Upload timed out'), { name: 'AbortError' }));
    xhr.send(body); // the multipart Content-Type with its boundary is set automatically
  });
}

function unreachable(error) {
  const timedOut = error.name === 'AbortError';
  return new ApiError(
    timedOut
      ? 'LocalAlert is taking too long to respond. Please try again.'
      : __DEV__
        // During development, say which address failed so it is easy to check.
        ? `Can't reach the LocalAlert server at ${API_URL}. Check that the backend is running and that your phone and computer are on the same Wi-Fi. (${error.message})`
        : "Can't reach LocalAlert. Check your internet connection and try again.",
    0
  );
}

export async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const isUpload = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers = { Accept: 'application/json', ...TUNNEL_HEADERS };
  if (body !== undefined && !isUpload) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let status;
  let ok;
  let data = null;

  if (isUpload) {
    try {
      ({ ok, status, data } = await uploadRequest(`${API_URL}${path}`, { method, headers, body }));
    } catch (error) {
      throw unreachable(error);
    }
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw unreachable(error);
    } finally {
      clearTimeout(timer);
    }
    ok = response.ok;
    status = response.status;
    try {
      data = await response.json();
    } catch {
      // Non-JSON response; handled below.
    }
  }

  if (!ok) {
    if (status === 401 && token && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(data?.message || 'Something went wrong. Please try again.', status);
  }

  return data;
}
