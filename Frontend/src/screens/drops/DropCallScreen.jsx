/**
 * DropCallScreen.jsx
 *
 * Group video call for a chat interface's "room" — the host plus however
 * many guests their room currently allows (see ChatProfileSetupScreen's
 * solo/multi + capacity settings). Unlike the 1:1 CallScreen, everyone here
 * joins the same Agora channel symmetrically (Communication profile, all
 * publishers) — there's no broadcaster/audience split, host and guests are
 * peers on the stream. "Host" only matters for the leave-vs-end-for-everyone
 * button and the backend room-capacity check that happened before this
 * screen was ever reached.
 *
 * Navigation params (all already resolved by DropChatScreen's
 * start/join call handlers, which hit /drop-calls/start or /:id/join first):
 *   callId, channel, token, uid, appId, isHost, hostName, isAudioOnly
 *
 * isAudioOnly: the header's Phone icon vs. Video icon — joins with the
 * camera off by default, but it's just a starting state, not a locked
 * mode. Either side can flip to video mid-call with the toggle below.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Platform, PermissionsAndroid,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Mic, MicOff, PhoneOff, RotateCcw, ScreenShare, ScreenShareOff, Video, VideoOff,
} from 'lucide-react-native';
import { rs, rf, rp, SPACING, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

function useCallTimer(running) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Tile count → columns, so the grid stays readable from a duo up to a full
// 1-host+12-guest room instead of shrinking tiles into confetti.
function columnsFor(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

const VideoTile = React.memo(({ uid, label, isLocal, isSelf, muted, RtcView, size }) => (
  <View style={[styles.tile, { width: size, height: size }]}>
    {RtcView ? (
      <RtcView style={StyleSheet.absoluteFill} canvas={{ uid: isLocal ? 0 : uid, renderMode: 1 }} />
    ) : (
      <View style={[StyleSheet.absoluteFill, styles.tileFallback]} />
    )}
    <View style={styles.tileLabelWrap}>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      {muted && <MicOff size={rs(11)} color="#fff" />}
    </View>
  </View>
));

export default function DropCallScreen({ route, navigation }) {
  const {
    callId, channel, token, uid, appId, isHost, hostName, isAudioOnly,
  } = route.params || {};

  const { showToast } = useToast();

  const [joined, setJoined]         = useState(false);
  const [micMuted, setMicMuted]     = useState(false);
  const [camOff, setCamOff]         = useState(!!isAudioOnly);
  const [frontCam, setFrontCam]     = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [remoteUids, setRemoteUids] = useState([]);

  const engineRef  = useRef(null);
  const RtcViewRef = useRef(null);
  const callEndedRef = useRef(false);

  const elapsed = useCallTimer(joined);

  const cleanupEngine = useCallback(async () => {
    try {
      if (sharingScreen) engineRef.current?.stopScreenCapture?.();
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
      engineRef.current = null;
    } catch { /* silent */ }
  }, [sharingScreen]);

  const leaveCall = useCallback(async (notifyServer = true) => {
    if (callEndedRef.current) return;
    callEndedRef.current = true;
    await cleanupEngine();

    if (notifyServer && callId) {
      try {
        const token_ = await AsyncStorage.getItem('token');
        const endpoint = isHost
          ? `${API_BASE_URL}/api/v1/drop-calls/${callId}/end`
          : `${API_BASE_URL}/api/v1/drop-calls/${callId}/leave`;
        await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token_}` } });
      } catch { /* silent */ }
    }

    navigation.goBack();
  }, [callId, isHost, cleanupEngine, navigation]);

  // ── Join Agora on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let agoraModule;
      try {
        agoraModule = await import('react-native-agora');
      } catch {
        showToast({ type: 'error', message: 'Calls require a full app build — not supported in Expo Go.' });
        navigation.goBack();
        return;
      }
      const { createAgoraRtcEngine, ChannelProfileType, ClientRoleType, RtcSurfaceView } = agoraModule;
      RtcViewRef.current = RtcSurfaceView;

      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        const ok = Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
        if (!ok) {
          showToast({ type: 'info', title: 'Camera/mic blocked', message: 'Allow access in Settings for video calls.' });
          navigation.goBack();
          return;
        }
      }

      try {
        const engine = createAgoraRtcEngine();
        engineRef.current = engine;
        engine.initialize({ appId });
        engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
        engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
        engine.enableAudio();
        engine.enableVideo();
        engine.startPreview();
        if (isAudioOnly) engine.muteLocalVideoStream(true);

        engine.addListener('onUserJoined', (_connection, joinedUid) => {
          setRemoteUids((prev) => (prev.includes(joinedUid) ? prev : [...prev, joinedUid]));
        });
        engine.addListener('onUserOffline', (_connection, leftUid) => {
          setRemoteUids((prev) => prev.filter((u) => u !== leftUid));
        });
        engine.addListener('onError', () => {
          showToast({ type: 'error', message: 'Call connection error.' });
        });

        await engine.joinChannel(token, channel, uid, {});
        if (!cancelled) setJoined(true);
      } catch {
        showToast({ type: 'error', message: 'Could not join the call.' });
        navigation.goBack();
      }
    })();

    return () => {
      cancelled = true;
      cleanupEngine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setFrontCam((f) => !f);
  }, []);

  // Anyone in the call can share their screen — same toggle for host and
  // guests. Exact ScreenCaptureParameters shape can vary by platform/SDK
  // build; this uses sane defaults and fails soft with a toast rather than
  // crashing the call if the installed native module rejects them.
  const toggleScreenShare = useCallback(async () => {
    try {
      if (!sharingScreen) {
        await engineRef.current?.startScreenCapture?.({
          captureAudio: true,
          captureVideo: true,
        });
        setSharingScreen(true);
      } else {
        await engineRef.current?.stopScreenCapture?.();
        setSharingScreen(false);
      }
    } catch {
      showToast({ type: 'error', message: 'Screen share isn\'t available on this device.' });
    }
  }, [sharingScreen, showToast]);

  const allTiles = useMemo(() => {
    const tiles = [{ uid: 0, label: isHost ? 'You (host)' : 'You', isLocal: true }];
    remoteUids.forEach((u, i) => {
      tiles.push({ uid: u, label: isHost ? `Guest ${i + 1}` : (i === 0 ? (hostName || 'Host') : `Guest ${i + 1}`), isLocal: false });
    });
    return tiles;
  }, [remoteUids, isHost, hostName]);

  const cols = columnsFor(allTiles.length);
  const tileSize = `${100 / cols}%`;
  const RtcView = RtcViewRef.current;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {joined ? elapsed : 'connecting…'}
        </Text>
        <Text style={styles.headerSub}>{allTiles.length} in the room</Text>
      </View>

      <View style={styles.grid}>
        {allTiles.map((t) => (
          <VideoTile
            key={t.isLocal ? 'local' : t.uid}
            uid={t.uid}
            label={t.label}
            isLocal={t.isLocal}
            muted={t.isLocal && micMuted}
            RtcView={RtcView}
            size={tileSize}
          />
        ))}
      </View>

      {!joined && (
        <View style={styles.connectingOverlay}>
          <ActivityIndicator color={T.primary} size="large" />
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.ctrlBtn, micMuted && styles.ctrlBtnActive]}
          onPress={toggleMic}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          {micMuted ? <MicOff size={rs(20)} color="#fff" /> : <Mic size={rs(20)} color={T.text} strokeWidth={1.8} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, camOff && styles.ctrlBtnActive]}
          onPress={toggleCam}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          {camOff ? <VideoOff size={rs(20)} color="#fff" /> : <Video size={rs(20)} color={T.text} strokeWidth={1.8} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endBtn}
          onPress={() => leaveCall(true)}
          hitSlop={HIT_SLOP}
          activeOpacity={0.85}
        >
          <PhoneOff size={rs(24)} color="#fff" strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, sharingScreen && styles.ctrlBtnActive]}
          onPress={toggleScreenShare}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          {sharingScreen
            ? <ScreenShareOff size={rs(20)} color="#fff" />
            : <ScreenShare size={rs(20)} color={T.text} strokeWidth={1.8} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={switchCamera} hitSlop={HIT_SLOP} activeOpacity={0.8}>
          <RotateCcw size={rs(20)} color={T.text} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {isHost && (
        <Text style={styles.hostNote}>Ending the call closes it for everyone in the room.</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050608' },

  header: {
    alignItems: 'center', paddingVertical: rp(10),
  },
  headerTitle: { fontSize: rf(16), fontWeight: '700', color: T.text },
  headerSub:   { fontSize: rf(11), color: T.textMute, marginTop: rp(2) },

  grid: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap',
    alignContent: 'flex-start', alignItems: 'flex-start',
  },
  tile: {
    aspectRatio: 3 / 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden', position: 'relative',
  },
  tileFallback: { backgroundColor: '#111318' },
  tileLabelWrap: {
    position: 'absolute', bottom: rp(6), left: rp(8),
    flexDirection: 'row', alignItems: 'center', gap: rp(5),
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: RADIUS.sm,
    paddingHorizontal: rp(7), paddingVertical: rp(3),
  },
  tileLabel: { fontSize: rf(11), color: '#fff', fontWeight: '600', maxWidth: rs(100) },

  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(5,6,8,0.6)',
  },

  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.md, paddingVertical: rp(18),
  },
  ctrlBtn: {
    width: rs(50), height: rs(50), borderRadius: rs(25),
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border,
  },
  ctrlBtnActive: { backgroundColor: 'rgba(255,99,74,0.3)', borderColor: T.primary },
  endBtn: {
    width: rs(60), height: rs(60), borderRadius: rs(30),
    backgroundColor: T.danger, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.danger, shadowOffset: { width: 0, height: rs(6) },
    shadowOpacity: 0.5, shadowRadius: rs(12), elevation: 8,
  },
  hostNote: {
    fontSize: rf(10), color: T.textMute, textAlign: 'center',
    paddingBottom: rp(10), fontStyle: 'italic',
  },
});
