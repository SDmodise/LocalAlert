/*
Tick the verified profiles to share (Hand over responsibility). Profiles without a
verified ID number are shown greyed out: they can't be reported, so they can't be shared.
*/
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../theme';
import AuthImage from '../common/AuthImage';
import { CheckIcon, PersonSilhouette } from '../common/Icons';
import { profilePhotoUrl } from '../../services/family';

export default function ProfilePicker({ profiles, selected, onChange }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <View style={styles.list}>
      {profiles.map((p) => {
        const verified = p.verification_status === 'verified';
        const on = selected.includes(p.member_id);
        return (
          <Pressable
            key={p.member_id}
            onPress={verified ? () => toggle(p.member_id) : undefined}
            style={[styles.row, on && styles.rowOn, !verified && styles.rowOff]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: !verified }}
            accessibilityLabel={`${p.full_name}${verified ? '' : ', pending ID, cannot be shared'}`}
          >
            <AuthImage
              uri={p.has_photo ? profilePhotoUrl(p.member_id) : null}
              style={styles.avatar}
              fallback={<PersonSilhouette size={28} />}
            />
            <View style={styles.flex}>
              <Text style={styles.name}>{p.full_name}</Text>
              <Text style={styles.meta}>{verified ? 'Verified' : 'Pending ID – cannot be shared'}</Text>
            </View>
            <View style={[styles.box, on && styles.boxOn]}>{on ? <CheckIcon size={12} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  rowOn: { borderColor: colors.blue, backgroundColor: colors.blueTint },
  rowOff: { opacity: 0.5 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  flex: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.ink3, marginTop: 1 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
});
