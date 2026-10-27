/*
Image loaded from a protected backend URL: sends the login token with the request.
Shows the fallback (e.g. a silhouette) while loading or if the image fails.
*/
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { getToken } from '../../services/auth';

export default function AuthImage({ uri, style, fallback }) {
  const [token, setToken] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getToken().then((t) => active && setToken(t));
    return () => { active = false; };
  }, []);

  if (!uri || !token || failed) return <View style={style}>{fallback}</View>;

  return (
    <Image
      source={{ uri, headers: { Authorization: `Bearer ${token}` } }}
      style={style}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  );
}
