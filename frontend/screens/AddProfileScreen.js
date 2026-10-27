/*
12 Add profile — matches Figma screen "12 Add profile – ID check".

Photo, name, date of birth, gender, description, ID number (checked while typing,
never stored) and a photo of the ID document or birth certificate.
*/
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { colors, radius } from '../theme';
import Button from '../components/common/Button';
import Input, { FieldError } from '../components/common/Input';
import { BackIcon, CameraIcon, CheckIcon, InfoIcon, UploadIcon } from '../components/common/Icons';
import { addFamilyProfile } from '../services/family';
import { idNumberProblem } from '../utils/idNumber';

const NAME = /^[A-Za-zÀ-ÿ' .-]{2,100}$/;

// Formats typed digits as YYYY-MM-DD.
function formatDate(text) {
  const d = text.replace(/[^0-9]/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

function dateProblem(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter the date as YYYY-MM-DD.';
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return 'Enter a real date.';
  const today = new Date().toISOString().slice(0, 10);
  if (value > today) return 'The date of birth cannot be in the future.';
  if (value < '1900-01-01') return 'Check the year.';
  return null;
}

// Formats an ID number as 6-4-3 groups for readability: 180314 0123 087
function formatId(text) {
  const d = text.replace(/[^0-9]/g, '').slice(0, 13);
  return [d.slice(0, 6), d.slice(6, 10), d.slice(10)].filter(Boolean).join(' ');
}

async function pickImage(fromCamera, aspect) {
  const permission = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Permission needed',
      fromCamera ? 'Allow LocalAlert to use the camera in your phone settings.' : 'Allow LocalAlert to use your photos in your phone settings.'
    );
    return null;
  }
  const options = { mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : result.assets[0];
}

function chooseSource(onPick, aspect) {
  Alert.alert('Add photo', undefined, [
    { text: 'Take photo', onPress: async () => onPick(await pickImage(true, aspect)) },
    { text: 'Choose from gallery', onPress: async () => onPick(await pickImage(false, aspect)) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export default function AddProfileScreen({ groupId, onCancel, onSaved }) {
  const insets = useSafeAreaInsets();
  const dobRef = useRef(null);

  const [photo, setPhoto] = useState(null);
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState(null);
  const [description, setDescription] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idDocument, setIdDocument] = useState(null);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!saving) onCancel?.();
      return true;
    });
    return () => sub.remove();
  }, [saving, onCancel]);

  const clear = (field) => setErrors((e) => (e[field] ? { ...e, [field]: '' } : e));

  const idDigits = idNumber.replace(/\s/g, '');
  // Show ID feedback once all 13 digits are typed (or after a save attempt).
  const liveIdProblem = idDigits.length === 13 ? idNumberProblem(idDigits, dob, gender) : null;
  const idChecked = idDigits.length === 13 && !liveIdProblem && !dateProblem(dob) && gender;

  const validate = () => {
    const next = {};
    if (!photo) next.photo = 'Add a recent photo.';
    if (!NAME.test(fullName.trim())) next.fullName = 'Enter the full name.';
    const dp = dateProblem(dob);
    if (dp) next.dob = dp;
    if (!gender) next.gender = 'Choose a gender.';
    if (description.trim().length < 5) next.description = 'Describe height, build, hair and any marks.';
    if (idDigits) {
      const ip = idNumberProblem(idDigits, dob, gender);
      if (ip) next.idNumber = ip;
    }
    if (!idDocument) next.idDocument = 'Upload a photo of the ID document or birth certificate.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    setFormError('');
    try {
      const profile = await addFamilyProfile(
        groupId,
        {
          full_name: fullName.trim(),
          date_of_birth: dob,
          gender,
          physical_description: description.trim(),
          id_number: idDigits || undefined,
        },
        photo,
        idDocument
      );
      onSaved?.(profile);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (saving || !validate()) return;
    if (!idDigits) {
      Alert.alert(
        'Save without an ID number?',
        'The profile will be marked Pending ID and cannot be used in an alert until a valid ID number is added.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save as pending', onPress: () => { setSaving(true); save(); } },
        ]
      );
      return;
    }
    setSaving(true);
    save();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} disabled={saving} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <BackIcon />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">Add profile</Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Photo */}
          <Pressable
            style={styles.photoRow}
            onPress={() => chooseSource((asset) => { if (asset) { setPhoto(asset); clear('photo'); } }, [1, 1])}
            accessibilityRole="button"
            accessibilityLabel={photo ? 'Change photo' : 'Add photo'}
          >
            <View style={[styles.photoCircle, errors.photo && styles.errorBorder]}>
              {photo ? <Image source={{ uri: photo.uri }} style={styles.photoImage} /> : <CameraIcon />}
            </View>
            <View style={styles.flex}>
              <Text style={styles.photoTitle}>{photo ? 'Change photo' : 'Add a clear, recent photo'}</Text>
              <Text style={styles.caption}>Face visible, no sunglasses or hats</Text>
            </View>
          </Pressable>
          <FieldError message={errors.photo} />

          <Input
            label="Full name"
            value={fullName}
            onChangeText={(t) => { setFullName(t); clear('fullName'); }}
            error={errors.fullName}
            autoCapitalize="words"
            maxLength={100}
            returnKeyType="next"
            onSubmitEditing={() => dobRef.current?.focus()}
          />

          <View style={styles.row}>
            <Input
              ref={dobRef}
              style={styles.flex}
              label="Date of birth"
              placeholder="YYYY-MM-DD"
              value={dob}
              onChangeText={(t) => { setDob(formatDate(t)); clear('dob'); }}
              error={errors.dob}
              keyboardType="number-pad"
              maxLength={10}
            />
            <View style={[styles.flex, styles.genderField]}>
              <Text style={styles.label}>Gender</Text>
              <View style={[styles.segment, errors.gender && styles.errorBorder]} accessibilityRole="radiogroup">
                {['Female', 'Male'].map((g) => (
                  <Pressable
                    key={g}
                    style={[styles.segmentItem, gender === g && styles.segmentOn]}
                    onPress={() => { setGender(g); clear('gender'); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: gender === g }}
                  >
                    <Text style={[styles.segmentText, gender === g && styles.segmentTextOn]}>{g}</Text>
                  </Pressable>
                ))}
              </View>
              <FieldError message={errors.gender} />
            </View>
          </View>

          <Input
            label="Physical description"
            value={description}
            onChangeText={(t) => { setDescription(t); clear('description'); }}
            error={errors.description}
            placeholder="e.g. 1.25 m, slim, short braids, birthmark on left wrist"
            multiline
            maxLength={1000}
          />

          <View style={styles.field}>
            <Input
              label="ID number"
              placeholder="13-digit ID number"
              value={idNumber}
              onChangeText={(t) => { setIdNumber(formatId(t)); clear('idNumber'); }}
              error={errors.idNumber || liveIdProblem}
              keyboardType="number-pad"
              maxLength={15}
              autoComplete="off"
              autoCorrect={false}
            />
            {idChecked && !errors.idNumber ? (
              <View style={styles.okRow}>
                <View style={styles.okBadge}><CheckIcon size={10} /></View>
                <Text style={styles.okText}>ID number checked against the date of birth and gender</Text>
              </View>
            ) : null}
            <Text style={styles.caption}>Checked, then discarded. LocalAlert never stores ID numbers.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>ID document or birth certificate</Text>
            <Pressable
              style={[styles.upload, idDocument && styles.uploadDone, errors.idDocument && styles.errorBorder]}
              onPress={() => chooseSource((asset) => { if (asset) { setIdDocument(asset); clear('idDocument'); } }, undefined)}
              accessibilityRole="button"
              accessibilityLabel={idDocument ? 'Change ID document photo' : 'Upload photo of document'}
            >
              {idDocument ? (
                <>
                  <Image source={{ uri: idDocument.uri }} style={styles.docThumb} />
                  <Text style={[styles.uploadText, styles.flex]}>Document added</Text>
                  <Text style={styles.link}>Change</Text>
                </>
              ) : (
                <>
                  <UploadIcon />
                  <Text style={styles.uploadText}>Upload photo of document</Text>
                </>
              )}
            </Pressable>
            <FieldError message={errors.idDocument} />
            <Text style={styles.caption}>Only you can see this document.</Text>
          </View>

          {formError ? (
            <View style={styles.formErrorBox} accessibilityRole="alert">
              <InfoIcon size={18} />
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.spacer} />
          <Button title="Save profile" onPress={handleSave} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.ink },

  content: { flexGrow: 1, paddingHorizontal: 20, gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  field: { gap: 6 },
  spacer: { flexGrow: 1, minHeight: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  caption: { fontSize: 12, lineHeight: 17, color: colors.ink3 },
  link: { fontSize: 13, fontWeight: '600', color: colors.blue },
  errorBorder: { borderColor: colors.blueDark, borderWidth: 2 },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: colors.blueLight,
  },
  photoImage: { width: '100%', height: '100%' },
  photoTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },

  genderField: { gap: 6 },
  segment: {
    height: 48, flexDirection: 'row', padding: 4, gap: 4, borderRadius: radius.field,
    backgroundColor: colors.blueLight, borderWidth: 1.5, borderColor: colors.blueLight,
  },
  segmentItem: { flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.white },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  segmentTextOn: { color: colors.blue },

  okRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  okBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  okText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.blue },

  upload: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.field,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.blueMid, backgroundColor: colors.blueTint,
  },
  uploadDone: { justifyContent: 'flex-start', borderStyle: 'solid', borderColor: colors.line },
  uploadText: { fontSize: 14, fontWeight: '600', color: colors.blue },
  docThumb: { width: 48, height: 36, borderRadius: 6, backgroundColor: colors.blueLight },

  formErrorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
    backgroundColor: colors.blueTint, borderWidth: 1.5, borderColor: colors.blueDark,
  },
  formErrorText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.blueDark },
});
