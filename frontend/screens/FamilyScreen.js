/*
11 Family Link — matches Figma screen "11 Family Link – Group".
Family Administrators only. Creates the family group and lists its profiles
and linked family members. "Add profile" opens AddProfileScreen.
*/
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import Input from '../components/common/Input';
import ScreenHeader from '../components/common/ScreenHeader';
import EmptyState from '../components/common/EmptyState';
import AuthImage from '../components/common/AuthImage';
import { CheckIcon, FamilyTabIcon, InfoIcon, PersonSilhouette, PlusIcon } from '../components/common/Icons';
import { createFamilyGroup, getMyFamilyGroup, profilePhotoUrl } from '../services/family';
import { ageInYears } from '../utils/idNumber';
import AddProfileScreen from './AddProfileScreen';

function describe(profile) {
  const age = ageInYears(profile.date_of_birth);
  const child = age !== null && age < 18;
  const word = profile.gender === 'Female' ? (child ? 'Girl' : 'Woman') : (child ? 'Boy' : 'Man');
  return age === null ? word : `${age} ${age === 1 ? 'year' : 'years'} · ${word}`;
}

function ProfileCard({ profile }) {
  const verified = profile.verification_status === 'verified';
  return (
    <View style={styles.card} accessibilityLabel={`${profile.full_name}, ${describe(profile)}, ${verified ? 'verified' : 'pending ID'}`}>
      <AuthImage
        uri={profile.has_photo ? profilePhotoUrl(profile.member_id) : null}
        style={styles.avatar}
        fallback={<PersonSilhouette size={36} />}
      />
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{profile.full_name}</Text>
        <Text style={styles.cardMeta}>{describe(profile)}</Text>
      </View>
      {verified ? (
        <View style={[styles.chip, styles.chipSolid]}>
          <CheckIcon size={11} />
          <Text style={[styles.chipText, { color: colors.white }]}>Verified</Text>
        </View>
      ) : (
        <View style={[styles.chip, styles.chipOutline]}>
          <Text style={[styles.chipText, { color: colors.ink2 }]}>Pending ID</Text>
        </View>
      )}
    </View>
  );
}

function initials(m) {
  return `${(m.first_name || '?')[0]}${(m.last_name || '')[0] || ''}`.toUpperCase();
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null); // { group, profiles, members }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  // Create-group form
  const [groupName, setGroupName] = useState('');
  const [groupError, setGroupError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await getMyFamilyGroup());
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

  const createGroup = async () => {
    const name = groupName.trim();
    if (name.length < 2) {
      setGroupError('Enter a name for your family group.');
      return;
    }
    setCreating(true);
    setGroupError('');
    try {
      await createFamilyGroup(name);
      await load();
    } catch (e) {
      setGroupError(e.message);
    } finally {
      setCreating(false);
    }
  };

  if (adding && data?.group) {
    return (
      <AddProfileScreen
        groupId={data.group.group_id}
        onCancel={() => setAdding(false)}
        onSaved={async () => {
          setAdding(false);
          await load();
        }}
      />
    );
  }

  const root = [styles.root, { paddingTop: insets.top }];

  if (loading) {
    return (
      <View style={[root, styles.center]}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={root}>
        <ScreenHeader title="Family Link" />
        <EmptyState icon={<InfoIcon size={40} />} title="Could not load your family group" message={error}>
          <Button title="Try again" variant="secondary" onPress={onRefresh} style={styles.wide} />
        </EmptyState>
      </View>
    );
  }

  // No group yet: create one.
  if (!data?.group) {
    return (
      <View style={root}>
        <ScreenHeader title="Family Link" />
        <ScrollView contentContainerStyle={styles.createContent} keyboardShouldPersistTaps="handled">
          <View style={styles.illustration}><FamilyTabIcon size={44} active /></View>
          <Text style={styles.heading}>Create your family group</Text>
          <Text style={styles.body}>
            Add the people you may one day need to report missing, so their details and photo are ready in an emergency. You can then link family members who should be told straight away.
          </Text>
          <Input
            label="Family group name"
            placeholder="e.g. Mokoena Family"
            value={groupName}
            onChangeText={(t) => { setGroupName(t); setGroupError(''); }}
            error={groupError}
            autoCapitalize="words"
            maxLength={100}
            returnKeyType="done"
            onSubmitEditing={createGroup}
          />
          <Button title="Create family group" onPress={createGroup} loading={creating} />
        </ScrollView>
      </View>
    );
  }

  const { group, profiles, members } = data;

  return (
    <View style={root}>
      <ScreenHeader
        title={group.group_name}
        subtitle="Family Link"
        right={
          <Pressable style={styles.roundButton} onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="Add profile" hitSlop={6}>
            <PlusIcon />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}
      >
        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <InfoIcon size={18} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Profiles</Text>
          <Pressable onPress={() => setAdding(true)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>+ Add profile</Text>
          </Pressable>
        </View>

        {profiles.length === 0 ? (
          <View style={styles.infoBox}>
            <Text style={styles.body}>
              No profiles yet. Add a profile for each person you may need to report missing, such as your children.
            </Text>
            <Button title="Add a profile" variant="secondary" onPress={() => setAdding(true)} />
          </View>
        ) : (
          profiles.map((p) => <ProfileCard key={p.member_id} profile={p} />)
        )}

        {profiles.some((p) => p.verification_status !== 'verified') && (
          <Text style={styles.caption}>
            Profiles marked Pending ID have no verified ID number and cannot be used in an alert yet.
          </Text>
        )}

        <View style={[styles.sectionRow, { marginTop: 8 }]}>
          <Text style={styles.sectionTitle}>Linked family members</Text>
        </View>
        {members.length === 0 ? (
          <View style={styles.infoBox}>
            <Text style={styles.body}>
              No family members linked yet. Linked members receive this family's alerts immediately, wherever they are. Inviting them by invitation or QR code is the next part being built.
            </Text>
          </View>
        ) : (
          <View style={styles.membersRow}>
            <View style={styles.avatars}>
              {members.slice(0, 4).map((m, i) => (
                <View key={m.user_id} style={[styles.memberAvatar, i > 0 && { marginLeft: -8 }]}>
                  <Text style={styles.memberInitials}>{initials(m)}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.body, styles.flex]}>
              You and {members.length} linked {members.length === 1 ? 'member' : 'members'} receive this family's alerts immediately.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  wide: { alignSelf: 'stretch' },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  createContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },

  illustration: {
    alignSelf: 'center', marginTop: 8, width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'center',
  },
  heading: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  caption: { fontSize: 12, lineHeight: 18, color: colors.ink3 },
  link: { fontSize: 13, fontWeight: '600', color: colors.blue },

  roundButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },

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
  chipOutline: { borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  chipText: { fontSize: 11, fontWeight: '700' },

  infoBox: { gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint },
  membersRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatars: { flexDirection: 'row' },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blue,
    borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  memberInitials: { fontSize: 13, fontWeight: '800', color: colors.white },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
    backgroundColor: colors.blueTint, borderWidth: 1.5, borderColor: colors.blueDark,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.blueDark },
});
