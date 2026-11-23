/** Incoming 1-to-1 Room call, over any screen. Rings from the socket (`call_incoming`); when
 * the app comes back to the foreground it also asks GET /drop-calls/live, so a call that rang
 * while the socket was down still shows. Accept opens DropCall; decline tells the caller.
 * Mounted once, inside the NavigationContainer (AppNavigator). */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, AppState, Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, Vibration, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MessageCircle, Phone, PhoneOff, Video } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rs, rf, rp, SPACING, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../ui/Toast';
import { callsApi, callParams, QUICK_REPLIES, sendQuickReply } from '../../services/calls';
import AuthorAvatar from '../../components/common/AuthorAvatar';
import { startCallSound, stopCallSound } from '../../utils/callSounds';
import { nativeCalls } from '../../native/calls';

const RING_PATTERN = [0, 700, 900];

export default function IncomingCallOverlay({ navigate }) {
  const { socketService, connected } = useSocket();
  const { showToast } = useToast();
  const [call, setCall] = useState(null);   // { call_id, caller_name, caller_avatar, video, connection_id }
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const close = useCallback(() => {
    Vibration.cancel();
    stopCallSound();
    clearTimeout(timer.current);
    setCall(null);
    setBusy(false);
    setReplying(false);
  }, []);

  const ring = useCallback((c) => {
    setCall((cur) => (cur && cur.call_id !== c.call_id ? cur : c));   // one at a time
    nativeCalls.cancelIncomingCall(c.call_id);
    Vibration.vibrate(RING_PATTERN, true);
    startCallSound('ringtone');
    callsApi.ringing(c.call_id).catch(() => {});
    clearTimeout(timer.current);
    timer.current = setTimeout(close, ((c.ring_seconds || 45) + 2) * 1000);
  }, [close]);

  useEffect(() => {
    if (!connected) return undefined;
    const onIncoming = (c) => ring(c);
    const onGone = (e) => setCall((cur) => {
      if (cur && cur.call_id === e?.call_id) { Vibration.cancel(); stopCallSound(); clearTimeout(timer.current); return null; }
      return cur;
    });
    socketService.on('call_incoming', onIncoming);
    ['call_cancelled', 'call_missed', 'drop_call_ended'].forEach((ev) => socketService.on(ev, onGone));
    return () => {
      socketService.off('call_incoming', onIncoming);
      ['call_cancelled', 'call_missed', 'drop_call_ended'].forEach((ev) => socketService.off(ev, onGone));
    };
  }, [connected, socketService, ring]);

  // Fallback: on open / back to foreground, look for a call still ringing for me.
  const check = useCallback(async () => {
    if (!(await AsyncStorage.getItem('token'))) return;
    try {
      const live = await callsApi.live();
      const ringing = (live.direct || []).find((d) => d.incoming && d.status === 'ringing');
      if (ringing) {
        ring({
          call_id: ringing.id, connection_id: ringing.connection_id, video: ringing.video,
          caller_name: ringing.other?.name, caller_avatar: ringing.other?.avatar_url,
        });
      }
    } catch { /* offline */ }
  }, [ring]);
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  // Opened from the full-screen ringing notification: Answer goes straight into the call.
  useEffect(() => {
    const handle = async (url) => {
      const m = url && url.match(/^anonixx:\/\/call\/([^?/]+)\?action=(\w+)/);
      if (!m) return;
      const [, id, action] = m;
      nativeCalls.cancelIncomingCall(id);
      if (action !== 'accept') { check(); return; }
      try {
        const data = await callsApi.accept(id);
        close();
        navigate('DropCall', callParams(data, { other: data.other || null }));
      } catch (e) {
        showToast({ type: 'info', message: e.message || 'This call has ended.' });
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [check, close, navigate, showToast]);

  useEffect(() => {
    if (!call) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [call, pulse]);

  const accept = useCallback(async () => {
    if (!call || busy) return;
    setBusy(true);
    const c = call;
    try {
      const data = await callsApi.accept(c.call_id);
      close();
      navigate('DropCall', callParams(data, {
        other: { name: c.caller_name, avatar_url: c.caller_avatar, ...(data.other || {}) },
      }));
    } catch (e) {
      close();
      showToast({ type: 'info', message: e.message || 'This call has ended.' });
    }
  }, [call, busy, close, navigate, showToast]);

  const decline = useCallback(async () => {
    if (!call) return;
    const id = call.call_id;
    close();
    try { await callsApi.decline(id); } catch { /* it ends by itself */ }
  }, [call, close]);

  const replyWith = useCallback(async (content) => {
    if (!call) return;
    const { call_id: id, connection_id: cid } = call;
    close();
    callsApi.decline(id).catch(() => {});
    if (!cid) return;
    if (!content) {
      navigate('DropChat', { connectionId: cid });
      return;
    }
    try {
      await sendQuickReply(cid, content);
      showToast({ type: 'info', message: 'Message sent.' });
    } catch (e) {
      showToast({ type: 'error', message: e.message });
    }
  }, [call, close, navigate, showToast]);

  if (!call) return null;
  const name = call.caller_name || 'Someone';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={decline} statusBarTranslucent navigationBarTranslucent>
      <View style={[s.back, { paddingTop: insets.top + rs(72), paddingBottom: insets.bottom + rs(56) }]}>
        {call.caller_avatar ? <Image source={{ uri: call.caller_avatar }} style={StyleSheet.absoluteFill} blurRadius={40} /> : null}
        <LinearGradient colors={['rgba(11,15,24,0.55)', 'rgba(11,15,24,0.82)', 'rgba(11,15,24,0.97)']} style={StyleSheet.absoluteFill} />
        <View style={s.center}>
          <View style={s.kickerRow}>
            {call.video ? <Video size={rs(14)} color={T.textSecondary} /> : <Phone size={rs(14)} color={T.textSecondary} />}
            <Text style={s.kicker}>{call.video ? 'Anonixx video call' : 'Anonixx voice call'}</Text>
          </View>
          <View style={s.avaWrap}>
            <Animated.View
              pointerEvents="none"
              style={[s.ring, {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
              }]}
            />
            <View style={s.ava}>
              <AuthorAvatar uri={call.caller_avatar} name={name} />
            </View>
          </View>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.sub}>{busy ? 'Connecting…' : 'Incoming call'}</Text>
        </View>
        {replying ? (
          <View style={s.replies}>
            {QUICK_REPLIES.map((r) => (
              <TouchableOpacity key={r} style={s.reply} onPress={() => replyWith(r)} accessibilityRole="button">
                <Text style={s.replyText}>{r}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.reply} onPress={() => replyWith('')} accessibilityRole="button">
              <Text style={[s.replyText, s.replyOwn]}>Write your own…</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setReplying(false)} hitSlop={HIT_SLOP} accessibilityRole="button">
              <Text style={s.replyBack}>Back</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={s.bottom}>
          {call.connection_id ? (
            <TouchableOpacity style={[s.message, replying && s.messageOn]} onPress={() => setReplying((v) => !v)} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Decline with a message">
              <MessageCircle size={rs(20)} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <View style={s.actions}>
            <TouchableOpacity style={[s.btn, s.decline]} onPress={decline} hitSlop={HIT_SLOP} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Decline call">
              <PhoneOff size={rs(30)} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.accept, busy && { opacity: 0.6 }]} onPress={accept} disabled={busy} hitSlop={HIT_SLOP} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Accept call">
              {call.video ? <Video size={rs(30)} color="#fff" /> : <Phone size={rs(30)} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: T.background, justifyContent: 'space-between' },
  center: { alignItems: 'center', gap: rp(10), paddingHorizontal: SPACING.lg },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(28) },
  kicker: { fontFamily: 'DMSans-SemiBold', fontSize: rf(13), color: T.textSecondary },
  avaWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: rp(10) },
  ring: { position: 'absolute', width: rs(132), height: rs(132), borderRadius: rs(66), borderWidth: 2, borderColor: T.primary },
  ava: { width: rs(132), height: rs(132), borderRadius: rs(66), backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 3, borderColor: T.primaryBorder },
  name: { fontFamily: 'DMSans-SemiBold', fontSize: rf(26), color: '#fff', marginTop: rp(10) },
  sub: { fontFamily: 'DMSans-Regular', fontSize: rf(15), color: 'rgba(255,255,255,0.75)' },
  bottom: { alignItems: 'center', gap: rp(36) },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: rs(56) },
  btn: {
    width: rs(74), height: rs(74), borderRadius: rs(37), alignItems: 'center', justifyContent: 'center',
    elevation: 10, shadowOffset: { width: 0, height: rs(6) }, shadowOpacity: 0.45, shadowRadius: rs(14),
  },
  decline: { backgroundColor: T.danger, shadowColor: T.danger },
  accept: { backgroundColor: T.success, shadowColor: T.success },
  message: {
    width: rs(48), height: rs(48), borderRadius: rs(24), alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  messageOn: { backgroundColor: 'rgba(255,255,255,0.24)' },
  replies: { position: 'absolute', left: SPACING.lg, right: SPACING.lg, bottom: rs(230), gap: rp(8), alignItems: 'stretch' },
  reply: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 999, paddingVertical: rp(12), paddingHorizontal: rp(16) },
  replyText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text, textAlign: 'center' },
  replyOwn: { color: T.primary },
  replyBack: { fontFamily: 'DMSans-SemiBold', fontSize: rf(13), color: T.textSecondary, textAlign: 'center', paddingTop: rp(4) },
});
