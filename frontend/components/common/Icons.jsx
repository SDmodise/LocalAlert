import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme';

export function ShieldLogo({ size = 36, color = colors.blue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill={color} />
      <Path d="M12 7v6M12 16.5v.5" stroke={colors.white} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function InfoIcon({ size = 14, color = colors.blueDark }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={color} />
      <Path d="M12 7v6M12 16.5v.5" stroke={colors.white} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function BackIcon({ size = 18, color = colors.blue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CheckIcon({ size = 14, color = colors.white }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5 9-10" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PinIcon({ size = 24, color = colors.blue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill={color} />
      <Circle cx="12" cy="10" r="2.6" fill={colors.white} />
    </Svg>
  );
}

export function ChevronIcon({ size = 18, color = colors.ink3 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

export function AlertTabIcon({ size = 24, active }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {active ? (
        <>
          <Path d="M12 3l9 16H3L12 3z" fill={colors.blue} />
          <Path d="M12 10v4M12 16.5v.5" stroke={colors.white} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : (
        <Path d="M12 3l9 16H3L12 3z" stroke={colors.ink3} strokeWidth={2} strokeLinejoin="round" />
      )}
    </Svg>
  );
}

export function FamilyTabIcon({ size = 24, active }) {
  const c = active ? colors.blue : colors.ink3;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="8" cy="8" r="3.2" stroke={c} strokeWidth={2} fill={active ? c : 'none'} />
      <Circle cx="17" cy="9" r="2.6" stroke={c} strokeWidth={2} fill={active ? c : 'none'} />
      <Path d="M2.5 19c.6-3.4 2.8-5 5.5-5s4.9 1.6 5.5 5M14 14.6c.9-.4 1.9-.6 3-.6 2.4 0 4 1.4 4.5 4.6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function BellTabIcon({ size = 24, active }) {
  const c = active ? colors.blue : colors.ink3;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 10a6 6 0 1112 0v4l2 3H4l2-3v-4z" stroke={c} strokeWidth={2} strokeLinejoin="round" fill={active ? c : 'none'} />
      <Path d="M10 20a2 2 0 004 0" stroke={c} strokeWidth={2} />
    </Svg>
  );
}

export function ProfileTabIcon({ size = 24, active }) {
  const c = active ? colors.blue : colors.ink3;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={c} strokeWidth={2} fill={active ? c : 'none'} />
      <Path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
