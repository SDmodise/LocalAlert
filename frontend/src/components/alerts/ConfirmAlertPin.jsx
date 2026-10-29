/*
Screen 15: the administrator enters their PIN and the alert is sent.
The server checks the PIN; the alert only goes out if it is right.
*/
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import Button from '../common/Button';
import PinInput from '../common/PinInput';
import { InfoIcon, PinIcon } from '../common/Icons';
import { createAlert } from '../../services/alerts';

export default function ConfirmAlertPin({ draft, onCancel, onSent }) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (pin.length !== 4) {
      setError('Enter your 4-digit PIN.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await createAlert({
        member_id: draft.memberId,
        latitude: draft.location.latitude,
        longitude: draft.location.longitude,
        last_seen_place: draft.location.place,
        last_seen_time: draft.lastSeen.toISOString(),
        clothing_description: draft.clothing,
        pin,
      }, draft.newPhoto);
      onSent(result);
    } catch (e) {
      setPin('');
      setError(e.message);
      setSending(false);
    }
  };

  return (
    <View style={[styles.blueRoot, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      <KeyboardAvoidingView style={styles.pinWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.lockCircle}><PinIcon size={34} color={colors.white} /></View>
        <Text style={styles.pinTitle}>Enter your PIN to send</Text>
        <Text style={styles.pinBody}>
          The alert for <Text style={styles.boldWhite}>{draft.profile.full_name}</Text> will go out immediately.
        </Text>
        <PinInput value={pin} onChange={(v) => { setPin(v); setError(''); }} label="Your PIN" error={!!error} autoFocus />
        {error ? (
          <View style={styles.pinError} accessibilityRole="alert">
            <InfoIcon size={16} color={colors.white} />
            <Text style={styles.pinErrorText}>{error}</Text>
          </View>
        ) : null}
        <Button title="Send alert" variant="outline" onPress={send} loading={sending} disabled={pin.length !== 4} style={styles.sendButton} />
        <Pressable onPress={onCancel} disabled={sending} hitSlop={10} accessibilityRole="button">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  blueRoot: { flex: 1, backgroundColor: colors.blue, paddingHorizontal: 24 },
  pinWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  lockCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  pinTitle: { fontSize: 22, fontWeight: '800', color: colors.white, textAlign: 'center' },
  pinBody: { fontSize: 14, lineHeight: 21, color: colors.heroText, textAlign: 'center', marginBottom: 8 },
  boldWhite: { fontWeight: '700', color: colors.white },
  pinError: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: colors.danger,
  },
  pinErrorText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: colors.white },
  sendButton: { alignSelf: 'stretch', marginTop: 8 },
  cancel: { fontSize: 15, fontWeight: '600', color: colors.heroText, padding: 8 },
});
