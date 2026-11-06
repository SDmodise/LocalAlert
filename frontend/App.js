import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, AppState, Linking, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
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
import { getMyInvitations } from './src/services/invitations';
import { describeInvitation } from './src/utils/invitationText';
import { needsHomeConfirmation } from './src/utils/homeReminder';
import { WarningIcon } from './src/components/common/Icons';
import {
  onNotificationReceived,
  onNotificationTapped,
  registerForPush,
  setupNotificationDisplay,
  unregisterPush,
} from './src/services/push';
import { colors } from './src/theme';

const LOCATION_REFRESH_MS = 10 * 60 * 1000; // at most every 10 minutes

const NOTIFICATION_POLL_MS = 30 * 1000; // how often to check for new notifications while the app is open

// Lock-screen notifications (development build only): while the app is open,
// the in-app banner below is shown instead of a system one.
setupNotificationDisplay();

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
      {note.notification_type === 'alert' ? (
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
          <WarningIcon size={22} />
        </View>
      ) : null}
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

function MainTabs({ user, onLogout, openAlert, onAlertOpened, openInvitationsRequest }) {
  const [tab, setTab] = useState('alerts');
  const [fullScreen, setFullScreen] = useState(false); // hides the tab bar (e.g. while reporting a missing person)
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState(null); // newest notification, shown briefly
  const [localOpen, setLocalOpen] = useState(null); // alert opened from a notification
  const [invites, setInvites] = useState(0); // pending family invitations (badge on Family)
  const [inviteList, setInviteList] = useState([]); // the invitations themselves (for their wording)
  const [openInvites, setOpenInvites] = useState(null); // changes to open the invitations screen
  const lastUnread = useRef(null);
  const lastInvites = useRef(null);

  const refreshInvites = useCallback(async () => {
    try {
      const list = await getMyInvitations();
      if (lastInvites.current !== null && list.length > lastInvites.current) {
        const { title, message } = describeInvitation(list[0]);
        setBanner({ kind: 'invitation', title, message: `${message} Tap to view.` });
      }
      lastInvites.current = list.length;
      setInvites(list.length);
      setInviteList(list);
    } catch {
      // Offline: try again next time.
    }
  }, []);

  const openInvitations = () => {
    setBanner(null);
    setTab('family');
    setOpenInvites(Date.now());
  };

  // A tapped "Family invitation" notification.
  useEffect(() => {
    if (openInvitationsRequest) openInvitations();
  }, [openInvitationsRequest]);

  // Signed up away from home: remind them (once each time the app opens) to confirm
  // their home municipality when they get there.
  useEffect(() => {
    const timer = setTimeout(() => {
      needsHomeConfirmation(user?.email).then((needed) => {
        if (needed) {
          setBanner((current) => current || {
            kind: 'home',
            title: 'Confirm your home municipality',
            message: 'When you get home, open Profile and tap "I\'m home now". Tap to open Profile.',
          });
        }
      });
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const checkAll = () => { check(); refreshInvites(); };
    checkAll();
    const timer = setInterval(checkAll, NOTIFICATION_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') checkAll(); });
    const offPush = onNotificationReceived(checkAll); // a push arrived while open: update at once
    return () => { active = false; clearInterval(timer); sub.remove(); offPush(); };
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
  if (visible === 'family') {
    screen = (
      <FamilyScreen
        user={user}
        onFullScreen={setFullScreen}
        invitations={invites}
        invitationList={inviteList}
        openInvitations={openInvites}
        onInvitationsChanged={refreshInvites}
      />
    );
  } else if (visible === 'notifications') {
    screen = (
      <NotificationsScreen
        user={user}
        onOpenAlert={openFromNotification}
        onUnreadChange={onUnreadChange}
        onOpenInvitations={openInvitations}
      />
    );
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
        <TabBar role={user.role} active={visible} onChange={setTab} badges={{ notifications: unread + invites, family: invites }} />
      )}
      <NewNotificationBanner
        note={banner}
        onPress={() => {
          if (!banner) return;
          if (banner.kind === 'invitation') openInvitations();
          else if (banner.kind === 'home') { setBanner(null); setTab('profile'); }
          else openFromNotification(banner.alert_id);
        }}
        onClose={() => setBanner(null)}
      />
    </View>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [authEmail, setAuthEmail] = useState(''); // carried between login and forgot password
  const [loginNotice, setLoginNotice] = useState(''); // shown on login after a password reset
  const lastLocationRefresh = useRef(0);
  const [pendingShareCode, setPendingShareCode] = useState(null); // from a shared link
  const [openAlert, setOpenAlert] = useState(null); // { id, key } to show on the Alerts tab
  const [openInvitationsRequest, setOpenInvitationsRequest] = useState(null); // tapped invitation notification

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
    await unregisterPush(); // this phone stops getting notifications for the account
    await logout();
    setUser(null);
    setAuthScreen('login');
  };

  // Restore a saved session when the app starts, and log out if the
  // backend rejects the session later (expired or invalid token).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      unregisterPush();
      logout();
      setUser(null);
      setAuthScreen('login');
    });
    getSession()
      .then((session) => setUser(session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  // Lock-screen notifications: ask permission and register this phone once signed in.
  useEffect(() => {
    if (user) registerForPush();
  }, [user]);

  // Tapping a notification (also from the lock screen) opens that alert.
  useEffect(() => onNotificationTapped((data) => {
    if (data.type === 'invitation') setOpenInvitationsRequest(Date.now());
    else setOpenAlert({ id: data.alertId, key: Date.now() });
  }), []);

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
    content = (
      <MainTabs
        user={user}
        onLogout={handleLogout}
        openAlert={openAlert}
        onAlertOpened={() => setOpenAlert(null)}
        openInvitationsRequest={openInvitationsRequest}
      />
    );
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
  } else if (authScreen === 'forgot') {
    content = (
      <ForgotPasswordScreen
        initialEmail={authEmail}
        onBack={() => setAuthScreen('login')}
        onDone={(email) => {
          setAuthEmail(email);
          setLoginNotice('Password changed. Log in with your new password.');
          setAuthScreen('login');
        }}
      />
    );
  } else {
    content = (
      <LoginScreen
        initialEmail={authEmail}
        notice={loginNotice}
        onLoggedIn={(loggedIn) => {
          lastLocationRefresh.current = 0;
          setLoginNotice('');
          setUser(loggedIn);
        }}
        onCreateAccount={() => setAuthScreen('signup')}
        onForgotPassword={(email) => {
          setAuthEmail(email);
          setLoginNotice('');
          setAuthScreen('forgot');
        }}
      />
    );
  }

  return <SafeAreaProvider>{content}</SafeAreaProvider>;
}
