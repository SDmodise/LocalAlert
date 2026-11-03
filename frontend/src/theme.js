/*
LocalAlert design tokens, matching the Figma file "LocalAlert – UI Design (Phase 4)".
Blue and white palette. Validation errors are red (danger) with an icon.
*/
export const colors = {
  blue: '#1559D6',        // primary actions, active states
  blueDark: '#0B2F73',    // Level 4, still missing, "Mark as found"
  blueMid: '#3D7BEA',
  blueLight: '#E8F0FD',   // secondary buttons, chips, icon backgrounds
  blueTint: '#F4F8FE',    // info boxes, selected cards
  line: '#D6E2F5',        // borders and dividers
  ink: '#0B1A33',         // main text
  ink2: '#4A5B78',        // secondary text, labels
  ink3: '#8292AD',        // hints, placeholders
  heroText: '#D3E1FA',    // muted text on blue
  white: '#FFFFFF',
  danger: '#D92D20',      // validation errors: text, icons, field borders
  dangerTint: '#FEF3F2',  // background of error boxes
};

// Alert levels get warmer as the search widens:
// 1 the alert's own area (blue), 2 neighbours (amber), 3 wider area (red), 4 all users (dark red).
export const levelColors = {
  1: { bg: '#1559D6', fg: '#FFFFFF' },
  2: { bg: '#F79009', fg: '#0B1A33' }, // dark text: white is hard to read on amber
  3: { bg: '#D92D20', fg: '#FFFFFF' },
  4: { bg: '#7A1A12', fg: '#FFFFFF' },
};

export function levelColor(level) {
  return levelColors[Math.min(Math.max(Number(level) || 1, 1), 4)];
}

export const radius = { field: 12, button: 14, card: 16, chip: 999 };

export const type = {
  display: { fontSize: 30, fontWeight: '800' },
  heading: { fontSize: 22, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
};
