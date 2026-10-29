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

export function InfoIcon({ size = 14, color = colors.danger }) {
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

export function PlusIcon({ size = 20, color = colors.blue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function CameraIcon({ size = 30, color = colors.blue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 5h12a3 3 0 013 3v8a3 3 0 01-3 3H6a3 3 0 01-3-3V8a3 3 0 013-3z" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function UploadIcon({ size = 20, color = colors.blue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 16V4M7 9l5-5 5 5M4 20h16" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PersonSilhouette({ size = 40 }) {
  return (
    <Svg width={size} height={size * (64 / 56)} viewBox="0 0 56 64">
      <Circle cx="28" cy="24" r="12" fill="#9DBBEF" />
      <Path d="M6 64c0-14 10-22 22-22s22 8 22 22z" fill="#9DBBEF" />
    </Svg>
  );
}

export function ClockIcon({ size = 16, color = colors.ink2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={2} />
      <Path d="M12 7v5l3 2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CloseIcon({ size = 18, color = colors.blue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

// LocalAlert logo (Concept C, "Pin and Waves").
// variant "blue": blue pin, white person (for white backgrounds)
// variant "white": white pin, blue person (for blue backgrounds)
export function AppLogo({ size = 36, variant = 'blue' }) {
  // "Pin and Waves": a child in a map pin with alert waves on both sides.
  // size is the height; width follows the mark's proportions.
  const fg = variant === 'white' ? colors.white : colors.blue;
  const person = variant === 'white' ? colors.blue : colors.white;
  const wave = { stroke: fg, strokeWidth: 44, strokeLinecap: 'round', fill: 'none' };
  return (
    <Svg width={size * (724 / 670)} height={size} viewBox="150 160 724 670" accessibilityLabel="LocalAlert logo">
      <Path d="M769.3 243.1 A318 318 0 0 1 769.3 616.9" {...wave} />
      <Path d="M254.7 616.9 A318 318 0 0 1 254.7 243.1" {...wave} />
      <Path d="M842.1 190.2 A408 408 0 0 1 842.1 669.8" {...wave} opacity={0.55} />
      <Path d="M181.9 669.8 A408 408 0 0 1 181.9 190.2" {...wave} opacity={0.55} />
      <Path d="M512 820 C436.4 644.5 302 593.8 302 430 A210 210 0 1 1 722 430 C722 593.8 587.6 644.5 512 820 Z" fill={fg} />
      <Circle cx="512" cy="399.8" r="51.5" fill={person} />
      <Path d="M409.0 545.4 C409.0 471.4 456.0 467.0 512 467.0 C568.0 467.0 615.0 471.4 615.0 545.4 Z" fill={person} />
    </Svg>
  );
}
