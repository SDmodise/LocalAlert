/*
02–04 Sign up — matches Figma screens 02 (details and role), 03 (PIN and privacy)
and 04 (home municipality).

Step 1  Details and role
Step 2  Security PIN (Family Administrators only) and privacy consent
Step 3  Home municipality from the phone's location (optional), then create the account
*/
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { colors, radius } from '../theme';
import Input, { FieldError } from '../components/common/Input';
import Button from '../components/common/Button';
import PinInput from '../components/common/PinInput';
import { BackIcon, CheckIcon, InfoIcon, PinIcon } from '../components/common/Icons';
import { register } from '../services/auth';
import { lookupMunicipality } from '../services/municipalities';

const ADMIN = 'Family Administrator';
const COMMUNITY = 'Community Member';

const ROLES = [
  { value: ADMIN, description: 'Create a family group, add profiles and send alerts' },
  { value: COMMUNITY, description: 'Receive alerts and report sightings' },
];

const NAME_PATTERN = /^[A-Za-zÀ-ÿ' -]{1,50}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalisePhone(phone) {
  const digits = phone.replace(/[\s-]/g, '');
  const local = digits.startsWith('+27') ? '0' + digits.slice(3) : digits;
  return /^0[6-8][0-9]{8}$/.test(local) ? local : null;
}

function StepBar({ step }) {
  return (
    <View style={styles.stepBar} accessibilityLabel={`Step ${step} of 3`}>
      {[1, 2, 3].map((n) => (
        <View key={n} style={[styles.stepSegment, n <= step && styles.stepSegmentOn]} />
      ))}
    </View>
  );
}

function RoleCard({ role, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.roleCard, selected && styles.roleCardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.radio, selected && styles.radioOn]} />
      <View style={styles.flex}>
        <Text style={styles.roleTitle}>{role.value}</Text>
        <Text style={styles.roleText}>{role.description}</Text>
      </View>
    </Pressable>
  );
}

export default function SignUpScreen({ onBackToAuth, onRegistered }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const refs = { lastName: useRef(null), email: useRef(null), phone: useRef(null), password: useRef(null) };

  const [step, setStep] = useState(1);

  // Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState(null);

  // Step 2
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [consent, setConsent] = useState(false);

  // Step 3
  const [location, setLocation] = useState({ status: 'idle' });
  // status: idle | locating | found | not-covered | denied | error

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = role === ADMIN;

  const goBack = () => {
    if (submitting) return true;
    setErrors({});
    setFormError('');
    if (step === 1) onBackToAuth?.();
    else setStep(step - 1);
    return true;
  };

  // Android hardware back button moves back one step.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const clear = (field) => setErrors((e) => (e[field] ? { ...e, [field]: '' } : e));

  // ---------- Step 1 ----------
  const submitDetails = () => {
    const next = {};
    if (!NAME_PATTERN.test(firstName.trim())) next.firstName = 'Enter your first name.';
    if (!NAME_PATTERN.test(lastName.trim())) next.lastName = 'Enter your last name.';
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!normalisePhone(phone)) next.phone = 'Enter a valid South African mobile number.';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) next.password = 'Include at least one letter and one number.';
    if (!role) next.role = 'Choose how you are joining.';
    setErrors(next);
    if (Object.keys(next).length === 0) setStep(2);
  };

  // ---------- Step 2 ----------
  const submitSecurity = () => {
    const next = {};
    if (isAdmin) {
      if (pin.length !== 4) next.pin = 'Enter a 4-digit PIN.';
      else if (/^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
        next.pin = 'Choose a PIN that is harder to guess.';
      } else if (pinConfirm !== pin) next.pinConfirm = 'The PINs do not match.';
    }
    if (!consent) next.consent = 'You need to accept the privacy notice to continue.';
    setErrors(next);
    if (Object.keys(next).length === 0) setStep(3);
  };

  // ---------- Step 3 ----------
  const detectMunicipality = async () => {
    setFormError('');
    setLocation({ status: 'locating' });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocation({ status: 'denied' });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      const municipality = await lookupMunicipality(latitude, longitude);
      setLocation(
        municipality
          ? { status: 'found', municipality, latitude, longitude }
          : { status: 'not-covered' }
      );
    } catch (error) {
      setLocation({ status: 'error', message: error.message });
    }
  };

  const createAccount = async () => {
    setFormError('');
    setSubmitting(true);
    try {
      const details = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone_number: normalisePhone(phone),
        password,
        role,
        privacy_consent: consent,
        ...(isAdmin ? { pin } : {}),
        ...(location.status === 'found'
          ? { latitude: location.latitude, longitude: location.longitude }
          : {}),
      };
      const user = await register(details);
      onRegistered?.(user);
    } catch (error) {
      if (error.status === 409) {
        setErrors({ email: error.message });
        setStep(1);
      } else {
        setFormError(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titles = { 1: 'Create account', 2: isAdmin ? 'Security PIN' : 'Privacy', 3: 'Your area' };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <BackIcon />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{titles[step]}</Text>
        <Text style={styles.stepText}>Step {step} of 3</Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepBar step={step} />

          {step === 1 && (
            <>
              <View style={styles.row}>
                <Input
                  style={styles.flex}
                  label="First name"
                  value={firstName}
                  onChangeText={(t) => { setFirstName(t); clear('firstName'); }}
                  error={errors.firstName}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  textContentType="givenName"
                  returnKeyType="next"
                  onSubmitEditing={() => refs.lastName.current?.focus()}
                />
                <Input
                  ref={refs.lastName}
                  style={styles.flex}
                  label="Last name"
                  value={lastName}
                  onChangeText={(t) => { setLastName(t); clear('lastName'); }}
                  error={errors.lastName}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  textContentType="familyName"
                  returnKeyType="next"
                  onSubmitEditing={() => refs.email.current?.focus()}
                />
              </View>
              <Input
                ref={refs.email}
                label="Email address"
                value={email}
                onChangeText={(t) => { setEmail(t); clear('email'); }}
                error={errors.email}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => refs.phone.current?.focus()}
              />
              <Input
                ref={refs.phone}
                label="Phone number"
                value={phone}
                onChangeText={(t) => { setPhone(t); clear('phone'); }}
                error={errors.phone}
                hint="10 digits, for example 072 345 6789"
                placeholder="072 345 6789"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={13}
                returnKeyType="next"
                onSubmitEditing={() => refs.password.current?.focus()}
              />
              <Input
                ref={refs.password}
                label="Password"
                value={password}
                onChangeText={(t) => { setPassword(t); clear('password'); }}
                error={errors.password}
                hint="At least 8 characters, with a letter and a number"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={72}
                right={
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    <Text style={styles.link}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                }
              />

              <Text style={styles.label}>I am joining as</Text>
              <View style={styles.roles} accessibilityRole="radiogroup">
                {ROLES.map((r) => (
                  <RoleCard key={r.value} role={r} selected={role === r.value}
                    onPress={() => { setRole(r.value); clear('role'); }} />
                ))}
              </View>
              <FieldError message={errors.role} />

              <View style={styles.spacer} />
              <Button title="Continue" onPress={submitDetails} />
            </>
          )}

          {step === 2 && (
            <>
              {isAdmin && (
                <>
                  <Text style={styles.body}>
                    As a Family Administrator you confirm every new alert and every resolution with a 4-digit PIN. This prevents accidental or false alerts.
                  </Text>
                  <Text style={styles.label}>Create PIN</Text>
                  <PinInput label="Create PIN" value={pin} autoFocus
                    onChange={(v) => { setPin(v); clear('pin'); }} error={!!errors.pin} />
                  <FieldError message={errors.pin} />
                  <Text style={styles.label}>Confirm PIN</Text>
                  <PinInput label="Confirm PIN" value={pinConfirm}
                    onChange={(v) => { setPinConfirm(v); clear('pinConfirm'); }} error={!!errors.pinConfirm} />
                  <FieldError message={errors.pinConfirm} />
                </>
              )}

              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Privacy notice (POPIA)</Text>
                <Text style={styles.body}>
                  LocalAlert stores your name, contact details and municipality, and the profiles you add, only to create and share missing-person alerts. ID numbers are checked and never stored. Your exact location is never stored.
                </Text>
                <Pressable
                  style={styles.consentRow}
                  onPress={() => { setConsent((c) => !c); clear('consent'); }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consent }}
                >
                  <View style={[styles.checkbox, consent && styles.checkboxOn]}>
                    {consent ? <CheckIcon /> : null}
                  </View>
                  <Text style={[styles.body, styles.flex, { color: colors.ink }]}>
                    I have read the privacy notice and consent to LocalAlert processing my information.
                  </Text>
                </Pressable>
              </View>
              <FieldError message={errors.consent} />

              <View style={styles.spacer} />
              <Button title="Continue" onPress={submitSecurity} />
            </>
          )}

          {step === 3 && (
            <>
              <View style={styles.illustration}>
                <PinIcon size={56} />
              </View>
              <Text style={styles.heading}>Find your municipality</Text>
              <Text style={[styles.body, styles.center]}>
                LocalAlert uses your location once to set your home municipality, so you receive alerts for people missing near you. Only the municipality is saved.
              </Text>

              {location.status === 'locating' && (
                <View style={[styles.infoBox, styles.centerRow]}>
                  <ActivityIndicator color={colors.blue} />
                  <Text style={styles.body}>Finding your municipality…</Text>
                </View>
              )}

              {location.status === 'found' && (
                <View style={[styles.infoBox, styles.foundRow]}>
                  <View style={styles.flex}>
                    <Text style={styles.caption}>Home municipality</Text>
                    <Text style={styles.foundName}>{location.municipality.municipality_name}</Text>
                    <Text style={styles.body}>{location.municipality.province}</Text>
                  </View>
                  <View style={styles.chip}><Text style={styles.chipText}>Detected</Text></View>
                </View>
              )}

              {['not-covered', 'denied', 'error'].includes(location.status) && (
                <View style={[styles.infoBox, styles.messageRow]}>
                  <InfoIcon size={18} />
                  <Text style={[styles.body, styles.flex]}>
                    {location.status === 'not-covered' &&
                      "LocalAlert doesn't cover your area yet. You can still create an account and will receive alerts that go to all users."}
                    {location.status === 'denied' &&
                      'Location permission was not given. You can create your account now and set your area later.'}
                    {location.status === 'error' &&
                      "We couldn't find your location. Check that location is switched on, then try again."}
                  </Text>
                </View>
              )}

              <Text style={[styles.caption, styles.center]}>
                Your current municipality updates each time you open the app.
              </Text>

              {formError ? (
                <View style={styles.formErrorBox} accessibilityRole="alert">
                  <InfoIcon size={18} />
                  <Text style={styles.formErrorText}>{formError}</Text>
                </View>
              ) : null}

              <View style={styles.spacer} />

              {location.status === 'found' ? (
                <Button title="Create account" onPress={createAccount} loading={submitting} />
              ) : (
                <>
                  <Button
                    title={location.status === 'idle' ? 'Use my location' : 'Try again'}
                    onPress={detectMunicipality}
                    loading={location.status === 'locating'}
                    disabled={submitting}
                  />
                  <Button
                    title={location.status === 'idle' ? 'Skip and create account' : 'Create account without location'}
                    variant="secondary"
                    onPress={createAccount}
                    loading={submitting}
                    disabled={location.status === 'locating'}
                  />
                </>
              )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.ink },
  stepText: { fontSize: 12, color: colors.ink3 },

  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  stepBar: { flexDirection: 'row', gap: 6 },
  stepSegment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.line },
  stepSegmentOn: { backgroundColor: colors.blue },
  row: { flexDirection: 'row', gap: 12 },
  spacer: { flexGrow: 1, minHeight: 8 },

  label: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  body: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  caption: { fontSize: 12, color: colors.ink3 },
  center: { textAlign: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  link: { fontSize: 13, fontWeight: '600', color: colors.blue },

  roles: { gap: 10 },
  roleCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  roleCardSelected: { borderColor: colors.blue, borderWidth: 2, backgroundColor: colors.blueTint },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, marginTop: 1 },
  radioOn: { borderWidth: 7, borderColor: colors.blue },
  roleTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  roleText: { fontSize: 13, color: colors.ink2, marginTop: 2 },

  infoBox: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.blueTint,
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  consentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.blue, borderColor: colors.blue },

  illustration: {
    alignSelf: 'center',
    marginTop: 12,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  foundRow: { flexDirection: 'row', alignItems: 'center' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start' },
  foundName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  chip: { backgroundColor: colors.blue, borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.white },

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
});
