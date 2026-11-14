/** An empty chat: a hello and openers to tap. */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { T } from '../../utils/colorTokens';
import { rs, rf, rp, FONT, RADIUS, SPACING } from '../../utils/responsive';

const OPENERS_GUEST = [
  'What made you post this?',
  'Tell me the part you left out 😏',
  'Where are you tonight?',
];
const OPENERS_HOST = [
  'So what caught you?',
  'Tell me something you would never post.',
  'Where are you right now?',
];

export const EmptyChat = React.memo(({ connection, onPickOpener }) => (
  <ScrollView contentContainerStyle={s.empty} keyboardShouldPersistTaps="handled">
    <View style={s.hello}>
      <Sparkles size={rs(22)} color={T.primary} strokeWidth={1.8} />
      <Text style={s.emptyText}>You're both anonymous. Say the first thing.</Text>
    </View>
    <View style={s.openers}>
      {(connection?.is_sender ? OPENERS_HOST : OPENERS_GUEST).map((line) => (
        <TouchableOpacity key={line} style={s.opener} onPress={() => onPickOpener?.(line)} activeOpacity={0.8}>
          <Text style={s.openerText}>{line}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </ScrollView>
));

const s = StyleSheet.create({
  empty: { flexGrow: 1, justifyContent: 'center', padding: SPACING.lg },
  hello: { alignItems: 'center', gap: rp(8) },
  emptyText: { fontFamily: 'DMSans-Medium', fontSize: FONT.md, color: T.textSec, textAlign: 'center', lineHeight: rf(22) },
  // Openers as tappable chips that wrap.
  openers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: rp(8), marginTop: SPACING.lg },
  opener: {
    paddingHorizontal: rp(14), paddingVertical: rp(9), borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,107,79,0.35)',
  },
  openerText: { fontFamily: 'DMSans-Medium', fontSize: FONT.sm, color: T.text },
});
