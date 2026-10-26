import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import HomeScreen from './screens/HomeScreen';
import { getSession, logout } from './services/auth';
import { colors } from './theme';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'signup'

  // Restore a saved session when the app starts.
  useEffect(() => {
    getSession()
      .then((session) => setUser(session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAuthScreen('login');
  };

  let content;
  if (booting) {
    content = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  } else if (user) {
    content = <HomeScreen user={user} onLogout={handleLogout} />;
  } else if (authScreen === 'signup') {
    content = <SignUpScreen onBackToAuth={() => setAuthScreen('login')} />;
  } else {
    content = (
      <LoginScreen
        onLoggedIn={setUser}
        onCreateAccount={() => setAuthScreen('signup')}
      />
    );
  }

  return <SafeAreaProvider>{content}</SafeAreaProvider>;
}
