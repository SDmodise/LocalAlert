/*
14 Create alert -> 15 Confirm with PIN -> 16 Alert sent
Family Administrators only. Reports a verified profile missing: last known
location (current position or a typed place), last seen time and clothing.
The alert is only sent after the administrator's PIN is checked by the server.
*/
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert as NativeAlert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import PinInput from '../components/common/PinInput';
import SubHeader from '../components/common/SubHeader';
import AuthImage from '../components/common/AuthImage';
import { CameraIcon, CheckIcon, ClockIcon, FamilyTabIcon, InfoIcon, PersonSilhouette, PinIcon, UploadIcon } from '../components/common/Icons';
import { getMyFamilyGroup, profilePhotoUrl } from '../services/family';
import { lookupMunicipality } from '../services/municipalities';
import { currentPlace, findPlace, placeName } from '../services/location';
import { alertPhotoUrl, createAlert } from '../services/alerts';
import ShareAlertButton from '../components/alerts/ShareAlertButton';
import { ageInYears } from '../utils/idNumber';

const pad = (n) => String(n).padStart(2, '0');
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0];
}

const DAYS_BACK = 29; // the server accepts sightings up to 30 days ago
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Local calendar date, `daysAgo` days before today, as YYYY-MM-DD.
function isoDay(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

function lastSeenDate(day, time) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!m) return null;
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, Number(m[1]), Number(m[2]), 0, 0);
}

function scheduledText(iso) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const day = d.toDateString() === today.toDateString() ? '' : d.toDateString() === tomorrow.toDateString() ? 'tomorrow ' : `${d.getDate()}/${d.getMonth() + 1} `;
  return `Scheduled for ${day}${clock(d)}`;
}

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

// Photo for the alert: the profile photo, or a newer one taken or chosen now.
function PhotoChoice({ profile, newPhoto, onNewPhoto }) {
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
  const [pickingDate, setPickingDate] = useState(!!initial.day && initial.day !== isoDay(0) && initial.day !== isoDay(1));
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

          <View style={styles.group}>
            <Text style={styles.label}>Last seen</Text>
            <View style={styles.row}>
              {[[isoDay(0), 'Today'], [isoDay(1), 'Yesterday'], ['other', 'Other date']].map(([key, label]) => {
                const on = key === 'other' ? pickingDate : !pickingDate && day === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setErrors((e) => ({ ...e, time: '' }));
                      if (key === 'other') {
                        setPickingDate(true);
                        if (day === isoDay(0) || day === isoDay(1)) setDay(isoDay(2));
                      } else {
                        setPickingDate(false);
                        setDay(key);
                      }
                    }}
                    style={[styles.segment, styles.flex, on && styles.segmentOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.segmentText, on && { color: colors.white }]} numberOfLines={1}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {pickingDate ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
                {Array.from({ length: DAYS_BACK - 1 }, (_, i) => isoDay(i + 2)).map((iso) => (
                  <Pressable
                    key={iso}
                    onPress={() => setDay(iso)}
                    style={[styles.dateChip, day === iso && styles.segmentOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: day === iso }}
                  >
                    <Text style={[styles.dateChipDay, day === iso && { color: colors.white }]}>{dayLabel(iso).split(' ')[0]}</Text>
                    <Text style={[styles.dateChipDate, day === iso && { color: colors.white }]}>{dayLabel(iso).split(' ').slice(1).join(' ')}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.row}>
              <Text style={[styles.hint, styles.flex, { alignSelf: 'center' }]}>
                {pickingDate ? dayLabel(day) : day === isoDay(0) ? 'Today' : 'Yesterday'}, at
              </Text>
              <Input
                value={time}
                onChangeText={(t) => { setTime(t.replace(/[^0-9:]/g, '').slice(0, 5)); setErrors((e) => ({ ...e, time: '' })); }}
                keyboardType="numbers-and-punctuation"
                placeholder="HH:MM"
                maxLength={5}
                style={styles.flex}
                right={<ClockIcon />}
                accessibilityLabel="Last seen time"
              />
            </View>
            <FieldError message={errors.time} />
          </View>

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

// ---------------------------------------------------------------- 15 PIN

function ConfirmPin({ draft, onCancel, onSent }) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (pin.length !== 4) {
      setError('Enter your 4-digit PIN.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await createAlert({
        member_id: draft.memberId,
        latitude: draft.location.latitude,
        longitude: draft.location.longitude,
        last_seen_place: draft.location.place,
        last_seen_time: draft.lastSeen.toISOString(),
        clothing_description: draft.clothing,
        pin,
      }, draft.newPhoto);
      onSent(result);
    } catch (e) {
      setPin('');
      setError(e.message);
      setSending(false);
    }
  };

  return (
    <View style={[styles.blueRoot, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      <KeyboardAvoidingView style={styles.pinWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.lockCircle}><PinIcon size={34} color={colors.white} /></View>
        <Text style={styles.pinTitle}>Enter your PIN to send</Text>
        <Text style={styles.pinBody}>
          The alert for <Text style={styles.boldWhite}>{draft.profile.full_name}</Text> will go out immediately.
        </Text>
        <PinInput value={pin} onChange={(v) => { setPin(v); setError(''); }} label="Your PIN" error={!!error} autoFocus />
        {error ? (
          <View style={styles.pinError} accessibilityRole="alert">
            <InfoIcon size={16} color={colors.white} />
            <Text style={styles.pinErrorText}>{error}</Text>
          </View>
        ) : null}
        <Button title="Send alert" variant="outline" onPress={send} loading={sending} disabled={pin.length !== 4} style={styles.sendButton} />
        <Pressable onPress={onCancel} disabled={sending} hitSlop={10} accessibilityRole="button">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------------------------------------------------------------- 16 sent

function LevelRow({ badge, title, meta, done }) {
  return (
    <View style={styles.card}>
      <View style={[styles.badge, done && typeof badge === 'string' ? styles.badgeOn : styles.badgeOff]}>
        {typeof badge === 'string' ? <Text style={[styles.badgeText, done && { color: colors.white }]}>{badge}</Text> : badge}
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardMeta}>{meta}</Text>
      </View>
      <View style={[styles.chip, done ? styles.chipSolid : styles.chipOutline]}>
        <Text style={[styles.chipText, { color: done ? colors.white : colors.blue }]}>{done ? 'Sent' : 'Next'}</Text>
      </View>
    </View>
  );
}

function AlertSent({ result, onDone }) {
  const insets = useSafeAreaInsets();
  const { alert, reach } = result;
  const her = alert.gender === 'Female' ? 'her' : 'him';
  const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
  const users = (n) => `${n} ${n === 1 ? 'user' : 'users'}`;
  const levelTitle = (l) =>
    l.level === 4 ? 'All LocalAlert users'
      : l.level === 2 ? 'Neighbouring municipalities'
        : 'Municipalities next to those';
  const levelMeta = (l) => {
    const names = l.municipalities.length ? `${l.municipalities.join(', ')} · ` : l.level < 4 ? 'No new areas covered yet · ' : '';
    return l.status === 'sent' ? `${names}${users(l.users)}` : `${names}${scheduledText(l.scheduled_at)}`;
  };
  const nextIndex = reach.levels.findIndex((l) => l.status === 'scheduled');

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + 28 }]}>
        <View style={styles.heroCheck}><CheckIcon size={30} color={colors.blue} /></View>
        <Text style={styles.heroTitle}>Alert sent</Text>
        <Text style={styles.heroBody}>
          {firstName(alert.child_name)}'s alert is live. We will widen the search every 6 hours until you mark {her} as found.
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.sentCard}>
          <AuthImage
            uri={alert.has_photo ? alertPhotoUrl(alert.alert_id) : null}
            style={styles.sentPhoto}
            fallback={<PersonSilhouette size={56} />}
          />
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{alert.child_name}</Text>
            <Text style={styles.cardMeta}>{alert.age !== null ? `${alert.age} years · ` : ''}{alert.last_seen_place || alert.municipality_name}</Text>
            <Text style={styles.cardMeta} numberOfLines={2}>{alert.clothing_description}</Text>
          </View>
        </View>
        <ShareAlertButton alert={alert} variant="primary" title="Share on WhatsApp, Facebook, X…" />
        <Text style={styles.hint}>Sharing sends a LocalAlert link, so everyone always sees the latest details and photo.</Text>
        <Text style={styles.label}>Who has been told</Text>
        <LevelRow badge={<FamilyTabIcon size={22} active />} title="Linked family" meta={reach.family ? `${people(reach.family)} · immediately` : 'No linked family members yet'} done={reach.family > 0} />
        <LevelRow badge="L1" title={alert.municipality_name} meta={`${users(reach.levels[0].users)} · now`} done />
        {reach.levels.slice(1).map((l, i) =>
          l.status === 'sent' || i + 1 === nextIndex ? (
            <LevelRow key={l.level} badge={`L${l.level}`} title={levelTitle(l)} meta={levelMeta(l)} done={l.status === 'sent'} />
          ) : null
        )}
        {nextIndex > 0 && nextIndex < 3 ? (
          <Text style={styles.hint}>
            After that: Level {nextIndex + 2}{nextIndex + 2 < 4 ? ' and Level 4 (all users)' : ' (all users)'} every 6 hours.
          </Text>
        ) : null}
        <Button title="Back to alerts" variant="secondary" onPress={onDone} style={{ marginTop: 8 }} />
        <Button title="Call SAPS (10111)" variant="outline" onPress={() => Linking.openURL('tel:10111')} />
      </ScrollView>
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
      <ConfirmPin
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
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
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

  segment: {
    height: 48, paddingHorizontal: 14, borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  segmentOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.ink2 },
  dateRow: { gap: 8, paddingVertical: 2 },
  dateChip: {
    width: 64, paddingVertical: 8, borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', backgroundColor: colors.white,
  },
  dateChipDay: { fontSize: 12, fontWeight: '600', color: colors.ink3 },
  dateChipDate: { fontSize: 14, fontWeight: '700', color: colors.ink },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint,
  },

  // Photo choice
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

  // PIN
  blueRoot: { flex: 1, backgroundColor: colors.blue, paddingHorizontal: 24 },
  pinWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  lockCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  pinTitle: { fontSize: 22, fontWeight: '800', color: colors.white, textAlign: 'center' },
  pinBody: { fontSize: 14, lineHeight: 21, color: colors.heroText, textAlign: 'center', marginBottom: 8 },
  boldWhite: { fontWeight: '700', color: colors.white },
  pinError: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: colors.danger,
  },
  pinErrorText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: colors.white },
  sendButton: { alignSelf: 'stretch', marginTop: 8 },
  cancel: { fontSize: 15, fontWeight: '600', color: colors.heroText, padding: 8 },

  // Sent
  sentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  sentPhoto: {
    width: 96, height: 120, borderRadius: 12, backgroundColor: colors.blueLight,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
  },
  hero: { backgroundColor: colors.blue, alignItems: 'center', paddingHorizontal: 28, paddingBottom: 28, gap: 10 },
  heroCheck: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: colors.white },
  heroBody: { fontSize: 14, lineHeight: 21, color: colors.heroText, textAlign: 'center' },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: colors.blue },
  badgeOff: { backgroundColor: colors.blueLight },
  badgeText: { fontSize: 13, fontWeight: '800', color: colors.blue },
  chip: { borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  chipSolid: { backgroundColor: colors.blue },
  chipOutline: { borderWidth: 1.5, borderColor: colors.blue },
  chipText: { fontSize: 11, fontWeight: '700' },
});
