/*
Profile > Delete account. Permanently deletes the account and the personal
information that belongs to it (POPIA). Needs the password and a final confirmation.
*/
import React, { useState } from 'react';
import { Alert as NativeAlert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import SubHeader from '../components/common/SubHeader';
import { InfoIcon } from '../components/common/Icons';
import { deleteMyAccount } from '../services/users';

export default function DeleteAccountScreen({ isAdmin, onBack, onDeleted }) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteMyAccount(password);
      NativeAlert.alert('Account deleted', 'Your account and personal information have been deleted.');
      onDeleted();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    NativeAlert.alert(
      'Delete your account?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: doDelete },
      ]
    );
  };

  const items = isAdmin
    ? [
        'Your account and contact details',
        'Your family group, with every profile, photo and ID document',
        'Your links to family members (they keep their own accounts)',
        'The alerts you created, with their sightings and notifications',
      ]
    : [
        'Your account and contact details',
        'Your notifications and your links to family groups',
        'Sighting reports you sent stay with the families, without your name',
      ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title="Delete account" onBack={onBack} disabled={busy} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.warning}>
            <InfoIcon size={20} color={colors.white} />
            <Text style={styles.warningText}>Deleting your account is permanent and cannot be undone.</Text>
          </View>

          <Text style={styles.heading}>What will be deleted</Text>
          {items.map((t) => (
            <View key={t} style={styles.item}>
              <View style={styles.bullet} />
              <Text style={styles.body}>{t}</Text>
            </View>
          ))}
          {isAdmin ? (
            <Text style={styles.note}>
              If someone in your family is in an open alert, mark them as found first.
            </Text>
          ) : null}

          <Input
            label="Your password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            error={error}
            returnKeyType="done"
            onSubmitEditing={confirm}
          />

          <Button title="Delete my account" variant="dark" onPress={confirm} loading={busy} />
          <Button title="Cancel" variant="secondary" onPress={onBack} disabled={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 14 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: colors.blueDark },
  warningText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.white, lineHeight: 20 },
  heading: { fontSize: 16, fontWeight: '700', color: colors.ink },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: -4 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue, marginTop: 7 },
  body: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink2 },
  note: { fontSize: 13, lineHeight: 19, color: colors.ink3 },
});
