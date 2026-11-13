/** Rooms → Updates. Live now: a row of rings for sessions open in Rooms you're inside (tap to
 * join), with your own "Go live" first. Below it, Your Room: the page visitors see first. */
import React, { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Plus, Radio } from 'lucide-react-native';
import { rs, rf, rp, FONT, SPACING } from '../../utils/responsive';
import T from '../../utils/theme';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../ui/Toast';
import { callsApi, callParams } from '../../services/calls';
import { avatarColorFor } from './ChatBits';
import MyRoomPanel from './MyRoomPanel';
import { StartSessionSheet } from './LivePanel';

const EVENTS = ['drop_call_started', 'drop_call_ended', 'drop_call_guest_joined'];

function Ring({ name, url, live, label, sub, onPress, busy, badge }) {
  const inner = (
    <View style={s.ringInner}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} />
        : <View style={[StyleSheet.absoluteFill, s.initialWrap, { backgroundColor: avatarColorFor(name) }]}><Text style={s.initial}>{(name || 'A')[0].toUpperCase()}</Text></View>}
      {busy ? <View style={[StyleSheet.absoluteFill, s.busy]}><ActivityIndicator color="#fff" /></View> : null}
    </View>
  );
  return (
    <TouchableOpacity style={s.ringItem} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${label}${sub ? `, ${sub}` : ''}`}>
      {live ? <LinearGradient colors={[T.primary, T.gold]} style={s.ring}>{inner}</LinearGradient>
        : <View style={[s.ring, s.ringIdle]}>{inner}</View>}
      {badge}
      <Text style={s.ringName} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={s.ringSub} numberOfLines={1}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

const UpdatesPanel = forwardRef(function UpdatesPanel({ navigation, onLiveCount }, ref) {
  const { socketService, connected } = useSocket();
  const { showToast } = useToast();
  const me = useSelector((state) => state.auth.user);
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState('');
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await callsApi.live();
      setLive(l);
      onLiveCount?.((l.sessions || []).filter((c) => !c.joined).length);
    } catch {
      setLive((x) => x || { hosting: null, sessions: [], direct: [] });
    }
  }, [onLiveCount]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    if (!connected) return undefined;
    EVENTS.forEach((e) => socketService.on(e, load));
    return () => EVENTS.forEach((e) => socketService.off(e, load));
  }, [connected, socketService, load]);
  useImperativeHandle(ref, () => ({ goLive: () => setStarting(true), refresh: load }), [load]);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { showToast({ type: 'error', message: e.message }); } finally { setBusy(''); load(); }
  };
  const join = (c) => run(c.id, async () => {
    const d = await callsApi.join(c.id);
    navigation.navigate('DropCall', callParams(d, { isHost: false, other: c.host }));
  });

  const hosting = live?.hosting;
  const sessions = live?.sessions || [];

  const strip = (
    <View style={s.strip}>
      <Text style={s.h}>Live now</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rings}>
        <Ring
          name={me?.anonymous_name}
          url={me?.avatar_url}
          live={!!hosting}
          label={hosting ? 'You’re live' : 'Go live'}
          sub={hosting ? `${hosting.guest_count}/${hosting.max_guests} in` : 'Your Room'}
          busy={busy === 'host'}
          onPress={() => (hosting ? run('host', () => callsApi.end(hosting.id)) : setStarting(true))}
          badge={hosting ? <View style={[s.plus, s.liveBadge]}><Radio size={rs(11)} color="#fff" strokeWidth={2.5} /></View>
            : <View style={s.plus}><Plus size={rs(13)} color="#fff" strokeWidth={2.5} /></View>}
        />
        {sessions.map((c) => (
          <Ring
            key={c.id}
            name={c.host?.name}
            url={c.host?.avatar_url}
            live
            label={c.host?.name || 'Anonymous'}
            sub={c.joined ? 'You’re in' : c.guest_count >= c.max_guests ? 'Full' : `${c.video ? 'Video' : 'Voice'} · ${c.guest_count}/${c.max_guests}`}
            busy={busy === c.id}
            onPress={() => (c.joined ? run(c.id, () => callsApi.leave(c.id)) : c.guest_count >= c.max_guests ? showToast({ type: 'info', message: 'That session is full right now.' }) : join(c))}
          />
        ))}
      </ScrollView>
      {live && !sessions.length ? (
        <Text style={s.note}>Rooms you're inside show up here when they go live.</Text>
      ) : null}
      {hosting ? <Text style={s.note}>Tap your ring to end your session.</Text> : null}
      <Text style={[s.h, { marginTop: rp(18) }]}>Your Room</Text>
      <Text style={s.note}>What they see when they peek, and once they’re in.</Text>
    </View>
  );

  return (
    <>
      <MyRoomPanel navigation={navigation} header={strip} onRefresh={load} />
      {starting && (
        <StartSessionSheet
          onClose={() => setStarting(false)}
          onStarted={(d) => { setStarting(false); navigation.navigate('DropCall', callParams(d, { isHost: true })); }}
          navigation={navigation}
        />
      )}
    </>
  );
});

export default UpdatesPanel;

const R = rs(64);
const s = StyleSheet.create({
  strip: { marginHorizontal: -SPACING.md, marginTop: -SPACING.md + rp(4) },
  h: { fontSize: rf(18), fontFamily: 'DMSans-Bold', color: T.text, paddingHorizontal: SPACING.md, marginBottom: rp(8) },
  rings: { paddingHorizontal: SPACING.md, gap: rp(14) },
  ringItem: { width: R + rp(8), alignItems: 'center' },
  ring: { width: R, height: R, borderRadius: R / 2, padding: rs(2.5) },
  ringIdle: { borderWidth: 1.5, borderColor: T.border, padding: rs(2) },
  ringInner: { flex: 1, borderRadius: R / 2, overflow: 'hidden', borderWidth: 2, borderColor: T.background, backgroundColor: T.surfaceAlt },
  initialWrap: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontSize: rf(22), fontWeight: '800' },
  busy: { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  plus: {
    position: 'absolute', top: R - rs(20), right: rp(2), width: rs(22), height: rs(22), borderRadius: rs(11),
    backgroundColor: T.primary, borderWidth: 2, borderColor: T.background, alignItems: 'center', justifyContent: 'center',
  },
  liveBadge: { backgroundColor: T.danger },
  ringName: { fontSize: rf(12), fontFamily: 'DMSans-SemiBold', color: T.text, marginTop: rp(6), maxWidth: R + rp(8) },
  ringSub: { fontSize: rf(10.5), color: T.textSecondary, maxWidth: R + rp(8) },
  note: { fontSize: FONT.xs, color: T.textSecondary, paddingHorizontal: SPACING.md, marginTop: rp(8), lineHeight: FONT.xs * 1.5 },
});
