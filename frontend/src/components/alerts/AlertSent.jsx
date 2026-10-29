/*
Screen 16: the alert is live. Shows the alert, a share button, and who has been
told so far (linked family and Level 1) and which level goes out next.
*/
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import Button from '../common/Button';
import AuthImage from '../common/AuthImage';
import { CheckIcon, FamilyTabIcon, PersonSilhouette } from '../common/Icons';
import ShareAlertButton from './ShareAlertButton';
import { alertPhotoUrl } from '../../services/alerts';
import { scheduledText } from '../../utils/dates';

const firstName = (name) => (name || '').trim().split(/\s+/)[0];
const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
const users = (n) => `${n} ${n === 1 ? 'user' : 'users'}`;

function LevelRow({ badge, title, meta, done }) {
  return (
    <View style={styles.card}>
      <View style={[styles.badge, done && typeof badge === 'string' ? styles.badgeOn : styles.badgeOff]}>
        {typeof badge === 'string' ? <Text style={[styles.badgeText, done && { color: colors.white }]}>{badge}</Text> : badge}
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardMeta}>{meta}</Text>
      </View>
      <View style={[styles.chip, done ? styles.chipSolid : styles.chipOutline]}>
        <Text style={[styles.chipText, { color: done ? colors.white : colors.blue }]}>{done ? 'Sent' : 'Next'}</Text>
      </View>
    </View>
  );
}

export default function AlertSent({ result, onDone }) {
  const insets = useSafeAreaInsets();
  const { alert, reach } = result;
  const her = alert.gender === 'Female' ? 'her' : 'him';
  const levelTitle = (l) =>
    l.level === 4 ? 'All LocalAlert users'
      : l.level === 2 ? 'Neighbouring municipalities'
        : 'Municipalities next to those';
  const levelMeta = (l) => {
    const names = l.municipalities.length ? `${l.municipalities.join(', ')} · ` : l.level < 4 ? 'No new areas covered yet · ' : '';
    return l.status === 'sent' ? `${names}${users(l.users)}` : `${names}${scheduledText(l.scheduled_at)}`;
  };
  const nextIndex = reach.levels.findIndex((l) => l.status === 'scheduled');

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + 28 }]}>
        <View style={styles.heroCheck}><CheckIcon size={30} color={colors.blue} /></View>
        <Text style={styles.heroTitle}>Alert sent</Text>
        <Text style={styles.heroBody}>
          {firstName(alert.child_name)}'s alert is live. We will widen the search every 6 hours until you mark {her} as found.
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.sentCard}>
          <AuthImage
            uri={alert.has_photo ? alertPhotoUrl(alert.alert_id) : null}
            style={styles.sentPhoto}
            fallback={<PersonSilhouette size={56} />}
          />
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{alert.child_name}</Text>
            <Text style={styles.cardMeta}>{alert.age !== null ? `${alert.age} years · ` : ''}{alert.last_seen_place || alert.municipality_name}</Text>
            <Text style={styles.cardMeta} numberOfLines={2}>{alert.clothing_description}</Text>
          </View>
        </View>
        <ShareAlertButton alert={alert} variant="primary" title="Share on WhatsApp, Facebook, X…" />
        <Text style={styles.hint}>Sharing sends a LocalAlert link, so everyone always sees the latest details and photo.</Text>
        <Text style={styles.label}>Who has been told</Text>
        <LevelRow badge={<FamilyTabIcon size={22} active />} title="Linked family" meta={reach.family ? `${people(reach.family)} · immediately` : 'No linked family members yet'} done={reach.family > 0} />
        <LevelRow badge="L1" title={alert.municipality_name} meta={`${users(reach.levels[0].users)} · now`} done />
        {reach.levels.slice(1).map((l, i) =>
          l.status === 'sent' || i + 1 === nextIndex ? (
            <LevelRow key={l.level} badge={`L${l.level}`} title={levelTitle(l)} meta={levelMeta(l)} done={l.status === 'sent'} />
          ) : null
        )}
        {nextIndex > 0 && nextIndex < 3 ? (
          <Text style={styles.hint}>
            After that: Level {nextIndex + 2}{nextIndex + 2 < 4 ? ' and Level 4 (all users)' : ' (all users)'} every 6 hours.
          </Text>
        ) : null}
        <Button title="Back to alerts" variant="secondary" onPress={onDone} style={{ marginTop: 8 }} />
        <Button title="Call SAPS (10111)" variant="outline" onPress={() => Linking.openURL('tel:10111')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 4 },
  hint: { fontSize: 12, color: colors.ink3 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  sentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  sentPhoto: {
    width: 96, height: 120, borderRadius: 12, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  hero: { backgroundColor: colors.blue, alignItems: 'center', paddingHorizontal: 28, paddingBottom: 28, gap: 10 },
  heroCheck: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: colors.white },
  heroBody: { fontSize: 14, lineHeight: 21, color: colors.heroText, textAlign: 'center' },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: colors.blue },
  badgeOff: { backgroundColor: colors.blueLight },
  badgeText: { fontSize: 13, fontWeight: '800', color: colors.blue },
  chip: { borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  chipSolid: { backgroundColor: colors.blue },
  chipOutline: { borderWidth: 1.5, borderColor: colors.blue },
  chipText: { fontSize: 11, fontWeight: '700' },
});
