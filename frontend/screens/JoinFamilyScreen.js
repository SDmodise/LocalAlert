/*
19 Join a family group — matches Figma screen "19 Join a family group – Scan QR".
Lists invitations sent to this user and scans a family administrator's QR code.
Before joining, the user sees which family it is and confirms.
*/
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { colors, radius } from '../theme';
import Button from '../components/common/Button';
import SubHeader from '../components/common/SubHeader';
import { CheckIcon, FamilyTabIcon, InfoIcon } from '../components/common/Icons';
import {
  QR_PREFIX,
  acceptInvitation,
  acceptQrCode,
  declineInvitation,
  getMyInvitations,
  previewQrCode,
} from '../services/invitations';

function Confirm({ invitation, busy, error, onAccept, onDecline }) {
  return (
    <View style={styles.sheetBody}>
      <View style={styles.sheetRow}>
        <View style={styles.tile}><FamilyTabIcon size={24} active /></View>
        <View style={styles.flex}>
          <Text style={styles.caption}>Invitation from {invitation.invited_by}</Text>
          <Text style={styles.sheetTitle}>Join {invitation.group_name}?</Text>
        </View>
      </View>
      <Text style={styles.body}>
        You will receive this family's alerts and sightings immediately, wherever you are.
      </Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Button title="Accept and join" onPress={onAccept} loading={busy} />
      <Pressable onPress={onDecline} disabled={busy} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.link, styles.center]}>Decline</Text>
      </Pressable>
    </View>
  );
}

function Scanner({ onClose, onJoined }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scanning = useRef(true);
  const [code, setCode] = useState(null);
  const [invitation, setInvitation] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCode(null);
    setInvitation(null);
    setError('');
    scanning.current = true;
  };

  const onScanned = async ({ data }) => {
    if (!scanning.current) return;
    if (!String(data).startsWith(QR_PREFIX)) {
      scanning.current = false;
      setError('This is not a LocalAlert family code.');
      return;
    }
    scanning.current = false;
    setCode(data);
    setChecking(true);
    setError('');
    try {
      setInvitation(await previewQrCode(data));
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  };

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await acceptQrCode(code);
      onJoined(result.group.group_name);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return <View style={[styles.dark, styles.centered]}><ActivityIndicator color={colors.white} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <SubHeader title="Scan family QR code" onBack={onClose} close />
        <View style={styles.permission}>
          <Text style={[styles.body, styles.center]}>
            LocalAlert needs the camera to scan the QR code on the family administrator's phone.
          </Text>
          <Button title="Allow camera" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.dark, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <SubHeader title="Scan family QR code" onBack={onClose} close light />
      <View style={styles.cameraArea}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={code || error ? undefined : onScanned}
        />
        <View style={styles.viewfinder} pointerEvents="none">
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        <Text style={styles.cameraHint}>Point your camera at the QR code on the family administrator's phone</Text>
      </View>

      {(checking || invitation || error) && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          {checking ? (
            <ActivityIndicator color={colors.blue} />
          ) : invitation ? (
            <Confirm invitation={invitation} busy={busy} error={error} onAccept={accept} onDecline={onClose} />
          ) : (
            <View style={styles.sheetBody}>
              <View style={styles.sheetRow}>
                <InfoIcon size={22} />
                <Text style={[styles.body, styles.flex, { color: colors.ink }]}>{error}</Text>
              </View>
              <Button title="Scan again" onPress={reset} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function JoinFamilyScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [scanning, setScanning] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [joined, setJoined] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setInvitations(await getMyInvitations());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (scanning) setScanning(false);
      else onBack?.();
      return true;
    });
    return () => sub.remove();
  }, [scanning, onBack]);

  const respond = async (inv, accept) => {
    setBusyId(inv.invitation_id);
    setError('');
    try {
      if (accept) {
        await acceptInvitation(inv.invitation_id);
        setJoined(inv.group_name);
      } else {
        await declineInvitation(inv.invitation_id);
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (scanning) {
    return (
      <Scanner
        onClose={() => setScanning(false)}
        onJoined={(groupName) => {
          setScanning(false);
          setJoined(groupName);
          load();
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <SubHeader title="Join a family group" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        {joined ? (
          <View style={styles.successBox} accessibilityRole="alert">
            <View style={styles.successBadge}><CheckIcon size={12} /></View>
            <Text style={[styles.body, styles.flex, { color: colors.ink }]}>
              You joined {joined}. You will now receive this family's alerts immediately.
            </Text>
          </View>
        ) : null}

        <View style={styles.infoBox}>
          <Text style={styles.cardTitle}>Scan a QR code</Text>
          <Text style={styles.body}>
            Ask the family administrator to open Family › Invite on their phone and show you the QR code.
          </Text>
          <Button title="Scan QR code" onPress={() => { setJoined(''); setScanning(true); }} />
        </View>

        <Text style={styles.sectionTitle}>Invitations</Text>
        {loading ? (
          <ActivityIndicator color={colors.blue} />
        ) : invitations.length === 0 ? (
          <Text style={styles.body}>
            No invitations right now. Invitations sent to your email address or phone number will appear here.
          </Text>
        ) : (
          invitations.map((inv) => (
            <View key={inv.invitation_id} style={styles.card}>
              <View style={styles.sheetRow}>
                <View style={styles.tile}><FamilyTabIcon size={22} active /></View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{inv.group_name}</Text>
                  <Text style={styles.caption}>From {inv.invited_by}</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Button title="Decline" variant="secondary" style={styles.flex}
                  onPress={() => respond(inv, false)} disabled={!!busyId} />
                <Button title="Accept" style={styles.flex}
                  onPress={() => respond(inv, true)} loading={busyId === inv.invitation_id} disabled={!!busyId && busyId !== inv.invitation_id} />
              </View>
            </View>
          ))
        )}

        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <InfoIcon size={18} />
            <Text style={[styles.errorText, styles.flex]}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const CORNER = 46;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  dark: { flex: 1, backgroundColor: colors.ink },
  centered: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  content: { flexGrow: 1, paddingHorizontal: 20, gap: 14 },
  body: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  caption: { fontSize: 12, color: colors.ink3 },
  link: { fontSize: 13, fontWeight: '600', color: colors.blue },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  errorText: { fontSize: 13, fontWeight: '600', color: colors.danger },

  infoBox: { gap: 10, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint },
  card: { gap: 12, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line },
  actions: { flexDirection: 'row', gap: 10 },
  tile: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.blueLight, alignItems: 'center', justifyContent: 'center' },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.blue, backgroundColor: colors.blueTint },
  successBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger, backgroundColor: colors.dangerTint },

  permission: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  cameraArea: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  viewfinder: { width: 250, height: 250 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.white },
  tl: { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 14 },
  cameraHint: { position: 'absolute', bottom: 32, left: 24, right: 24, fontSize: 15, color: colors.heroText, textAlign: 'center' },

  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 22 },
  sheetBody: { gap: 12 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
