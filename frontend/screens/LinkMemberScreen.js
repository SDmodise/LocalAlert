/*
13 Link a family member — matches Figma screen "13 Link a family member – QR and invite".
The family administrator shows a single-use QR code (valid 24 hours) or sends an
in-app invitation to an email address or phone number.
*/
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { colors, radius } from '../theme';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import SubHeader from '../components/common/SubHeader';
import { CheckIcon, ClockIcon, InfoIcon } from '../components/common/Icons';
import { createQrInvitation, sendInvitation } from '../services/invitations';

function timeLeft(expiresAt, now) {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export default function LinkMemberScreen({ groupId, groupName, onBack }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('qr');

  // QR code
  const [qr, setQr] = useState(null); // { value, expiresAt }
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const [now, setNow] = useState(Date.now());

  // Invitation
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onBack?.(); return true; });
    return () => sub.remove();
  }, [onBack]);

  // Refresh the countdown every 30 seconds.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const generate = useCallback(async () => {
    setQrLoading(true);
    setQrError('');
    try {
      const data = await createQrInvitation(groupId);
      setQr({ value: data.qr_value, expiresAt: data.invitation.expires_at });
      setNow(Date.now());
    } catch (e) {
      setQrError(e.message);
    } finally {
      setQrLoading(false);
    }
  }, [groupId]);

  useEffect(() => { generate(); }, [generate]);

  const send = async () => {
    setInviteError('');
    setSentTo('');
    if (!contact.trim()) {
      setInviteError('Enter their email address or mobile number.');
      return;
    }
    setSending(true);
    try {
      const result = await sendInvitation(groupId, contact.trim());
      setSentTo(result.message || `Invitation sent to ${contact.trim()}.`);
      setContact('');
    } catch (e) {
      setInviteError(e.message);
    } finally {
      setSending(false);
    }
  };

  const remaining = qr ? timeLeft(qr.expiresAt, now) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title="Link a family member" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.segment} accessibilityRole="tablist">
          {[['qr', 'QR code'], ['invite', 'Send invitation']].map(([key, label]) => (
            <Pressable key={key} style={[styles.segmentItem, tab === key && styles.segmentOn]} onPress={() => setTab(key)}
              accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
              <Text style={[styles.segmentText, tab === key && styles.segmentTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'qr' ? (
          <>
            <Text style={[styles.body, styles.center]}>
              Ask your family member to open LocalAlert, go to <Text style={styles.bold}>Profile › Join a family group</Text> and scan this code.
            </Text>

            <View style={styles.qrFrame} accessibilityLabel="Family QR code">
              {qrLoading ? (
                <ActivityIndicator color={colors.blue} />
              ) : qr && remaining ? (
                <QRCode value={qr.value} size={196} color={colors.blueDark} backgroundColor={colors.white} ecl="M" />
              ) : (
                <Text style={[styles.body, styles.center]}>{qrError || 'This code has expired.'}</Text>
              )}
            </View>

            {qr && remaining && !qrLoading ? (
              <View style={styles.expiryRow}>
                <ClockIcon />
                <Text style={styles.body}>Single use · expires in {remaining}</Text>
              </View>
            ) : null}

            <View style={styles.infoBox}>
              <Text style={styles.body}>
                Linked family members receive {groupName ? `${groupName}'s` : "this family's"} alerts and sightings immediately, wherever they are. They cannot create or resolve alerts.
              </Text>
            </View>

            <View style={styles.spacer} />
            <Button title="Generate a new code" variant="secondary" onPress={generate} loading={qrLoading} />
          </>
        ) : (
          <>
            <Text style={styles.body}>
              Enter the email address or mobile number of the person you want to link. An email address also gets the invitation by email. They accept it in LocalAlert under Profile › Join a family group. If they don't have an account yet, they will see it after signing up with the same email or number.
            </Text>
            <Input
              label="Email or mobile number"
              placeholder="e.g. sipho@example.com or 072 345 6789"
              value={contact}
              onChangeText={(t) => { setContact(t); setInviteError(''); }}
              error={inviteError}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={send}
            />
            {sentTo ? (
              <View style={styles.successBox} accessibilityRole="alert">
                <View style={styles.successBadge}><CheckIcon size={12} /></View>
                <Text style={[styles.body, styles.flex]}>{sentTo} It is valid for 24 hours.</Text>
              </View>
            ) : null}
            <View style={styles.spacer} />
            <Button title="Send invitation" onPress={send} loading={sending} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, gap: 14 },
  spacer: { flexGrow: 1, minHeight: 8 },
  body: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  bold: { fontWeight: '700', color: colors.ink },
  center: { textAlign: 'center' },

  segment: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: colors.blueLight },
  segmentItem: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.white },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  segmentTextOn: { color: colors.blue },

  qrFrame: {
    alignSelf: 'center', width: 236, height: 236, padding: 18, borderRadius: 20,
    borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  expiryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  infoBox: { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint },
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.field,
    borderWidth: 1.5, borderColor: colors.blue, backgroundColor: colors.blueTint,
  },
  successBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
});
