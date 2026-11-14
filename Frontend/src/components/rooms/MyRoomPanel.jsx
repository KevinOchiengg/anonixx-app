/** Rooms → My Room: your Room as visitors see it (theme, picture, name, status, intro), the
 * welcome you've set up (note, audio, three media slots) and quick ways to change it.
 * Editing happens in ChatProfileSetup (Your Room); this panel only reads GET /chat-profile/me. */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Eye, Lock, Mic, Palette, Sparkles } from 'lucide-react-native';
import { rs, rf, rp, SPACING, RADIUS } from '../../utils/responsive';
import T from '../../utils/theme';
import { API_BASE_URL } from '../../config/api';
import { CHAT_FONT_MAP, DEFAULT_CHAT_FONT } from '../../config/fonts';
import { roomThemeById, statusLabel } from '../../config/roomThemes';

export default function MyRoomPanel({ navigation, header, onRefresh }) {
  const me = useSelector((state) => state.auth.user?.id);
  const [room, setRoom] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRoom(await res.json());
    } catch { /* keep what we have */ } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!room) return <View style={s.center}><ActivityIndicator color={T.primary} /></View>;

  const th = roomThemeById(room.room_theme);
  const font = CHAT_FONT_MAP[room.font_style] || CHAT_FONT_MAP[DEFAULT_CHAT_FONT];
  const name = room.anonymous_name || 'Your Room';
  const status = statusLabel(room.room_status);
  const edit = (tab) => navigation.navigate('ChatProfileSetup', { tab });
  const steps = [
    { done: !!room.welcome_message, label: 'Welcome note', hint: room.welcome_message ? `“${room.welcome_message}”` : 'The first thing someone reads when you let them in.' },
  ];

  return (
    <ScrollView
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); onRefresh?.(); }} tintColor={T.primary} colors={[T.primary]} />}
    >
      {header}
      {/* The window: what a visitor sees first, in your theme. */}
      <View style={[s.hero, { backgroundColor: th.bg, borderColor: th.border }]}>
        <LinearGradient colors={[th.glow, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.8 }} />
        <Text style={[s.kicker, { color: th.muted }]}>{th.room.toUpperCase()}</Text>
        <LinearGradient colors={[th.accent, th.accent2]} style={s.ring}>
          <View style={[s.ava, { backgroundColor: th.surface, borderColor: th.bg }]}>
            {room.profile_picture_url ? <Image source={{ uri: room.profile_picture_url }} style={StyleSheet.absoluteFill} />
              : <Text style={[s.initial, { color: th.accent }]}>{name[0].toUpperCase()}</Text>}
          </View>
        </LinearGradient>
        <Text style={[s.name, { color: th.text, fontFamily: font }]} numberOfLines={1}>{name}</Text>
        {status ? <Text style={[s.status, { color: th.text, borderColor: th.border, backgroundColor: th.tint }]}>{status}</Text> : null}
        <Text style={[s.intro, { color: th.muted, fontFamily: font }]} numberOfLines={3}>
          {room.intro || 'No intro yet. It’s the first thing they read.'}
        </Text>
        <View style={s.heroActs}>
          <TouchableOpacity style={[s.heroBtn, { borderColor: th.borderStrong }]} onPress={() => me && navigation.navigate('Room', { userId: me })}>
            <Eye size={rs(15)} color={th.text} />
            <Text style={[s.heroBtnText, { color: th.text }]}>See it as a visitor</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.heroBtn, { backgroundColor: th.accent, borderColor: th.accent }]} onPress={() => edit('appearance')}>
            <Palette size={rs(15)} color={th.bg} />
            <Text style={[s.heroBtnText, { color: th.bg }]}>Personalize</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={s.label}>YOUR WELCOME</Text>
      <View style={s.card}>
        {steps.map((st, i) => (
          <TouchableOpacity key={st.label} style={[s.step, i > 0 && s.stepBorder]} onPress={() => edit('welcome')} activeOpacity={0.8}>
            <View style={[s.tick, st.done && s.tickOn]}>
              {st.done ? <Check size={rs(13)} color="#fff" /> : i === 1 ? <Mic size={rs(13)} color={T.textSecondary} /> : <Sparkles size={rs(13)} color={T.textSecondary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>{st.label}</Text>
              <Text style={s.stepHint} numberOfLines={2}>{st.hint}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={s.primary} onPress={() => edit('welcome')} activeOpacity={0.88}>
        <Text style={s.primaryText}>{steps.every((x) => x.done) ? 'Edit your welcome' : 'Set up your welcome'}</Text>
      </TouchableOpacity>

      <View style={s.note}>
        <Lock size={rs(14)} color={T.textSecondary} />
        <Text style={s.noteText}>
          {room.welcome_visibility === 'window'
            ? 'Anyone peeking reads your welcome note.'
            : 'Only people you let in see this.'}
          {' '}Change who sees what in Privacy.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { padding: SPACING.md, gap: rp(12), paddingBottom: rp(120) },
  hero: { borderRadius: rs(22), borderWidth: 1, padding: rp(18), alignItems: 'center', overflow: 'hidden', gap: rp(8) },
  kicker: { fontSize: rf(10), letterSpacing: 2, fontFamily: 'DMSans-Bold' },
  ring: { width: rs(92), height: rs(92), borderRadius: rs(46), padding: rs(3), marginTop: rp(4) },
  ava: { flex: 1, borderRadius: rs(43), borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: rf(32), fontWeight: '800' },
  name: { fontSize: rf(23), marginTop: rp(4) },
  status: { fontSize: rf(12), fontWeight: '600', borderWidth: 1, borderRadius: 999, paddingHorizontal: rp(11), paddingVertical: rp(4), overflow: 'hidden' },
  intro: { fontSize: rf(14), lineHeight: rf(20), textAlign: 'center', maxWidth: '92%' },
  heroActs: { flexDirection: 'row', gap: rp(8), alignSelf: 'stretch', marginTop: rp(8) },
  heroBtn: { flex: 1, flexDirection: 'row', gap: rp(6), height: rs(44), borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroBtnText: { fontFamily: 'DMSans-Bold', fontSize: rf(14) },
  label: { fontFamily: 'DMSans-Bold', fontSize: rf(11), letterSpacing: 1.6, color: T.textSecondary, marginTop: rp(8) },
  card: { borderRadius: RADIUS.lg, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, paddingHorizontal: rp(14) },
  step: { flexDirection: 'row', alignItems: 'center', gap: rp(12), paddingVertical: rp(13) },
  stepBorder: { borderTopWidth: 1, borderTopColor: T.border },
  tick: { width: rs(28), height: rs(28), borderRadius: rs(14), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.borderStrong },
  tickOn: { backgroundColor: T.success, borderColor: T.success },
  stepTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.text },
  stepHint: { fontFamily: 'DMSans-Regular', fontSize: rf(12.5), color: T.textSecondary, marginTop: rp(2), lineHeight: rf(17) },
  primary: { height: rs(50), borderRadius: RADIUS.md, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: '#fff' },
  note: { flexDirection: 'row', gap: rp(8), alignItems: 'flex-start', paddingHorizontal: rp(4) },
  noteText: { flex: 1, fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary, lineHeight: rf(17) },
});
