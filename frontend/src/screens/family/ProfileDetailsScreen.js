/*
Family > profile details (Family Administrator).
View the profile; "Edit details" to change the name, description, photo, ID
document, or add an ID number to verify a pending profile. Saving needs the PIN.
"Remove profile" is at the bottom and also needs the PIN.
Date of birth and gender can't be changed: the ID number was checked against them.
*/
import React, { useState } from 'react';
import {
  Alert as NativeAlert,
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

import { colors, radius } from '../../theme';
import Button from '../../components/common/Button';
import Input, { FieldError } from '../../components/common/Input';
import SubHeader from '../../components/common/SubHeader';
import AuthImage from '../../components/common/AuthImage';
import PinSheet from '../../components/common/PinSheet';
import { CameraIcon, CheckIcon, PersonSilhouette, UploadIcon } from '../../components/common/Icons';
import { idDocumentUrl, profilePhotoUrl, removeProfile, updateProfile } from '../../services/family';
import { ageInYears, idNumberProblem } from '../../utils/idNumber';

const NAME = /^[A-Za-zÀ-ÿ' .-]{2,100}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDob(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y ? `${d} ${MONTHS[m - 1]} ${y}` : '';
}

function formatId(text) {
  const d = text.replace(/[^0-9]/g, '').slice(0, 13);
  return [d.slice(0, 6), d.slice(6, 10), d.slice(10)].filter(Boolean).join(' ');
}

async function pickImage(fromCamera, aspect) {
  const permission = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    NativeAlert.alert('Permission needed', fromCamera
      ? 'Allow camera access in your phone settings to take a photo.'
      : 'Allow photo access in your phone settings to choose a photo.');
    return null;
  }
  const options = { mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect };
  const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : result.assets[0];
}

function Detail({ label, value }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ImageButtons({ onPick }) {
  return (
    <View style={styles.row}>
      <Pressable style={styles.smallButton} onPress={() => onPick(true)} accessibilityRole="button">
        <CameraIcon size={18} />
        <Text style={styles.smallButtonText}>Take photo</Text>
      </Pressable>
      <Pressable style={styles.smallButton} onPress={() => onPick(false)} accessibilityRole="button">
        <UploadIcon size={16} />
        <Text style={styles.smallButtonText}>Choose photo</Text>
      </Pressable>
    </View>
  );
}

export default function ProfileDetailsScreen({ profile: initialProfile, onBack, onChanged, onRemoved }) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(initialProfile);
  const [editing, setEditing] = useState(false);
  const [pinFor, setPinFor] = useState(null); // 'save' | 'remove'

  // Edit form
  const [name, setName] = useState(profile.full_name);
  const [description, setDescription] = useState(profile.physical_description);
  const [photo, setPhoto] = useState(null);
  const [idNumber, setIdNumber] = useState('');
  const [idDocument, setIdDocument] = useState(null);
  const [errors, setErrors] = useState({});

  const verified = profile.verification_status === 'verified';
  const age = ageInYears(profile.date_of_birth);
  const child = age !== null && age < 18;
  const word = profile.gender === 'Female' ? (child ? 'Girl' : 'Woman') : (child ? 'Boy' : 'Man');

  const startEditing = () => {
    setName(profile.full_name);
    setDescription(profile.physical_description);
    setPhoto(null);
    setIdNumber('');
    setIdDocument(null);
    setErrors({});
    setEditing(true);
  };

  const changes = () => {
    const fields = {};
    if (name.trim() !== profile.full_name) fields.full_name = name.trim();
    if (description.trim() !== profile.physical_description) fields.physical_description = description.trim();
    const digits = idNumber.replace(/\s/g, '');
    if (digits) fields.id_number = digits;
    return fields;
  };

  const save = () => {
    const next = {};
    if (!NAME.test(name.trim())) next.name = "Enter the person's full name (letters only).";
    if (description.trim().length < 5) next.description = 'Describe the person in at least 5 characters (height, build, hair, marks).';
    const digits = idNumber.replace(/\s/g, '');
    if (digits) {
      const problem = idNumberProblem(digits, profile.date_of_birth, profile.gender);
      if (problem) next.idNumber = problem;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    if (!Object.keys(changes()).length && !photo && !idDocument) {
      setErrors({ form: 'You have not changed anything yet.' });
      return;
    }
    setPinFor('save');
  };

  const confirmWithPin = async (pin) => {
    if (pinFor === 'save') {
      const updated = await updateProfile(profile.member_id, changes(), { photo, idDocument }, pin);
      setProfile(updated);
      setPinFor(null);
      setEditing(false);
      onChanged?.();
      NativeAlert.alert('Profile updated', `${updated.full_name}'s details were saved.`);
    } else {
      await removeProfile(profile.member_id, pin);
      setPinFor(null);
      onRemoved?.();
    }
  };

  const askRemove = () => {
    NativeAlert.alert(
      `Remove ${profile.full_name}?`,
      'Their profile, photo and ID document will be deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => setPinFor('remove') },
      ]
    );
  };

  const liveIdProblem = idNumber.replace(/\s/g, '').length === 13
    ? idNumberProblem(idNumber.replace(/\s/g, ''), profile.date_of_birth, profile.gender)
    : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader
        title={editing ? 'Edit profile' : profile.full_name}
        onBack={editing ? () => setEditing(false) : onBack}
        close={editing}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          {/* Photo */}
          <View style={styles.photoWrap}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={styles.photo} />
            ) : (
              <AuthImage
                uri={profile.has_photo ? profilePhotoUrl(profile.member_id) : null}
                style={styles.photo}
                fallback={<PersonSilhouette size={100} />}
              />
            )}
            <View style={[styles.chip, verified ? styles.chipSolid : styles.chipOutline]}>
              {verified ? <CheckIcon size={11} /> : null}
              <Text style={[styles.chipText, { color: verified ? colors.white : colors.ink2 }]}>{verified ? 'Verified' : 'Pending ID'}</Text>
            </View>
          </View>

          {!editing ? (
            <>
              <View>
                <Text style={styles.name}>{profile.full_name}</Text>
                <Text style={styles.sub}>{age !== null ? `${age} ${age === 1 ? 'year' : 'years'} · ` : ''}{word}</Text>
              </View>
              <View style={styles.card}>
                <Detail label="Date of birth" value={formatDob(profile.date_of_birth)} />
                <View style={styles.divider} />
                <Detail label="Gender" value={profile.gender} />
                <View style={styles.divider} />
                <Detail label="Description" value={profile.physical_description} />
              </View>
              {!verified ? (
                <Text style={styles.note}>
                  This profile has no verified ID number yet, so it can't be used in an alert. Tap Edit details to add the ID number.
                </Text>
              ) : null}
              {profile.has_id_document ? (
                <View style={styles.group}>
                  <Text style={styles.label}>ID document (only you can see this)</Text>
                  <AuthImage uri={idDocumentUrl(profile.member_id)} style={styles.document} fallback={null} />
                </View>
              ) : null}

              <Button title="Edit details" onPress={startEditing} />
              <Button title="Remove profile" variant="danger" onPress={askRemove} />
            </>
          ) : (
            <>
              <View style={styles.group}>
                <Text style={styles.label}>Photo</Text>
                <ImageButtons onPick={async (cam) => { const a = await pickImage(cam, [4, 5]); if (a) setPhoto(a); }} />
                {photo ? (
                  <Pressable onPress={() => setPhoto(null)} hitSlop={8}><Text style={styles.link}>Keep the current photo</Text></Pressable>
                ) : null}
              </View>

              <Input
                label="Full name"
                value={name}
                onChangeText={(t) => { setName(t); setErrors((e) => ({ ...e, name: '', form: '' })); }}
                error={errors.name}
                autoCapitalize="words"
                maxLength={100}
              />
              <Input
                label="Physical description"
                value={description}
                onChangeText={(t) => { setDescription(t); setErrors((e) => ({ ...e, description: '', form: '' })); }}
                error={errors.description}
                multiline
                maxLength={1000}
              />

              {!verified ? (
                <Input
                  label="ID number (to verify this profile)"
                  placeholder="13 digits"
                  value={idNumber}
                  onChangeText={(t) => { setIdNumber(formatId(t)); setErrors((e) => ({ ...e, idNumber: '', form: '' })); }}
                  error={errors.idNumber || liveIdProblem || ''}
                  hint="Checked against the date of birth and gender, then discarded. It is never stored."
                  keyboardType="number-pad"
                  maxLength={15}
                />
              ) : null}

              <View style={styles.group}>
                <Text style={styles.label}>ID document or birth certificate</Text>
                {idDocument ? (
                  <View style={styles.row}>
                    <Image source={{ uri: idDocument.uri }} style={styles.docThumb} />
                    <Pressable onPress={() => setIdDocument(null)} hitSlop={8}><Text style={styles.link}>Keep the current document</Text></Pressable>
                  </View>
                ) : (
                  <ImageButtons onPick={async (cam) => { const a = await pickImage(cam, undefined); if (a) setIdDocument(a); }} />
                )}
              </View>

              <View style={styles.card}>
                <Detail label="Date of birth" value={formatDob(profile.date_of_birth)} />
                <View style={styles.divider} />
                <Detail label="Gender" value={profile.gender} />
              </View>
              <Text style={styles.note}>
                Date of birth and gender can't be changed because the ID number was checked against them. If they are wrong, remove this profile and add it again.
              </Text>

              <FieldError message={errors.form} />
              <Button title="Save changes" onPress={save} />
              <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PinSheet
        visible={!!pinFor}
        title={pinFor === 'remove' ? `Remove ${profile.full_name}?` : 'Confirm changes'}
        message={pinFor === 'remove'
          ? 'Enter your PIN to remove this profile permanently.'
          : `Enter your PIN to save the changes to ${profile.full_name}'s profile.`}
        confirmTitle={pinFor === 'remove' ? 'Remove profile' : 'Save changes'}
        danger={pinFor === 'remove'}
        onConfirm={confirmWithPin}
        onCancel={() => setPinFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  group: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },
  note: { fontSize: 12, lineHeight: 18, color: colors.ink3 },

  photoWrap: { alignItems: 'center' },
  photo: {
    width: 180, height: 220, borderRadius: radius.card, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  chip: {
    position: 'absolute', top: 10, right: '50%', marginRight: -84,
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 4,
  },
  chipSolid: { backgroundColor: colors.blue },
  chipOutline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line },
  chipText: { fontSize: 11, fontWeight: '700' },

  name: { fontSize: 24, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  sub: { fontSize: 14, color: colors.ink2, textAlign: 'center', marginTop: 2 },
  card: { padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, gap: 10 },
  divider: { height: 1, backgroundColor: colors.line },
  detail: { gap: 2 },
  detailLabel: { fontSize: 12, fontWeight: '600', color: colors.ink3 },
  detailValue: { fontSize: 15, lineHeight: 21, color: colors.ink },
  document: { height: 180, borderRadius: 12, backgroundColor: colors.blueLight },
  docThumb: { width: 72, height: 56, borderRadius: 8, backgroundColor: colors.blueLight },

  smallButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46,
    borderRadius: radius.button, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.blueMid, backgroundColor: colors.blueTint,
  },
  smallButtonText: { fontSize: 13, fontWeight: '700', color: colors.blue },
});
