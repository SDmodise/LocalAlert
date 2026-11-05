/*
Family tab for community members: the family groups they are linked to, with
each family's profiles (read-only). Linked members are told immediately when
anyone in these families is reported missing. Not linked yet? Join from here.
If the administrator shared responsibility with them, the profiles they can report
are marked, and they can step down (give the responsibility back).
*/
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import ScreenHeader from '../../components/common/ScreenHeader';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import AuthImage from '../../components/common/AuthImage';
import { CheckIcon, FamilyTabIcon, InfoIcon, PersonSilhouette } from '../../components/common/Icons';
import { getLinkedFamilies, leaveFamily, profilePhotoUrl, stepDown } from '../../services/family';
import { ageInYears } from '../../utils/idNumber';
import JoinFamilyScreen from './JoinFamilyScreen';
import InvitationsCard from '../../components/family/InvitationsCard';

function describe(p) {
  const age = ageInYears(p.date_of_birth);
  const child = age !== null && age < 18;
  const word = p.gender === 'Female' ? (child ? 'Girl' : 'Woman') : (child ? 'Boy' : 'Man');
  return age === null ? word : `${age} ${age === 1 ? 'year' : 'years'} · ${word}`;
}

function ProfileCard({ p, canReport }) {
  const verified = p.verification_status === 'verified';
  return (
    <View style={[styles.card, canReport && styles.cardShared]} accessibilityLabel={`${p.full_name}, ${describe(p)}${canReport ? ', you can report them missing' : ''}`}>
      <AuthImage
        uri={p.has_photo ? profilePhotoUrl(p.member_id) : null}
        style={styles.avatar}
        fallback={<PersonSilhouette size={36} />}
      />
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{p.full_name}</Text>
        <Text style={styles.cardMeta}>{describe(p)}</Text>
        {canReport ? <Text style={styles.sharedText}>You can report</Text> : null}
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

export default function LinkedFamilyScreen({ onFullScreen, invitations = 0, openInvitations, onInvitationsChanged, onResponsibilityChanged }) {
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
    onInvitationsChanged?.();
    setRefreshing(false);
  };

  const join = (open) => {
    setJoining(open);
    onFullScreen?.(open);
    if (!open) {
      onInvitationsChanged?.();
      onResponsibilityChanged?.();
      load();
    }
  };

  // Opened from a notification or the Notifications list.
  useEffect(() => {
    if (openInvitations) join(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvitations]);

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

  const confirmStepDown = (g) => {
    NativeAlert.alert(
      'Step down?',
      `You will no longer be able to report anyone in ${g.group_name} missing. You stay linked and still get their alerts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Step down',
          style: 'destructive',
          onPress: async () => {
            try {
              await stepDown(g.group_id);
              await load();
              onResponsibilityChanged?.();
            } catch (e) {
              NativeAlert.alert('Could not step down', e.message);
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
        {invitations ? (
          <View style={styles.invitesTop}><InvitationsCard count={invitations} onOpen={() => join(true)} /></View>
        ) : null}
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
        <InvitationsCard count={invitations} onOpen={() => join(true)} />
        {groups.map((g) => (
          <View key={g.group_id} style={styles.group}>
            <View>
              <Text style={styles.groupName}>{g.group_name}</Text>
              <Text style={styles.cardMeta}>
                Administrator: {g.administrator} · {g.members.length} linked {g.members.length === 1 ? 'member' : 'members'}
              </Text>
            </View>
            {(g.shared_profile_ids || []).length ? (
              <View style={styles.sharedBox}>
                <Text style={styles.sharedTitle}>Shared responsibility</Text>
                <Text style={styles.body}>
                  {g.administrator} shared the responsibility with you: you can report the marked people missing from the Alerts tab.
                </Text>
              </View>
            ) : null}
            {g.profiles.length === 0 ? (
              <Text style={styles.body}>No profiles have been added to this family yet.</Text>
            ) : (
              g.profiles.map((p) => (
                <ProfileCard key={p.member_id} p={p} canReport={(g.shared_profile_ids || []).includes(p.member_id)} />
              ))
            )}
            <View style={styles.actionsRow}>
              {(g.shared_profile_ids || []).length ? (
                <Pressable onPress={() => confirmStepDown(g)} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.link}>Step down</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => confirmLeave(g)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Leave this family</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <View style={styles.infoBox}>
          <InfoIcon size={18} color={colors.blue} />
          <Text style={[styles.body, styles.flex]}>
            You're told immediately if anyone in these families is reported missing, wherever you are. Only the family administrator, and people they share the responsibility with, can report someone missing.
          </Text>
        </View>
        <Button title="Join another family group" variant="secondary" onPress={() => join(true)} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  invitesTop: { paddingHorizontal: 20, paddingBottom: 4 },
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
  cardShared: { borderColor: colors.blue },
  sharedText: { fontSize: 12, fontWeight: '700', color: colors.blue, marginTop: 2 },
  sharedBox: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: colors.blueTint },
  sharedTitle: { fontSize: 12, fontWeight: '800', color: colors.blue, textTransform: 'uppercase', letterSpacing: 0.5 },
  actionsRow: { flexDirection: 'row', gap: 24 },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint,
  },
});
