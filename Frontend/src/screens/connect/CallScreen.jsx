/**
 * CallScreen.jsx — 1-on-1 anonymous audio/video call via Agora.
 *
 * Flow:
 *   Initiator  → navigated here by ChatScreen with isInitiator=true
 *                → calls /call/start → gets token → joins channel → waits for call_accepted
 *   Receiver   → navigated here when they tap "Accept" on IncomingCallModal
 *                → calls /call/accept → gets token → joins channel
 *
 * Both sides publish audio (always) and video (when callType === 'video').
 * All 17 Anonixx dev rules applied.
 */
import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Animated, Platform, PermissionsAndroid,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, RotateCcw } from 'lucide-react-native';
import { rs, rf, rp, SPACING, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:  '#0b0f18',
  surface:     '#151924',
  surfaceAlt:  '#1e2535',
  primary:     '#FF634A',
  text:        '#EAEAF0',
  textSecondary: '#9A9AA3',
  danger:      '#ef4444',
  online:      '#4CAF50',
  border:      'rgba(255,255,255,0.06)',
};

const AVATAR_MAP = {
  ghost: '👻', shadow: '🌑', flame: '🔥', void: '🕳️',
  storm: '⛈️', smoke: '💨', eclipse: '🌘', shard: '🔷',
  moth: '🦋', raven: '🐦‍⬛',
};

// ─── Call timer ───────────────────────────────────────────────
function useCallTimer(running) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Pulsing ring animation ───────────────────────────────────
const PulseRing = React.memo(({ color }) => {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1.5, duration: 1200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulseRing,
        { borderColor: color, transform: [{ scale }], opacity },
      ]}
    />
  );
});

// ─── Screen ───────────────────────────────────────────────────
export default function CallScreen({ route, navigation }) {
  const {
    chatId, callType = 'audio',
    isInitiator = false,
    otherName, otherAvatar, otherAvatarColor,
  } = route.params || {};

  const { showToast }     = useToast();
  const { socketService } = useSocket();

  const [status,    setStatus]    = useState(isInitiator ? 'calling' : 'connecting');
  // status: 'calling' | 'connecting' | 'active' | 'ended'
  const [micMuted,  setMicMuted]  = useState(false);
  const [camOff,    setCamOff]    = useState(false);
  const [frontCam,  setFrontCam]  = useState(true);
  const [remoteUid, setRemoteUid] = useState(null);

  const engineRef        = useRef(null);
  const localViewRef     = useRef(null);
  const remoteViewRef    = useRef(null);
  const RtcLocalViewRef  = useRef(null);
  const RtcRemoteViewRef = useRef(null);
  const callEnded           = useRef(false);
  const noAnswerTimerRef    = useRef(null);

  const elapsed = useCallTimer(status === 'active');
  const avatarColor = otherAvatarColor || T.primary;

  // ── Cleanup helper ────────────────────────────────────────
  const cleanupEngine = useCallback(async () => {
    if (callEnded.current) return;
    callEnded.current = true;
    // Always clear the no-answer timer on cleanup
    if (noAnswerTimerRef.current) {
      clearTimeout(noAnswerTimerRef.current);
      noAnswerTimerRef.current = null;
    }
    try {
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
      engineRef.current = null;
    } catch { /* silent */ }
  }, []);

  // ── End call ──────────────────────────────────────────────
  const endCall = useCallback(async (notify = true) => {
    if (callEnded.current) return;
    await cleanupEngine();
    setStatus('ended');

    if (notify) {
      try {
        const token = await AsyncStorage.getItem('token');
        await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/call/end`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* silent */ }
    }

    setTimeout(() => navigation.goBack(), 1200);
  }, [chatId, cleanupEngine, navigation]);

  // ── Init Agora ────────────────────────────────────────────
  const joinChannel = useCallback(async (token, channel, uid, appId) => {
    try {
      let agoraModule;
      try {
        agoraModule = await import('react-native-agora');
      } catch {
        showToast({ type: 'error', message: 'Calls require a full app build — not supported in Expo Go.' });
        endCall(false);
        return;
      }
      const {
        createAgoraRtcEngine,
        ChannelProfileType,
        ClientRoleType,
        RtcSurfaceView,
      } = agoraModule;

      RtcLocalViewRef.current  = RtcSurfaceView;
      RtcRemoteViewRef.current = RtcSurfaceView;

      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({ appId });
      engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
      engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      engine.enableAudio();

      if (callType === 'video') {
        // Android 6+ requires runtime camera permission even if it's in the manifest.
        // iOS uses NSCameraUsageDescription (set in app.json infoPlist) — the OS
        // prompts automatically on first use, but we gate here to avoid a silent
        // black-screen failure if the user previously denied it.
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title:   'Camera access',
              message: 'Anonixx needs your camera for this video call.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            showToast({
              type:    'info',
              title:   'Camera blocked',
              message: 'Allow camera access in Settings to make video calls.',
            });
            endCall(false);
            return;
          }
        }
        engine.enableVideo();
        engine.startPreview();
      }

      engine.addListener('onUserJoined', (connection, uid_) => {
        setRemoteUid(uid_);
        setStatus('active');
        // Remote user joined — clear the no-answer timeout
        if (noAnswerTimerRef.current) {
          clearTimeout(noAnswerTimerRef.current);
          noAnswerTimerRef.current = null;
        }
      });

      engine.addListener('onUserOffline', () => {
        endCall(false);
      });

      engine.addListener('onError', () => {
        showToast({ type: 'error', message: 'Call connection error.' });
        endCall(false);
      });

      await engine.joinChannel(token, channel, uid, {});

      // Both audio and video wait for onUserJoined before going active.
      // If no one joins within 30s, end the call — they didn't answer.
      if (isInitiator) {
        noAnswerTimerRef.current = setTimeout(() => {
          showToast({ type: 'info', message: 'No answer.' });
          endCall(true);
        }, 30_000);
      }
    } catch (e) {
      showToast({ type: 'error', message: 'Could not start call.' });
      endCall(false);
    }
  }, [callType, endCall, showToast]);

  // ── Fetch token + join ────────────────────────────────────
  const initCall = useCallback(async () => {
    try {
      const token   = await AsyncStorage.getItem('token');
      const endpoint = isInitiator
        ? `${API_BASE_URL}/api/v1/connect/chats/${chatId}/call/start?call_type=${callType}`
        : `${API_BASE_URL}/api/v1/connect/chats/${chatId}/call/accept?call_type=${callType}`;

      const res  = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        // 503 = other user is offline (definitive server-side check)
        const msg = res.status === 503
          ? (err.detail || 'They\'re not online right now.')
          : (err.detail || 'Could not start call.');
        showToast({ type: 'info', title: 'Not available', message: msg });
        navigation.goBack();
        return;
      }
      const data = await res.json();
      await joinChannel(data.token, data.channel, data.uid, data.app_id);
    } catch {
      showToast({ type: 'error', message: 'Could not connect the call.' });
      navigation.goBack();
    }
  }, [chatId, callType, isInitiator, joinChannel, navigation, showToast]);

  // ── Socket events ─────────────────────────────────────────
  useEffect(() => {
    const onAccepted = () => setStatus('connecting'); // caller knows receiver accepted
    const onRejected = () => {
      showToast({ type: 'info', message: 'Call declined.' });
      endCall(false);
    };
    const onEnded = () => endCall(false);

    socketService?.onCallAccepted?.(onAccepted);
    socketService?.onCallRejected?.(onRejected);
    socketService?.onCallEnded?.(onEnded);

    return () => {
      socketService?.offCallAccepted?.(onAccepted);
      socketService?.offCallRejected?.(onRejected);
      socketService?.offCallEnded?.(onEnded);
    };
  }, [socketService, endCall, showToast]);

  // ── Start on mount ────────────────────────────────────────
  useEffect(() => {
    initCall();
    return () => { cleanupEngine(); };
  }, []);

  // ── Controls ──────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const next = !micMuted;
    engineRef.current?.muteLocalAudioStream(next);
    setMicMuted(next);
  }, [micMuted]);

  const toggleCam = useCallback(() => {
    const next = !camOff;
    engineRef.current?.muteLocalVideoStream(next);
    setCamOff(next);
  }, [camOff]);

  const switchCamera = useCallback(() => {
    engineRef.current?.switchCamera();
    setFrontCam(f => !f);
  }, []);

  // ── Render ────────────────────────────────────────────────
  const statusLabel = status === 'calling'
    ? 'calling…'
    : status === 'connecting'
    ? 'connecting…'
    : status === 'ended'
    ? 'call ended'
    : elapsed;

  const RtcLocalView  = RtcLocalViewRef.current;
  const RtcRemoteView = RtcRemoteViewRef.current;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>

      {/* ── Video streams (video calls only) ── */}
      {callType === 'video' && status === 'active' && RtcRemoteView && (
        <View style={StyleSheet.absoluteFill}>
          <RtcRemoteView
            style={StyleSheet.absoluteFill}
            canvas={{ uid: remoteUid, renderMode: 1 }}
          />
        </View>
      )}

      {/* ── Caller card (audio calls or waiting state) ── */}
      {(callType === 'audio' || status !== 'active') && (
        <View style={styles.centerCard}>
          <View style={styles.avatarWrap}>
            {(status === 'calling') && (
              <PulseRing color={avatarColor} />
            )}
            <View style={[styles.avatar, { backgroundColor: avatarColor + '22', borderColor: avatarColor + '55' }]}>
              <Text style={styles.avatarEmoji}>
                {AVATAR_MAP[otherAvatar] || '👤'}
              </Text>
            </View>
          </View>

          <Text style={styles.name}>{otherName || 'Anonymous'}</Text>
          <Text style={styles.statusLabel}>{statusLabel}</Text>

          {status === 'calling' && (
            <ActivityIndicator
              color={T.primary}
              style={{ marginTop: SPACING.sm }}
            />
          )}
        </View>
      )}

      {/* ── Self preview (video call, top-right pip) ── */}
      {callType === 'video' && RtcLocalView && (
        <View style={styles.selfPreview}>
          <RtcLocalView
            style={StyleSheet.absoluteFill}
            canvas={{ uid: 0, renderMode: 1 }}
          />
          {camOff && (
            <View style={styles.camOffOverlay}>
              <VideoOff size={rs(18)} color={T.textSecondary} />
            </View>
          )}
        </View>
      )}

      {/* ── Controls bar ── */}
      <View style={styles.controls}>
        {/* Mic */}
        <TouchableOpacity
          style={[styles.ctrlBtn, micMuted && styles.ctrlBtnActive]}
          onPress={toggleMic}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          {micMuted
            ? <MicOff size={rs(22)} color="#fff" strokeWidth={2} />
            : <Mic    size={rs(22)} color={T.text} strokeWidth={1.8} />
          }
        </TouchableOpacity>

        {/* End call */}
        <TouchableOpacity
          style={styles.endBtn}
          onPress={() => endCall(true)}
          hitSlop={HIT_SLOP}
          activeOpacity={0.85}
        >
          <PhoneOff size={rs(26)} color="#fff" strokeWidth={2} />
        </TouchableOpacity>

        {/* Camera toggle (video only, only when call is active) */}
        {callType === 'video' && status === 'active' ? (
          <TouchableOpacity
            style={[styles.ctrlBtn, camOff && styles.ctrlBtnActive]}
            onPress={toggleCam}
            hitSlop={HIT_SLOP}
            activeOpacity={0.8}
          >
            {camOff
              ? <VideoOff size={rs(22)} color="#fff" strokeWidth={2} />
              : <Video    size={rs(22)} color={T.text} strokeWidth={1.8} />
            }
          </TouchableOpacity>
        ) : (
          /* Placeholder keeps end btn centred during calling/audio */
          <View style={styles.ctrlBtn} />
        )}
      </View>

      {/* Switch camera (video only, only when active) */}
      {callType === 'video' && status === 'active' && (
        <TouchableOpacity
          style={styles.switchCamBtn}
          onPress={switchCamera}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          <RotateCcw size={rs(18)} color={T.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  centerCard: {
    flex: 1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingBottom:  rs(120),
  },
  avatarWrap: {
    width:          rs(110),
    height:         rs(110),
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.md,
    position:       'relative',
  },
  pulseRing: {
    position:     'absolute',
    width:         rs(110),
    height:        rs(110),
    borderRadius:  rs(55),
    borderWidth:   2,
  },
  avatar: {
    width:          rs(90),
    height:         rs(90),
    borderRadius:   rs(45),
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    2,
  },
  avatarEmoji: { fontSize: rf(40) },
  name: {
    fontSize:   rf(20),
    fontWeight: '700',
    color:      T.text,
    marginBottom: rp(6),
  },
  statusLabel: {
    fontSize:   rf(14),
    color:      T.textSecondary,
    fontStyle:  'italic',
  },

  // Self-view PiP
  selfPreview: {
    position:     'absolute',
    top:          rp(20),
    right:        rp(16),
    width:        rs(90),
    height:       rs(130),
    borderRadius: RADIUS.md,
    overflow:     'hidden',
    borderWidth:  1,
    borderColor:  T.border,
    backgroundColor: T.surfaceAlt,
  },
  camOffOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.surfaceAlt,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Controls bar
  controls: {
    position:          'absolute',
    bottom:            rp(48),
    left:              0,
    right:             0,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  ctrlBtn: {
    width:          rs(56),
    height:         rs(56),
    borderRadius:   rs(28),
    backgroundColor: T.surfaceAlt,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    T.border,
  },
  ctrlBtnActive: {
    backgroundColor: 'rgba(255,99,74,0.25)',
    borderColor:     T.primary,
  },
  endBtn: {
    width:          rs(68),
    height:         rs(68),
    borderRadius:   rs(34),
    backgroundColor: T.danger,
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    T.danger,
    shadowOffset:   { width: 0, height: rs(6) },
    shadowOpacity:  0.5,
    shadowRadius:   rs(12),
    elevation:      8,
  },
  switchCamBtn: {
    position:       'absolute',
    bottom:         rp(58),
    left:           rp(28),
    width:          rs(40),
    height:         rs(40),
    borderRadius:   rs(20),
    backgroundColor: T.surfaceAlt,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    T.border,
  },
});
