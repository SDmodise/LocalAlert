/*
Accepting shared responsibility (from an invitation, a request or a scanned QR code).
Reporting someone missing needs a PIN, so the person confirms with their PIN, or, if
they never had one (Community Members), creates one here (entered twice).
onAccept(pin) should throw an error with a message when the server refuses it.
*/
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import Button from '../common/Button';
import PinInput from '../common/PinInput';
import { FieldError } from '../common/Input';

export default function AcceptResponsibilitySheet({ visible, invitation, hasPin, onAccept, onCancel }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('pin'); // pin | confirm (creating a new PIN)
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) { setStep('pin'); setPin(''); setFirst(''); setError(''); setBusy(false); }
  }, [visible]);

  if (!invitation) return null;
  const names = (invitation.profiles || []).map((p) => p.full_name).join(', ');

  const submit = async (value) => {
    setBusy(true);
    setError('');
    try {
      await onAccept(value);
    } catch (e) {
      setBusy(false);
      setPin('');
      setError(e.message);
    }
  };

  const onPin = (value) => {
    setPin(value);
    setError('');
    if (value.length !== 4) return;
    if (hasPin) return; // confirmed with the Accept button
    if (step === 'pin') {
      setFirst(value);
      setPin('');
      setStep('confirm');
    } else if (value !== first) {
      setPin('');
      setFirst('');
      setStep('pin');
      setError("The PINs didn't match. Choose your PIN again.");
    } else {
      submit(value);
    }
  };

  const title = hasPin ? 'Confirm with your PIN'
    : step === 'pin' ? 'Create a PIN' : 'Enter the new PIN again';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={styles.flex} onPress={busy ? undefined : onCancel} accessibilityLabel="Cancel" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>
            You will be able to report {names || 'these family members'} missing for {invitation.group_name}.
            {hasPin ? '' : ' You will use this PIN to confirm alerts.'}
          </Text>
          <PinInput key={`${step}-${hasPin}`} value={pin} onChange={onPin} label={title} error={!!error} autoFocus />
          <FieldError message={error} />
          {hasPin ? (
            <Button title="Accept" onPress={() => submit(pin)} loading={busy} disabled={pin.length !== 4} />
          ) : busy ? (
            <Text style={styles.message}>Saving…</Text>
          ) : null}
          <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,51,0.45)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 22, gap: 14 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, color: colors.ink2, textAlign: 'center' },
});
