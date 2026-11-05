/*
Hand over responsibility (Family Administrators).

The administrator shares the responsibility to report chosen family profiles missing.
Only verified profiles (with a checked ID number) can be shared.

New hand-over:   1. choose the profiles  2. choose who: a linked family member, or
                 someone new (QR code or invitation)  3. confirm with the PIN.
                 A linked member gets a request that they accept within 24 hours.
Manage (member): change which profiles a member may report, or end it.
The administrator keeps full responsibility: this is sharing, not a transfer.
*/
import React, { useEffect, useMemo, useState } from 'react';
import { Alert as NativeAlert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import Button from '../../components/common/Button';
import SubHeader from '../../components/common/SubHeader';
import PinSheet from '../../components/common/PinSheet';
import { ChevronIcon, InfoIcon } from '../../components/common/Icons';
import ProfilePicker from '../../components/family/ProfilePicker';
import { updateSharedProfiles } from '../../services/family';
import { createQrInvitation, requestResponsibility } from '../../services/invitations';
import LinkMemberScreen from './LinkMemberScreen';

const fullName = (m) => `${m.first_name || ''} ${m.last_name || ''}`.trim();
const listNames = (names) => (names.length <= 1 ? names.join('')
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export default function HandOverScreen({ group, profiles, members, member, onBack, onDone }) {
  const insets = useSafeAreaInsets();
  const managing = !!member;
  const [step, setStep] = useState('profiles'); // profiles | who
  const [selected, setSelected] = useState(managing ? member.shared_profile_ids || [] : []);
  const [to, setTo] = useState(null); // a linked member, or 'new'
  const [pinFor, setPinFor] = useState(null); // send | save | end
  const [newPerson, setNewPerson] = useState(null); // { share, qr } once the QR code is made

  const verified = profiles.filter((p) => p.verification_status === 'verified');
  const chosenNames = useMemo(
    () => listNames(profiles.filter((p) => selected.includes(p.member_id)).map((p) => p.full_name)),
    [profiles, selected]
  );
  // Members who don't share yet (those who do are managed from the Family screen).
  const candidates = members.filter((m) => !(m.shared_profile_ids || []).length);

  const back = () => {
    if (pinFor) return;
    if (step === 'who') { setStep('profiles'); setTo(null); } else onBack();
  };

  useEffect(() => {
    if (newPerson) return undefined; // LinkMemberScreen handles Back then
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  });

  if (newPerson) {
    return (
      <LinkMemberScreen
        groupId={group.group_id}
        groupName={group.group_name}
        share={newPerson.share}
        initialQr={newPerson.qr}
        onBack={onDone}
      />
    );
  }

  const confirm = async (pin) => {
    if (pinFor === 'send' && to === 'new') {
      const share = { memberIds: selected, pin, names: chosenNames };
      const data = await createQrInvitation(group.group_id, share); // throws on a wrong PIN
      setPinFor(null);
      setNewPerson({ share, qr: { value: data.qr_value, expiresAt: data.invitation.expires_at } });
      return;
    }
    if (pinFor === 'send') {
      const result = await requestResponsibility(group.group_id, to.user_id, selected, pin);
      setPinFor(null);
      NativeAlert.alert('Request sent', result.message || `${fullName(to)} has 24 hours to accept it.`);
      onDone();
      return;
    }
    const ids = pinFor === 'end' ? [] : selected;
    const result = await updateSharedProfiles(group.group_id, member.user_id, ids, pin);
    setPinFor(null);
    NativeAlert.alert(ids.length ? 'Saved' : 'Ended', result.message);
    onDone();
  };

  const pinText = {
    send: to === 'new'
      ? `Next you show a QR code or send an invitation. The person who joins can report ${chosenNames} missing.`
      : to ? `${fullName(to)} will be asked to share the responsibility for ${chosenNames}. The request expires after 24 hours.` : '',
    save: `${managing ? fullName(member) : ''} will be able to report ${chosenNames} missing.`,
    end: `${managing ? fullName(member) : ''} will no longer be able to report anyone in ${group.group_name} missing. They stay linked and still get the alerts.`,
  }[pinFor] || '';

  const unchanged = managing
    && selected.length === (member.shared_profile_ids || []).length
    && selected.every((id) => member.shared_profile_ids.includes(id));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title={managing ? fullName(member) : 'Hand over responsibility'} onBack={back} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {step === 'profiles' ? (
          <>
            {!managing ? <Text style={styles.stepText}>Step 1 of 2</Text> : null}
            <Text style={styles.heading} accessibilityRole="header">
              {managing ? 'Profiles they can report' : 'Which profiles do you want to share?'}
            </Text>
            <Text style={styles.body}>
              {managing
                ? `${fullName(member)} can report the ticked profiles missing, mark them found and change the number to call. You keep the same rights.`
                : 'The person you choose will be able to report these people missing, mark them found and change the number to call. You keep full responsibility too.'}
            </Text>

            {verified.length === 0 ? (
              <View style={styles.infoBox}>
                <InfoIcon size={20} />
                <Text style={[styles.body, styles.flex]}>
                  Only verified profiles can be shared. Add an ID number to a profile first.
                </Text>
              </View>
            ) : (
              <ProfilePicker profiles={profiles} selected={selected} onChange={setSelected} />
            )}

            {managing ? (
              <>
                <Button title="Save changes" onPress={() => setPinFor(selected.length ? 'save' : 'end')} disabled={unchanged} />
                <Button title="End shared responsibility" variant="secondary" onPress={() => setPinFor('end')} />
              </>
            ) : (
              <Button title="Continue" onPress={() => setStep('who')} disabled={!selected.length} />
            )}
          </>
        ) : (
          <>
            <Text style={styles.stepText}>Step 2 of 2</Text>
            <Text style={styles.heading} accessibilityRole="header">Who should share it?</Text>
            <Text style={styles.body}>They will be able to report {chosenNames} missing.</Text>

            <Text style={styles.sectionTitle}>Linked family members</Text>
            {candidates.length === 0 ? (
              <Text style={styles.caption}>
                {members.length ? 'Everyone linked already shares responsibility. Change what they can report on the Family screen.' : 'No family members linked yet.'}
              </Text>
            ) : candidates.map((m) => (
              <Option key={m.user_id} title={fullName(m)} meta="Linked family member" selected={to?.user_id === m.user_id} onPress={() => setTo(m)} />
            ))}

            <Text style={styles.sectionTitle}>Someone new</Text>
            <Option title="QR code or invitation" meta="They are linked to your family when they accept" selected={to === 'new'} onPress={() => setTo('new')} />

            <Button title={to === 'new' ? 'Continue' : 'Send request'} onPress={() => setPinFor('send')} disabled={!to} />
          </>
        )}
      </ScrollView>

      <PinSheet
        visible={!!pinFor}
        title="Confirm with your PIN"
        message={pinText}
        confirmTitle={pinFor === 'end' ? 'End' : pinFor === 'save' ? 'Save' : 'Confirm'}
        danger={pinFor === 'end'}
        onConfirm={confirm}
        onCancel={() => setPinFor(null)}
      />
    </View>
  );
}

function Option({ title, meta, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.option, selected && styles.optionOn]}
      accessibilityRole="radio" accessibilityState={{ selected }}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.dot} /> : null}</View>
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.caption}>{meta}</Text>
      </View>
      <ChevronIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  stepText: { fontSize: 12, fontWeight: '700', color: colors.blue },
  heading: { fontSize: 22, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
  caption: { fontSize: 12, lineHeight: 18, color: colors.ink3 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 6 },
  infoBox: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  optionOn: { borderColor: colors.blue, backgroundColor: colors.blueTint },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.blue },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue },
});
