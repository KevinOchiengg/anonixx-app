/** Rooms → Calls, like a messenger's call log: start a session, calls happening now, then
 * Recent (in, out, missed, declined; sessions hosted or joined) with a call-back button.
 * Data: GET /drop-calls/live and /drop-calls/history. */
import React, { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowDownLeft, ArrowUpRight, Link2, Phone, PhoneMissed, Radio, Users, Video,
} from 'lucide-react-native';
import { rs, rf, rp, FONT, SPACING, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { useSocket } from '../../context/SocketContext';
import { useUnread } from '../../context/UnreadContext';
import { useToast } from '../ui/Toast';
import { callsApi, callParams } from '../../services/calls';
import { chatsApi } from '../../services/chats';
import { Avatar, callTime, duration, st as rowSt } from './ChatBits';
import { StartSessionSheet } from './LivePanel';

const SEEN_KEY = 'rooms_calls_seen_at';
const EVENTS = ['drop_call_started', 'drop_call_ended', 'call_incoming', 'call_cancelled', 'call_missed', 'call_declined', 'call_accepted'];

function statusLine(c) {
  if (c.kind === 'group') return c.direction === 'hosted' ? `Your session${c.guest_count ? ` · ${c.guest_count} joined` : ''}` : 'Session in their Room';
  if (c.missed) return 'Missed';
  if (c.status === 'declined') return c.direction === 'outgoing' ? 'Declined' : 'You declined';
  if (c.status === 'cancelled' || c.status === 'missed') return c.direction === 'outgoing' ? 'No answer' : 'Missed';
  if (c.status === 'ringing') return 'Ringing…';
  if (c.status === 'active') return 'On now';
  return c.direction === 'outgoing' ? 'Outgoing' : 'Incoming';
}

function DirectionIcon({ c }) {
  const bad = c.missed || c.status === 'declined' || c.status === 'cancelled' || c.status === 'missed';
  const color = c.missed ? T.danger : bad ? T.textMuted : T.success;
  if (c.kind === 'group') return <Users size={rs(14)} color={T.violet} strokeWidth={2} />;
  if (c.missed) return <PhoneMissed size={rs(14)} color={color} strokeWidth={2} />;
  return c.direction === 'outgoing'
    ? <ArrowUpRight size={rs(15)} color={color} strokeWidth={2} />
    : <ArrowDownLeft size={rs(15)} color={color} strokeWidth={2} />;
}

const CallsPanel = forwardRef(function CallsPanel({ navigation, active, onMissedCount }, ref) {
  const { socketService, connected } = useSocket();
  const { showToast } = useToast();
  const { refreshUnread } = useUnread();
  const [calls, setCalls] = useState(null);
  const [live, setLive] = useState({ hosting: null, direct: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [starting, setStarting] = useState(false);
  const [myChats, setMyChats] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const [h, l, c] = await Promise.all([
        chatsApi.callHistory(), callsApi.live().catch(() => null), chatsApi.list().catch(() => null),
      ]);
      setCalls(h.calls || []);
      if (l) setLive(l);
      if (c) setMyChats(new Set((c.connections || []).map((x) => x.id)));
      const seen = await AsyncStorage.getItem(SEEN_KEY);
      onMissedCount?.((h.calls || []).filter((x) => x.missed && (!seen || x.started_at > seen)).length);
    } catch {
      setCalls((x) => x || []);
    } finally {
      setRefreshing(false);
    }
  }, [onMissedCount]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!connected) return undefined;
    EVENTS.forEach((e) => socketService.on(e, load));
    return () => EVENTS.forEach((e) => socketService.off(e, load));
  }, [connected, socketService, load]);
  // Looking at the log clears the missed-calls badge.
  useEffect(() => {
    if (!active) return;
    load();
    AsyncStorage.setItem(SEEN_KEY, new Date().toISOString()).then(refreshUnread, () => {});
    onMissedCount?.(0);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    startSession: () => setStarting(true),
    clear: async () => {
      try { await chatsApi.clearCalls(); load(); } catch (e) { showToast({ type: 'error', message: e.message }); }
    },
    refresh: load,
  }), [load, showToast]);

  const callBack = useCallback(async (c, video) => {
    if (busy) return;
    setBusy(c.id);
    try {
      const d = await callsApi.direct(c.connection_id, video);
      navigation.navigate('DropCall', callParams(d, { other: { ...(c.other || {}), ...(d.other || {}) } }));
    } catch (e) {
      showToast({ type: e.status === 409 || e.status === 403 ? 'info' : 'error', message: e.message });
    } finally {
      setBusy('');
    }
  }, [busy, navigation, showToast]);

  const end = useCallback(async (c) => {
    setBusy(c.id);
    try {
      await (c.kind === 'direct' && c.incoming && c.status === 'ringing' ? callsApi.decline(c.id) : callsApi.end(c.id));
    } catch (e) { showToast({ type: 'error', message: e.message }); } finally { setBusy(''); load(); }
  }, [load, showToast]);

  if (calls === null) return <View style={s.center}><ActivityIndicator color={T.primary} /></View>;
  const { hosting, direct = [] } = live || {};

  const header = (
    <View>
      {hosting ? (
        <View style={rowSt.row}>
          <View style={[s.bigIcon, s.bigIconLive]}><Radio size={rs(20)} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={rowSt.name}>Your session is open</Text>
            <Text style={s.meta}>{hosting.video ? 'Video' : 'Voice'} · {hosting.guest_count}/{hosting.max_guests} in{hosting.invite_only ? ' · invite only' : ''}</Text>
          </View>
          <TouchableOpacity style={s.endBtn} onPress={() => end(hosting)} disabled={busy === hosting.id}><Text style={s.endText}>End</Text></TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={rowSt.row} onPress={() => setStarting(true)} activeOpacity={0.7} accessibilityRole="button">
          <View style={s.bigIcon}><Link2 size={rs(20)} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={rowSt.name}>Start a session</Text>
            <Text style={s.meta}>A voice or video room for people you've let in</Text>
          </View>
        </TouchableOpacity>
      )}
      {direct.map((c) => (
        <View key={c.id} style={rowSt.row}>
          <Avatar name={c.other?.name} url={c.other?.avatar_url} seed={c.other?.user_id} />
          <View style={{ flex: 1 }}>
            <Text style={rowSt.name} numberOfLines={1}>{c.other?.name || 'Anonymous'}</Text>
            <Text style={[s.meta, { color: T.primary }]}>{c.video ? 'Video' : 'Voice'} · {c.status === 'ringing' ? (c.incoming ? 'calling you' : 'ringing') : 'on now'}</Text>
          </View>
          <TouchableOpacity style={s.endBtn} onPress={() => end(c)} disabled={busy === c.id}>
            <Text style={s.endText}>{c.status === 'ringing' && c.incoming ? 'Decline' : 'End'}</Text>
          </TouchableOpacity>
        </View>
      ))}
      {calls.length ? <Text style={s.section}>Recent</Text> : null}
    </View>
  );

  return (
    <>
      <FlatList
        data={calls}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: rs(110) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.primary} colors={[T.primary]} />}
        ListEmptyComponent={(
          <View style={s.empty}>
            <View style={s.emptyIcon}><Phone size={rs(26)} color={T.primary} /></View>
            <Text style={s.emptyTitle}>No calls yet</Text>
            <Text style={s.emptyText}>Call anyone you're connected with. 1-to-1 calls are free, and ending one never ends the chat.</Text>
          </View>
        )}
        renderItem={({ item: c }) => {
          const canCallBack = c.kind === 'direct' && c.connection_id && myChats.has(c.connection_id);
          const name = c.kind === 'group' && c.direction === 'hosted' ? 'Your Room' : c.other?.name || 'Anonymous';
          return (
            <TouchableOpacity
              style={rowSt.row}
              activeOpacity={0.7}
              disabled={!c.connection_id || !myChats.has(c.connection_id)}
              onPress={() => navigation.navigate('DropChat', { connectionId: c.connection_id })}
            >
              <Avatar name={name} url={c.direction === 'hosted' ? null : c.other?.avatar_url} seed={c.other?.user_id || 'me'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[rowSt.name, c.missed && { color: T.danger }]} numberOfLines={1}>{name}</Text>
                <View style={s.metaRow}>
                  <DirectionIcon c={c} />
                  <Text style={s.meta} numberOfLines={1}>
                    {statusLine(c)} · {callTime(c.started_at)}{duration(c.duration_seconds) ? ` · ${duration(c.duration_seconds)}` : ''}
                  </Text>
                </View>
              </View>
              {canCallBack ? (
                <TouchableOpacity onPress={() => callBack(c, c.video)} hitSlop={HIT_SLOP} disabled={!!busy} accessibilityLabel={`Call ${name} back`}>
                  {busy === c.id ? <ActivityIndicator size="small" color={T.primary} />
                    : c.video ? <Video size={rs(23)} color={T.primary} /> : <Phone size={rs(21)} color={T.primary} />}
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
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

export default CallsPanel;

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bigIcon: { width: rs(50), height: rs(50), borderRadius: rs(25), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  bigIconLive: { backgroundColor: T.danger },
  section: { fontSize: rf(15), fontFamily: 'DMSans-Bold', color: T.text, paddingHorizontal: SPACING.md, paddingTop: rp(14), paddingBottom: rp(2) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: rp(5), marginTop: rp(3) },
  meta: { fontSize: rf(13), color: T.textSecondary, flexShrink: 1 },
  endBtn: { paddingHorizontal: rp(14), height: rs(32), borderRadius: 999, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  endText: { color: T.danger, fontFamily: 'DMSans-Bold', fontSize: rf(13) },
  empty: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: rp(40), gap: rp(8) },
  emptyIcon: { width: rs(60), height: rs(60), borderRadius: rs(30), backgroundColor: T.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: rp(6) },
  emptyTitle: { fontSize: rf(17), fontFamily: 'DMSans-Bold', color: T.text },
  emptyText: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: FONT.sm * 1.5 },
});
