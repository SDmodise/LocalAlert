import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import AlertsScreen from './screens/AlertsScreen';
import FamilyScreen from './screens/FamilyScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ProfileScreen from './screens/ProfileScreen';
import TabBar, { tabsForRole } from './components/navigation/TabBar';
import { getSession, logout } from './services/auth';
import { setUnauthorizedHandler } from './services/api';
import { refreshCurrentMunicipality } from './services/users';
import { colors } from './theme';

const LOCATION_REFRESH_MS = 10 * 60 * 1000; // at most every 10 minutes

function MainTabs({ user, onLogout }) {
  const [tab, setTab] = useState('alerts');

  // If the role has no such tab (e.g. Family for community members), fall back to Alerts.
  const visible = tabsForRole(user.role).some((t) => t.key === tab) ? tab : 'alerts';

  let screen;
  if (visible === 'family') screen = <FamilyScreen user={user} />;
  else if (visible === 'notifications') screen = <NotificationsScreen user={user} />;
  else if (visible === 'profile') screen = <ProfileScreen sessionUser={user} onLogout={onLogout} />;
  else screen = <AlertsScreen user={user} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>{screen}</View>
      <TabBar role={user.role} active={visible} onChange={setTab} />
    </View>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'signup'
  const lastLocationRefresh = useRef(0);

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
    content = <MainTabs user={user} onLogout={handleLogout} />;
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
