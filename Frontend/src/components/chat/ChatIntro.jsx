/** Top of a chat: the confession you're both talking about. It sits at the start of the
 * thread and scrolls away. EmptyChat adds openers to tap. */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Quote, Sparkles } from 'lucide-react-native';
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
      colors={['rgba(255,107,79,0.18)', 'rgba(232,69,110,0.06)']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.quoteBadge}><Quote size={rs(14)} color={T.primary} strokeWidth={2.2} /></View>
      <View style={{ flex: 1, gap: rp(4) }}>
        <Text style={s.kicker}>THE CONFESSION</Text>
        <Text style={s.confession} numberOfLines={4}>{connection.confession}</Text>
      </View>
    </LinearGradient>
  );
});

export const EmptyChat = React.memo(({ connection, onPickOpener }) => (
  <ScrollView contentContainerStyle={s.empty} keyboardShouldPersistTaps="handled">
    <ConfessionCard connection={connection} />
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
  card: {
    alignSelf: 'stretch', flexDirection: 'row', gap: rp(12), borderRadius: RADIUS.lg + rs(2), padding: rp(14),
    marginTop: rp(4), marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(255,107,79,0.26)',
  },
  quoteBadge: {
    width: rs(30), height: rs(30), borderRadius: rs(15), alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,107,79,0.16)',
  },
  kicker: { fontFamily: 'DMSans-Bold', fontSize: rf(9.5), color: T.primary, letterSpacing: 1.6 },
  confession: { fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md, color: T.text, lineHeight: rf(22) },
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
