import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

export default function EmptyState({ icon, title, message, children }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>{icon}</View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  circle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 21, color: colors.ink2, textAlign: 'center' },
});
