/** Rooms → Live: your open session, sessions you can join in Rooms you're inside, and your
 * ringing / ongoing 1-to-1 calls. "Start a session" opens a group session in your own Room
 * (voice or video, everyone inside or only the people you pick). Data: GET /drop-calls/live. */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, RefreshControl, ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Check, Mic, Radio, Users, Video, X } from 'lucide-react-native';
import { rs, rf, rp, SPACING, RADIUS, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { API_BASE_URL } from '../../config/api';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../ui/Toast';
import { callsApi, callParams } from '../../services/calls';

const REFRESH_EVENTS = ['drop_call_started', 'drop_call_ended', 'call_incoming', 'call_cancelled', 'call_missed', 'drop_call_guest_joined'];

function Ava({ name, url, size = rs(44) }) {
  return (
    <View style={[s.ava, { width: size, height: size, borderRadius: size / 2 }]}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} />
        : <Text style={s.avaText}>{(name || 'A')[0].toUpperCase()}</Text>}
    </View>
  );
}

export default function LivePanel({ navigation }) {
  const { socketService, connected } = useSocket();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await callsApi.live());
    } catch {
      setData((d) => d || { hosting: null, sessions: [], direct: [] });
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]));
  useEffect(() => {
    if (!connected) return undefined;
    REFRESH_EVENTS.forEach((e) => socketService.on(e, load));
    return () => REFRESH_EVENTS.forEach((e) => socketService.off(e, load));
  }, [connected, socketService, load]);

  const run = useCallback(async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { showToast({ type: 'error', message: e.message }); } finally { setBusy(''); load(); }
  }, [load, showToast]);

  const join = (c) => run(c.id, async () => {
    const d = await callsApi.join(c.id);
    navigation.navigate('DropCall', callParams(d, { isHost: false, other: c.host }));
  });
  const leave = (c) => run(c.id, () => callsApi.leave(c.id));
  // A call ringing for me is declined (the caller hears why); anything else is ended.
  const endCall = (c) => run(c.id, () => (c.kind === 'direct' && c.incoming && c.status === 'ringing' ? callsApi.decline(c.id) : callsApi.end(c.id)));

  if (!data) return <View style={s.center}><ActivityIndicator color={T.primary} /></View>;
  const { hosting, sessions = [], direct = [] } = data;
  const nothing = !hosting && !sessions.length && !direct.length;

  return (
    <ScrollView
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.primary} colors={[T.primary]} />}
    >
      {direct.map((c) => (
        <View key={c.id} style={[s.card, s.cardLive]}>
          <View style={s.row}>
            <Ava name={c.other?.name} url={c.other?.avatar_url} />
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{c.other?.name || 'Anonymous'}</Text>
              <Text style={s.meta}>{c.video ? 'Video' : 'Voice'} call · {c.status === 'ringing' ? (c.incoming ? 'calling you' : 'ringing') : 'on now'}</Text>
            </View>
            <TouchableOpacity style={s.ghost} onPress={() => endCall(c)} disabled={busy === c.id}>
              <Text style={s.ghostText}>{c.status === 'ringing' && c.incoming ? 'Decline' : 'End'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {hosting ? (
        <View style={[s.card, s.cardLive]}>
          <View style={s.row}>
            <View style={s.liveIcon}><Radio size={rs(18)} color={T.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Your session is open</Text>
              <Text style={s.meta}>{hosting.video ? 'Video' : 'Voice'} · {hosting.guest_count}/{hosting.max_guests} in{hosting.invite_only ? ' · invite only' : ''}</Text>
            </View>
            <TouchableOpacity style={s.ghost} onPress={() => endCall(hosting)} disabled={busy === hosting.id}>
              <Text style={[s.ghostText, { color: T.danger }]}>End</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.startCard} onPress={() => setStarting(true)} activeOpacity={0.85} accessibilityRole="button">
          <View style={s.liveIcon}><Users size={rs(18)} color={T.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Start a session</Text>
            <Text style={s.meta}>Voice or video, for everyone inside or a chosen few.</Text>
          </View>
        </TouchableOpacity>
      )}

      {sessions.length > 0 && <Text style={s.label}>LIVE IN ROOMS YOU'RE INSIDE</Text>}
      {sessions.map((c) => (
        <View key={c.id} style={s.card}>
          <View style={s.row}>
            <Ava name={c.host?.name} url={c.host?.avatar_url} />
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{c.host?.name || 'Anonymous'}'s session</Text>
              <Text style={s.meta}>
                {c.video ? 'Video' : 'Voice'} · {c.guest_count}/{c.max_guests} in{c.invite_only ? ' · you were invited' : ''}
              </Text>
            </View>
            {c.joined ? (
              <TouchableOpacity style={s.ghost} onPress={() => leave(c)} disabled={busy === c.id}><Text style={s.ghostText}>Leave</Text></TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.primary} onPress={() => join(c)} disabled={busy === c.id || c.guest_count >= c.max_guests}>
                {busy === c.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryText}>{c.guest_count >= c.max_guests ? 'Full' : 'Join'}</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {nothing && (
        <View style={s.empty}>
          <View style={s.emptyIcon}><Radio size={rs(26)} color={T.primary} /></View>
          <Text style={s.emptyTitle}>Nothing live right now</Text>
          <Text style={s.emptyText}>Live sessions from Rooms you're inside show up here.</Text>
        </View>
      )}

      {starting && (
        <StartSessionSheet
          onClose={() => setStarting(false)}
          onStarted={(d) => { setStarting(false); navigation.navigate('DropCall', callParams(d, { isHost: true })); }}
          navigation={navigation}
        />
      )}
    </ScrollView>
  );
}

export function StartSessionSheet({ onClose, onStarted, navigation }) {
  const { showToast } = useToast();
  const [video, setVideo] = useState(true);
  const [everyone, setEveryone] = useState(true);
  const [people, setPeople] = useState(null);
  const [picked, setPicked] = useState([]);
  const [room, setRoom] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [c, me] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/drops/connections`, { headers }).then((r) => r.json()),
          fetch(`${API_BASE_URL}/api/v1/chat-profile/me`, { headers }).then((r) => r.json()),
        ]);
        const seen = new Set();
        setPeople((c.connections || []).filter((x) => x.is_sender && !seen.has(x.other_user_id) && seen.add(x.other_user_id)));
        setRoom(me);
      } catch {
        setPeople([]);
      }
    })();
  }, []);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const solo = room?.call_mode !== 'multi';
  const seats = room?.max_guests || 1;

  const start = async () => {
    if (!everyone && !picked.length) { showToast({ type: 'info', message: 'Pick at least one person, or invite everyone.' }); return; }
    setBusy(true);
    try {
      onStarted(await callsApi.startSession({ inviteUserIds: everyone ? null : picked, video }));
    } catch (e) {
      showToast({ type: 'error', message: e.message });
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBack}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Start a session</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} accessibilityLabel="Close"><X size={rs(18)} color={T.textSecondary} /></TouchableOpacity>
          </View>
          {people === null ? <ActivityIndicator color={T.primary} style={{ marginVertical: rp(30) }} /> : people.length === 0 ? (
            <Text style={s.emptyText}>Nobody's inside yet. Let someone in first.</Text>
          ) : (
            <ScrollView style={{ maxHeight: rs(380) }} contentContainerStyle={{ gap: rp(12) }}>
              <View style={s.seg}>
                {[[true, 'Video', Video], [false, 'Voice', Mic]].map(([v, label, Icon]) => (
                  <TouchableOpacity key={label} style={[s.segBtn, video === v && s.segOn]} onPress={() => setVideo(v)}>
                    <Icon size={rs(15)} color={video === v ? T.text : T.textSecondary} />
                    <Text style={[s.segText, video === v && { color: T.text }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>Invite everyone inside</Text>
                  <Text style={s.meta}>Off: only the people you tick can join.</Text>
                </View>
                <Switch value={everyone} onValueChange={setEveryone} trackColor={{ false: T.surfaceAlt, true: T.primary }} thumbColor="#fff" />
              </View>
              {!everyone && people.map((x) => {
                const on = picked.includes(x.other_user_id);
                return (
                  <TouchableOpacity key={x.other_user_id} style={s.pickRow} onPress={() => toggle(x.other_user_id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <Ava name={x.other_anonymous_name} url={x.other_avatar_url} size={rs(36)} />
                    <Text style={[s.title, { flex: 1 }]} numberOfLines={1}>{x.other_anonymous_name}</Text>
                    <View style={[s.check, on && s.checkOn]}>{on ? <Check size={rs(13)} color="#fff" /> : null}</View>
                  </TouchableOpacity>
                );
              })}
              <Text style={s.fine}>
                {solo
                  ? 'One guest at a time. Switch to a group room in Room settings, 4 seats free.'
                  : `Up to ${seats} guests. 4 seats free, extras 25 coins each. Going live is free.`}
              </Text>
              {solo || seats < 12 ? (
                <TouchableOpacity onPress={() => { onClose(); navigation.navigate('ChatProfileSetup', { tab: 'calls' }); }}>
                  <Text style={s.link}>Room size and call settings</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          )}
          {people?.length ? (
            <TouchableOpacity style={[s.primary, s.primaryWide]} onPress={start} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Open the session</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { padding: SPACING.md, gap: rp(10), paddingBottom: rp(120) },
  label: { fontFamily: 'DMSans-Bold', fontSize: rf(11), letterSpacing: 1.6, color: T.textSecondary, marginTop: rp(10) },
  card: { padding: rp(14), borderRadius: RADIUS.lg, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  cardLive: { borderColor: T.primaryBorder, backgroundColor: T.primaryTint },
  startCard: { flexDirection: 'row', alignItems: 'center', gap: rp(12), padding: rp(14), borderRadius: RADIUS.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: T.primaryBorder },
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(12) },
  ava: { backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: T.primaryBorder },
  avaText: { fontFamily: 'DMSans-Bold', fontSize: rf(16), color: T.primary },
  liveIcon: { width: rs(44), height: rs(44), borderRadius: rs(22), alignItems: 'center', justifyContent: 'center', backgroundColor: T.primaryDim },
  title: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.text },
  meta: { fontFamily: 'DMSans-Regular', fontSize: rf(12.5), color: T.textSecondary, marginTop: rp(2), lineHeight: rf(17) },
  primary: { minWidth: rs(70), height: rs(38), paddingHorizontal: rp(16), borderRadius: 999, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  primaryWide: { height: rs(50), borderRadius: RADIUS.md, marginTop: rp(14) },
  primaryText: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: '#fff' },
  ghost: { height: rs(36), paddingHorizontal: rp(14), borderRadius: 999, borderWidth: 1, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text },
  empty: { alignItems: 'center', paddingVertical: rp(40), paddingHorizontal: SPACING.lg, gap: rp(8) },
  emptyIcon: { width: rs(64), height: rs(64), borderRadius: rs(32), alignItems: 'center', justifyContent: 'center', backgroundColor: T.primaryDim, marginBottom: rp(6) },
  emptyTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(18), color: T.text },
  emptyText: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.textSecondary, textAlign: 'center', lineHeight: rf(20) },

  sheetBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.surface, borderTopLeftRadius: rs(22), borderTopRightRadius: rs(22), padding: SPACING.md, paddingBottom: rp(28), borderWidth: 1, borderColor: T.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rp(14) },
  sheetTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(18), color: T.text },
  seg: { flexDirection: 'row', gap: rp(8) },
  segBtn: { flex: 1, flexDirection: 'row', gap: rp(6), height: rs(42), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  segOn: { borderColor: T.primary, backgroundColor: T.primaryTint },
  segText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: rp(12) },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: rp(12) },
  check: { width: rs(24), height: rs(24), borderRadius: rs(12), borderWidth: 1.5, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: T.primary, borderColor: T.primary },
  fine: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary, lineHeight: rf(17) },
  link: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: T.primary },
});
