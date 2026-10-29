/*
Image loaded from a protected backend URL: sends the login token with the request
(in the address and as a header).
Shows the fallback (e.g. a silhouette) while loading or if the image can't be loaded.
If loading fails (e.g. a brief network drop), it tries again twice before giving up,
and starts over whenever the image address changes.
*/
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { getToken } from '../../services/auth';
import { TUNNEL_HEADERS } from '../../services/api';

const RETRIES = 2;
const RETRY_DELAY_MS = 3000;

export default function AuthImage({ uri, style, fallback }) {
  const [token, setToken] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getToken().then((t) => active && setToken(t));
    return () => { active = false; };
  }, []);

  // New image: start again.
  useEffect(() => {
    setAttempt(0);
    setFailed(false);
    setLoaded(false);
  }, [uri]);

  const onError = () => {
    if (attempt < RETRIES) setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAY_MS);
    else setFailed(true);
  };

  if (!uri || !token || failed) return <View style={style}>{fallback}</View>;

  // The login token goes in the address as well as the header: the phone's image
  // component doesn't always send headers (then the server would refuse the photo).
  // A retry adds a counter so the phone doesn't reuse a failed result.
  const params = [`access_token=${encodeURIComponent(token)}`];
  if (attempt) params.push(`retry=${attempt}`);
  const source = {
    uri: `${uri}${uri.includes('?') ? '&' : '?'}${params.join('&')}`,
    headers: { Authorization: `Bearer ${token}`, ...TUNNEL_HEADERS },
  };

  return (
    <View style={[style, { overflow: 'hidden' }]}>
      {!loaded ? fallback : null}
      <Image
        key={source.uri}
        source={source}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={onError}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
