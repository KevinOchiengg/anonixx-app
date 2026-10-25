/**
 * RoomThemePicker
 *
 * The ten Room themes as miniature Rooms, with a larger live preview of
 * whichever one is picked. Nothing is saved until Apply; Cancel puts the
 * saved theme back. The saved theme keeps a "current" tag so it's always
 * clear what visitors see right now. Mirrors Web/components/RoomThemePicker.tsx.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, RADIUS, FONT } from '../../utils/responsive';
import { ROOM_THEMES, roomThemeById } from '../../config/roomThemes';

export function RoomMini({ theme, name, big = false }) {
  const th = roomThemeById(theme);
  return (
    <View style={[m.box, big && m.big, { backgroundColor: th.bg, borderColor: th.border }]}>
      <LinearGradient colors={[th.glow, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }} />
      <View style={[big ? m.avaBig : m.ava, { backgroundColor: th.surface, borderColor: th.accent }]}>
        <Text style={{ color: th.accent, fontWeight: '800', fontSize: big ? rf(17) : rf(10) }}>{(name || 'A')[0].toUpperCase()}</Text>
      </View>
      {big ? (
        <>
          <Text style={[m.name, { color: th.text }]} numberOfLines={1}>{name || 'Your Room'}</Text>
          <Text style={[m.room, { color: th.muted }]} numberOfLines={1}>{th.room.toUpperCase()}</Text>
        </>
      ) : (
        <>
          <View style={[m.line, { width: '60%', backgroundColor: th.text }]} />
          <View style={[m.line, { width: '40%', backgroundColor: th.muted, opacity: 0.6 }]} />
        </>
      )}
      <View style={m.tiles}>
        {[0, 1, 2].map((i) => <View key={i} style={[m.tile, { backgroundColor: th.surface, borderColor: th.border }]} />)}
      </View>
      <View style={[big ? m.knockBig : m.knock, { backgroundColor: th.accent }]}>
        {big ? <Text style={[m.knockText, { color: th.bg }]}>Knock</Text> : null}
      </View>
    </View>
  );
}

export default function RoomThemePicker({ saved, name, onApply }) {
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(saved); }, [saved]);

  const dirty = draft !== saved;
  const th = roomThemeById(draft);

  const apply = async () => {
    setBusy(true);
    try { await onApply(draft); } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: rp(14) }}>
      <View style={s.stage}>
        <RoomMini theme={draft} name={name} big />
        <View style={{ flex: 1, gap: rp(4) }}>
          <Text style={s.kicker}>{dirty ? 'PREVIEWING' : 'YOUR ROOM NOW'}</Text>
          <Text style={s.title}>{th.name}</Text>
          <Text style={s.mood}>{th.mood}</Text>
        </View>
      </View>

      <View style={s.grid} accessibilityRole="radiogroup">
        {ROOM_THEMES.map((x) => {
          const on = draft === x.id;
          return (
            <TouchableOpacity
              key={x.id}
              style={[s.card, on && s.cardOn]}
              onPress={() => setDraft(x.id)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${x.name}, ${x.room}`}
            >
              <RoomMini theme={x.id} />
              <View style={s.nameRow}>
                <Text style={s.cardName} numberOfLines={1}>{x.name}</Text>
                {saved === x.id ? <Text style={s.current}>NOW</Text> : null}
              </View>
              <Text style={s.cardRoom} numberOfLines={1}>{x.room}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[s.bar, !dirty && { opacity: 0.5 }]}>
        <TouchableOpacity style={s.cancel} disabled={!dirty || busy} onPress={() => setDraft(saved)}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.apply} disabled={!dirty || busy} onPress={apply}>
          {busy ? <ActivityIndicator color={T.background} /> : <Text style={s.applyText} numberOfLines={1}>Apply {th.name}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const m = StyleSheet.create({
  box: { width: '100%', aspectRatio: 4 / 5, borderRadius: rs(12), borderWidth: 1, overflow: 'hidden', alignItems: 'center', paddingTop: rp(10), paddingHorizontal: rp(7), paddingBottom: rp(7), gap: rp(4) },
  big: { width: rs(128), aspectRatio: undefined, paddingTop: rp(14), paddingHorizontal: rp(10), paddingBottom: rp(10), borderRadius: rs(16) },
  ava: { width: rs(22), height: rs(22), borderRadius: rs(11), borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avaBig: { width: rs(42), height: rs(42), borderRadius: rs(21), borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  line: { height: rs(4), borderRadius: 2 },
  name: { marginTop: rp(2), fontSize: rf(13), fontWeight: '700', maxWidth: '100%' },
  room: { fontSize: rf(8), letterSpacing: 1 },
  tiles: { marginTop: 'auto', flexDirection: 'row', gap: rp(3), width: '100%', paddingTop: rp(6) },
  tile: { flex: 1, aspectRatio: 3 / 4, borderRadius: rs(3), borderWidth: 1 },
  knock: { width: '100%', height: rs(7), borderRadius: rs(4) },
  knockBig: { width: '100%', paddingVertical: rp(5), borderRadius: rs(7), alignItems: 'center', marginTop: rp(2) },
  knockText: { fontSize: rf(10), fontWeight: '800' },
});

const s = StyleSheet.create({
  stage: { flexDirection: 'row', alignItems: 'center', gap: rp(14), padding: rp(12), borderRadius: RADIUS.lg, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  kicker: { fontSize: rf(10), letterSpacing: 1.4, color: T.textSec, fontWeight: '700' },
  title: { fontSize: rf(21), color: T.text, fontFamily: 'PlayfairDisplay-Italic' },
  mood: { fontSize: FONT.sm, color: T.textSec, lineHeight: FONT.sm * 1.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: rp(10) },
  card: { width: '31.5%', padding: rp(5), borderRadius: rs(14), borderWidth: 1, borderColor: 'transparent', gap: rp(4) },
  cardOn: { borderColor: T.gold, backgroundColor: 'rgba(251,191,36,0.06)' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: rp(4) },
  cardName: { flexShrink: 1, fontSize: rf(11), fontWeight: '700', color: T.text },
  current: { fontSize: rf(8), fontWeight: '800', color: T.textSec, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: rp(4), paddingVertical: rp(1), borderRadius: 6, overflow: 'hidden' },
  cardRoom: { fontSize: rf(10), color: T.textSec },
  bar: { flexDirection: 'row', gap: rp(10) },
  cancel: { flex: 0.5, height: rs(46), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: T.text, fontWeight: '700', fontSize: FONT.sm },
  apply: { flex: 1, height: rs(46), borderRadius: RADIUS.md, backgroundColor: T.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(10) },
  applyText: { color: T.background, fontWeight: '800', fontSize: FONT.sm },
});
