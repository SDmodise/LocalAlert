/*
05 Alerts / 20 Still missing — the alerts the user created, belongs to as family,
or received, split into Active, Still missing and Resolved. Tapping a card opens
the details (06/07/10). Family Administrators can report a missing person (14–16).
*/
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import AuthImage from '../../components/common/AuthImage';
import { AlertTabIcon, InfoIcon, PersonSilhouette, PlusIcon } from '../../components/common/Icons';
import { alertPhotoUrl, listAlerts } from '../../services/alerts';
import CreateAlertScreen from './CreateAlertScreen';
import AlertDetailsScreen from './AlertDetailsScreen';

const ADMIN = 'Family Administrator';

function timeAgo(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} h ${minutes % 60} min ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

const TABS = [
  ['active', 'Active'],
  ['still_missing', 'Still missing'],
  ['resolved', 'Resolved'],
];

function daysMissing(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return `Missing for ${d} ${d === 1 ? 'day' : 'days'}`;
}

function AlertCard({ alert, onPress }) {
  const resolved = alert.status === 'resolved';
  const still = alert.status === 'still_missing';
  const child = alert.age !== null && alert.age < 18;
  const word = alert.gender === 'Female' ? (child ? 'Girl' : 'Woman') : (child ? 'Boy' : 'Man');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, resolved && { opacity: 0.6 }, pressed && { backgroundColor: colors.blueTint }]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.child_name}, ${alert.age}, ${resolved ? 'found' : `level ${alert.escalation_level}`}`}
    >
      <AuthImage
        uri={alert.has_photo ? alertPhotoUrl(alert.alert_id) : null}
        style={styles.photo}
        fallback={<PersonSilhouette size={40} />}
      />
      <View style={styles.flex}>
        <View style={styles.rowBetween}>
          <Text style={[styles.name, styles.flex]} numberOfLines={1}>
            {alert.child_name}{alert.age !== null ? `, ${alert.age}` : ''}
          </Text>
          <View style={[styles.chip, resolved ? styles.chipLight : still || alert.escalation_level >= 4 ? styles.chipDark : alert.escalation_level >= 2 ? styles.chipSolid : styles.chipLight]}>
            <Text style={[styles.chipText, { color: resolved || (!still && alert.escalation_level < 2) ? colors.blue : colors.white }]}>
              {resolved ? 'Found' : still ? 'Still missing' : `Level ${alert.escalation_level}`}
            </Text>
          </View>
        </View>
        <Text style={styles.place} numberOfLines={1}>
          {alert.last_seen_place ? `Last seen near ${alert.last_seen_place}` : `Last seen in ${alert.municipality_name}`}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {still ? daysMissing(alert.created_at) : timeAgo(alert.last_seen_time || alert.created_at)} · {word}{alert.clothing_description ? ` · ${alert.clothing_description}` : ''}
        </Text>
        {alert.relation !== 'recipient' ? (
          <View style={styles.tags}>
            <View style={[styles.chip, styles.chipLight]}><Text style={[styles.chipText, { color: colors.blue }]}>Family</Text></View>
            {alert.sightings_count ? (
              <View style={[styles.chip, styles.chipLight]}>
                <Text style={[styles.chipText, { color: colors.blue }]}>{alert.sightings_count} {alert.sightings_count === 1 ? 'sighting' : 'sightings'}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function AlertsScreen({ user, onFullScreen, openAlert, onAlertOpened }) {
  const insets = useSafeAreaInsets();
  const isAdmin = user?.role === ADMIN;
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState('active');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      setAlerts(await listAlerts());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = (open) => {
    setCreating(open);
    onFullScreen?.(open);
  };

  const openDetails = (id) => {
    setOpenId(id);
    onFullScreen?.(Boolean(id));
  };

  // Opened from a shared link (see App.js).
  useEffect(() => {
    if (!openAlert) return;
    setCreating(false);
    openDetails(openAlert.id);
    onAlertOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAlert]);

  if (openId) {
    return <AlertDetailsScreen alertId={openId} onBack={() => { openDetails(null); load(); }} />;
  }

  if (creating) {
    return (
      <CreateAlertScreen
        onClose={() => openCreate(false)}
        onCreated={() => { openCreate(false); load(); }}
      />
    );
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const area = alerts?.find((a) => a.relation === 'recipient')?.municipality_name;
  const shown = (alerts || []).filter((a) => a.status === tab);
  const counts = Object.fromEntries(TABS.map(([key]) => [key, (alerts || []).filter((a) => a.status === key).length]));
  const emptyText = {
    active: ['No active alerts', 'When someone is reported missing in your area, the alert will appear here and you will get a notification.'],
    still_missing: ['No one is still missing', 'Alerts that stay open for more than five days are listed here. You can still report a sighting for them.'],
    resolved: ['No resolved alerts', 'Alerts for people who have been found are listed here.'],
  }[tab];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Alerts"
        subtitle={area || 'LocalAlert'}
        right={isAdmin ? (
          <Pressable style={styles.roundButton} onPress={() => openCreate(true)} accessibilityRole="button" accessibilityLabel="Report a missing person" hitSlop={6}>
            <PlusIcon />
          </Pressable>
        ) : null}
      />
      {alerts && alerts.length > 0 ? (
        <View style={styles.segments} accessibilityRole="tablist">
          {TABS.map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[styles.segment, tab === key && styles.segmentOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
            >
              <Text style={[styles.segmentText, tab === key && styles.segmentTextOn]} numberOfLines={1}>
                {label}{counts[key] ? ` (${counts[key]})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {alerts === null && !error ? (
        <View style={[styles.flex, styles.center]}><ActivityIndicator size="large" color={colors.blue} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, shown.length === 0 && { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
        >
          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <InfoIcon size={18} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {tab === 'still_missing' && shown.length > 0 ? (
            <Text style={styles.caption}>
              These people have been missing for more than five days. Their alerts stay open and you can still report a sighting.
            </Text>
          ) : null}
          {shown.map((a) => <AlertCard key={a.alert_id} alert={a} onPress={() => openDetails(a.alert_id)} />)}
          {alerts && shown.length === 0 ? (
            <EmptyState icon={<AlertTabIcon size={44} active />} title={emptyText[0]} message={emptyText[1]}>
              {isAdmin && tab === 'active' ? <Button title="Report a missing person" onPress={() => openCreate(true)} style={styles.wide} /> : null}
            </EmptyState>
          ) : null}
          {isAdmin && tab === 'active' && shown.length > 0 ? (
            <Button title="Report a missing person" variant="secondary" onPress={() => openCreate(true)} />
          ) : null}
          {!alerts && error ? <Button title="Try again" variant="secondary" onPress={onRefresh} /> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  wide: { alignSelf: 'stretch', marginTop: 8 },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  roundButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    flexDirection: 'row', gap: 12, padding: 12,
    borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  photo: {
    width: 64, height: 76, borderRadius: 12, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  place: { fontSize: 13, color: colors.ink2, marginTop: 3 },
  meta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 6 },
  chip: { borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 3 },
  chipSolid: { backgroundColor: colors.blue },
  chipDark: { backgroundColor: colors.blueDark },
  chipLight: { backgroundColor: colors.blueLight },
  chipText: { fontSize: 11, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 18, color: colors.ink3 },
  segments: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 12, padding: 4, gap: 4,
    borderRadius: 12, backgroundColor: colors.blueLight,
  },
  segment: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentOn: { backgroundColor: colors.white },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  segmentTextOn: { color: colors.blue, fontWeight: '700' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
    backgroundColor: colors.dangerTint, borderWidth: 1.5, borderColor: colors.danger,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.danger },
});
