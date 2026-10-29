/*
14 Create alert -> 15 Confirm with PIN -> 16 Alert sent
Family Administrators only. Reports a verified profile missing: last known
location (a typed place or the phone's current position), last seen time and clothing.
The alert is only sent after the administrator's PIN is checked by the server.
The PIN step and the "Alert sent" screen are in components/alerts.
*/
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import Button from '../../components/common/Button';
import Input, { FieldError } from '../../components/common/Input';
import SubHeader from '../../components/common/SubHeader';
import AuthImage from '../../components/common/AuthImage';
import { CheckIcon, FamilyTabIcon, InfoIcon, PersonSilhouette, PinIcon } from '../../components/common/Icons';
import PhotoChoice from '../../components/alerts/PhotoChoice';
import LastSeenPicker, { isOtherDate } from '../../components/alerts/LastSeenPicker';
import ConfirmAlertPin from '../../components/alerts/ConfirmAlertPin';
import AlertSent from '../../components/alerts/AlertSent';
import { getMyFamilyGroup, profilePhotoUrl } from '../../services/family';
import { lookupMunicipality } from '../../services/municipalities';
import { currentPlace, findPlace, placeName } from '../../services/location';
import { ageInYears } from '../../utils/idNumber';
import { clock, isoDay, lastSeenDate } from '../../utils/dates';

// ---------------------------------------------------------------- 14 form

function ProfileOption({ profile, selected, onPress }) {
  const verified = profile.verification_status === 'verified';
  const age = ageInYears(profile.date_of_birth);
  return (
    <Pressable
      onPress={verified ? onPress : undefined}
      style={[styles.card, selected && styles.cardSelected, !verified && styles.cardDisabled]}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !verified }}
      accessibilityLabel={`${profile.full_name}, ${age ?? ''} years, ${verified ? 'verified' : 'pending ID, cannot be used'}`}
    >
      <AuthImage
        uri={profile.has_photo ? profilePhotoUrl(profile.member_id) : null}
        style={styles.avatar}
        fallback={<PersonSilhouette size={32} />}
      />
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{profile.full_name}</Text>
        <Text style={styles.cardMeta}>
          {age !== null ? `${age} ${age === 1 ? 'year' : 'years'} · ` : ''}{verified ? 'Verified' : 'Pending ID – cannot be used'}
        </Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <CheckIcon size={12} /> : null}</View>
    </Pressable>
  );
}

function AlertForm({ initial, onBack, onContinue }) {
  const insets = useSafeAreaInsets();
  const [profiles, setProfiles] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [memberId, setMemberId] = useState(initial.memberId || null);
  const [newPhoto, setNewPhoto] = useState(initial.newPhoto || null);

  // Location
  const [location, setLocation] = useState(initial.location || null); // { latitude, longitude, place, municipality }
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [editingPlace, setEditingPlace] = useState(!initial.location); // ask where they were last seen
  const [placeText, setPlaceText] = useState('');

  // Last seen + clothing
  const [day, setDay] = useState(initial.day || isoDay(0)); // YYYY-MM-DD
  const [pickingDate, setPickingDate] = useState(isOtherDate(initial.day));
  const [time, setTime] = useState(initial.time || clock(new Date()));
  const [clothing, setClothing] = useState(initial.clothing || '');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    getMyFamilyGroup()
      .then((data) => {
        const list = data.profiles || [];
        setProfiles(list);
        if (!memberId) {
          const verified = list.filter((p) => p.verification_status === 'verified');
          if (verified.length === 1) setMemberId(verified[0].member_id);
        }
      })
      .catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolve = async (latitude, longitude, place) => {
    const municipality = await lookupMunicipality(latitude, longitude);
    if (!municipality) {
      setLocation(null);
      setLocationError('This place is outside the area LocalAlert covers. If someone is in danger, call SAPS on 10111.');
      return;
    }
    // The address the phone matched, so the reporter can check it is the right place.
    const found = await placeName(latitude, longitude);
    setLocation({ latitude, longitude, place, found, municipality });
    setLocationError('');
    return true;
  };

  async function locateNow() {
    setLocating(true);
    setLocationError('');
    setEditingPlace(false);
    try {
      const result = await currentPlace();
      if (result.status === 'no-permission') {
        setLocationError('Location permission is off. Type the place where they were last seen instead.');
        setEditingPlace(true);
      } else if (result.status !== 'ok') {
        setLocationError("Couldn't get your location. Type the place where they were last seen instead.");
        setEditingPlace(true);
      } else {
        await resolve(result.latitude, result.longitude, result.place || 'Where I am now');
      }
    } catch (e) {
      setLocationError(e.message);
    } finally {
      setLocating(false);
    }
  }

  const searchPlace = async () => {
    const text = placeText.trim();
    if (text.length < 3) {
      setLocationError('Type a place, street or landmark.');
      return;
    }
    setLocating(true);
    setLocationError('');
    try {
      const found = await findPlace(text);
      if (found.status !== 'ok') {
        setLocationError("Couldn't find that place. Add the suburb or town, e.g. \"Mabopane Station, Mabopane\".");
        return;
      }
      if (await resolve(found.latitude, found.longitude, text)) setEditingPlace(false);
    } catch (e) {
      setLocationError(e.message);
    } finally {
      setLocating(false);
    }
  };

  const selected = profiles?.find((p) => p.member_id === memberId);
  const verifiedCount = profiles ? profiles.filter((p) => p.verification_status === 'verified').length : 0;

  const submit = () => {
    const next = {};
    if (!selected) next.member = 'Choose who is missing.';
    if (!location) next.location = editingPlace ? 'Type where they were last seen and tap Find this place.' : 'Add the last known location.';
    const seen = lastSeenDate(day, time);
    if (!seen) next.time = 'Enter the time as HH:MM, e.g. 11:50.';
    else if (seen.getTime() > Date.now() + 60000) next.time = 'The last seen time cannot be in the future.';
    if (clothing.trim().length < 3) next.clothing = 'Describe what they were wearing.';
    setErrors(next);
    if (Object.keys(next).length) return;
    onContinue({
      profile: selected,
      memberId,
      location,
      day,
      time,
      clothing: clothing.trim(),
      lastSeen: seen,
      newPhoto,
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title="Report missing person" onBack={onBack} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Who is missing?</Text>
          {!profiles && !loadError ? <ActivityIndicator color={colors.blue} style={{ marginVertical: 12 }} /> : null}
          {loadError ? <FieldError message={loadError} /> : null}
          {profiles && verifiedCount === 0 ? (
            <View style={styles.infoBox}>
              <FamilyTabIcon size={28} active />
              <Text style={[styles.body, styles.flex]}>
                You need a verified profile first. Go to the Family tab, add the person with their photo and ID number, then come back here.
              </Text>
            </View>
          ) : null}
          {profiles?.map((p) => (
            <ProfileOption key={p.member_id} profile={p} selected={p.member_id === memberId} onPress={() => { if (p.member_id !== memberId) setNewPhoto(null); setMemberId(p.member_id); setErrors((e) => ({ ...e, member: '' })); }} />
          ))}
          <FieldError message={errors.member} />

          {selected ? <PhotoChoice profile={selected} newPhoto={newPhoto} onNewPhoto={setNewPhoto} /> : null}

          <View style={styles.group}>
            <Text style={styles.label}>Last known location</Text>
            {editingPlace ? (
              <View style={styles.group}>
                <Text style={styles.hint}>Where were they last seen? Type the place, street or landmark, with the suburb or town.</Text>
                <Input
                  placeholder="e.g. Soshanguve Crossing Mall, Soshanguve"
                  value={placeText}
                  onChangeText={(t) => { setPlaceText(t); setLocationError(''); setErrors((e) => ({ ...e, location: '' })); }}
                  returnKeyType="search"
                  onSubmitEditing={searchPlace}
                  maxLength={150}
                />
                <Button title="Find this place" onPress={searchPlace} loading={locating} />
                <Button title="I'm there now: use my location" variant="secondary" onPress={locateNow} disabled={locating} />
                {location ? (
                  <Pressable onPress={() => setEditingPlace(false)} hitSlop={8} style={{ alignSelf: 'center' }}>
                    <Text style={styles.link}>Keep {location.place}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={[styles.field, (errors.location || locationError) && styles.fieldError]}>
                <PinIcon size={20} />
                {locating ? (
                  <Text style={[styles.fieldText, { color: colors.ink3 }]}>Finding the place…</Text>
                ) : (
                  <Text style={styles.fieldText} numberOfLines={1}>{location ? location.place : 'No location yet'}</Text>
                )}
                <Pressable onPress={() => { setPlaceText(''); setEditingPlace(true); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change location">
                  <Text style={styles.link}>Change</Text>
                </Pressable>
              </View>
            )}
            {location && !editingPlace ? (
              <Text style={styles.hint}>
                {location.found && location.found !== location.place ? `Found: ${location.found}\n` : ''}
                Municipality: {location.municipality.municipality_name}. Not right? Tap Change and add the suburb or town.
              </Text>
            ) : null}
            <FieldError message={locationError || errors.location} />
          </View>

          <LastSeenPicker
            day={day}
            onDayChange={(d) => { setDay(d); setErrors((e) => ({ ...e, time: '' })); }}
            pickingDate={pickingDate}
            onPickingDateChange={setPickingDate}
            time={time}
            onTimeChange={(t) => { setTime(t); setErrors((e) => ({ ...e, time: '' })); }}
            error={errors.time}
          />

          <Input
            label="What were they wearing?"
            placeholder="e.g. Red school jersey, grey skirt, black shoes"
            value={clothing}
            onChangeText={(t) => { setClothing(t); setErrors((e) => ({ ...e, clothing: '' })); }}
            error={errors.clothing}
            multiline
            maxLength={500}
          />

          <View style={styles.infoBox}>
            <InfoIcon size={18} color={colors.blue} />
            <Text style={[styles.body, styles.flex]}>
              Your family and people in <Text style={styles.bold}>{location ? location.municipality.municipality_name : 'the area'}</Text> are told at once. The search widens every 6 hours until the alert is resolved.
            </Text>
          </View>

          <Button title="Continue to PIN" onPress={submit} disabled={!profiles || locating} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------------------------------------------------------------- flow

export default function CreateAlertScreen({ onClose, onCreated }) {
  const [step, setStep] = useState('form'); // form | pin | sent
  const [draft, setDraft] = useState(null);
  const [result, setResult] = useState(null);
  const initial = useMemo(() => draft || {}, [draft]);

  if (step === 'sent' && result) {
    return <AlertSent result={result} onDone={() => onCreated?.(result.alert)} />;
  }
  if (step === 'pin' && draft) {
    return (
      <ConfirmAlertPin
        draft={draft}
        onCancel={() => setStep('form')}
        onSent={(r) => { setResult(r); setStep('sent'); }}
      />
    );
  }
  return (
    <AlertForm
      initial={initial}
      onBack={onClose}
      onContinue={(d) => { setDraft(d); setStep('pin'); }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  group: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 4 },
  hint: { fontSize: 12, color: colors.ink3 },
  body: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  bold: { fontWeight: '700', color: colors.ink },
  link: { fontSize: 13, fontWeight: '700', color: colors.blue },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  cardSelected: { borderColor: colors.blue, backgroundColor: colors.blueTint },
  cardDisabled: { opacity: 0.55 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.blue, borderColor: colors.blue },

  field: {
    height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
    borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  fieldError: { borderColor: colors.danger },
  fieldText: { flex: 1, fontSize: 15, color: colors.ink },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint,
  },
});
