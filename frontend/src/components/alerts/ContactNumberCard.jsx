/*
"Number to call" on the family's alert screen: the number people call when they
see the missing person (empty = SAPS 10111). The family administrator can change
it in one sheet with two steps: the number, then the PIN to confirm.
(One sheet, not two: on Android a second pop-up opened while the first is closing
does not receive typing.)
*/
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import Button from '../common/Button';
import Input, { FieldError } from '../common/Input';
import PinInput from '../common/PinInput';
import { updateAlertContact } from '../../services/alerts';
import { formatPhone, normaliseContactNumber } from '../../utils/phone';

export default function ContactNumberCard({ alert, canEdit, onChanged }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('number'); // number | pin
  const [value, setValue] = useState('');
  const [number, setNumber] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = () => {
    setValue(alert.contact_number ? formatPhone(alert.contact_number) : '');
    setPin('');
    setError('');
    setStep('number');
    setOpen(true);
  };

  const close = () => {
    if (!busy) setOpen(false);
  };

  const next = () => {
    const normalised = normaliseContactNumber(value);
    if (normalised === null) {
      setError('Enter a South African number, e.g. 082 123 4567, or leave it empty to show SAPS (10111).');
      return;
    }
    if (normalised === (alert.contact_number || '')) {
      setOpen(false);
      return;
    }
    setNumber(normalised);
    setPin('');
    setError('');
    setStep('pin');
  };

  const save = async () => {
    if (pin.length !== 4) return;
    setBusy(true);
    setError('');
    try {
      const result = await updateAlertContact(alert.alert_id, number, pin);
      setBusy(false);
      setOpen(false);
      onChanged?.(result.alert);
    } catch (e) {
      setBusy(false);
      setPin('');
      setError(e.message);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.label}>Number to call if someone sees them</Text>
          <Text style={styles.value}>
            {alert.contact_number ? formatPhone(alert.contact_number) : 'SAPS (10111)'}
          </Text>
        </View>
        {canEdit ? (
          <Pressable onPress={start} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change the number to call">
            <Text style={styles.link}>Change</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.hint}>
        Shown to everyone who gets the alert and on shared links, on the "I have seen them" button.
      </Text>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
          <Pressable style={styles.flex} onPress={close} accessibilityLabel="Cancel" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            {step === 'number' ? (
              <>
                <Text style={styles.sheetTitle}>Number to call</Text>
                <Text style={styles.body}>
                  People who see {alert.child_name} will be asked to call this number. Leave it empty to show SAPS (10111).
                </Text>
                <Input
                  label="Phone number"
                  value={value}
                  onChangeText={(t) => { setValue(t); setError(''); }}
                  error={error}
                  placeholder="e.g. 082 123 4567"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  maxLength={18}
                  returnKeyType="done"
                  onSubmitEditing={next}
                  autoFocus
                />
                <Button title="Continue" onPress={next} />
                <Button title="Cancel" variant="secondary" onPress={close} />
              </>
            ) : (
              <>
                <Text style={[styles.sheetTitle, styles.center]}>Confirm with your PIN</Text>
                <Text style={[styles.body, styles.center]}>
                  {number
                    ? `People who see them will call ${formatPhone(number)}.`
                    : 'People who see them will be asked to call SAPS (10111).'}
                </Text>
                <PinInput
                  key="contact-pin"
                  value={pin}
                  onChange={(v) => { setPin(v); setError(''); }}
                  label="Your PIN"
                  error={!!error}
                  autoFocus
                />
                <FieldError message={error} />
                <Button title="Save" onPress={save} loading={busy} disabled={pin.length !== 4} />
                <Button title="Back" variant="secondary" onPress={() => { setStep('number'); setError(''); }} disabled={busy} />
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  label: { fontSize: 12, fontWeight: '600', color: colors.ink3 },
  value: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 2 },
  hint: { fontSize: 12, lineHeight: 17, color: colors.ink3 },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,51,0.45)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, lineHeight: 20, color: colors.ink2 },
});
