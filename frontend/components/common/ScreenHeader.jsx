import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

// Large page title used on the tab screens, with an optional line above it.
export default function ScreenHeader({ title, subtitle, right }) {
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  flex: { flex: 1 },
  subtitle: { fontSize: 12, color: colors.ink3 },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
});
