/** A Room call on Agora (Communication profile; everyone publishes).
 *
 * kind "direct": a 1-to-1 call. The caller arrives with status "ringing" and is already in the
 *   channel, so audio connects the moment the other person accepts; declined / missed / no
 *   answer close it. Either side can end it.
 * kind "group": a session in the owner's Room. The host sees the participant list and can mute
 *   or remove someone, and ends it for everyone; guests leave.
 *
 * Params: callId, channel, token, uid, appId, kind, video, status, ringSeconds, other
 * ({ name, avatar_url }), isHost. Older params (isAudioOnly, hostName) still work.
 * Leaving a call never touches the Room conversation. */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Animated, Image, Modal, Platform, PermissionsAndroid, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Mic, MicOff, PhoneOff, RefreshCw, Users, Video, VideoOff, Volume2, VolumeX, X, UserMinus,
} from 'lucide-react-native';
import { rs, rf, rp, SPACING, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { callsApi } from '../../services/calls';
import T from '../../utils/theme';

function useCallTimer(running) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const h = Math.floor(secs / 3600);
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

// Tile count → columns, so the grid stays readable from a duo up to a full room.
function columnsFor(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

function Avatar({ name, url, size }) {
  return (
    <View style={[styles.ava, { width: size, height: size, borderRadius: size / 2 }]}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} />
        : <Text style={[styles.avaInitial, { fontSize: size * 0.38 }]}>{(name || 'A')[0].toUpperCase()}</Text>}
    </View>
  );
}

const VideoTile = React.memo(({ uid, person, isLocal, muted, camOff, RtcView, size }) => (
  <View style={[styles.tile, { width: size, height: size }]}>
    {RtcView && !camOff ? (
      <RtcView style={StyleSheet.absoluteFill} canvas={{ uid: isLocal ? 0 : uid, renderMode: 1 }} />
    ) : (
      <View style={[StyleSheet.absoluteFill, styles.tileFallback]}>
        <Avatar name={person?.name} url={person?.avatar_url} size={rs(64)} />
      </View>
    )}
    <View style={styles.tileLabelWrap}>
      <Text style={styles.tileLabel} numberOfLines={1}>{isLocal ? 'You' : person?.name || 'Guest'}</Text>
      {muted && <MicOff size={rs(11)} color="#fff" />}
    </View>
  </View>
));

// Phases: ringing (direct, waiting for an answer) → connecting → live → ended.
export default function DropCallScreen({ route, navigation }) {
  const p = route.params || {};
  const callId = p.callId;
  const kind = p.kind || 'group';
  const direct = kind === 'direct';
  const wantVideo = p.video !== undefined ? !!p.video : !p.isAudioOnly;
  const isHost = !!p.isHost;
  const other = p.other || (p.hostName ? { name: p.hostName } : null);

  const { showToast } = useToast();
  const { socketService } = useSocket();

  const [phase, setPhase]           = useState(p.status === 'ringing' ? 'ringing' : 'connecting');
  const [joined, setJoined]         = useState(false);
  const [micMuted, setMicMuted]     = useState(false);
  const [camOff, setCamOff]         = useState(!wantVideo);
  const [speaker, setSpeaker]       = useState(wantVideo);
  const [remoteUids, setRemoteUids] = useState([]);
  const [remoteCamOff, setRemoteCamOff] = useState({});   // uid -> true when their camera is off
  const [remoteMuted, setRemoteMuted]   = useState({});
  const [netNote, setNetNote]       = useState('');
  const [people, setPeople]         = useState([]);       // from GET /drop-calls/{id}
  const [peopleOpen, setPeopleOpen] = useState(false);

  const engineRef  = useRef(null);
  const RtcViewRef = useRef(null);
  const endedRef   = useRef(false);
  const pulse      = useRef(new Animated.Value(0)).current;

  // The timer runs from when the other side is actually there.
  const live = joined && (direct ? remoteUids.length > 0 : true);
  const elapsed = useCallTimer(live);
  useEffect(() => { if (live) setPhase('live'); }, [live]);

  const cleanupEngine = useCallback(() => {
    try {
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
    } catch { /* silent */ }
    engineRef.current = null;
  }, []);

  // notify: tell the server (end for host/direct, leave for guests). message: toast to show.
  const finish = useCallback(async ({ notify = true, message } = {}) => {
    if (endedRef.current) return;
    endedRef.current = true;
    cleanupEngine();
    if (notify && callId) {
      try {
        await (direct || isHost ? callsApi.end(callId) : callsApi.leave(callId));
      } catch { /* the server ends stale calls by itself */ }
    }
    if (message) showToast({ type: 'info', message });
    if (navigation.canGoBack()) navigation.goBack();
  }, [callId, direct, isHost, cleanupEngine, navigation, showToast]);

  // Hardware back = hang up, so nobody stays connected by accident.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { finish(); return true; });
    return () => sub.remove();
  }, [finish]);

  // Ringing: a soft pulse, and give up after the ring window (the server marks it missed too).
  useEffect(() => {
    if (phase !== 'ringing') return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    const t = setTimeout(() => finish({ message: `${other?.name || 'They'} didn't answer.` }), ((p.ringSeconds || 45) + 3) * 1000);
    return () => { loop.stop(); clearTimeout(t); };
  }, [phase, pulse, finish, other?.name, p.ringSeconds]);

  // Server events for this call.
  useEffect(() => {
    const mine = (fn) => (e) => { if (e?.call_id === callId) fn(e); };
    const handlers = {
      call_accepted: mine(() => setPhase('connecting')),
      call_declined: mine(() => finish({ notify: false, message: `${other?.name || 'They'} can't talk right now.` })),
      call_missed: mine(() => finish({ notify: false, message: `${other?.name || 'They'} didn't answer.` })),
      call_cancelled: mine(() => finish({ notify: false })),
      drop_call_ended: mine(() => finish({ notify: false, message: 'The call ended.' })),
      drop_call_removed: mine(() => finish({ notify: false, message: 'The host took you out of the session.' })),
      drop_call_mute: mine(() => {
        engineRef.current?.muteLocalAudioStream(true);
        setMicMuted(true);
        showToast({ type: 'info', message: 'The host muted you. Tap the mic to talk again.' });
      }),
      drop_call_guest_joined: mine(() => loadPeople()),
      drop_call_participants: mine(() => loadPeople()),
    };
    Object.entries(handlers).forEach(([ev, fn]) => socketService.on(ev, fn));
    return () => Object.entries(handlers).forEach(([ev, fn]) => socketService.off(ev, fn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, socketService, finish, other?.name, showToast]);

  const loadPeople = useCallback(async () => {
    if (!callId) return;
    try {
      const d = await callsApi.details(callId);
      setPeople(d.participants || []);
      if (d.status && !['active', 'ringing'].includes(d.status)) finish({ notify: false, message: 'The call ended.' });
    } catch { /* keep the last list */ }
  }, [callId, finish]);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  // ── Join Agora on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let agoraModule;
      try {
        agoraModule = await import('react-native-agora');
      } catch {
        showToast({ type: 'error', message: 'Calls need the full app build. They don’t run in Expo Go.' });
        finish();
        return;
      }
      const {
        createAgoraRtcEngine, ChannelProfileType, ClientRoleType, RtcSurfaceView,
      } = agoraModule;
      RtcViewRef.current = RtcSurfaceView;

      // Mic is required; the camera only for video, and a refused camera just means voice.
      let camAllowed = wantVideo;
      if (Platform.OS === 'android') {
        const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, ...(wantVideo ? [PermissionsAndroid.PERMISSIONS.CAMERA] : [])];
        const granted = await PermissionsAndroid.requestMultiple(perms);
        if (granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED) {
          showToast({ type: 'warning', title: 'Microphone blocked', message: 'Allow the microphone for Anonixx in Settings to make calls.' });
          finish();
          return;
        }
        if (wantVideo && granted[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED) {
          camAllowed = false;
          setCamOff(true);
          showToast({ type: 'info', message: 'Camera blocked, so this is voice only. You can allow it in Settings.' });
        }
      }

      try {
        const engine = createAgoraRtcEngine();
        engineRef.current = engine;
        engine.initialize({ appId: p.appId });
        engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
        engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
        engine.enableAudio();
        engine.enableVideo();
        engine.setDefaultAudioRouteToSpeakerphone(wantVideo);
        if (camAllowed) engine.startPreview();
        engine.muteLocalVideoStream(!camAllowed);

        engine.addListener('onUserJoined', (_c, u) => {
          setRemoteUids((prev) => (prev.includes(u) ? prev : [...prev, u]));
          loadPeople();
        });
        engine.addListener('onUserOffline', (_c, u) => {
          setRemoteUids((prev) => {
            const next = prev.filter((x) => x !== u);
            // A 1-to-1 call is over when the other person drops out.
            if (direct && next.length === 0) setTimeout(() => finish({ message: 'The call ended.' }), 0);
            return next;
          });
        });
        engine.addListener('onUserMuteVideo', (_c, u, m) => setRemoteCamOff((prev) => ({ ...prev, [u]: m })));
        engine.addListener('onUserMuteAudio', (_c, u, m) => setRemoteMuted((prev) => ({ ...prev, [u]: m })));
        // 4 reconnecting, 5 failed (Agora ConnectionStateType).
        engine.addListener('onConnectionStateChanged', (_c, state) => {
          if (state === 4) setNetNote('Reconnecting…');
          else if (state === 5) finish({ notify: false, message: 'Lost the connection. The call ended.' });
          else setNetNote('');
        });
        engine.addListener('onTokenPrivilegeWillExpire', async () => {
          try {
            const r = await callsApi.renew(callId);
            engineRef.current?.renewToken(r.token);
          } catch { /* the call ends when the old token runs out */ }
        });
        engine.addListener('onError', (err) => {
          if (err === 109 || err === 110) finish({ message: 'The call link expired.' });
        });

        engine.joinChannel(p.token, p.channel, p.uid, {});
        if (!cancelled) setJoined(true);
      } catch {
        showToast({ type: 'error', message: 'Could not connect the call.' });
        finish();
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

  const toggleCam = useCallback(async () => {
    const next = !camOff;
    if (!next && Platform.OS === 'android') {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (r !== PermissionsAndroid.RESULTS.GRANTED) {
        showToast({ type: 'info', message: 'Allow the camera in Settings to turn it on.' });
        return;
      }
    }
    if (!next) engineRef.current?.startPreview();
    engineRef.current?.muteLocalVideoStream(next);
    setCamOff(next);
  }, [camOff, showToast]);

  const toggleSpeaker = useCallback(() => {
    const next = !speaker;
    engineRef.current?.setEnableSpeakerphone(next);
    setSpeaker(next);
  }, [speaker]);

  const switchCamera = useCallback(() => engineRef.current?.switchCamera(), []);

  const personForUid = useCallback(
    (u) => people.find((x) => x.uid === u) || (direct ? other : null),
    [people, direct, other],
  );

  const hostAction = useCallback(async (person, action) => {
    try {
      if (action === 'mute') {
        await callsApi.mute(callId, person.user_id);
        showToast({ type: 'info', message: `Muted ${person.name}.` });
      } else {
        await callsApi.remove(callId, person.user_id);
        showToast({ type: 'info', message: `${person.name} is out of this session. They're still in your Room.` });
        loadPeople();
      }
    } catch (e) {
      showToast({ type: 'error', message: e.message });
    }
  }, [callId, loadPeople, showToast]);

  const tiles = useMemo(() => [
    { key: 'local', uid: 0, isLocal: true },
    ...remoteUids.map((u) => ({ key: String(u), uid: u, isLocal: false })),
  ], [remoteUids]);

  const RtcView = RtcViewRef.current;
  const anyVideo = !camOff || remoteUids.some((u) => !remoteCamOff[u]);
  const showStage = direct && (phase === 'ringing' || !anyVideo || remoteUids.length === 0);
  const cols = columnsFor(tiles.length);
  const tileSize = `${100 / cols}%`;

  const status = phase === 'ringing' ? 'Ringing…'
    : !live ? (direct ? 'Connecting…' : 'Opening the session…')
      : netNote || elapsed;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient colors={[T.primaryGlow, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }} pointerEvents="none" />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {direct ? other?.name || 'Anonymous' : isHost ? 'Your session' : `${other?.name || 'Room'} session`}
          </Text>
          <Text style={[styles.headerSub, netNote && { color: T.warn }]}>
            {direct ? `${wantVideo ? 'Video' : 'Voice'} call · ${status}` : `${tiles.length} here · ${status}`}
          </Text>
        </View>
        {!direct && (
          <TouchableOpacity style={styles.peopleBtn} onPress={() => setPeopleOpen(true)} hitSlop={HIT_SLOP} accessibilityLabel="People in this session">
            <Users size={rs(16)} color={T.text} />
            <Text style={styles.peopleText}>{Math.max(people.length, tiles.length)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {showStage ? (
        <View style={styles.stage}>
          <View style={styles.stageAvaWrap}>
            {phase === 'ringing' && (
              <Animated.View
                pointerEvents="none"
                style={[styles.ring, {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                }]}
              />
            )}
            <Avatar name={other?.name} url={other?.avatar_url} size={rs(124)} />
          </View>
          <Text style={styles.stageName} numberOfLines={1}>{other?.name || 'Anonymous'}</Text>
          <Text style={styles.stageStatus}>{phase === 'ringing' ? `Calling… they'll see it's you` : status}</Text>
          {/* My own camera, small, while waiting or when only I have video on. */}
          {!camOff && RtcView ? (
            <View style={styles.selfPip}><RtcView style={StyleSheet.absoluteFill} canvas={{ uid: 0, renderMode: 1 }} /></View>
          ) : null}
        </View>
      ) : (
        <View style={styles.grid}>
          {tiles.map((t) => (
            <VideoTile
              key={t.key}
              uid={t.uid}
              person={t.isLocal ? null : personForUid(t.uid)}
              isLocal={t.isLocal}
              muted={t.isLocal ? micMuted : !!remoteMuted[t.uid]}
              camOff={t.isLocal ? camOff : !!remoteCamOff[t.uid]}
              RtcView={RtcView}
              size={tileSize}
            />
          ))}
        </View>
      )}

      {!joined && phase !== 'ringing' && (
        <View style={styles.connectingOverlay} pointerEvents="none">
          <ActivityIndicator color={T.primary} size="large" />
        </View>
      )}

      <View style={styles.controls}>
        <CtrlBtn on={micMuted} onPress={toggleMic} label={micMuted ? 'Unmute' : 'Mute'}
          icon={micMuted ? <MicOff size={rs(20)} color="#fff" /> : <Mic size={rs(20)} color={T.text} strokeWidth={2} />} />
        <CtrlBtn on={camOff} onPress={toggleCam} label={camOff ? 'Camera on' : 'Camera off'}
          icon={camOff ? <VideoOff size={rs(20)} color="#fff" /> : <Video size={rs(20)} color={T.text} strokeWidth={2} />} />
        <TouchableOpacity style={styles.endBtn} onPress={() => finish()} hitSlop={HIT_SLOP} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={!direct && isHost ? 'End session for everyone' : 'End call'}>
          <PhoneOff size={rs(24)} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <CtrlBtn on={!speaker} onPress={toggleSpeaker} label={speaker ? 'Speaker on' : 'Speaker off'}
          icon={speaker ? <Volume2 size={rs(20)} color={T.text} strokeWidth={2} /> : <VolumeX size={rs(20)} color="#fff" />} />
        <CtrlBtn disabled={camOff} onPress={switchCamera} label="Flip camera"
          icon={<RefreshCw size={rs(20)} color={camOff ? T.textMute : T.text} strokeWidth={2} />} />
      </View>

      <Text style={styles.hostNote}>
        {direct ? 'Hanging up ends the call. Your conversation stays open.'
          : isHost ? 'Ending closes the session for everyone. Nobody leaves your Room.'
            : 'Leaving the session keeps you in the Room.'}
      </Text>

      <Modal visible={peopleOpen} transparent animationType="slide" onRequestClose={() => setPeopleOpen(false)}>
        <View style={styles.sheetBack}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setPeopleOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>In this session</Text>
              <TouchableOpacity onPress={() => setPeopleOpen(false)} hitSlop={HIT_SLOP} accessibilityLabel="Close"><X size={rs(18)} color={T.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: rp(10), paddingBottom: rp(10) }}>
              {people.map((x) => (
                <View key={x.user_id} style={styles.personRow}>
                  <Avatar name={x.name} url={x.avatar_url} size={rs(40)} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName} numberOfLines={1}>{x.name}{x.is_host ? ' · host' : ''}</Text>
                    <Text style={styles.personSub}>{x.uid && remoteMuted[x.uid] ? 'Muted' : 'Connected'}</Text>
                  </View>
                  {isHost && !x.is_host ? (
                    <>
                      <TouchableOpacity style={styles.smallBtn} onPress={() => hostAction(x, 'mute')} accessibilityLabel={`Mute ${x.name}`}>
                        <MicOff size={rs(14)} color={T.text} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallBtn} onPress={() => hostAction(x, 'remove')} accessibilityLabel={`Remove ${x.name} from the session`}>
                        <UserMinus size={rs(14)} color={T.danger} />
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              ))}
              {people.length === 0 ? <Text style={styles.personSub}>Waiting for people to join…</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CtrlBtn({ on, onPress, icon, label, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.ctrlBtn, on && styles.ctrlBtnActive, disabled && { opacity: 0.4 }]}
      onPress={onPress} disabled={disabled} hitSlop={HIT_SLOP} activeOpacity={0.8}
      accessibilityRole="button" accessibilityLabel={label}
    >
      {icon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },

  header: { flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingHorizontal: SPACING.md, paddingVertical: rp(10) },
  headerTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(17), color: T.text },
  headerSub:   { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary, marginTop: rp(2) },
  peopleBtn: { flexDirection: 'row', alignItems: 'center', gap: rp(6), height: rs(34), paddingHorizontal: rp(12), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: T.borderStrong },
  peopleText: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: T.text },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: rp(12), paddingHorizontal: SPACING.lg },
  stageAvaWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: rp(8) },
  ring: { position: 'absolute', width: rs(124), height: rs(124), borderRadius: rs(62), borderWidth: 2, borderColor: T.primary },
  stageName: { fontFamily: 'DMSans-Bold', fontSize: rf(24), color: T.text },
  stageStatus: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.textSecondary },
  selfPip: { position: 'absolute', right: SPACING.md, top: rp(8), width: rs(96), height: rs(132), borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surface },

  ava: { backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: T.primaryBorder },
  avaInitial: { fontFamily: 'DMSans-Bold', color: T.primary },

  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', alignItems: 'flex-start' },
  tile: { aspectRatio: 3 / 4, borderWidth: 1, borderColor: T.border, overflow: 'hidden', position: 'relative' },
  tileFallback: { backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  tileLabelWrap: {
    position: 'absolute', bottom: rp(6), left: rp(8), flexDirection: 'row', alignItems: 'center', gap: rp(5),
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: RADIUS.sm, paddingHorizontal: rp(7), paddingVertical: rp(3),
  },
  tileLabel: { fontSize: rf(11), color: '#fff', fontWeight: '600', maxWidth: rs(110) },

  connectingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(36,25,32,0.5)' },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(14), paddingTop: rp(16), paddingBottom: rp(8) },
  ctrlBtn: { width: rs(50), height: rs(50), borderRadius: rs(25), backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  ctrlBtnActive: { backgroundColor: 'rgba(255,99,74,0.3)', borderColor: T.primary },
  endBtn: {
    width: rs(62), height: rs(62), borderRadius: rs(31), backgroundColor: T.danger, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.danger, shadowOffset: { width: 0, height: rs(6) }, shadowOpacity: 0.5, shadowRadius: rs(12), elevation: 8,
  },
  hostNote: { fontSize: rf(11), color: T.textSecondary, textAlign: 'center', paddingHorizontal: SPACING.lg, paddingBottom: rp(10) },

  sheetBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '70%', backgroundColor: T.surface, borderTopLeftRadius: rs(22), borderTopRightRadius: rs(22), padding: SPACING.md, borderWidth: 1, borderColor: T.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rp(12) },
  sheetTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(16), color: T.text },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: rp(12) },
  personName: { fontFamily: 'DMSans-SemiBold', fontSize: rf(15), color: T.text },
  personSub: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary },
  smallBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: T.border },
});
