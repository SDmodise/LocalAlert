/*
Bottom tab bar (matches the Figma "Tab bar" component).
The Family tab is only shown to Family Administrators (Phase 4, 4.7.1).
*/
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { AlertTabIcon, BellTabIcon, FamilyTabIcon, ProfileTabIcon } from '../common/Icons';

const ALL_TABS = [
  { key: 'alerts', label: 'Alerts', Icon: AlertTabIcon },
  { key: 'family', label: 'Family', Icon: FamilyTabIcon, adminOnly: true },
  { key: 'notifications', label: 'Notifications', Icon: BellTabIcon },
  { key: 'profile', label: 'Profile', Icon: ProfileTabIcon },
];

export function tabsForRole(role) {
  return ALL_TABS.filter((t) => !t.adminOnly || role === 'Family Administrator');
}

export default function TabBar({ role, active, onChange }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]} accessibilityRole="tablist">
      {tabsForRole(role).map(({ key, label, Icon }) => {
        const selected = key === active;
        return (
          <Pressable
            key={key}
            style={styles.tab}
            onPress={() => onChange(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
          >
            <Icon active={selected} />
            <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
  },
  tab: { alignItems: 'center', gap: 4, minWidth: 72, paddingVertical: 2 },
  label: { fontSize: 11, fontWeight: '600', color: colors.ink3 },
  labelActive: { color: colors.blue },
});
