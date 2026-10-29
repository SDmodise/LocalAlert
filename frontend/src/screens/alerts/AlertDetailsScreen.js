/*
Alert details.
  06 Community   — anyone who received the alert: description, search area,
                   "I saw this person" (08) and Call SAPS.
  07 Family      — family administrator and linked members: escalation timeline,
                   people notified, Spotted reports; the administrator can
                   "Mark as found" with their PIN.
  10 Resolved    — shown to everyone once the person has been found.
*/
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import Button from '../../components/common/Button';
import SubHeader from '../../components/common/SubHeader';
import EmptyState from '../../components/common/EmptyState';
import PinInput from '../../components/common/PinInput';
import AuthImage from '../../components/common/AuthImage';
import { CheckIcon, ClockIcon, InfoIcon, PersonSilhouette, PinIcon } from '../../components/common/Icons';
import { alertPhotoUrl, getAlert, listSightings, resolveAlert, sightingPhotoUrl } from '../../services/alerts';
import SpottedReportScreen from './SpottedReportScreen';
import ShareAlertButton from '../../components/alerts/ShareAlertButton';

const pad = (n) => String(n).padStart(2, '0');
const clock = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dateTime = (iso) => { const d = new Date(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(iso)}`; };

function dayAndTime(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return clock(iso);
  if (d.toDateString() === yesterday.toDateString()) return `yesterday ${clock(iso)}`;
  return dateTime(iso);
}

function ago(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} h ${minutes % 60} min ago`;
  const days = Math.floor(h / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

function until(iso) {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const firstName = (name) => (name || '').trim().split(/\s+/)[0];
function personWord(a) {
  const child = a.age !== null && a.age < 18;
  return a.gender === 'Female' ? (child ? 'Girl' : 'Woman') : (child ? 'Boy' : 'Man');
}

function coverage(a) {
  if (a.escalation_level >= 4) return 'All LocalAlert users';
  if (a.escalation_level === 3) return `${a.municipality_name} and a wider area`;
  if (a.escalation_level === 2) return `${a.municipality_name} and neighbouring municipalities`;
  return a.municipality_name;
}

const openMaps = (lat, lng) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
const callSaps = () => Linking.openURL('tel:10111');

function Detail({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function StatusChip({ alert }) {
  const resolved = alert.status === 'resolved';
  const still = alert.status === 'still_missing';
  return (
    <View style={[styles.chip, resolved ? styles.chipLight : still ? styles.chipDark : styles.chipSolid]}>
      <Text style={[styles.chipText, { color: resolved ? colors.blue : colors.white }]}>
        {resolved ? 'Resolved' : still ? 'Still missing' : 'Active'}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------- 06 community

function CommunityView({ alert, onSighting, refresh }) {
  const still = alert.status === 'still_missing';
  return (
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={refresh}>
      <View style={styles.photoHero}>
        <AuthImage
          uri={alert.has_photo ? alertPhotoUrl(alert.alert_id) : null}
          style={styles.bigPhoto}
          fallback={<PersonSilhouette size={110} />}
        />
        <View style={[styles.heroChip, still && { backgroundColor: colors.blueDark }]}>
          <Text style={styles.heroChipText}>{still ? 'STILL MISSING' : 'MISSING'} · LEVEL {alert.escalation_level}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{alert.child_name}</Text>
        <Text style={styles.sub}>
          {alert.age !== null ? `${alert.age} ${alert.age === 1 ? 'year' : 'years'} · ` : ''}{personWord(alert)}
        </Text>
        <View style={styles.inline}>
          <ClockIcon size={14} color={colors.ink3} />
          <Text style={styles.small}>Reported {ago(alert.created_at)}</Text>
        </View>
        <View style={styles.placeBox}>
          <PinIcon size={20} />
          <Text style={[styles.placeText, styles.flex]}>
            {alert.last_seen_place || alert.municipality_name} · {dayAndTime(alert.last_seen_time)}
          </Text>
          {alert.latitude !== null ? (
            <Pressable onPress={() => openMaps(alert.latitude, alert.longitude)} hitSlop={8} accessibilityRole="link">
              <Text style={styles.link}>Map</Text>
            </Pressable>
          ) : null}
        </View>
        <Detail label="Description" value={alert.description} />
        <Detail label="Wearing" value={alert.clothing_description} />
        <View style={styles.searchBox}>
          <Text style={styles.detailLabel}>Search area</Text>
          <Text style={styles.detailValue}>{coverage(alert)}</Text>
          {alert.next_escalation_at ? (
            <Text style={styles.small}>Next level in {until(alert.next_escalation_at)}</Text>
          ) : null}
        </View>
        <Button title="I saw this person" onPress={onSighting} />
        <ShareAlertButton alert={alert} />
        <Button title="Call SAPS (10111)" variant="outline" onPress={callSaps} />
      </View>
    </ScrollView>
  );
}

// ------------------------------------------------------------- 07 family

function Timeline({ alert, reach }) {
  const labels = { 1: alert.municipality_name, 2: 'Neighbours', 3: 'Wider area', 4: 'All users' };
  return (
    <View style={styles.timeline}>
      {reach.levels.map((l, i) => {
        const done = l.status === 'sent';
        const time = done ? l.sent_at : l.scheduled_at;
        return (
          <View key={l.level} style={styles.step}>
            <View style={styles.stepTrack}>
              {i > 0 ? <View style={[styles.stepLine, done && styles.stepLineOn]} /> : <View style={styles.stepLineBlank} />}
              <View style={[styles.stepDot, done ? styles.stepDotOn : styles.stepDotOff]}>
                <Text style={[styles.stepDotText, done && { color: colors.white }]}>L{l.level}</Text>
              </View>
              {i < reach.levels.length - 1 ? <View style={[styles.stepLine, reach.levels[i + 1].status === 'sent' && styles.stepLineOn]} /> : <View style={styles.stepLineBlank} />}
            </View>
            <Text style={styles.stepLabel} numberOfLines={2}>{labels[l.level]}</Text>
            <Text style={styles.stepTime}>{time ? clock(time) : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SightingCard({ alert, s }) {
  return (
    <View style={styles.sighting}>
      <View style={styles.inlineBetween}>
        <Text style={styles.sightingMeta}>
          {dayAndTime(s.reported_at)}{s.distance_km !== null ? ` · ${s.distance_km < 1 ? `${Math.round(s.distance_km * 1000)} m` : `${s.distance_km} km`} away` : ''}
        </Text>
        <Text style={styles.small}>{s.reporter}</Text>
      </View>
      {s.description ? <Text style={styles.sightingText}>{s.description}</Text> : null}
      {s.has_photo ? (
        <AuthImage uri={sightingPhotoUrl(alert.alert_id, s.report_id)} style={styles.sightingPhoto} fallback={null} />
      ) : null}
      {s.latitude !== null ? (
        <Pressable style={styles.mapButton} onPress={() => openMaps(s.latitude, s.longitude)} accessibilityRole="link">
          <PinIcon size={16} />
          <Text style={styles.link}>Location shared · Open in Maps</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FamilyView({ alert, reach, sightings, sightingsError, onResolve, onSighting, refresh }) {
  const notified = (reach?.family || 0) + (reach?.levels || []).reduce((sum, l) => sum + (l.users || 0), 0);
  return (
    <ScrollView contentContainerStyle={[styles.scroll, styles.body]} refreshControl={refresh}>
      <View style={styles.familyHero}>
        <AuthImage
          uri={alert.has_photo ? alertPhotoUrl(alert.alert_id) : null}
          style={styles.familyPhoto}
          fallback={<PersonSilhouette size={90} />}
        />
        <View style={styles.heroChipRight}><StatusChip alert={alert} /></View>
      </View>
      <View>
        <Text style={styles.name}>{alert.child_name}</Text>
        <Text style={styles.small}>
          {alert.age !== null ? `${alert.age} years · ` : ''}{personWord(alert)} · last seen {alert.last_seen_place || alert.municipality_name}, {dayAndTime(alert.last_seen_time)}
        </Text>
      </View>
      <ShareAlertButton alert={alert} variant="primary" title="Share alert on WhatsApp, Facebook, X…" />

      {reach ? (
        <View style={styles.card}>
          <View style={styles.inlineBetween}>
            <Text style={styles.sectionTitle}>Escalation</Text>
            <Text style={styles.small}>Started {clock(alert.created_at)}</Text>
          </View>
          <Timeline alert={alert} reach={reach} />
          <Text style={styles.notified}>
            <Text style={styles.bold}>{notified.toLocaleString('en-ZA')}</Text> {notified === 1 ? 'person' : 'people'} notified so far
          </Text>
        </View>
      ) : null}

      <View style={styles.inlineBetween}>
        <Text style={styles.sectionTitle}>Spotted reports</Text>
        {sightings?.length ? <View style={[styles.chip, styles.chipLight]}><Text style={[styles.chipText, { color: colors.blue }]}>{sightings.length}</Text></View> : null}
      </View>
      {sightingsError ? <Text style={styles.small}>{sightingsError}</Text> : null}
      {sightings === null && !sightingsError ? <ActivityIndicator color={colors.blue} /> : null}
      {sightings && sightings.length === 0 ? (
        <View style={styles.infoBox}>
          <Text style={styles.small}>No sightings yet. Reports from people who received the alert appear here, and you get a notification for each one.</Text>
        </View>
      ) : null}
      {(sightings || []).map((s) => <SightingCard key={s.report_id} alert={alert} s={s} />)}

      {alert.can_resolve ? <Button title="Mark as found" variant="dark" onPress={onResolve} style={{ marginTop: 6 }} /> : null}
      {alert.relation === 'family' ? <Button title="I saw this person" variant="secondary" onPress={onSighting} /> : null}
      <Button title="Call SAPS (10111)" variant="outline" onPress={callSaps} />
    </ScrollView>
  );
}

// ------------------------------------------------------------- 10 resolved

function ResolvedView({ alert, reach, onBack }) {
  const first = firstName(alert.child_name);
  const family = alert.relation !== 'recipient';
  return (
    <ScrollView contentContainerStyle={[styles.scroll, styles.body]}>
      <View style={styles.resolvedHero}>
        <View style={styles.resolvedCheck}><CheckIcon size={28} /></View>
        <Text style={styles.resolvedTitle}>{first} has been found</Text>
        <Text style={[styles.small, { textAlign: 'center' }]}>
          The family confirmed that {alert.child_name} is safe. Thank you to everyone who looked out and reported sightings.
        </Text>
      </View>
      <View style={styles.card}>
        <Detail label="Reported missing" value={dateTime(alert.created_at)} />
        <Detail label="Found" value={alert.resolved_at ? dateTime(alert.resolved_at) : null} />
        <Detail label="Highest level" value={`Level ${alert.escalation_level}${alert.escalation_level === 4 ? ' · All users' : ''}`} />
        {family ? <Detail label="Sightings received" value={String(alert.sightings_count ?? 0)} /> : null}
        {family && reach ? (
          <Detail label="People notified" value={((reach.family || 0) + reach.levels.reduce((s, l) => s + (l.users || 0), 0)).toLocaleString('en-ZA')} />
        ) : null}
      </View>
      {!family ? <Text style={[styles.small, { textAlign: 'center' }]}>You will not receive further updates about this alert.</Text> : null}
      <Button title="Back to alerts" onPress={onBack} />
    </ScrollView>
  );
}

// ------------------------------------------------------------- PIN to resolve

function ResolvePin({ alert, onCancel, onResolved }) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await resolveAlert(alert.alert_id, pin);
      onResolved(result.alert);
    } catch (e) {
      setPin('');
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <View style={[styles.blueRoot, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      <KeyboardAvoidingView style={styles.pinWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.lockCircle}><CheckIcon size={30} /></View>
        <Text style={styles.pinTitle}>Mark {firstName(alert.child_name)} as found?</Text>
        <Text style={styles.pinBody}>
          Enter your PIN to confirm. The alert closes and everyone who received it is told that {alert.child_name} is safe.
        </Text>
        <PinInput value={pin} onChange={(v) => { setPin(v); setError(''); }} label="Your PIN" error={!!error} autoFocus />
        {error ? (
          <View style={styles.pinError} accessibilityRole="alert">
            <InfoIcon size={16} color={colors.white} />
            <Text style={styles.pinErrorText}>{error}</Text>
          </View>
        ) : null}
        <Button title="Confirm found" variant="outline" onPress={submit} loading={busy} disabled={pin.length !== 4} style={styles.stretch} />
        <Pressable onPress={onCancel} disabled={busy} hitSlop={10} accessibilityRole="button">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

// ------------------------------------------------------------- screen

export default function AlertDetailsScreen({ alertId, onBack }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null); // { alert, reach? }
  const [error, setError] = useState('');
  const [sightings, setSightings] = useState(null);
  const [sightingsError, setSightingsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('details'); // details | sighting | resolve

  const load = useCallback(async () => {
    try {
      const result = await getAlert(alertId);
      setData(result);
      setError('');
      if (result.alert.relation !== 'recipient') {
        listSightings(alertId)
          .then((list) => { setSightings(list); setSightingsError(''); })
          .catch((e) => setSightingsError(e.message));
      }
    } catch (e) {
      setError(e.message);
    }
  }, [alertId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />;

  if (data && view === 'sighting') {
    return <SpottedReportScreen alert={data.alert} onBack={() => setView('details')} onSent={() => { setView('details'); load(); }} />;
  }
  if (data && view === 'resolve') {
    return (
      <ResolvePin
        alert={data.alert}
        onCancel={() => setView('details')}
        onResolved={(alert) => { setData((d) => ({ ...d, alert })); setView('details'); load(); }}
      />
    );
  }

  const alert = data?.alert;
  const title = !alert ? 'Alert details'
    : alert.status === 'resolved' ? 'Alert details'
      : alert.relation === 'recipient' ? 'Missing person'
        : `${firstName(alert.child_name)}'s alert`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title={title} onBack={onBack} />
      {!data && !error ? (
        <View style={[styles.flex, styles.center]}><ActivityIndicator size="large" color={colors.blue} /></View>
      ) : !data ? (
        <EmptyState icon={<InfoIcon size={40} />} title="Could not load this alert" message={error}>
          <Button title="Try again" variant="secondary" onPress={onRefresh} style={styles.stretch} />
        </EmptyState>
      ) : alert.status === 'resolved' ? (
        <ResolvedView alert={alert} reach={data.reach} onBack={onBack} />
      ) : alert.relation === 'recipient' ? (
        <CommunityView alert={alert} onSighting={() => setView('sighting')} refresh={refresh} />
      ) : (
        <FamilyView
          alert={alert}
          reach={data.reach}
          sightings={sightings}
          sightingsError={sightingsError}
          onResolve={() => setView('resolve')}
          onSighting={() => setView('sighting')}
          refresh={refresh}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stretch: { alignSelf: 'stretch' },
  scroll: { paddingBottom: 32 },
  body: { paddingHorizontal: 20, gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  small: { fontSize: 12, lineHeight: 18, color: colors.ink3 },
  bold: { fontWeight: '800', color: colors.ink },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },

  photoHero: { marginHorizontal: 20, marginBottom: 14 },
  bigPhoto: {
    height: 260, borderRadius: radius.card, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  heroChip: { position: 'absolute', left: 12, top: 12, backgroundColor: colors.blue, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 5 },
  heroChipText: { fontSize: 11, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  name: { fontSize: 24, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 14, color: colors.ink2, marginTop: -6 },
  placeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.field,
    backgroundColor: colors.blueTint, borderWidth: 1.5, borderColor: colors.line,
  },
  placeText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  detail: { gap: 2 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: colors.ink3 },
  detailValue: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  searchBox: { gap: 3, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line },

  card: { gap: 12, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  familyHero: { marginTop: 4 },
  familyPhoto: {
    height: 220, borderRadius: radius.card, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  heroChipRight: { position: 'absolute', right: 12, top: 12 },
  smallPhoto: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  chip: { borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  chipSolid: { backgroundColor: colors.blue },
  chipDark: { backgroundColor: colors.blueDark },
  chipLight: { backgroundColor: colors.blueLight },
  chipText: { fontSize: 11, fontWeight: '700' },
  notified: { fontSize: 13, color: colors.ink2 },

  timeline: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 4 },
  stepTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepLine: { flex: 1, height: 3, backgroundColor: colors.line },
  stepLineOn: { backgroundColor: colors.blue },
  stepLineBlank: { flex: 1 },
  stepDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stepDotOn: { backgroundColor: colors.blue },
  stepDotOff: { backgroundColor: colors.blueLight, borderWidth: 1.5, borderColor: colors.line },
  stepDotText: { fontSize: 11, fontWeight: '800', color: colors.blue },
  stepLabel: { fontSize: 11, fontWeight: '600', color: colors.ink2, textAlign: 'center' },
  stepTime: { fontSize: 11, color: colors.ink3 },

  infoBox: { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint },
  sighting: { gap: 8, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line },
  sightingMeta: { fontSize: 12, fontWeight: '700', color: colors.ink2 },
  sightingText: { fontSize: 14, lineHeight: 20, color: colors.ink },
  sightingPhoto: { height: 180, borderRadius: 12, backgroundColor: colors.blueLight },
  mapButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  resolvedHero: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  resolvedCheck: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  resolvedTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' },

  blueRoot: { flex: 1, backgroundColor: colors.blueDark, paddingHorizontal: 24 },
  pinWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  lockCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  pinTitle: { fontSize: 22, fontWeight: '800', color: colors.white, textAlign: 'center' },
  pinBody: { fontSize: 14, lineHeight: 21, color: colors.heroText, textAlign: 'center', marginBottom: 8 },
  pinError: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.danger },
  pinErrorText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: colors.white },
  cancel: { fontSize: 15, fontWeight: '600', color: colors.heroText, padding: 8 },
});
