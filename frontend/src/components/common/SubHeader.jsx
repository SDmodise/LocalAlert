import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { BackIcon, CloseIcon } from './Icons';

// Header for screens opened from a tab: back (or close) button and a title.
export default function SubHeader({ title, onBack, close = false, light = false, disabled = false }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        disabled={disabled}
        style={[styles.button, light && styles.buttonLight]}
        accessibilityRole="button"
        accessibilityLabel={close ? 'Close' : 'Back'}
        hitSlop={8}
      >
        {close ? <CloseIcon color={light ? colors.white : colors.blue} /> : <BackIcon color={light ? colors.white : colors.blue} />}
      </Pressable>
      <Text style={[styles.title, light && { color: colors.white }]} accessibilityRole="header">{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  button: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'center' },
  buttonLight: { backgroundColor: 'rgba(255,255,255,0.15)' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.ink },
});
