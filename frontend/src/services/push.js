/*
Lock-screen (push) notifications.

After login the app asks for permission, gets this phone's Expo push token and
sends it to the backend (PUT /api/users/me/push-token). The backend then sends a
push for every new LocalAlert notification. Tapping one opens that alert.
On log out the token is removed again, so the phone stops receiving them.

Android: push notifications need the LocalAlert development build (Expo Go on
Android cannot receive them), so in Expo Go on Android this file quietly does
nothing and the app keeps working with in-app notifications only.
iPhone: Expo Go can receive them; an installed iPhone build needs an Apple
Developer account (EAS sets up Apple's push key when building).
*/
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiRequest } from './api';
import { getToken } from './auth';
import { colors } from '../theme';

const TOKEN_KEY = 'localalert.pushToken';
const inExpoGoOnAndroid =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android';

// Not loaded in Expo Go on Android, which cannot receive push notifications.
let Notifications = null;
function lib() {
  if (inExpoGoOnAndroid) return null;
  if (!Notifications) {
    try {
      // eslint-disable-next-line global-require
      Notifications = require('expo-notifications');
    } catch {
      Notifications = null;
    }
  }
  return Notifications;
}

export const pushSupported = () => !!lib();

// While the app is open the in-app banner is used instead of a second, system banner.
export function setupNotificationDisplay() {
  const N = lib();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(N) {
  if (Platform.OS !== 'android') return;
  // "alerts" must match channelId in the backend's pushService.
  await N.setNotificationChannelAsync('alerts', {
    name: 'Missing person alerts',
    description: 'New alerts, sightings and found messages',
    importance: N.AndroidImportance.MAX, // plays the phone's normal notification sound
    vibrationPattern: [0, 400, 200, 400],
    lightColor: colors.blue,
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
  });
}

// Returns { status }: 'registered' | 'denied' | 'unavailable' | 'no-project' | 'error'.
export async function registerForPush({ ask = true } = {}) {
  const N = lib();
  if (!N) return { status: 'unavailable' };
  try {
    await ensureAndroidChannel(N);
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted' && ask) ({ status } = await N.requestPermissionsAsync());
    if (status !== 'granted') return { status: 'denied' };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { status: 'no-project' };
    const { data: pushToken } = await N.getExpoPushTokenAsync({ projectId });

    await apiRequest('/users/me/push-token', {
      method: 'PUT',
      token: await getToken(),
      body: { token: pushToken, platform: Platform.OS },
    });
    await AsyncStorage.setItem(TOKEN_KEY, pushToken);
    return { status: 'registered' };
  } catch (error) {
    if (__DEV__) console.log('[push] could not register this phone:', error.message);
    return { status: 'error', message: error.message };
  }
}

// On log out: this phone stops receiving notifications for the account.
export async function unregisterPush() {
  try {
    const pushToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (!pushToken) return;
    await AsyncStorage.removeItem(TOKEN_KEY);
    await apiRequest('/users/me/push-token', { method: 'DELETE', body: { token: pushToken } });
  } catch {
    // Offline: the backend removes the token later when Expo reports the phone is gone.
  }
}

// Calls onOpen(data) when a notification is tapped, including the one that opened
// the app from the lock screen. data: { alertId, type } or { type: 'invitation' }.
// Returns an unsubscribe function.
export function onNotificationTapped(onOpen) {
  const N = lib();
  if (!N) return () => {};
  const handled = new Set();
  const handle = (response) => {
    const id = response?.notification?.request?.identifier;
    const data = response?.notification?.request?.content?.data;
    if (!data || (!data.alertId && data.type !== 'invitation') || handled.has(id)) return;
    handled.add(id);
    onOpen(data);
  };
  N.getLastNotificationResponseAsync()
    .then((response) => {
      handle(response);
      N.clearLastNotificationResponseAsync?.().catch(() => {});
    })
    .catch(() => {});
  const sub = N.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

// Calls onReceive() when a push arrives while the app is open (to refresh the badge at once).
export function onNotificationReceived(onReceive) {
  const N = lib();
  if (!N) return () => {};
  const sub = N.addNotificationReceivedListener(() => onReceive());
  return () => sub.remove();
}
