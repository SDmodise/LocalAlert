/*
"Last seen" day and time for a new alert: Today, Yesterday, or another date up to
DAYS_BACK days ago, plus a typed HH:MM time. Used on the create alert form (screen 14).
*/
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../theme';
import Input, { FieldError } from '../common/Input';
import { ClockIcon } from '../common/Icons';
import { dayLabel, isoDay } from '../../utils/dates';

export const DAYS_BACK = 29; // the server accepts sightings up to 30 days ago

// Opens on the date list when the chosen day is neither today nor yesterday.
export const isOtherDate = (day) => !!day && day !== isoDay(0) && day !== isoDay(1);

export default function LastSeenPicker({ day, onDayChange, pickingDate, onPickingDateChange, time, onTimeChange, error }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>Last seen</Text>
      <View style={styles.row}>
        {[[isoDay(0), 'Today'], [isoDay(1), 'Yesterday'], ['other', 'Other date']].map(([key, label]) => {
          const on = key === 'other' ? pickingDate : !pickingDate && day === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                if (key === 'other') {
                  onPickingDateChange(true);
                  if (!isOtherDate(day)) onDayChange(isoDay(2));
                } else {
                  onPickingDateChange(false);
                  onDayChange(key);
                }
              }}
              style={[styles.segment, styles.flex, on && styles.segmentOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segmentText, on && { color: colors.white }]} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {pickingDate ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {Array.from({ length: DAYS_BACK - 1 }, (_, i) => isoDay(i + 2)).map((iso) => {
            const [weekday, ...date] = dayLabel(iso).split(' ');
            const on = day === iso;
            return (
              <Pressable
                key={iso}
                onPress={() => onDayChange(iso)}
                style={[styles.dateChip, on && styles.segmentOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.dateChipDay, on && { color: colors.white }]}>{weekday}</Text>
                <Text style={[styles.dateChipDate, on && { color: colors.white }]}>{date.join(' ')}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.row}>
        <Text style={[styles.hint, styles.flex, { alignSelf: 'center' }]}>
          {pickingDate ? dayLabel(day) : day === isoDay(0) ? 'Today' : 'Yesterday'}, at
        </Text>
        <Input
          value={time}
          onChangeText={(t) => onTimeChange(t.replace(/[^0-9:]/g, '').slice(0, 5))}
          keyboardType="numbers-and-punctuation"
          placeholder="HH:MM"
          maxLength={5}
          style={styles.flex}
          right={<ClockIcon />}
          accessibilityLabel="Last seen time"
        />
      </View>
      <FieldError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: 8 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginTop: 4 },
  hint: { fontSize: 12, color: colors.ink3 },
  segment: {
    height: 48, paddingHorizontal: 14, borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  segmentOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.ink2 },
  dateRow: { gap: 8, paddingVertical: 2 },
  dateChip: {
    width: 64, paddingVertical: 8, borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', backgroundColor: colors.white,
  },
  dateChipDay: { fontSize: 12, fontWeight: '600', color: colors.ink3 },
  dateChipDate: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
