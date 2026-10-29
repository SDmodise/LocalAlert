/*
Shares an alert through the phone's share sheet (WhatsApp, Facebook, X, Instagram,
SMS, email, ...). Only a link is shared, never a copy of the details: the link opens
LocalAlert's public page, which always shows the current status and photo.
*/
import React, { useState } from 'react';
import { Alert as NativeAlert, Share } from 'react-native';
import Button from '../common/Button';
import { getShareLink } from '../../services/alerts';

export default function ShareAlertButton({ alert, variant = 'secondary', title = 'Share alert', style }) {
  const [busy, setBusy] = useState(false);

  const openShareSheet = (message) =>
    Share.share(
      // The message already contains the link; passing it once avoids apps showing it twice.
      { message, title: `Missing: ${alert.child_name}` },
      { dialogTitle: `Share ${alert.child_name}'s alert` } // Android share sheet title
    );

  const share = async () => {
    setBusy(true);
    try {
      const { message, local_only: localOnly } = await getShareLink(alert.alert_id);
      if (localOnly) {
        // Testing on Wi-Fi: the server has no public address, so the link is only
        // usable on this network and most apps won't show it as a tappable link.
        NativeAlert.alert(
          'Link only works on this Wi-Fi',
          "LocalAlert's server doesn't have a public internet address yet, so people on other networks can't open this link, and apps like WhatsApp may not make it tappable.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Share anyway', onPress: () => openShareSheet(message).catch(() => {}) },
          ]
        );
        return;
      }
      await openShareSheet(message);
    } catch (e) {
      NativeAlert.alert('Could not share the alert', e.message);
    } finally {
      setBusy(false);
    }
  };

  return <Button title={title} variant={variant} onPress={share} loading={busy} style={style} />;
}
