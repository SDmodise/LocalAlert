/*
Finding a place for an alert: the phone's current position, or a typed address.
Uses the phone's own geocoder (expo-location); nothing is sent to other services.
*/
import * as Location from 'expo-location';

// Short readable name for a position, e.g. "Soshanguve Crossing Mall, Soshanguve".
export async function placeName(latitude, longitude) {
  try {
    const [p] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!p) return '';
    const first = p.name && !/^\d+$/.test(p.name) ? p.name : [p.streetNumber, p.street].filter(Boolean).join(' ');
    const area = p.district || p.subregion || p.city;
    return [first, area].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ').slice(0, 150);
  } catch {
    return '';
  }
}

// { status: 'ok', latitude, longitude, place } | { status: 'no-permission' | 'unavailable' }
export async function currentPlace() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return { status: 'no-permission' };
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = position.coords;
    return { status: 'ok', latitude, longitude, place: await placeName(latitude, longitude) };
  } catch {
    return { status: 'unavailable' };
  }
}

// Looks up a typed place or address in South Africa.
// { status: 'ok', latitude, longitude } | { status: 'not-found' }
export async function findPlace(text) {
  try {
    const results = await Location.geocodeAsync(`${text}, South Africa`);
    if (!results.length) return { status: 'not-found' };
    return { status: 'ok', latitude: results[0].latitude, longitude: results[0].longitude };
  } catch {
    return { status: 'not-found' };
  }
}
