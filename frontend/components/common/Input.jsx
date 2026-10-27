/*
Labelled text field with focus, error and hint states (matches the Figma inputs).
*/
import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../../theme';
import { InfoIcon } from './Icons';

export function FieldError({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <InfoIcon />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const Input = forwardRef(function Input(
  { label, error, hint, right, style, onFocus, onBlur, ...inputProps },
  ref
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, focused && styles.boxFocused, error && styles.boxError]}>
        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={colors.ink3}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          accessibilityLabel={label}
          {...inputProps}
        />
        {right}
      </View>
      <FieldError message={error} />
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

export default Input;

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  box: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.field,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  boxFocused: { borderColor: colors.blue },
  boxError: { borderColor: colors.blueDark, borderWidth: 2 },
  input: { flex: 1, height: '100%', fontSize: 15, color: colors.ink },
  hint: { fontSize: 12, color: colors.ink3 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.blueDark },
});
