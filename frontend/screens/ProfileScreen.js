/*
18 Profile — matches Figma screen "18 Profile".

Shows the account, home and current municipality, account actions and Log out.
*/
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';
import Button from '../components/common/Button';
import ScreenHeader from '../components/common/ScreenHeader';
import { ChevronIcon, InfoIcon } from '../components/common/Icons';
import { getMyProfile, refreshCurrentMunicipality } from '../services/users';

const ADMIN = 'Family Administrator';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPhone(phone) {
  if (!phone || phone.length !== 10) return phone || '—';
  return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
}

function formatUpdated(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = new Date();
  return d.toDateString() === today.toDateString() ? `updated ${time}` : `updated ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function initials(first, last) {
  return `${(first || '?')[0]}${(last || '')[0] || ''}`.toUpperCase();
}

function InfoRow({ label, value, action }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueWrap}>
        <Text style={styles.infoValue}>{value}</Text>
        {action}
      </View>
    </View>
  );
}

function SettingRow({ title, note, onPress, last }) {
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !onPress }}
      >
        <Text style={[styles.settingTitle, !onPress && styles.muted]}>{title}</Text>
        {note ? <Text style={styles.soon}>{note}</Text> : <ChevronIcon />}
      </Pressable>
      {!last && <View style={styles.divider} />}
    </>
  );
}

export default function ProfileScreen({ sessionUser, onLogout }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setProfile(await getMyProfile());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const updateLocation = async () => {
    setLocating(true);
    try {
      const result = await refreshCurrentMunicipality({ askPermission: true });
      if (result.status === 'no-permission') {
        Alert.alert('Location is off', 'Allow LocalAlert to use your location in your phone settings to update your municipality.');
      } else {
        setProfile(result.user);
        if (!result.user.current_municipality) {
          Alert.alert('Area not covered', "LocalAlert doesn't cover your current area yet. You will still receive alerts that go to all users.");
        }
      }
    } catch (e) {
      Alert.alert('Could not update location', e.message);
    } finally {
      setLocating(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will stop receiving alerts on this phone until you log in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: onLogout },
    ]);
  };

  const p = profile || sessionUser || {};
  const isAdmin = p.role === ADMIN;
  const updated = formatUpdated(profile?.last_location_at);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Profile" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(p.first_name, p.last_name)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{[p.first_name, p.last_name].filter(Boolean).join(' ')}</Text>
            <Text style={styles.email}>{p.email}</Text>
            {p.role ? (
              <View style={styles.chip}><Text style={styles.chipText}>{p.role}</Text></View>
            ) : null}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blue} style={{ marginVertical: 16 }} />
        ) : error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <InfoIcon size={18} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onRefresh} hitSlop={8}><Text style={styles.link}>Retry</Text></Pressable>
          </View>
        ) : (
          <View style={styles.infoBox}>
            <InfoRow label="Home municipality" value={profile.home_municipality || 'Not set'} />
            <View style={styles.divider} />
            <InfoRow
              label="Current municipality"
              value={profile.current_municipality ? `${profile.current_municipality}${updated ? ` · ${updated}` : ''}` : 'Not known'}
              action={
                locating ? (
                  <ActivityIndicator size="small" color={colors.blue} />
                ) : (
                  <Pressable onPress={updateLocation} hitSlop={8} accessibilityRole="button" accessibilityLabel="Update current municipality">
                    <Text style={styles.link}>Update</Text>
                  </Pressable>
                )
              }
            />
            <View style={styles.divider} />
            <InfoRow label="Phone" value={formatPhone(profile.phone_number)} />
          </View>
        )}

        <View style={styles.card}>
          <SettingRow title="Join a family group" note="Coming soon" />
          {isAdmin && <SettingRow title="Change PIN" note="Coming soon" />}
          <SettingRow title="Privacy notice" onPress={() => setShowPrivacy(true)} last />
        </View>

        <View style={styles.spacer} />
        <Button title="Log out" variant="outline" onPress={confirmLogout} />
      </ScrollView>

      <Modal visible={showPrivacy} animationType="slide" transparent onRequestClose={() => setShowPrivacy(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.sheetTitle}>Privacy notice (POPIA)</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={styles.sheetBody}>
                LocalAlert stores your name, email address, phone number, role and municipality, and the profiles a family administrator adds, only to create and share missing-person alerts.{'\n\n'}
                Your exact location is never stored: LocalAlert only keeps the municipality it falls in. ID numbers are checked when a profile is added and are never stored. ID documents can only be seen by the family administrator of the group.{'\n\n'}
                Passwords and PINs are stored only in encrypted (hashed) form. Push notifications contain no personal details.{'\n\n'}
                You can ask for your account and information to be deleted at any time.
              </Text>
            </ScrollView>
            <Button title="Close" variant="secondary" onPress={() => setShowPrivacy(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  spacer: { flexGrow: 1, minHeight: 12 },
  pressed: { opacity: 0.6 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800', color: colors.white },
  name: { fontSize: 18, fontWeight: '700', color: colors.ink },
  email: { fontSize: 13, color: colors.ink2, marginTop: 2 },
  chip: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.blueLight, borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.blue },

  infoBox: { padding: 14, gap: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  infoLabel: { fontSize: 12, color: colors.ink3 },
  infoValueWrap: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoValue: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: colors.ink, textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.line },

  card: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 4, backgroundColor: colors.white },
  settingRow: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  muted: { color: colors.ink3 },
  soon: { fontSize: 12, color: colors.ink3 },
  link: { fontSize: 13, fontWeight: '600', color: colors.blue },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.blueTint, borderWidth: 1.5, borderColor: colors.blueDark },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.blueDark },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,26,51,0.55)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  sheetBody: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
});
