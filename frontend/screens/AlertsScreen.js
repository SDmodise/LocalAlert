/*
05 Alerts — placeholder until alerts are built. Shows the empty state.
*/
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import ScreenHeader from '../components/common/ScreenHeader';
import EmptyState from '../components/common/EmptyState';
import { AlertTabIcon } from '../components/common/Icons';

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Alerts" subtitle="LocalAlert" />
      <EmptyState
        icon={<AlertTabIcon size={44} active />}
        title="No active alerts"
        message="When someone is reported missing in your area, the alert will appear here and you will get a notification."
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.white } });
