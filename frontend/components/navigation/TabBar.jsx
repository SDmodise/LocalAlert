/*
Bottom tab bar (matches the Figma "Tab bar" component).
Family: administrators manage their group there; community members see the
families they are linked to. Notifications shows an unread count badge.
*/
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { AlertTabIcon, BellTabIcon, FamilyTabIcon, ProfileTabIcon } from '../common/Icons';

const ALL_TABS = [
  { key: 'alerts', label: 'Alerts', Icon: AlertTabIcon },
  { key: 'family', label: 'Family', Icon: FamilyTabIcon },
  { key: 'notifications', label: 'Notifications', Icon: BellTabIcon },
  { key: 'profile', label: 'Profile', Icon: ProfileTabIcon },
];

export function tabsForRole() {
  return ALL_TABS;
}

export default function TabBar({ role, active, onChange, badges = {} }) {
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
            accessibilityLabel={badges[key] ? `${label}, ${badges[key]} unread` : label}
          >
            <View>
              <Icon active={selected} />
              {badges[key] ? (
                <View style={styles.badge} accessibilityLabel={`${badges[key]} unread`}>
                  <Text style={styles.badgeText}>{badges[key] > 99 ? '99+' : badges[key]}</Text>
                </View>
              ) : null}
            </View>
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
  badge: {
    position: 'absolute', top: -6, right: -12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.blue, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
});
