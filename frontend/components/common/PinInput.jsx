/*
Four-box PIN entry. A hidden numeric TextInput receives the digits;
the boxes show a dot for each digit typed.
*/
import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme';

export default function PinInput({ value, onChange, label, error, autoFocus = false }) {
  const inputRef = useRef(null);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      accessibilityLabel={`${label}, ${value.length} of 4 digits entered`}
    >
      <View style={styles.row}>
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
        autoFocus={autoFocus}
        secureTextEntry
        textContentType="oneTimeCode"
        style={styles.hidden}
        accessibilityLabel={label}
      />
    </Pressable>
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
  boxError: { borderColor: colors.blueDark },
  dot: { fontSize: 26, fontWeight: '700', color: colors.blue },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
