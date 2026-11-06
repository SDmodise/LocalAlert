/*
Profile > Reports (Family Administrators).

Family report: the family's alerts summed up from the live data (how many are
active, still missing or found, sightings, people alerted, average time until found,
how far each alert's search widened) and one card per alert.
Alert report (tap an alert): when it was reported, each level it reached, when they
were found, how many people were told at each level, and every sighting.
Both can be shared as text (WhatsApp, email, …) with the Share button.
*/
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, levelColor, radius } from '../../theme';
import Button from '../../components/common/Button';
import SubHeader from '../../components/common/SubHeader';
import { ChevronIcon, InfoIcon } from '../../components/common/Icons';
import { getAlertReport, getFamilyReport } from '../../services/reports';

const STATUS = {
  active: { label: 'Active', bg: colors.blueLight, fg: colors.blue },
  still_missing: { label: 'Still missing', bg: colors.blueDark, fg: colors.white },
  resolved: { label: 'Found', bg: '#E7F6EC', fg: '#146C2E' },
};

const dateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');

// 0.5 -> "30 min", 8 -> "8 h", 30.5 -> "1 day 6 h"
function duration(hours) {
  if (hours === null || hours === undefined) return '—';
  const totalMin = Math.round(hours * 60);
  if (totalMin < 60) return `${totalMin} min`;
  const days = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (days) return `${days} ${days === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
  return `${h} h${m ? ` ${m} min` : ''}`;
}

const statusOf = (s) => STATUS[s] || STATUS.active;

function Chip({ text, bg, fg }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function LevelChip({ level }) {
  const tone = levelColor(level);
  return <Chip text={`L${level}`} bg={tone.bg} fg={tone.fg} />;
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------- family report

function familyText(r) {
  const s = r.summary;
  const lines = [
    `LocalAlert family report: ${r.group_name}`,
    `Made ${dateTime(r.generated_at)}`,
    '',
    `Profiles: ${s.profiles} (${s.verified_profiles} verified). Linked family members: ${s.linked_members}.`,
    `Alerts: ${s.alerts} (active ${s.active}, still missing ${s.still_missing}, found ${s.found}).`,
    `Sightings reported: ${s.sightings}. People alerted: ${s.people_alerted}.`,
    `Average time until found: ${duration(s.average_hours_to_found)}.`,
    `Search widened to: ${r.by_level.map((l) => `Level ${l.level} ${l.alerts}`).join(', ')}.`,
  ];
  if (r.alerts.length) {
    lines.push('', 'Alerts:');
    r.alerts.forEach((a) => lines.push(
      `- ${a.child_name}: ${statusOf(a.status).label}, Level ${a.escalation_level}, reported ${dateTime(a.created_at)}`
      + `${a.status === 'resolved' ? `, found after ${duration(a.hours_open)}` : `, missing for ${duration(a.hours_open)}`}, ${a.sightings} sightings.`
    ));
  }
  return lines.join('\n');
}

function FamilyReport({ report, onOpen }) {
  const s = report.summary;
  const max = Math.max(1, ...report.by_level.map((l) => l.alerts));
  return (
    <>
      <View>
        <Text style={styles.heading} accessibilityRole="header">{report.group_name}</Text>
        <Text style={styles.caption}>Family report · made {dateTime(report.generated_at)}</Text>
      </View>

      <View style={styles.statGrid}>
        <Stat label="Alerts" value={s.alerts} />
        <Stat label="Active" value={s.active} />
        <Stat label="Still missing" value={s.still_missing} />
        <Stat label="Found" value={s.found} />
        <Stat label="Sightings" value={s.sightings} />
        <Stat label="People alerted" value={s.people_alerted} />
      </View>

      <View style={styles.card}>
        <Row label="Average time until found" value={duration(s.average_hours_to_found)} />
        <View style={styles.divider} />
        <Row label="Profiles" value={`${s.profiles} (${s.verified_profiles} verified)`} />
        <View style={styles.divider} />
        <Row label="Linked family members" value={String(s.linked_members)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How far the search widened</Text>
        <Text style={styles.caption}>Alerts that reached each level</Text>
        {report.by_level.map((l) => (
          <View key={l.level} style={styles.barRow} accessibilityLabel={`Level ${l.level}: ${l.alerts} alerts`}>
            <LevelChip level={l.level} />
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: `${(l.alerts / max) * 100}%`, backgroundColor: levelColor(l.level).bg }]} />
            </View>
            <Text style={styles.barValue}>{l.alerts}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Alerts</Text>
      {report.alerts.length === 0 ? (
        <View style={[styles.card, styles.row]}>
          <InfoIcon size={18} />
          <Text style={[styles.body, styles.flex]}>No alerts yet. The report fills in when someone in your family is reported missing.</Text>
        </View>
      ) : report.alerts.map((a) => (
        <Pressable key={a.alert_id} onPress={() => onOpen(a)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
          accessibilityRole="button" accessibilityLabel={`${a.child_name}, ${statusOf(a.status).label}, Level ${a.escalation_level}. Open report`}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, styles.flex]} numberOfLines={1}>{a.child_name}</Text>
            <Chip text={statusOf(a.status).label} bg={statusOf(a.status).bg} fg={statusOf(a.status).fg} />
            <LevelChip level={a.escalation_level} />
            <ChevronIcon />
          </View>
          <Text style={styles.body}>Reported {dateTime(a.created_at)}{a.reported_by ? ` by ${a.reported_by}` : ''}</Text>
          <Text style={styles.body}>
            {a.status === 'resolved' ? `Found after ${duration(a.hours_open)}` : `Missing for ${duration(a.hours_open)}`}
            {' · '}{a.sightings} {a.sightings === 1 ? 'sighting' : 'sightings'} · {a.people_alerted} alerted
          </Text>
        </Pressable>
      ))}
    </>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.body, styles.flex]}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// -------------------------------------------------------------- alert report

function alertText(r) {
  const a = r.alert;
  const lines = [
    `LocalAlert report: ${a.child_name}`,
    `Made ${dateTime(r.generated_at)}`,
    '',
    `Status: ${statusOf(a.status).label}, Level ${a.escalation_level}.`,
    `Reported missing ${dateTime(a.created_at)}${a.reported_by ? ` by ${a.reported_by}` : ''}, last seen ${a.last_seen_place || a.municipality_name || 'unknown'}.`,
    a.status === 'resolved' ? `Found ${dateTime(a.resolved_at)}, after ${duration(a.hours_open)}.` : `Missing for ${duration(a.hours_open)}.`,
    `People alerted: ${r.people_alerted.total} (family ${r.people_alerted.family}; ${r.people_alerted.by_level.map((l) => `L${l.level} ${l.users}`).join(', ')}).`,
    '',
    'Timeline:',
    ...r.timeline.map((t) => `- ${dateTime(t.at)}: ${t.event}`),
    '',
    `Sightings (${r.sightings.length}):`,
    ...(r.sightings.length ? r.sightings.map((s) => `- ${dateTime(s.reported_at)}: ${s.description || 'No description'}`
      + `${s.km_from_last_seen !== null ? ` (${s.km_from_last_seen} km from where they were last seen)` : ''}${s.has_photo ? ', with photo' : ''}.`) : ['- None']),
  ];
  return lines.join('\n');
}

function AlertReport({ report }) {
  const a = report.alert;
  const st = statusOf(a.status);
  return (
    <>
      <View style={{ gap: 8 }}>
        <Text style={styles.heading} accessibilityRole="header">{a.child_name}</Text>
        <View style={styles.row}>
          <Chip text={st.label} bg={st.bg} fg={st.fg} />
          <LevelChip level={a.escalation_level} />
        </View>
        <Text style={styles.caption}>Alert report · made {dateTime(report.generated_at)}</Text>
      </View>

      <View style={styles.card}>
        <Row label="Reported" value={dateTime(a.created_at)} />
        <View style={styles.divider} />
        <Row label="Reported by" value={a.reported_by || '—'} />
        <View style={styles.divider} />
        <Row label="Last seen" value={a.last_seen_place || a.municipality_name || '—'} />
        <View style={styles.divider} />
        {a.status === 'resolved' ? (
          <>
            <Row label="Found" value={dateTime(a.resolved_at)} />
            <View style={styles.divider} />
            <Row label="Time until found" value={duration(a.hours_open)} />
          </>
        ) : (
          <Row label="Missing for" value={duration(a.hours_open)} />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>People alerted: {report.people_alerted.total}</Text>
        <Row label="Linked family" value={String(report.people_alerted.family)} />
        {report.people_alerted.by_level.map((l) => (
          <View key={l.level} style={styles.row}>
            <LevelChip level={l.level} />
            <Text style={[styles.body, styles.flex]}>{['Their municipality', 'Neighbouring municipalities', 'The next ring of municipalities', 'All LocalAlert users'][l.level - 1]}</Text>
            <Text style={styles.rowValue}>{l.level <= a.escalation_level ? l.users : '—'}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Timeline</Text>
      <View style={styles.card}>
        {report.timeline.map((t, i) => (
          <View key={`${t.at}-${i}`} style={styles.timelineRow}>
            <View style={styles.dot} />
            <View style={styles.flex}>
              <Text style={styles.caption}>{dateTime(t.at)}</Text>
              <Text style={styles.body}>{t.event}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Sightings ({report.sightings.length})</Text>
      {report.sightings.length === 0 ? (
        <View style={styles.card}><Text style={styles.body}>No sightings were reported for this alert.</Text></View>
      ) : (
        <View style={styles.card}>
          {report.sightings.map((s, i) => (
            <View key={`${s.reported_at}-${i}`} style={{ gap: 2 }}>
              {i ? <View style={[styles.divider, { marginBottom: 8 }]} /> : null}
              <Text style={styles.caption}>
                {dateTime(s.reported_at)}{s.reported_by ? ` · ${s.reported_by}` : ''}
                {s.km_from_last_seen !== null ? ` · ${s.km_from_last_seen} km from last seen` : ''}
              </Text>
              <Text style={styles.body}>{s.description || 'No description'}{s.has_photo ? ' (with photo)' : ''}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ------------------------------------------------------------------- screen

export default function ReportsScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [family, setFamily] = useState(null);
  const [alertReport, setAlertReport] = useState(null); // the open alert's report
  const [openAlert, setOpenAlert] = useState(null); // { alert_id, child_name } while loading it
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadFamily = useCallback(async () => {
    setError('');
    try {
      setFamily(await getFamilyReport());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadAlert = useCallback(async (alertId) => {
    setError('');
    try {
      setAlertReport(await getAlertReport(alertId));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { loadFamily(); }, [loadFamily]);

  const open = (a) => {
    setOpenAlert(a);
    setAlertReport(null);
    loadAlert(a.alert_id);
  };

  const back = () => {
    if (openAlert) { setOpenAlert(null); setAlertReport(null); setError(''); } else onBack();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await (openAlert ? loadAlert(openAlert.alert_id) : loadFamily());
    setRefreshing(false);
  };

  const share = () => {
    const message = openAlert ? alertText(alertReport) : familyText(family);
    Share.share({ message, title: openAlert ? `Report: ${alertReport.alert.child_name}` : 'LocalAlert family report' }).catch(() => {});
  };

  const shown = openAlert ? alertReport : family;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title={openAlert ? 'Alert report' : 'Reports'} onBack={back} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
      >
        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <InfoIcon size={18} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!shown && !error ? <ActivityIndicator color={colors.blue} style={{ marginTop: 32 }} /> : null}

        {shown ? (
          <>
            {openAlert ? <AlertReport report={alertReport} /> : <FamilyReport report={family} onOpen={open} />}
            <Button title="Share report" variant="outline" onPress={share} />
            <Text style={[styles.caption, styles.center]}>Made from LocalAlert's live data. Pull down to refresh.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  center: { textAlign: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: colors.ink },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 4 },
  caption: { fontSize: 12, color: colors.ink3 },
  body: { fontSize: 13, lineHeight: 19, color: colors.ink2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { fontSize: 13, fontWeight: '700', color: colors.ink, textAlign: 'right', flexShrink: 1 },
  card: { gap: 8, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  divider: { height: 1, backgroundColor: colors.line },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '31%', flexGrow: 1, padding: 12, borderRadius: 14, backgroundColor: colors.blueTint, borderWidth: 1.5, borderColor: colors.line },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.blue },
  statLabel: { fontSize: 12, fontWeight: '600', color: colors.ink2, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.blueTint, overflow: 'hidden' },
  bar: { height: 12, borderRadius: 6 },
  barValue: { width: 24, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.ink },
  chip: { borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '800' },
  timelineRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue, marginTop: 4 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.dangerTint, borderWidth: 1.5, borderColor: colors.danger },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.danger },
});
