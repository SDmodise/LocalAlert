/*
17 Notifications — placeholder until notifications are built. Shows the empty state.
*/
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import ScreenHeader from '../components/common/ScreenHeader';
import EmptyState from '../components/common/EmptyState';
import { BellTabIcon } from '../components/common/Icons';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Notifications" />
      <EmptyState
        icon={<BellTabIcon size={44} active />}
        title="No notifications yet"
        message="Alerts, sightings and updates about alerts you received will be listed here."
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.white } });
