/*
Shown at the top of the Family tab when someone has invited this user to their
family group. Opens the invitations screen (accept / decline, or scan a QR code).
*/
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../theme';
import { ChevronIcon, FamilyTabIcon } from '../common/Icons';
import { invitationsHeading } from '../../utils/invitationText';

// list: the invitations (optional), so requests to share responsibility are named as such.
export default function InvitationsCard({ count, list, onOpen }) {
  if (!count) return null;
  const heading = list && list.length === count ? invitationsHeading(list) : invitationsHeading(Array(count).fill({}));
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${heading}. View`}
    >
      <View style={styles.tile}>
        <FamilyTabIcon size={22} active />
        <View style={styles.badge}><Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text></View>
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>
          {heading}
        </Text>
        <Text style={styles.meta}>Tap to accept or decline</Text>
      </View>
      <ChevronIcon color={colors.blue} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.blue, backgroundColor: colors.blueTint,
  },
  tile: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  flex: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.ink2, marginTop: 2 },
});
