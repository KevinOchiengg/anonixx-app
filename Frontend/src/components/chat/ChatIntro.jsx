/** Top of a Room chat: one card with the confession, who let who in, and the knock.
 * It sits at the start of the thread and scrolls away. EmptyChat adds openers to tap. */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock } from 'lucide-react-native';
import { T } from '../../utils/colorTokens';
import { rs, rf, rp, FONT, RADIUS, SPACING } from '../../utils/responsive';
import { intentLabel } from '../../config/linkup';

const OPENERS_GUEST = [
  'What made you post this?',
  'Tell me the part you left out 😏',
  'Where are you tonight?',
];
const OPENERS_HOST = [
  'You knocked. So what caught you?',
  'Tell me something you would never post.',
  'Where are you right now?',
];

function sinceLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const InsideCard = React.memo(({ connection, otherName }) => {
  if (!connection) return null;
  const guest = !connection.is_sender;
  const since = sinceLabel(connection.inside_since);
  return (
    <LinearGradient
      colors={['rgba(255,99,74,0.16)', 'rgba(251,191,36,0.06)']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.kickerRow}>
        <Lock size={rs(11)} color={T.gold} strokeWidth={2} />
        <Text style={s.kicker}>{guest ? "YOU'RE INSIDE" : 'INSIDE YOUR ROOM'}</Text>
      </View>
      {connection.confession ? (
        <Text style={s.confession} numberOfLines={3}>&ldquo;{connection.confession}&rdquo;</Text>
      ) : null}
      <Text style={s.title}>
        {guest ? `${otherName || 'They'} let you in` : `${otherName || 'They'} knocked and you let them in`}
        {since ? <Text style={s.since}>{`  ·  ${since}`}</Text> : null}
      </Text>
      {!!connection.knock_pitch && (
        <Text style={s.pitch}>
          {guest ? 'Your knock: ' : 'Their knock: '}
          <Text style={s.pitchQuote}>&ldquo;{connection.knock_pitch}&rdquo;</Text>
        </Text>
      )}
      {!!connection.knock_intents?.length && (
        <View style={s.chips}>
          {connection.knock_intents.map((i) => <Text key={i} style={s.chip}>{intentLabel(i)}</Text>)}
        </View>
      )}
      <Text style={s.foot}>Only the two of you can see this chat.</Text>
    </LinearGradient>
  );
});

export const EmptyChat = React.memo(({ connection, otherName, onPickOpener }) => (
  <ScrollView contentContainerStyle={s.empty} keyboardShouldPersistTaps="handled">
    <InsideCard connection={connection} otherName={otherName} />
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
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: rp(5) },
  kicker: { fontFamily: 'DMSans-Bold', fontSize: rf(9.5), color: T.gold, letterSpacing: 1.8 },
  confession: { fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md, color: T.text, lineHeight: rf(22) },
  title: { fontFamily: 'DMSans-Bold', fontSize: FONT.sm, color: T.text },
  since: { fontFamily: 'DMSans-Regular', fontSize: FONT.xs, color: T.textMute },
  pitch: { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.textSec, lineHeight: rf(19) },
  pitchQuote: { fontFamily: 'PlayfairDisplay-Italic', color: T.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(5) },
  chip: {
    fontSize: rf(10.5), color: T.text, borderWidth: 1, borderColor: T.primaryBorder,
    paddingHorizontal: rp(8), paddingVertical: rp(2), borderRadius: 999, overflow: 'hidden',
  },
  foot: { fontFamily: 'DMSans-Italic', fontSize: rf(10.5), color: T.textMute },
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
