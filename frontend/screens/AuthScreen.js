import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import GoogleButton from '../assets/googleicon.svg';

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errors, setErrors] = useState({});

  // =========================================================
  // CLEAR INDIVIDUAL ERROR
  // =========================================================

  const clearError = (field) => {
    setErrors((previousErrors) => ({
      ...previousErrors,
      [field]: '',
    }));
  };

  // =========================================================
  // SWITCH BETWEEN SIGN IN AND SIGN UP
  // =========================================================

  const switchAuthMode = () => {
    setIsSignUp((previous) => !previous);
    setErrors({});
  };

  // =========================================================
  // FORM VALIDATION
  // =========================================================

  const handleSubmit = () => {
    const newErrors = {};

    // -------------------------------------------------------
    // SIGN UP VALIDATION
    // -------------------------------------------------------

    if (isSignUp) {
      if (!fullName.trim()) {
        newErrors.fullName = 'Full name is required.';
      } else if (!/^[A-Za-zÀ-ÿ\s'-]{2,}$/.test(fullName.trim())) {
        newErrors.fullName = 'Please enter a valid full name.';
      }

      if (!phone.trim()) {
        newErrors.phone = 'Phone number is required.';
      } else if (
        !/^(?:\+27|0)[6-8][0-9]{8}$/.test(phone.trim())
      ) {
        newErrors.phone =
          'Enter a valid South African mobile number.';
      }
    }

    // -------------------------------------------------------
    // EMAIL VALIDATION
    // -------------------------------------------------------

    if (!email.trim()) {
      newErrors.email = 'Email address is required.';
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      newErrors.email = 'Enter a valid email address.';
    }

    // -------------------------------------------------------
    // PASSWORD VALIDATION
    // -------------------------------------------------------

    if (!password) {
      newErrors.password = 'Password is required.';
    } else if (isSignUp) {
      if (password.length < 8) {
        newErrors.password =
          'Password must be at least 8 characters.';
      } else if (!/[A-Z]/.test(password)) {
        newErrors.password =
          'Password must contain an uppercase letter.';
      } else if (!/[a-z]/.test(password)) {
        newErrors.password =
          'Password must contain a lowercase letter.';
      } else if (!/[0-9]/.test(password)) {
        newErrors.password =
          'Password must contain a number.';
      }
    }

    // -------------------------------------------------------
    // CONFIRM PASSWORD
    // -------------------------------------------------------

    if (isSignUp) {
      if (!confirmPassword) {
        newErrors.confirmPassword =
          'Please confirm your password.';
      } else if (password !== confirmPassword) {
        newErrors.confirmPassword =
          'Passwords do not match.';
      }
    }

    // -------------------------------------------------------
    // SHOW ERRORS
    // -------------------------------------------------------

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    // -------------------------------------------------------
    // TEMPORARY SUCCESS
    // -------------------------------------------------------

    if (isSignUp) {
      console.log('Create account successful');

      console.log({
        fullName,
        phone,
        email,
        password,
      });
    } else {
      console.log('Sign in successful');

      console.log({
        email,
        password,
      });
    }

    /*
      BACKEND AUTHENTICATION WILL BE CONNECTED HERE LATER.
    */
  };

  // =========================================================
  // GOOGLE
  // =========================================================

  const handleGooglePress = () => {
    console.log(
      isSignUp
        ? 'Create account using Google'
        : 'Continue with Google'
    );

    /*
      Google authentication will be connected here later.
    */
  };

  // =========================================================
  // APPLE
  // =========================================================

  const handleApplePress = () => {
    console.log(
      isSignUp
        ? 'Create account using Apple'
        : 'Continue with Apple'
    );

    /*
      Apple authentication will be connected here later.
    */
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>

            {/* =================================================
                HEADER
            ================================================= */}

            <View style={styles.header}>
              <Text style={styles.title}>
                {isSignUp ? 'Create Account' : 'Welcome Back'}
              </Text>

              <Text style={styles.subtitle}>
                {isSignUp
                  ? 'Create your LocalAlert account'
                  : 'Sign in to continue to LocalAlert'}
              </Text>
            </View>

            {/* =================================================
                GOOGLE BUTTON
            ================================================= */}

            <TouchableOpacity
              style={styles.googleSvgButton}
              activeOpacity={0.8}
              onPress={handleGooglePress}
            >
              <GoogleButton
                width="100%"
                height={52}
                preserveAspectRatio="xMidYMid meet"
              />
            </TouchableOpacity>

            {/* =================================================
                APPLE BUTTON
            ================================================= */}

            <TouchableOpacity
              style={styles.socialButton}
              activeOpacity={0.8}
              onPress={handleApplePress}
            >
              <Text style={styles.appleIcon}>
                
              </Text>

              <Text style={styles.socialButtonText}>
                {isSignUp
                  ? 'Create using Apple ID'
                  : 'Continue with Apple'}
              </Text>
            </TouchableOpacity>

            {/* =================================================
                OR DIVIDER
            ================================================= */}

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />

              <Text style={styles.orText}>
                OR
              </Text>

              <View style={styles.dividerLine} />
            </View>

            {/* =================================================
                SIGN UP FIELDS
            ================================================= */}

            {isSignUp && (
              <>
                {/* FULL NAME */}

                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>
                    Full Name
                  </Text>

                  <TextInput
                    style={[
                      styles.input,
                      errors.fullName && styles.inputError,
                    ]}
                    placeholder="Enter your full name"
                    placeholderTextColor="#999999"
                    value={fullName}
                    onChangeText={(text) => {
                      setFullName(text);
                      clearError('fullName');
                    }}
                    autoCapitalize="words"
                  />

                  {errors.fullName ? (
                    <Text style={styles.errorText}>
                      {errors.fullName}
                    </Text>
                  ) : null}
                </View>

                {/* PHONE */}

                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>
                    Phone Number
                  </Text>

                  <TextInput
                    style={[
                      styles.input,
                      errors.phone && styles.inputError,
                    ]}
                    placeholder="e.g. 0821234567"
                    placeholderTextColor="#999999"
                    value={phone}
                    onChangeText={(text) => {
                      setPhone(text);
                      clearError('phone');
                    }}
                    keyboardType="phone-pad"
                  />

                  {errors.phone ? (
                    <Text style={styles.errorText}>
                      {errors.phone}
                    </Text>
                  ) : null}
                </View>
              </>
            )}

            {/* =================================================
                EMAIL
            ================================================= */}

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>
                Email Address
              </Text>

              <TextInput
                style={[
                  styles.input,
                  errors.email && styles.inputError,
                ]}
                placeholder="Enter your email address"
                placeholderTextColor="#999999"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  clearError('email');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {errors.email ? (
                <Text style={styles.errorText}>
                  {errors.email}
                </Text>
              ) : null}
            </View>

            {/* =================================================
                PASSWORD
            ================================================= */}

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>
                Password
              </Text>

              <View
                style={[
                  styles.passwordContainer,
                  errors.password && styles.inputError,
                ]}
              >
                <TextInput
                  style={styles.passwordInput}
                  placeholder={
                    isSignUp
                      ? 'Create a password'
                      : 'Enter your password'
                  }
                  placeholderTextColor="#999999"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    clearError('password');
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() =>
                    setShowPassword((previous) => !previous)
                  }
                >
                  <Text style={styles.eyeText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>

              {errors.password ? (
                <Text style={styles.errorText}>
                  {errors.password}
                </Text>
              ) : null}
            </View>

            {/* =================================================
                CONFIRM PASSWORD
            ================================================= */}

            {isSignUp && (
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>
                  Confirm Password
                </Text>

                <View
                  style={[
                    styles.passwordContainer,
                    errors.confirmPassword &&
                      styles.inputError,
                  ]}
                >
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Confirm your password"
                    placeholderTextColor="#999999"
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      clearError('confirmPassword');
                    }}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />

                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() =>
                      setShowConfirmPassword(
                        (previous) => !previous
                      )
                    }
                  >
                    <Text style={styles.eyeText}>
                      {showConfirmPassword
                        ? 'Hide'
                        : 'Show'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {errors.confirmPassword ? (
                  <Text style={styles.errorText}>
                    {errors.confirmPassword}
                  </Text>
                ) : null}
              </View>
            )}

            {/* =================================================
                FORGOT PASSWORD
            ================================================= */}

            {!isSignUp && (
              <TouchableOpacity
                style={styles.forgotPasswordContainer}
                activeOpacity={0.7}
                onPress={() =>
                  console.log('Forgot password pressed')
                }
              >
                <Text style={styles.forgotPasswordText}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            )}

            {/* =================================================
                MAIN BUTTON
            ================================================= */}

            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.8}
              onPress={handleSubmit}
            >
              <Text style={styles.primaryButtonText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            {/* =================================================
                SWITCH AUTH MODE
            ================================================= */}

            <View style={styles.switchContainer}>
              <Text style={styles.switchText}>
                {isSignUp
                  ? 'Already have an account?'
                  : "Don't have an account?"}
              </Text>

              <TouchableOpacity
                onPress={switchAuthMode}
                activeOpacity={0.7}
              >
                <Text style={styles.switchLink}>
                  {isSignUp ? ' Sign In' : ' Create Account'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* =================================================
                FOOTER
            ================================================= */}

            <Text style={styles.footerText}>
              By continuing, you agree to LocalAlert's
              {' '}Terms of Service and Privacy Policy.
            </Text>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// =============================================================
// STYLES
// =============================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  keyboardView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
  },

  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 35,
  },

  // ===========================================================
  // HEADER
  // ===========================================================

  header: {
    alignItems: 'center',
    marginBottom: 28,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
  },

  // ===========================================================
  // GOOGLE SVG BUTTON
  // ===========================================================

  googleSvgButton: {
    width: '100%',
    height: 52,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // ===========================================================
  // SOCIAL BUTTON
  // ===========================================================

  socialButton: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  appleIcon: {
    fontSize: 24,
    color: '#000000',
    marginRight: 10,
  },

  socialButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222222',
  },

  // ===========================================================
  // DIVIDER
  // ===========================================================

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E1E1E1',
  },

  orText: {
    fontSize: 12,
    color: '#888888',
    marginHorizontal: 12,
    fontWeight: '600',
  },

  // ===========================================================
  // INPUT FIELDS
  // ===========================================================

  fieldContainer: {
    marginBottom: 16,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 7,
  },

  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 15,
    color: '#222222',
    backgroundColor: '#FFFFFF',
  },

  inputError: {
    borderColor: '#D32F2F',
  },

  errorText: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 5,
  },

  // ===========================================================
  // PASSWORD
  // ===========================================================

  passwordContainer: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 15,
    fontSize: 15,
    color: '#222222',
  },

  eyeButton: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  eyeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555555',
  },

  // ===========================================================
  // FORGOT PASSWORD
  // ===========================================================

  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: -5,
    marginBottom: 20,
  },

  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E5EFF',
  },

  // ===========================================================
  // PRIMARY BUTTON
  // ===========================================================

  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 8,
    backgroundColor: '#1E5EFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ===========================================================
  // SWITCH
  // ===========================================================

  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },

  switchText: {
    fontSize: 14,
    color: '#666666',
  },

  switchLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E5EFF',
  },

  // ===========================================================
  // FOOTER
  // ===========================================================

  footerText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#999999',
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 10,
  },
});