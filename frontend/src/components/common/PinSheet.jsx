/*
Bottom sheet asking for the 4-digit PIN to confirm a sensitive action
(saving profile changes, removing a profile). onConfirm(pin) should throw
an error with a message if the server rejects it; the sheet then shows it.
*/
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../../theme';
import Button from './Button';
import PinInput from './PinInput';
import { FieldError } from './Input';

export default function PinSheet({ visible, title, message, confirmTitle = 'Confirm', danger = false, onConfirm, onCancel }) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) { setPin(''); setError(''); setBusy(false); }
  }, [visible]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(pin);
    } catch (e) {
      setPin('');
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.flex} onPress={busy ? undefined : onCancel} accessibilityLabel="Cancel" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <PinInput value={pin} onChange={(v) => { setPin(v); setError(''); }} label="Your PIN" error={!!error} autoFocus />
          <FieldError message={error} />
          <Button
            title={confirmTitle}
            variant={danger ? 'dark' : 'primary'}
            onPress={confirm}
            loading={busy}
            disabled={pin.length !== 4}
          />
          <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,51,0.45)' },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 22, gap: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, color: colors.ink2, textAlign: 'center' },
});
