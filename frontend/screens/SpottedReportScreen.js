/*
08 Spotted report — "I saw this person". Live location, what they saw and/or a
photo; at least one. The report goes straight to the family.
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
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { colors, radius } from '../theme';
import Button from '../components/common/Button';
import Input, { FieldError } from '../components/common/Input';
import SubHeader from '../components/common/SubHeader';
import AuthImage from '../components/common/AuthImage';
import { CameraIcon, CheckIcon, PersonSilhouette, PinIcon, UploadIcon } from '../components/common/Icons';
import { alertPhotoUrl, sendSighting } from '../services/alerts';
import { currentPlace } from '../services/location';

const MAX = 500;

async function pickPhoto(fromCamera) {
  const permission = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    NativeAlert.alert('Permission needed', fromCamera
      ? 'Allow camera access in your phone settings to take a photo.'
      : 'Allow photo access in your phone settings to choose a photo.');
    return null;
  }
  const options = { mediaTypes: ['images'], quality: 0.6 };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : result.assets[0];
}

export default function SpottedReportScreen({ alert, onBack, onSent }) {
  const insets = useSafeAreaInsets();
  const [shareLocation, setShareLocation] = useState(false);
  const [location, setLocation] = useState(null); // { latitude, longitude, place }
  const [locating, setLocating] = useState(false);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const toggleLocation = async (on) => {
    setError('');
    if (!on) {
      setShareLocation(false);
      setLocation(null);
      return;
    }
    setShareLocation(true);
    setLocating(true);
    const result = await currentPlace();
    setLocating(false);
    if (result.status !== 'ok') {
      setShareLocation(false);
      setError(result.status === 'no-permission'
        ? 'Location permission is off. Describe the place instead, or allow location in your phone settings.'
        : "Couldn't get your location. Describe the place instead.");
      return;
    }
    setLocation(result);
  };

  const addPhoto = async (fromCamera) => {
    setError('');
    const asset = await pickPhoto(fromCamera);
    if (asset) setPhoto(asset);
  };

  const send = async () => {
    const text = description.trim();
    if (!text && !location && !photo) {
      setError('Add at least one: your location, what you saw, or a photo.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await sendSighting(alert.alert_id, { description: text, location, photo });
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top, paddingHorizontal: 28 }]}>
        <View style={styles.doneCircle}><CheckIcon size={30} /></View>
        <Text style={styles.doneTitle}>Report sent</Text>
        <Text style={[styles.body, { textAlign: 'center' }]}>
          Thank you. {alert.child_name}'s family has been told. If the person is in danger right now, call SAPS on 10111.
        </Text>
        <Button title="Back to alert" onPress={onSent} style={styles.stretch} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title="Report a sighting" onBack={onBack} disabled={sending} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.summary}>
            <AuthImage
              uri={alert.has_photo ? alertPhotoUrl(alert.alert_id) : null}
              style={styles.thumb}
              fallback={<PersonSilhouette size={28} />}
            />
            <View style={styles.flex}>
              <Text style={styles.name}>{alert.child_name}{alert.age !== null ? `, ${alert.age}` : ''}</Text>
              <Text style={styles.meta} numberOfLines={2}>{alert.clothing_description}</Text>
            </View>
          </View>

          <Text style={styles.body}>Add at least one of the following. Your report goes straight to the family.</Text>

          <View style={[styles.card, shareLocation && styles.cardOn]}>
            <PinIcon size={22} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Share my live location</Text>
              <Text style={styles.meta} numberOfLines={2}>
                {locating ? 'Finding your location…' : location ? location.place || 'Location found' : 'Sends where you are right now'}
              </Text>
            </View>
            <Switch
              value={shareLocation}
              onValueChange={toggleLocation}
              disabled={locating}
              trackColor={{ false: colors.line, true: colors.blue }}
              thumbColor={colors.white}
              accessibilityLabel="Share my live location"
            />
          </View>

          <Input
            label="Directions or what you saw"
            placeholder="e.g. Walking with an adult towards the taxi rank, holding a blue backpack."
            value={description}
            onChangeText={(t) => { setDescription(t.slice(0, MAX)); setError(''); }}
            multiline
            maxLength={MAX}
            hint={`${description.length} / ${MAX}`}
          />

          <Text style={styles.label}>Photo</Text>
          {photo ? (
            <View style={styles.photoRow}>
              <Image source={{ uri: photo.uri }} style={styles.photo} />
              <Pressable onPress={() => setPhoto(null)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Remove photo</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.row}>
              <Pressable style={styles.photoButton} onPress={() => addPhoto(true)} accessibilityRole="button">
                <CameraIcon size={24} />
                <Text style={styles.photoButtonText}>Take photo</Text>
              </Pressable>
              <Pressable style={styles.photoButton} onPress={() => addPhoto(false)} accessibilityRole="button">
                <UploadIcon size={22} />
                <Text style={styles.photoButtonText}>Choose photo</Text>
              </Pressable>
            </View>
          )}

          <FieldError message={error} />
          <Button title="Send report to family" onPress={send} loading={sending} disabled={locating} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch', marginTop: 8 },
  content: { paddingHorizontal: 20, gap: 14 },
  row: { flexDirection: 'row', gap: 10 },
  body: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card,
    backgroundColor: colors.blueTint, borderWidth: 1.5, borderColor: colors.line,
  },
  thumb: { width: 48, height: 56, borderRadius: 10, backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  cardOn: { borderColor: colors.blue, backgroundColor: colors.blueTint },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 96, height: 96, borderRadius: 12, backgroundColor: colors.blueLight },
  photoButton: {
    flex: 1, height: 84, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.blueMid,
    alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.blueTint,
  },
  photoButtonText: { fontSize: 13, fontWeight: '600', color: colors.blue },
  doneCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 24, fontWeight: '800', color: colors.ink },
});
