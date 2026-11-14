/** Top of a chat: the confession you're both talking about. It sits at the start of the
 * thread and scrolls away. EmptyChat adds openers to tap. */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

export const ConfessionCard = React.memo(({ connection }) => {
  if (!connection?.confession) return null;
  return (
    <LinearGradient
      colors={['rgba(255,99,74,0.16)', 'rgba(251,191,36,0.06)']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <Text style={s.kicker}>THE CONFESSION</Text>
      <Text style={s.confession} numberOfLines={4}>&ldquo;{connection.confession}&rdquo;</Text>
    </LinearGradient>
  );
});

export const EmptyChat = React.memo(({ connection, onPickOpener }) => (
  <ScrollView contentContainerStyle={s.empty} keyboardShouldPersistTaps="handled">
    <ConfessionCard connection={connection} />
    <Text style={s.emptyText}>You're both anonymous. Say the first thing.</Text>
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
  card: {
    alignSelf: 'stretch', borderRadius: RADIUS.lg, padding: rp(14), marginBottom: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.28)', gap: rp(6),
  },
  kicker: { fontFamily: 'DMSans-Bold', fontSize: rf(9.5), color: T.gold, letterSpacing: 1.8 },
  confession: { fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md, color: T.text, lineHeight: rf(22) },
  empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  emptyText: { fontFamily: 'DMSans-Italic', fontSize: FONT.md, color: T.textSec, textAlign: 'center', lineHeight: rf(22) },
  openers: { alignSelf: 'stretch', gap: rp(8), marginTop: SPACING.md },
  opener: {
    alignSelf: 'flex-start', paddingHorizontal: rp(14), paddingVertical: rp(9),
    borderRadius: RADIUS.lg, borderBottomLeftRadius: rs(4),
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.primaryBorder,
  },
  openerText: { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.text },
});
