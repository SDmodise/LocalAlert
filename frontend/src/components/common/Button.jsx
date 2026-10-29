/*
Buttons matching the Figma components: primary, secondary, outline and dark,
plus danger for destructive actions.
*/
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../../theme';

const VARIANTS = {
  primary: { bg: colors.blue, fg: colors.white, border: colors.blue },
  secondary: { bg: colors.blueLight, fg: colors.blue, border: colors.blueLight },
  outline: { bg: colors.white, fg: colors.blue, border: colors.blue },
  dark: { bg: colors.blueDark, fg: colors.white, border: colors.blueDark },
  danger: { bg: colors.white, fg: colors.danger, border: colors.danger }, // destructive actions, e.g. Remove
};

export default function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, style }) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        (pressed || loading) && styles.pressed,
        disabled && !loading && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.text, { color: v.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radius.button,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  text: { fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
