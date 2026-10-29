import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, AppState, Linking, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import AlertsScreen from './src/screens/alerts/AlertsScreen';
import FamilyScreen from './src/screens/family/FamilyScreen';
import NotificationsScreen from './src/screens/account/NotificationsScreen';
import ProfileScreen from './src/screens/account/ProfileScreen';
import TabBar from './src/components/navigation/TabBar';
import { getSession, logout } from './src/services/auth';
import { setUnauthorizedHandler } from './src/services/api';
import { refreshCurrentMunicipality } from './src/services/users';
import { followSharedAlert, shareCodeFromUrl } from './src/services/alerts';
import { getNotifications, getUnreadCount } from './src/services/notifications';
import { colors } from './src/theme';

const LOCATION_REFRESH_MS = 10 * 60 * 1000; // at most every 10 minutes

const NOTIFICATION_POLL_MS = 30 * 1000; // how often to check for new notifications while the app is open

// Banner at the top when a new notification arrives while the app is open.
function NewNotificationBanner({ note, onPress, onClose }) {
  const insets = useSafeAreaInsets();
  if (!note) return null;
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute', left: 12, right: 12, top: insets.top + 8, zIndex: 10,
        backgroundColor: colors.blueDark, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center',
        elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
      }}
      accessibilityRole="alert"
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.white, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{note.title}</Text>
        <Text style={{ color: colors.heroText, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{note.message}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Text style={{ color: colors.heroText, fontSize: 18, fontWeight: '700' }}>×</Text>
      </Pressable>
    </Pressable>
  );
}

function MainTabs({ user, onLogout, openAlert, onAlertOpened }) {
  const [tab, setTab] = useState('alerts');
  const [fullScreen, setFullScreen] = useState(false); // hides the tab bar (e.g. while reporting a missing person)
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState(null); // newest notification, shown briefly
  const [localOpen, setLocalOpen] = useState(null); // alert opened from a notification
  const lastUnread = useRef(null);

  // A shared alert link was opened: show it on the Alerts tab.
  useEffect(() => {
    if (openAlert) setTab('alerts');
  }, [openAlert]);

  // Unread badge + banner: check now, every 30 seconds, and when the app comes back.
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const count = await getUnreadCount();
        if (!active) return;
        if (lastUnread.current !== null && count > lastUnread.current) {
          const latest = await getNotifications(1);
          const note = latest.notifications[0];
          if (active && note && !note.is_read) setBanner(note);
        }
        lastUnread.current = count;
        setUnread(count);
      } catch {
        // Offline or server unreachable: try again next time.
      }
    };
    check();
    const timer = setInterval(check, NOTIFICATION_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => { active = false; clearInterval(timer); sub.remove(); };
  }, []);

  // Hide the banner after a few seconds.
  useEffect(() => {
    if (!banner) return undefined;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const openFromNotification = (alertId) => {
    setBanner(null);
    setLocalOpen({ id: alertId, key: Date.now() });
    setTab('alerts');
  };

  const onUnreadChange = (count) => {
    lastUnread.current = count;
    setUnread(count);
  };

  const visible = tab;
  let screen;
  if (visible === 'family') screen = <FamilyScreen user={user} onFullScreen={setFullScreen} />;
  else if (visible === 'notifications') {
    screen = <NotificationsScreen user={user} onOpenAlert={openFromNotification} onUnreadChange={onUnreadChange} />;
  } else if (visible === 'profile') screen = <ProfileScreen sessionUser={user} onLogout={onLogout} />;
  else {
    screen = (
      <AlertsScreen
        user={user}
        onFullScreen={setFullScreen}
        openAlert={localOpen || openAlert}
        onAlertOpened={() => { setLocalOpen(null); onAlertOpened?.(); }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>{screen}</View>
      {fullScreen ? null : (
        <TabBar role={user.role} active={visible} onChange={setTab} badges={{ notifications: unread }} />
      )}
      <NewNotificationBanner
        note={banner}
        onPress={() => banner && openFromNotification(banner.alert_id)}
        onClose={() => setBanner(null)}
      />
    </View>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'signup'
  const lastLocationRefresh = useRef(0);
  const [pendingShareCode, setPendingShareCode] = useState(null); // from a shared link
  const [openAlert, setOpenAlert] = useState(null); // { id, key } to show on the Alerts tab

  // Shared alert links (localalert://a/<code>): when the app is opened by one,
  // or while it is already running.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const code = shareCodeFromUrl(url);
      if (code) setPendingShareCode(code);
    }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      const code = shareCodeFromUrl(url);
      if (code) setPendingShareCode(code);
    });
    return () => sub.remove();
  }, []);

  // Open it once signed in (a link opened while logged out waits until login).
  useEffect(() => {
    if (!user || !pendingShareCode) return;
    const code = pendingShareCode;
    setPendingShareCode(null);
    followSharedAlert(code)
      .then((result) => {
        if (result.status === 'resolved') {
          NativeAlert.alert('Found safe', `${result.child_name} has been found. Thank you for looking out.`);
        }
        setOpenAlert({ id: result.alert_id, key: Date.now() });
      })
      .catch((e) => NativeAlert.alert('Could not open the alert', e.message));
  }, [user, pendingShareCode]);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAuthScreen('login');
  };

  // Restore a saved session when the app starts, and log out if the
  // backend rejects the session later (expired or invalid token).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      setUser(null);
      setAuthScreen('login');
    });
    getSession()
      .then((session) => setUser(session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  // FR36: update the current municipality when the app is opened or brought
  // back to the foreground. Only runs if location permission was already given.
  useEffect(() => {
    if (!user) return undefined;

    const refresh = () => {
      const now = Date.now();
      if (now - lastLocationRefresh.current < LOCATION_REFRESH_MS) return;
      lastLocationRefresh.current = now;
      refreshCurrentMunicipality().catch(() => {});
    };

    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [user]);

  let content;
  if (booting) {
    content = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  } else if (user) {
    content = <MainTabs user={user} onLogout={handleLogout} openAlert={openAlert} onAlertOpened={() => setOpenAlert(null)} />;
  } else if (authScreen === 'signup') {
    content = (
      <SignUpScreen
        onBackToAuth={() => setAuthScreen('login')}
        onRegistered={(newUser) => {
          lastLocationRefresh.current = 0;
          setUser(newUser);
        }}
      />
    );
  } else {
    content = (
      <LoginScreen
        onLoggedIn={(loggedIn) => {
          lastLocationRefresh.current = 0;
          setUser(loggedIn);
        }}
        onCreateAccount={() => setAuthScreen('signup')}
      />
    );
  }

  return <SafeAreaProvider>{content}</SafeAreaProvider>;
}
