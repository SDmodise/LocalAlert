/*
Photo for a new alert: the profile photo, or a newer one taken or chosen now.
Used on the create alert form (screen 14).
*/
import React from 'react';
import { Alert as NativeAlert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { colors, radius } from '../../theme';
import AuthImage from '../common/AuthImage';
import { CameraIcon, CheckIcon, PersonSilhouette, UploadIcon } from '../common/Icons';
import { profilePhotoUrl } from '../../services/family';

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
  const options = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 5] };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : result.assets[0];
}

export default function PhotoChoice({ profile, newPhoto, onNewPhoto }) {
  const useProfile = !newPhoto;
  const choose = async (fromCamera) => {
    const asset = await pickPhoto(fromCamera);
    if (asset) onNewPhoto(asset);
  };
  return (
    <View style={styles.group}>
      <Text style={styles.label}>Photo for the alert</Text>
      <View style={styles.photoChoices}>
        <Pressable
          onPress={() => onNewPhoto(null)}
          style={[styles.photoOption, useProfile && styles.photoOptionOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: useProfile }}
        >
          <AuthImage
            uri={profile.has_photo ? profilePhotoUrl(profile.member_id) : null}
            style={styles.photoThumb}
            fallback={<PersonSilhouette size={44} />}
          />
          <Text style={styles.photoOptionText}>Profile photo</Text>
          {useProfile ? <View style={styles.photoTick}><CheckIcon size={11} /></View> : null}
        </Pressable>
        {newPhoto ? (
          <Pressable
            onPress={() => choose(false)}
            style={[styles.photoOption, styles.photoOptionOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: true }}
            accessibilityHint="Choose a different photo"
          >
            <Image source={{ uri: newPhoto.uri }} style={styles.photoThumb} />
            <Text style={styles.photoOptionText}>New photo</Text>
            <View style={styles.photoTick}><CheckIcon size={11} /></View>
          </Pressable>
        ) : (
          <View style={[styles.photoOption, styles.photoAdd]}>
            <Pressable style={styles.photoAddButton} onPress={() => choose(true)} accessibilityRole="button">
              <CameraIcon size={22} />
              <Text style={styles.photoAddText}>Take photo</Text>
            </Pressable>
            <View style={styles.photoAddLine} />
            <Pressable style={styles.photoAddButton} onPress={() => choose(false)} accessibilityRole="button">
              <UploadIcon size={20} />
              <Text style={styles.photoAddText}>Choose photo</Text>
            </Pressable>
          </View>
        )}
      </View>
      <Text style={styles.hint}>
        {newPhoto
          ? 'This newer photo goes out with the alert. The profile photo stays as it is.'
          : 'Have a more recent photo? Add it so people recognise them more easily.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 4 },
  hint: { fontSize: 12, color: colors.ink3 },
  photoChoices: { flexDirection: 'row', gap: 10 },
  photoOption: {
    flex: 1, alignItems: 'center', gap: 6, padding: 10, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  photoOptionOn: { borderColor: colors.blue, backgroundColor: colors.blueTint },
  photoThumb: {
    width: 84, height: 104, borderRadius: 10, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  photoOptionText: { fontSize: 12, fontWeight: '700', color: colors.ink2 },
  photoTick: {
    position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: { borderStyle: 'dashed', borderColor: colors.blueMid, backgroundColor: colors.blueTint, padding: 0, gap: 0 },
  photoAddButton: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  photoAddLine: { height: 1, alignSelf: 'stretch', backgroundColor: colors.line },
  photoAddText: { fontSize: 12, fontWeight: '700', color: colors.blue },
});
