/*
Choose a municipality by hand, for when the phone's location can't be found.
Shows the covered municipalities grouped by province, with a search box.
*/
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme';
import Input, { FieldError } from './Input';
import Button from './Button';
import { CheckIcon } from './Icons';
import { listMunicipalities } from '../../services/municipalities';

export default function MunicipalityPicker({ selectedId, onSelect, onCancel }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = () => {
    setError('');
    listMunicipalities().then(setItems).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (items || []).filter(
      (m) => !q || m.municipality_name.toLowerCase().includes(q) || m.province.toLowerCase().includes(q)
    );
    const byProvince = {};
    filtered.forEach((m) => { (byProvince[m.province] = byProvince[m.province] || []).push(m); });
    return Object.entries(byProvince);
  }, [items, query]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Choose your municipality</Text>
      <Input
        placeholder="Search, e.g. Tshwane or Eastern Cape"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      {!items && !error ? <ActivityIndicator color={colors.blue} style={{ marginVertical: 12 }} /> : null}
      {error ? (
        <>
          <FieldError message={error} />
          <Button title="Try again" variant="secondary" onPress={load} />
        </>
      ) : null}
      {items && groups.length === 0 ? (
        <Text style={styles.empty}>
          No municipality matches "{query.trim()}". LocalAlert doesn't cover that area yet; you can still create your account without one.
        </Text>
      ) : null}
      {groups.map(([province, list]) => (
        <View key={province} style={styles.group}>
          <Text style={styles.province}>{province}</Text>
          {list.map((m) => {
            const selected = m.municipality_id === selectedId;
            return (
              <Pressable
                key={m.municipality_id}
                onPress={() => onSelect(m)}
                style={({ pressed }) => [styles.row, selected && styles.rowOn, pressed && { opacity: 0.8 }]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.name, selected && { color: colors.blue }]}>{m.municipality_name}</Text>
                {selected ? <View style={styles.tick}><CheckIcon size={12} /></View> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {onCancel ? (
        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center', padding: 6 }}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.blueTint },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  group: { gap: 6 },
  province: { fontSize: 12, fontWeight: '700', color: colors.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, height: 48,
    borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  rowOn: { borderColor: colors.blue },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 13, lineHeight: 20, color: colors.ink2 },
  link: { fontSize: 14, fontWeight: '700', color: colors.blue },
});
