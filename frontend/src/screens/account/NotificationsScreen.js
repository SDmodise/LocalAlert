/*
17 Notifications — alerts received, escalations, spotted reports and "found safe"
messages, newest first. Tapping one opens the alert (and marks it read).
*/
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import AuthImage from '../../components/common/AuthImage';
import { BellTabIcon, CheckIcon, InfoIcon, PersonSilhouette, PinIcon } from '../../components/common/Icons';
import { getNotifications, markNotificationsRead } from '../../services/notifications';
import { alertPhotoUrl } from '../../services/alerts';

const pad = (n) => String(n).padStart(2, '0');
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function sectionTitle(date) {
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'TODAY';
  if (date.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
  return 'EARLIER';
}

function timeLabel(date) {
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return clock(date);
  return `${date.getDate()}/${date.getMonth() + 1} ${clock(date)}`;
}

// Small badge in the corner of the photo bubble: what kind of notification it is.
function TypeBadge({ n }) {
  if (n.notification_type === 'resolved') {
    return <View style={[styles.typeBadge, { backgroundColor: colors.blue }]}><CheckIcon size={10} /></View>;
  }
  if (n.notification_type === 'escalation') {
    return <View style={[styles.typeBadge, { backgroundColor: colors.blueDark }]}><Text style={styles.typeText}>L{n.escalation_level}</Text></View>;
  }
  if (n.notification_type === 'spotted_report') {
    return <View style={[styles.typeBadge, { backgroundColor: colors.blue }]}><PinIcon size={11} color={colors.white} /></View>;
  }
  return null;
}

function Row({ n, onPress }) {
  const date = new Date(n.created_at);
  return (
    <Pressable
      onPress={() => onPress(n)}
      style={({ pressed }) => [styles.row, !n.is_read && styles.rowUnread, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${n.is_read ? '' : 'Unread. '}${n.title}. ${n.message}`}
    >
      <View>
        <AuthImage
          uri={n.has_photo ? alertPhotoUrl(n.alert_id) : null}
          style={styles.photo}
          fallback={<PersonSilhouette size={30} />}
        />
        <TypeBadge n={n} />
      </View>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, !n.is_read && styles.titleUnread]} numberOfLines={1}>{n.title}</Text>
          <Text style={styles.time}>{timeLabel(date)}</Text>
        </View>
        <Text style={styles.message} numberOfLines={2}>{n.message}</Text>
      </View>
      {!n.is_read ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

export default function NotificationsScreen({ onOpenAlert, onUnreadChange }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null); // { unread_count, notifications }
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getNotifications();
      setData(result);
      setError('');
      onUnreadChange?.(result.unread_count);
    } catch (e) {
      setError(e.message);
    }
  }, [onUnreadChange]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const open = (n) => {
    if (!n.is_read) {
      setData((d) => ({
        unread_count: Math.max(0, d.unread_count - 1),
        notifications: d.notifications.map((x) => (x.notification_id === n.notification_id ? { ...x, is_read: true } : x)),
      }));
      onUnreadChange?.(Math.max(0, (data?.unread_count || 1) - 1));
      markNotificationsRead([n.notification_id]).catch(() => {});
    }
    onOpenAlert?.(n.alert_id);
  };

  const markAll = async () => {
    setData((d) => ({ unread_count: 0, notifications: d.notifications.map((x) => ({ ...x, is_read: true })) }));
    onUnreadChange?.(0);
    markNotificationsRead('all').catch(() => {});
  };

  const sections = [];
  for (const n of data?.notifications || []) {
    const title = sectionTitle(new Date(n.created_at));
    if (!sections.length || sections[sections.length - 1].title !== title) sections.push({ title, data: [] });
    sections[sections.length - 1].data.push(n);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Notifications"
        right={data?.unread_count ? (
          <Pressable onPress={markAll} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Mark all read</Text>
          </Pressable>
        ) : null}
      />
      {!data && !error ? (
        <View style={[styles.flex, styles.center]}><ActivityIndicator size="large" color={colors.blue} /></View>
      ) : !data ? (
        <EmptyState icon={<InfoIcon size={40} />} title="Could not load notifications" message={error}>
          <Button title="Try again" variant="secondary" onPress={onRefresh} style={{ alignSelf: 'stretch' }} />
        </EmptyState>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.notification_id}
          renderItem={({ item }) => <Row n={item} onPress={open} />}
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.content, !sections.length && { flexGrow: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
          ListEmptyComponent={
            <EmptyState
              icon={<BellTabIcon size={44} active />}
              title="No notifications yet"
              message="Alerts, sightings and updates about alerts you received will be listed here."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },
  section: { fontSize: 11, fontWeight: '700', color: colors.ink3, letterSpacing: 0.6, marginTop: 14, marginBottom: 6, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card, marginBottom: 8 },
  rowUnread: { backgroundColor: colors.blueTint },
  photo: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  typeBadge: {
    position: 'absolute', right: -2, bottom: -2, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white,
  },
  typeText: { fontSize: 9, fontWeight: '800', color: colors.white },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  titleUnread: { fontWeight: '800' },
  time: { fontSize: 11, color: colors.ink3 },
  message: { fontSize: 13, lineHeight: 18, color: colors.ink2, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.blue },
});
