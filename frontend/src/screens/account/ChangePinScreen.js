/*
Profile > Change PIN (Family Administrators, and anyone who made a PIN to share responsibility).

1. Current PIN, or "Forgot your PIN?" -> the account password instead.
2. New 4-digit PIN.
3. The new PIN again.
The server checks the current PIN (or password) when the change is sent:
PUT /api/users/me/pin.
*/
import React, { useState } from 'react';
import { Alert as NativeAlert, KeyboardAvoidingView,  Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import Button from '../../components/common/Button';
import Input, { FieldError } from '../../components/common/Input';
import PinInput from '../../components/common/PinInput';
import SubHeader from '../../components/common/SubHeader';
import { changeMyPin } from '../../services/users';

const STEPS = { current: 1, new: 2, confirm: 3 };

export default function ChangePinScreen({ onBack, onDone }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('current'); // current | new | confirm
  const [usePassword, setUsePassword] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [password, setPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const goTo = (next, message = '') => {
    setError(message);
    setStep(next);
  };

  const send = async (finalPin) => {
    setBusy(true);
    setError('');
    try {
      await changeMyPin(usePassword ? { password, newPin: finalPin } : { currentPin, newPin: finalPin });
      NativeAlert.alert('PIN changed', 'Use your new PIN from now on to send alerts and confirm changes.');
      onDone?.();
    } catch (e) {
      setBusy(false);
      setConfirmPin('');
      if (/different/.test(e.message)) {
        setNewPin('');
        goTo('new', e.message);
      } else if (e.status === 403 || e.status === 429) {
        // Wrong current PIN or password (or locked): start again from step 1.
        setCurrentPin('');
        setPassword('');
        setNewPin('');
        goTo('current', e.message);
      } else {
        goTo('confirm', e.message);
      }
    }
  };

  const onCurrentPin = (value) => {
    setCurrentPin(value);
    setError('');
    if (value.length === 4) goTo('new');
  };

  const continueWithPassword = () => {
    if (!password) return setError('Enter your password.');
    goTo('new');
  };

  const onNewPin = (value) => {
    setNewPin(value);
    setError('');
    if (value.length === 4) {
      if (!usePassword && value === currentPin) {
        setNewPin('');
        setError('Choose a PIN that is different from your current PIN.');
        return;
      }
      setConfirmPin('');
      goTo('confirm');
    }
  };

  const onConfirmPin = (value) => {
    setConfirmPin(value);
    setError('');
    if (value.length === 4) {
      if (value !== newPin) {
        setNewPin('');
        setConfirmPin('');
        goTo('new', "The PINs didn't match. Choose your new PIN again.");
        return;
      }
      send(value);
    }
  };

  const back = () => {
    if (busy) return;
    if (step === 'confirm') { setNewPin(''); setConfirmPin(''); goTo('new'); }
    else if (step === 'new') { setNewPin(''); setCurrentPin(''); goTo('current'); }
    else onBack();
  };

  const title = {
    current: usePassword ? 'Enter your password' : 'Enter your current PIN',
    new: 'Choose a new PIN',
    confirm: 'Enter the new PIN again',
  }[step];
  const body = {
    current: usePassword
      ? "Forgot your PIN? Confirm it's you with your LocalAlert password instead."
      : 'Your PIN confirms new alerts, marking someone as found, and changes to your family profiles.',
    new: 'Pick 4 digits that are easy for you to remember but hard for others to guess.',
    confirm: 'Type the same 4 digits to make sure they are right.',
  }[step];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title="Change PIN" onBack={back} disabled={busy} />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.stepText}>Step {STEPS[step]} of 3</Text>
          <Text style={styles.heading} accessibilityRole="header">{title}</Text>
          <Text style={styles.body}>{body}</Text>

          {step === 'current' && usePassword ? (
            <>
              <Input
                label="Password"
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                error={error}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="next"
                onSubmitEditing={continueWithPassword}
                autoFocus
              />
              <Button title="Continue" onPress={continueWithPassword} />
              <Pressable onPress={() => { setUsePassword(false); setPassword(''); setError(''); }} hitSlop={8} style={styles.center} accessibilityRole="button">
                <Text style={styles.link}>Use my current PIN instead</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.pinArea}>
              {step === 'current' ? (
                <PinInput key="current" value={currentPin} onChange={onCurrentPin} label="Current PIN" error={!!error} autoFocus />
              ) : step === 'new' ? (
                <PinInput key="new" value={newPin} onChange={onNewPin} label="New PIN" error={!!error} autoFocus />
              ) : (
                <PinInput key="confirm" value={confirmPin} onChange={onConfirmPin} label="New PIN again" error={!!error} autoFocus />
              )}
              <View style={styles.stretch}><FieldError message={error} /></View>
              {busy ? <Text style={styles.hint}>Saving your new PIN…</Text> : null}
              {step === 'current' ? (
                <Pressable onPress={() => { setUsePassword(true); setCurrentPin(''); setError(''); }} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.link}>Forgot your PIN? Use your password</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  stepText: { fontSize: 12, fontWeight: '700', color: colors.blue },
  heading: { fontSize: 22, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
  pinArea: { alignItems: 'center', gap: 16, paddingTop: 12 },
  center: { alignSelf: 'center' },
  stretch: { alignSelf: 'stretch' },
  hint: { fontSize: 13, color: colors.ink3 },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },
});
