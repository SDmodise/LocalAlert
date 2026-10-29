/*
01a Forgot password — opened from "Forgot password?" on the login screen.

Step 1  Email address -> POST /api/auth/forgot-password (a 6-digit code is emailed).
Step 2  Code + new password -> POST /api/auth/reset-password.
Then back to the login screen with the email filled in.
The server gives the same reply whether or not the email has an account.
*/
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SubHeader from '../../components/common/SubHeader';
import { InfoIcon } from '../../components/common/Icons';
import { requestPasswordReset, resetPassword } from '../../services/auth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same rules as the server (and sign-up).
function passwordProblem(password) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 72) return 'Use 72 characters or fewer.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Include at least one letter and one number.';
  return '';
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <InfoIcon size={18} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export default function ForgotPasswordScreen({ initialEmail = '', onBack, onDone }) {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const [step, setStep] = useState('email'); // email | reset
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Countdown before another code can be asked for.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const clearError = (field) => {
    setFormError('');
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  const sendCode = async () => {
    setFormError('');
    const address = email.trim();
    if (!address) return setErrors({ email: 'Enter your email address.' });
    if (!EMAIL_PATTERN.test(address)) return setErrors({ email: 'Enter a valid email address.' });
    setErrors({});
    setBusy(true);
    try {
      const result = await requestPasswordReset(address);
      setSentMessage(result.message);
      setResendIn(result.resend_after || 60);
      setCode('');
      setStep('reset');
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    setFormError('');
    const next = {};
    if (!/^[0-9]{6}$/.test(code)) next.code = 'Enter the 6-digit code from the email.';
    const problem = passwordProblem(password);
    if (problem) next.password = problem;
    else if (confirm !== password) next.confirm = "The passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await resetPassword(email.trim(), code, password);
      onDone?.(email.trim());
    } catch (error) {
      setFormError(error.message);
      if (error.status === 429 || /new code/.test(error.message)) setCode('');
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <SubHeader title="Forgot password" onBack={step === 'reset' ? () => { setStep('email'); setFormError(''); setErrors({}); } : onBack} disabled={busy} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'email' ? (
            <>
              <Text style={styles.body}>
                Enter the email address you use for LocalAlert. We'll send you a 6-digit code so you can choose a new password.
              </Text>
              <ErrorBox message={formError} />
              <Input
                label="Email address"
                value={email}
                onChangeText={(t) => { setEmail(t); clearError('email'); }}
                error={errors.email}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={sendCode}
                editable={!busy}
                autoFocus={!initialEmail}
              />
              <Button title="Send code" onPress={sendCode} loading={busy} />
            </>
          ) : (
            <>
              <View style={styles.infoBox}>
                <InfoIcon size={18} color={colors.blue} />
                <Text style={[styles.body, styles.flex]}>
                  {sentMessage} We sent it to <Text style={styles.bold}>{email.trim()}</Text>. Check your spam folder too.
                </Text>
              </View>
              <ErrorBox message={formError} />
              <Input
                label="6-digit code"
                value={code}
                onChangeText={(t) => { setCode(t.replace(/[^0-9]/g, '').slice(0, 6)); clearError('code'); }}
                error={errors.code}
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!busy}
                autoFocus
              />
              <Input
                ref={passwordRef}
                label="New password"
                value={password}
                onChangeText={(t) => { setPassword(t); clearError('password'); }}
                error={errors.password}
                hint="At least 8 characters, with a letter and a number."
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                editable={!busy}
                right={(
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Text style={styles.link}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                )}
              />
              <Input
                ref={confirmRef}
                label="Confirm new password"
                value={confirm}
                onChangeText={(t) => { setConfirm(t); clearError('confirm'); }}
                error={errors.confirm}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={changePassword}
                editable={!busy}
              />
              <Button title="Change password" onPress={changePassword} loading={busy} />
              <View style={styles.resendRow}>
                {resendIn > 0 ? (
                  <Text style={styles.hint}>You can ask for a new code in {resendIn} s</Text>
                ) : (
                  <Pressable onPress={sendCode} disabled={busy} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.link}>Didn't get it? Send a new code</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => { setStep('email'); setFormError(''); setErrors({}); }}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>Use a different email</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
  body: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
  bold: { fontWeight: '700', color: colors.ink },
  hint: { fontSize: 13, color: colors.ink3 },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
    backgroundColor: colors.dangerTint, borderWidth: 1.5, borderColor: colors.danger,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.danger },
  resendRow: { alignItems: 'center', gap: 14, paddingTop: 4 },
});
