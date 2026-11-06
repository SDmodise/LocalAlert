/*
Four-box PIN entry. The boxes show a dot for each digit typed.

An invisible numeric TextInput lies on top of the boxes, so tapping them taps the
input itself and Android always opens the keyboard. (A tiny off-screen input that was
focused from code did not reliably open the keyboard inside pop-up sheets.)
autoFocus waits for the sheet to finish sliding in before focusing, for the same reason.
*/
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme';

export default function PinInput({ value, onChange, label, error, autoFocus = false }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!autoFocus) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  return (
    <View accessibilityLabel={`${label}, ${value.length} of 4 digits entered`}>
      <View style={styles.row} pointerEvents="none">
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.box,
              i < value.length && styles.boxFilled,
              error && styles.boxError,
            ]}
          >
            <Text style={styles.dot}>{i < value.length ? '•' : ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        textContentType="oneTimeCode"
        caretHidden
        contextMenuHidden
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  box: {
    width: 56,
    height: 64,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  boxFilled: { borderColor: colors.blue },
  boxError: { borderColor: colors.danger },
  dot: { fontSize: 26, fontWeight: '700', color: colors.blue },
  // Covers the boxes, invisible: taps on the boxes go straight to it.
  input: { ...StyleSheet.absoluteFillObject, color: 'transparent', backgroundColor: 'transparent', opacity: 0.02, fontSize: 1 },
});
