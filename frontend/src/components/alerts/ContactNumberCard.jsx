/*
"Number to call" on the family's alert screen: the number people call when they
see the missing person (empty = SAPS 10111). The family administrator can change
it; the change is confirmed with the PIN.
*/
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import Button from '../common/Button';
import Input from '../common/Input';
import PinSheet from '../common/PinSheet';
import { updateAlertContact } from '../../services/alerts';
import { formatPhone, normaliseContactNumber } from '../../utils/phone';

export default function ContactNumberCard({ alert, canEdit, onChanged }) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [askPin, setAskPin] = useState(false);
  const [number, setNumber] = useState('');

  const start = () => {
    setValue(alert.contact_number ? formatPhone(alert.contact_number) : '');
    setError('');
    setEditing(true);
  };

  const next = () => {
    const normalised = normaliseContactNumber(value);
    if (normalised === null) {
      setError('Enter a South African number, e.g. 082 123 4567, or leave it empty to show SAPS (10111).');
      return;
    }
    if (normalised === (alert.contact_number || '')) {
      setEditing(false);
      return;
    }
    setNumber(normalised);
    setEditing(false);
    setAskPin(true);
  };

  const save = async (pin) => {
    const result = await updateAlertContact(alert.alert_id, number, pin);
    setAskPin(false);
    onChanged?.(result.alert);
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

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.flex} onPress={() => setEditing(false)} accessibilityLabel="Cancel" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
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
            <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PinSheet
        visible={askPin}
        title="Confirm with your PIN"
        message={number ? `People who see them will call ${formatPhone(number)}.` : 'People who see them will be asked to call SAPS (10111).'}
        confirmTitle="Save"
        onConfirm={save}
        onCancel={() => setAskPin(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  label: { fontSize: 12, fontWeight: '600', color: colors.ink3 },
  value: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 2 },
  hint: { fontSize: 12, lineHeight: 17, color: colors.ink3 },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,51,0.45)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, lineHeight: 20, color: colors.ink2 },
});
