/*
01 Log in — matches screen "01 Log in" in the Figma design.

Validates the form, calls POST /api/auth/login, saves the session and
hands the signed-in user to App through onLoggedIn.
*/
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, radius } from '../theme';
import { login } from '../services/auth';
import { AppLogo } from '../components/common/Icons';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function InfoIcon({ size = 14 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={colors.blueDark} />
      <Path d="M12 7v6M12 16.5v.5" stroke={colors.white} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <InfoIcon />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export default function LoginScreen({ onLoggedIn, onCreateAccount }) {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleLogin = async () => {
    setFormError('');
    if (submitting || !validate()) return;

    setSubmitting(true);
    try {
      const user = await login(email, password);
      onLoggedIn?.(user);
    } catch (error) {
      setFormError(error.message);
      if (error.status === 401) setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Forgot password',
      'Password reset is not available in this version yet. Please contact the LocalAlert team for help.'
    );
  };

  const inputStyle = (field) => [
    styles.inputBox,
    focused === field && styles.inputFocused,
    errors[field] && styles.inputError,
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Hero */}
          <View style={[styles.hero, { paddingTop: insets.top + 28 }]}>
            <View style={styles.logoTile} accessibilityElementsHidden importantForAccessibility="no">
              <AppLogo size={44} />
            </View>
            <Text style={styles.appName} accessibilityRole="header">LocalAlert</Text>
            <Text style={styles.tagline}>
              Report a missing loved one and reach your community in minutes.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.heading} accessibilityRole="header">Welcome back</Text>

            {formError ? (
              <View style={styles.formErrorBox} accessibilityRole="alert">
                <InfoIcon size={18} />
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Email address</Text>
              <View style={inputStyle('email')}>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors((e) => ({ ...e, email: '' }));
                  }}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.ink3}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!submitting}
                  accessibilityLabel="Email address"
                />
              </View>
              <FieldError message={errors.email} />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={inputStyle('password')}>
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((e) => ({ ...e, password: '' }));
                  }}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="Your password"
                  placeholderTextColor={colors.ink3}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  editable={!submitting}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              <FieldError message={errors.password} />
            </View>

            <Pressable
              style={styles.forgot}
              onPress={handleForgotPassword}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || submitting) && styles.primaryButtonPressed,
              ]}
              onPress={handleLogin}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting, busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Log in</Text>
              )}
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>New to LocalAlert? </Text>
              <Pressable onPress={onCreateAccount} hitSlop={8} accessibilityRole="button">
                <Text style={styles.footerLink}>Create an account</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },

  hero: {
    backgroundColor: colors.blue,
    paddingHorizontal: 28,
    paddingBottom: 40,
    gap: 16,
  },
  logoTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { fontSize: 30, fontWeight: '800', color: colors.white },
  tagline: { fontSize: 15, lineHeight: 22, color: colors.white, opacity: 0.92 },

  form: { flex: 1, paddingHorizontal: 20, paddingTop: 28, gap: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.ink },

  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.blueTint,
    borderWidth: 1.5,
    borderColor: colors.blueDark,
  },
  formErrorText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.blueDark },

  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  inputBox: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.field,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  inputFocused: { borderColor: colors.blue },
  inputError: { borderColor: colors.blueDark, borderWidth: 2 },
  input: { flex: 1, height: '100%', fontSize: 15, color: colors.ink },
  showText: { fontSize: 13, fontWeight: '600', color: colors.blue },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.blueDark },

  forgot: { alignSelf: 'flex-end' },
  link: { fontSize: 13, fontWeight: '600', color: colors.blue },

  primaryButton: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { opacity: 0.85 },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: colors.white },

  footer: {
    marginTop: 'auto',
    paddingTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerText: { fontSize: 13, color: colors.ink2 },
  footerLink: { fontSize: 13, fontWeight: '700', color: colors.blue },
});
