/**
 * TopicPicker — moods and topics an author can put on a confession
 * (Backend utils/search_lexicon MOODS + STORY_TOPICS, max MAX_TOPICS; mirrors
 * Web/components/compose/TopicPicker.tsx). Optional; helps people find it in Stories.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { rf, rp } from '../../utils/responsive';
import T from '../../utils/theme';

export const STORY_MOODS = [
  ['heartbreak', 'Heartbreak'], ['love', 'Love'], ['secrets', 'Secrets'], ['regret', 'Regret'], ['betrayal', 'Betrayal'],
  ['happiness', 'Happiness'], ['anger', 'Anger'], ['relief', 'Relief'], ['confusion', 'Confusion'], ['funny', 'Funny'],
  ['growth', 'Personal growth'],
];
export const STORY_TOPICS = [
  ['relationships', 'Relationships'], ['friendship', 'Friendship'], ['family', 'Family'], ['work', 'Work'],
  ['money', 'Money'], ['school', 'School'], ['desire', 'Desire'],
];
export const MAX_TOPICS = 3;

export default function TopicPicker({ value, onChange }) {
  const toggle = (id) => onChange(
    value.includes(id) ? value.filter((x) => x !== id) : value.length >= MAX_TOPICS ? value : [...value, id],
  );
  const group = (title, items) => (
    <View style={s.group}>
      <Text style={s.title}>{title}</Text>
      <View style={s.chips}>
        {items.map(([id, label]) => {
          const on = value.includes(id);
          const off = !on && value.length >= MAX_TOPICS;
          return (
            <TouchableOpacity
              key={id}
              style={[s.chip, on && s.chipOn, off && { opacity: 0.4 }]}
              onPress={() => toggle(id)}
              disabled={off}
              accessibilityState={{ selected: on, disabled: off }}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
  return (
    <View style={{ gap: rp(12) }}>
      {group('HOW IT FEELS', STORY_MOODS)}
      {group("WHAT IT'S ABOUT", STORY_TOPICS)}
      <Text style={s.hint}>{value.length}/{MAX_TOPICS} picked. Optional. It helps the right people find it in Stories.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  group: { gap: rp(6) },
  title: { color: T.textSecondary, fontSize: rf(11), fontWeight: '800', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  chip: { paddingHorizontal: rp(13), paddingVertical: rp(7), borderRadius: 999, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipOn: { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  chipText: { color: T.text, fontSize: rf(13), fontWeight: '700' },
  chipTextOn: { color: T.primary },
  hint: { color: T.textSecondary, fontSize: rf(12) },
});
