/*
"Confirm your home municipality when you get home."
Set at sign-up when the person said the detected municipality is not their home
(they were somewhere else). Profile shows a reminder until they confirm it, and the
app reminds them once each time it opens. Kept on this phone only.
*/
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (email) => `localalert.confirmHome.${String(email || '').toLowerCase()}`;

export async function needsHomeConfirmation(email) {
  if (!email) return false;
  try {
    return (await AsyncStorage.getItem(key(email))) === '1';
  } catch {
    return false;
  }
}

export async function setHomeConfirmationNeeded(email, needed) {
  if (!email) return;
  try {
    if (needed) await AsyncStorage.setItem(key(email), '1');
    else await AsyncStorage.removeItem(key(email));
  } catch {
    // Not saved: the reminder simply isn't shown.
  }
}
