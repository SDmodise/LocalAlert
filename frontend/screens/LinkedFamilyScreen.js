/*
Family tab for community members: the family groups they are linked to, with
each family's profiles (read-only). Linked members are told immediately when
anyone in these families is reported missing. Not linked yet? Join from here.
*/
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';
import ScreenHeader from '../components/common/ScreenHeader';
import EmptyState from '../components/common/EmptyState';
import Button from '../components/common/Button';
import AuthImage from '../components/common/AuthImage';
import { CheckIcon, FamilyTabIcon, InfoIcon, PersonSilhouette } from '../components/common/Icons';
import { getLinkedFamilies, leaveFamily, profilePhotoUrl } from '../services/family';
import { ageInYears } from '../utils/idNumber';
import JoinFamilyScreen from './JoinFamilyScreen';

function describe(p) {
  const age = ageInYears(p.date_of_birth);
  const child = age !== null && age < 18;
  const word = p.gender === 'Female' ? (child ? 'Girl' : 'Woman') : (child ? 'Boy' : 'Man');
  return age === null ? word : `${age} ${age === 1 ? 'year' : 'years'} · ${word}`;
}

function ProfileCard({ p }) {
  const verified = p.verification_status === 'verified';
  return (
    <View style={styles.card} accessibilityLabel={`${p.full_name}, ${describe(p)}`}>
      <AuthImage
        uri={p.has_photo ? profilePhotoUrl(p.member_id) : null}
        style={styles.avatar}
        fallback={<PersonSilhouette size={36} />}
      />
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{p.full_name}</Text>
        <Text style={styles.cardMeta}>{describe(p)}</Text>
      </View>
      {verified ? (
        <View style={[styles.chip, styles.chipSolid]}>
          <CheckIcon size={11} />
          <Text style={[styles.chipText, { color: colors.white }]}>Verified</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function LinkedFamilyScreen({ onFullScreen }) {
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await getLinkedFamilies());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const join = (open) => {
    setJoining(open);
    onFullScreen?.(open);
    if (!open) load();
  };

  const confirmLeave = (g) => {
    NativeAlert.alert(
      `Leave ${g.group_name}?`,
      "You will no longer receive this family's alerts or see its profiles. The administrator can link you again later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveFamily(g.group_id);
              await load();
            } catch (e) {
              NativeAlert.alert('Could not leave the family group', e.message);
            }
          },
        },
      ]
    );
  };

  if (joining) return <JoinFamilyScreen onBack={() => join(false)} />;

  const root = [styles.root, { paddingTop: insets.top }];

  if (!groups && !error) {
    return <View style={[root, styles.center]}><ActivityIndicator size="large" color={colors.blue} /></View>;
  }

  if (!groups) {
    return (
      <View style={root}>
        <ScreenHeader title="Family" />
        <EmptyState icon={<InfoIcon size={40} />} title="Could not load your families" message={error}>
          <Button title="Try again" variant="secondary" onPress={onRefresh} style={styles.wide} />
        </EmptyState>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={root}>
        <ScreenHeader title="Family" />
        <EmptyState
          icon={<FamilyTabIcon size={44} active />}
          title="Not linked to a family yet"
          message="When a family administrator links you to their family, you'll see their profiles here and be told immediately if anyone in the family is reported missing."
        >
          <Button title="Join a family group" onPress={() => join(true)} style={styles.wide} />
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={root}>
      <ScreenHeader title="Family" subtitle="Linked family member" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
      >
        {groups.map((g) => (
          <View key={g.group_id} style={styles.group}>
            <View>
              <Text style={styles.groupName}>{g.group_name}</Text>
              <Text style={styles.cardMeta}>
                Administrator: {g.administrator} · {g.members.length} linked {g.members.length === 1 ? 'member' : 'members'}
              </Text>
            </View>
            {g.profiles.length === 0 ? (
              <Text style={styles.body}>No profiles have been added to this family yet.</Text>
            ) : (
              g.profiles.map((p) => <ProfileCard key={p.member_id} p={p} />)
            )}
            <Pressable onPress={() => confirmLeave(g)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
              <Text style={styles.link}>Leave this family</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.infoBox}>
          <InfoIcon size={18} color={colors.blue} />
          <Text style={[styles.body, styles.flex]}>
            You're told immediately if anyone in these families is reported missing, wherever you are. Only the family administrator can add profiles or report someone missing.
          </Text>
        </View>
        <Button title="Join another family group" variant="secondary" onPress={() => join(true)} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  wide: { alignSelf: 'stretch' },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  group: { gap: 10 },
  groupName: { fontSize: 18, fontWeight: '700', color: colors.ink },
  body: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 4 },
  chipSolid: { backgroundColor: colors.blue },
  chipText: { fontSize: 11, fontWeight: '700' },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint,
  },
});
