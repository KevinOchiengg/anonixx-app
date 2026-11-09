/** Incoming 1-to-1 Room call, over any screen. Rings from the socket (`call_incoming`); when
 * the app comes back to the foreground it also asks GET /drop-calls/live, so a call that rang
 * while the socket was down still shows. Accept opens DropCall; decline tells the caller.
 * Mounted once, inside the NavigationContainer (AppNavigator). */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, AppState, Image, Modal, StyleSheet, Text, TouchableOpacity, Vibration, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Phone, PhoneOff, Video } from 'lucide-react-native';
import { rs, rf, rp, SPACING, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../ui/Toast';
import { callsApi, callParams } from '../../services/calls';

const RING_PATTERN = [0, 700, 900];

export default function IncomingCallOverlay({ navigate }) {
  const { socketService, connected } = useSocket();
  const { showToast } = useToast();
  const [call, setCall] = useState(null);   // { call_id, caller_name, caller_avatar, video, connection_id }
  const [busy, setBusy] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const close = useCallback(() => {
    Vibration.cancel();
    clearTimeout(timer.current);
    setCall(null);
    setBusy(false);
  }, []);

  const ring = useCallback((c) => {
    setCall((cur) => (cur && cur.call_id !== c.call_id ? cur : c));   // one at a time
    // Vibration only: the device's own mute and do-not-disturb settings decide the rest.
    Vibration.vibrate(RING_PATTERN, true);
    clearTimeout(timer.current);
    timer.current = setTimeout(close, ((c.ring_seconds || 45) + 2) * 1000);
  }, [close]);

  useEffect(() => {
    if (!connected) return undefined;
    const onIncoming = (c) => ring(c);
    const onGone = (e) => setCall((cur) => {
      if (cur && cur.call_id === e?.call_id) { Vibration.cancel(); clearTimeout(timer.current); return null; }
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

  if (!call) return null;
  const name = call.caller_name || 'Someone';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={decline} statusBarTranslucent>
      <View style={s.back}>
        <LinearGradient colors={[T.primaryGlow, T.background]} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.7 }} />
        <View style={s.center}>
          <Text style={s.kicker}>{call.video ? 'VIDEO CALL' : 'VOICE CALL'} · FROM YOUR ROOM</Text>
          <View style={s.avaWrap}>
            <Animated.View
              pointerEvents="none"
              style={[s.ring, {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
              }]}
            />
            <View style={s.ava}>
              {call.caller_avatar ? <Image source={{ uri: call.caller_avatar }} style={StyleSheet.absoluteFill} />
                : <Text style={s.initial}>{name[0].toUpperCase()}</Text>}
            </View>
          </View>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.sub}>is calling you</Text>
        </View>
        <View style={s.actions}>
          <View style={s.act}>
            <TouchableOpacity style={[s.btn, s.decline]} onPress={decline} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Decline call">
              <PhoneOff size={rs(26)} color="#fff" />
            </TouchableOpacity>
            <Text style={s.actText}>Decline</Text>
          </View>
          <View style={s.act}>
            <TouchableOpacity style={[s.btn, s.accept]} onPress={accept} disabled={busy} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Accept call">
              {call.video ? <Video size={rs(26)} color="#fff" /> : <Phone size={rs(26)} color="#fff" />}
            </TouchableOpacity>
            <Text style={s.actText}>{busy ? 'Connecting…' : 'Accept'}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: T.background, justifyContent: 'space-between', paddingVertical: rp(70) },
  center: { alignItems: 'center', gap: rp(10), paddingHorizontal: SPACING.lg },
  kicker: { fontFamily: 'DMSans-Bold', fontSize: rf(11), letterSpacing: 2, color: T.primary, marginBottom: rp(24) },
  avaWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: rp(10) },
  ring: { position: 'absolute', width: rs(132), height: rs(132), borderRadius: rs(66), borderWidth: 2, borderColor: T.primary },
  ava: { width: rs(132), height: rs(132), borderRadius: rs(66), backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 3, borderColor: T.primaryBorder },
  initial: { fontFamily: 'DMSans-Bold', fontSize: rf(48), color: T.primary },
  name: { fontFamily: 'DMSans-Bold', fontSize: rf(28), color: T.text },
  sub: { fontFamily: 'DMSans-Regular', fontSize: rf(15), color: T.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly' },
  act: { alignItems: 'center', gap: rp(10) },
  btn: { width: rs(72), height: rs(72), borderRadius: rs(36), alignItems: 'center', justifyContent: 'center', elevation: 8 },
  decline: { backgroundColor: T.danger },
  accept: { backgroundColor: T.success },
  actText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text },
});
