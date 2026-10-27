/*
11 Family Link — placeholder until Family Link is built (Family Administrators only).
*/
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import ScreenHeader from '../components/common/ScreenHeader';
import EmptyState from '../components/common/EmptyState';
import { FamilyTabIcon } from '../components/common/Icons';

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Family Link" />
      <EmptyState
        icon={<FamilyTabIcon size={44} active />}
        title="Your family group"
        message="Here you will create your family group, add profiles and link family members. This is the next part being built."
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.white } });
