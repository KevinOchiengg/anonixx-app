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
  ActivityIndicator, Animated, AppState, Image, Modal, Platform, PermissionsAndroid, Pressable, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bluetooth, EllipsisVertical, Headphones, Mic, MicOff, Minimize2, Phone, PhoneOff, PictureInPicture2, RefreshCw, Smartphone, Smile, Sparkles,
  Users, Video, VideoOff, Volume2, VolumeX, Wifi, WifiOff, X, UserMinus,
} from 'lucide-react-native';
import { useIsFocused } from '@react-navigation/native';
import DraggablePip from '../../components/calls/DraggablePip';
import { ReactionLayer, ReactionPicker } from '../../components/calls/CallReactions';
import { activeCall } from '../../utils/activeCall';
import { nativeCalls } from '../../native/calls';
import { rs, rf, rp, SPACING, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { callsApi, callParams } from '../../services/calls';
import { playEndTone, startCallSound, stopCallSound } from '../../utils/callSounds';
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

const VideoTile = React.memo(({ uid, person, isLocal, muted, camOff, RtcView, size, style, overlay, small }) => (
  <View style={[styles.tile, size ? { width: size, height: size } : null, style]}>
    {RtcView && !camOff ? (
      <RtcView
        style={StyleSheet.absoluteFill}
        canvas={{ uid: isLocal ? 0 : uid, renderMode: 1 }}
        zOrderMediaOverlay={!!overlay}
      />
    ) : (
      <View style={[StyleSheet.absoluteFill, styles.tileFallback]}>
        <Avatar name={person?.name} url={person?.avatar_url} size={small ? rs(36) : rs(64)} />
        {!small && !isLocal ? <Text style={styles.camOffText}>Camera off</Text> : null}
      </View>
    )}
    {small ? null : (
      <View style={styles.tileLabelWrap}>
        <Text style={styles.tileLabel} numberOfLines={1}>{isLocal ? 'You' : person?.name || 'Guest'}</Text>
        {muted && <MicOff size={rs(11)} color="#fff" />}
      </View>
    )}
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
  const [delivered, setDelivered]   = useState(p.reachable !== false);
  const [outcome, setOutcome]       = useState(null);   // { title, sub } once an unanswered call ends
  const [redialing, setRedialing]   = useState(false);
  const [weak, setWeak]             = useState({ me: false, them: false });
  const [area, setArea]             = useState(null);
  const [asking, setAsking]         = useState(false);   // I asked to switch to video
  const [videoAsk, setVideoAsk]     = useState(null);    // they asked: { name }
  const [reactOpen, setReactOpen]   = useState(false);
  const [floaters, setFloaters]     = useState([]);
  const [audioRoute, setAudioRoute] = useState(wantVideo ? 'speaker' : 'earpiece');
  const [devices, setDevices]       = useState({ bluetooth: false, wired: false });
  const [routeOpen, setRouteOpen]   = useState(false);
  const [moreOpen, setMoreOpen]     = useState(false);
  const [inPip, setInPip]           = useState(false);
  const [blur, setBlur]             = useState(false);
  const isFocused = useIsFocused();
  const liveSince = useRef(null);
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
  const [focusKey, setFocusKey]     = useState(null);
  const [chrome, setChrome]         = useState(true);

  const engineRef  = useRef(null);
  const reconnectTimer = useRef(null);
  const dropTimer      = useRef(null);
  const RtcViewRef = useRef(null);
  const endedRef   = useRef(false);
  const pulse      = useRef(new Animated.Value(0)).current;

  // The timer runs from when the other side is actually there.
  const live = joined && (direct ? remoteUids.length > 0 : true);
  const elapsed = useCallTimer(live);
  useEffect(() => { if (live) setPhase('live'); }, [live]);

  // Lets the "Tap to return to call" bar show while you're elsewhere in the app.
  useEffect(() => {
    if (outcome) { activeCall.clear(callId); return; }
    if (phase === 'live' && !liveSince.current) liveSince.current = Date.now();
    activeCall.set({ callId, name: other?.name, video: !camOff, startedAt: liveSince.current });
  }, [phase, outcome, camOff, callId, other?.name]);
  useEffect(() => () => activeCall.clear(callId), [callId]);

  const addFloater = useCallback((emoji) => {
    const id = `${Date.now()}-${Math.random()}`;
    setFloaters((list) => [...list.slice(-12), { id, emoji, left: rs(40) + Math.random() * rs(240) }]);
  }, []);
  const dropFloater = useCallback((id) => setFloaters((list) => list.filter((f) => f.id !== id)), []);

  const cleanupEngine = useCallback(() => {
    try {
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
    } catch { /* silent */ }
    engineRef.current = null;
  }, []);

  const leaveScreen = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [navigation]);

  // notify: tell the server (end for host/direct, leave for guests). message: toast to show.
  // outcome: an unanswered call stays on screen with "Call again", like a phone.
  const finish = useCallback(async ({ notify = true, message, outcome: result } = {}) => {
    if (endedRef.current) return;
    endedRef.current = true;
    activeCall.clear(callId);
    nativeCalls.setProximity(false);
    nativeCalls.setAutoPip(false);
    nativeCalls.releaseLockScreen();
    clearTimeout(reconnectTimer.current);
    clearTimeout(dropTimer.current);
    stopCallSound();
    playEndTone();
    cleanupEngine();
    if (notify && callId) {
      (direct || isHost ? callsApi.end(callId) : callsApi.leave(callId)).catch(() => {});
    }
    if (result) {
      setOutcome(result);
      return;
    }
    if (message) showToast({ type: 'info', message });
    leaveScreen();
  }, [callId, direct, isHost, cleanupEngine, leaveScreen, showToast]);

  const redial = useCallback(async () => {
    if (!p.connectionId || redialing) return;
    setRedialing(true);
    try {
      const d = await callsApi.direct(p.connectionId, wantVideo);
      navigation.replace('DropCall', callParams(d, { other: { ...(other || {}), ...(d.other || {}) } }));
    } catch (e) {
      setRedialing(false);
      showToast({ type: 'info', message: e.message || 'Could not call. Try again.' });
    }
  }, [p.connectionId, redialing, wantVideo, navigation, other, showToast]);

  // Hardware back = hang up, so nobody stays connected by accident.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.isFocused()) return false;
      if (outcome) leaveScreen();
      else finish();
      return true;
    });
    return () => sub.remove();
  }, [finish, outcome, leaveScreen, navigation]);

  // Ringing: a soft pulse, and give up after the ring window (the server marks it missed too).
  useEffect(() => {
    if (phase !== 'ringing') return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    if (direct && delivered) startCallSound('ringback');
    const t = setTimeout(() => finish({ outcome: { title: 'No answer', sub: delivered ? 'They didn’t pick up.' : 'They’re offline. They’ll see you called.' } }), ((p.ringSeconds || 45) + 3) * 1000);
    return () => { loop.stop(); clearTimeout(t); stopCallSound(); };
  }, [phase, pulse, finish, p.ringSeconds, direct, delivered]);

  // Server events for this call.
  useEffect(() => {
    const mine = (fn) => (e) => { if (e?.call_id === callId) fn(e); };
    const handlers = {
      call_ringing: mine(() => setDelivered(true)),
      call_video_request: mine((e) => setVideoAsk({ name: e.from_name })),
      call_video_reply: mine((e) => {
        setAsking(false);
        if (!e.accept) {
          engineRef.current?.muteLocalVideoStream(true);
          setCamOff(true);
          showToast({ type: 'info', message: `${other?.name || 'They'} would rather stay on voice.` });
        }
      }),
      call_reaction: mine((e) => addFloater(e.emoji)),
      call_accepted: mine(() => setPhase('connecting')),
      call_declined: mine(() => finish({ notify: false, outcome: { title: 'Can’t talk right now', sub: 'They declined. Try again later or send a message.' } })),
      call_missed: mine(() => finish({ notify: false, outcome: { title: 'No answer', sub: 'They didn’t pick up.' } })),
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
          showToast({ type: 'warning', title: 'Microphone blocked', message: 'Allow the microphone in Settings to call.' });
          finish();
          return;
        }
        if (wantVideo && granted[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED) {
          camAllowed = false;
          setCamOff(true);
          showToast({ type: 'info', message: 'Camera blocked. Voice only.' });
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
        // Weak network: drop their video and keep the voice going, like a phone call.
        try { engine.setRemoteSubscribeFallbackOption(2); } catch { /* older SDK */ }
        if (camAllowed) engine.startPreview();
        engine.muteLocalVideoStream(!camAllowed);

        engine.addListener('onUserJoined', (_c, u) => {
          clearTimeout(dropTimer.current);
          setNetNote('');
          setRemoteUids((prev) => (prev.includes(u) ? prev : [...prev, u]));
          loadPeople();
        });
        // reason 1 = their connection dropped: wait for them to come back before ending.
        engine.addListener('onUserOffline', (_c, u, reason) => {
          setRemoteUids((prev) => {
            const next = prev.filter((x) => x !== u);
            if (direct && next.length === 0) {
              if (reason === 1) {
                setNetNote('Their connection dropped. Reconnecting…');
                clearTimeout(dropTimer.current);
                dropTimer.current = setTimeout(() => finish({ message: 'Lost them. The call ended.' }), 25000);
              } else {
                setTimeout(() => finish({ message: 'The call ended.' }), 0);
              }
            }
            return next;
          });
        });
        // Quality 4+ is poor (Agora QualityType); uid 0 is me.
        engine.addListener('onNetworkQuality', (_c, u, tx, rx) => {
          const bad = Math.max(tx || 0, rx || 0) >= 4;
          setWeak((prev) => {
            const key = u === 0 ? 'me' : 'them';
            return prev[key] === bad ? prev : { ...prev, [key]: bad };
          });
        });
        engine.addListener('onUserMuteVideo', (_c, u, m) => setRemoteCamOff((prev) => ({ ...prev, [u]: m })));
        // Agora AudioRoute: 1 earpiece, 3/4 speaker, 5/10 Bluetooth, 0/2/6 wired or USB.
        engine.addListener('onAudioRoutingChanged', (routing) => {
          const r = [3, 4].includes(routing) ? 'speaker'
            : [5, 10].includes(routing) ? 'bluetooth'
              : [0, 2, 6].includes(routing) ? 'wired' : 'earpiece';
          setAudioRoute(r);
          setSpeaker(r === 'speaker');
          setDevices(nativeCalls.audioDevices());
        });
        engine.addListener('onUserMuteAudio', (_c, u, m) => setRemoteMuted((prev) => ({ ...prev, [u]: m })));
        // 4 reconnecting, 5 failed (Agora ConnectionStateType).
        engine.addListener('onConnectionStateChanged', (_c, state) => {
          if (state === 4) {
            setNetNote('Reconnecting…');
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = setTimeout(() => finish({ message: 'Couldn’t reconnect. The call ended.' }), 30000);
          } else if (state === 5) {
            finish({ notify: false, message: 'Lost the connection. The call ended.' });
          } else if (state === 3) {
            clearTimeout(reconnectTimer.current);
            setNetNote('');
          }
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

  const toggleCam = useCallback(async ({ ask = true } = {}) => {
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
    // A voice call: turning the camera on asks them to switch to video, like WhatsApp.
    const theyHaveVideo = remoteUids.some((u) => !remoteCamOff[u]);
    if (!next && ask && direct && phase === 'live' && !theyHaveVideo) {
      setAsking(true);
      engineRef.current?.setEnableSpeakerphone(true);
      setSpeaker(true);
      callsApi.askVideo(callId).catch(() => setAsking(false));
    }
    if (next) setAsking(false);
  }, [camOff, showToast, remoteUids, remoteCamOff, direct, phase, callId]);

  const answerVideo = useCallback(async (accept) => {
    setVideoAsk(null);
    callsApi.replyVideo(callId, accept).catch(() => {});
    if (!accept) return;
    engineRef.current?.setEnableSpeakerphone(true);
    setSpeaker(true);
    if (camOff) await toggleCam({ ask: false });
  }, [callId, camOff, toggleCam]);

  const sendReaction = useCallback((emoji) => {
    setReactOpen(false);
    addFloater(emoji);
    callsApi.react(callId, emoji).catch(() => {});
  }, [callId, addFloater]);

  const minimise = useCallback(() => {
    if (p.connectionId) navigation.push('DropChat', { connectionId: p.connectionId });
  }, [navigation, p.connectionId]);

  const chooseRoute = useCallback((r) => {
    const engine = engineRef.current;
    setRouteOpen(false);
    if (!engine) return;
    engine.setEnableSpeakerphone(r === 'speaker');
    if (Platform.OS === 'android' && r !== 'speaker') {
      try { engine.setRouteInCommunicationMode(r === 'bluetooth' ? 5 : r === 'wired' ? 0 : 1); } catch { /* older SDK */ }
    }
    setAudioRoute(r);
    setSpeaker(r === 'speaker');
  }, []);

  // With a headset or Bluetooth connected, the speaker button picks where the sound goes.
  const toggleSpeaker = useCallback(() => {
    const d = nativeCalls.audioDevices();
    setDevices(d);
    if (d.bluetooth || d.wired) { setRouteOpen((v) => !v); return; }
    chooseRoute(speaker ? 'earpiece' : 'speaker');
  }, [speaker, chooseRoute]);

  useEffect(() => {
    setDevices(nativeCalls.audioDevices());
    const t = setInterval(() => setDevices(nativeCalls.audioDevices()), 5000);
    return () => clearInterval(t);
  }, []);

  // Voice on the earpiece: the screen goes dark at your ear so your cheek can't tap anything.
  const atEar = direct && camOff && audioRoute === 'earpiece' && !outcome && phase !== 'ended';
  useEffect(() => {
    nativeCalls.setProximity(atEar);
    return () => nativeCalls.setProximity(false);
  }, [atEar]);

  // A live video call goes picture-in-picture when you leave the app, like WhatsApp.
  const hasVideo = !camOff || remoteUids.some((u) => !remoteCamOff[u]);
  const canPip = nativeCalls.available && Platform.OS === 'android' && phase === 'live' && hasVideo && !outcome;
  useEffect(() => {
    nativeCalls.setAutoPip(canPip);
    return () => nativeCalls.setAutoPip(false);
  }, [canPip]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', () => setInPip(nativeCalls.isInPip()));
    return () => sub.remove();
  }, []);

  const toggleBlur = useCallback(() => {
    const engine = engineRef.current;
    setMoreOpen(false);
    if (!engine) return;
    const next = !blur;
    try {
      if (next && !engine.isFeatureAvailableOnDevice(1)) {
        showToast({ type: 'info', message: 'This phone can’t blur the background.' });
        return;
      }
      const res = engine.enableVirtualBackground(next, { background_source_type: 3, blur_degree: 3 }, { modelType: 1, greenCapacity: 0.5 });
      if (res < 0) throw new Error('blur');
      setBlur(next);
    } catch {
      showToast({ type: 'info', message: 'Couldn’t blur the background on this phone.' });
    }
  }, [blur, showToast]);

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
        showToast({ type: 'info', message: `${person.name} left the session. Still in your Room.` });
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

  // Off screen (minimised), video views are dropped so they can't draw over other screens.
  const RtcView = isFocused ? RtcViewRef.current : null;
  const anyVideo = !camOff || remoteUids.some((u) => !remoteCamOff[u]);
  const showStage = direct && (phase === 'ringing' || !anyVideo || remoteUids.length === 0);
  const cols = columnsFor(tiles.length);
  const tileSize = `${100 / cols}%`;

  // 1-to-1: the other person fills the screen and you sit in the corner; tap the corner to swap.
  // Group: tap anyone to make them full screen, tap again to go back to the grid.
  const firstRemote = remoteUids.length ? String(remoteUids[0]) : null;
  const mainKey = tiles.some((t) => t.key === focusKey) ? focusKey : direct ? firstRemote : null;
  const mainTile = mainKey ? tiles.find((t) => t.key === mainKey) : null;
  const sideTiles = mainTile ? tiles.filter((t) => t.key !== mainKey) : [];
  const showChrome = chrome || !mainTile || showStage;
  const tileProps = (t) => ({
    uid: t.uid,
    person: t.isLocal ? null : personForUid(t.uid),
    isLocal: t.isLocal,
    muted: t.isLocal ? micMuted : !!remoteMuted[t.uid],
    camOff: t.isLocal ? camOff : !!remoteCamOff[t.uid],
    RtcView,
  });
  const onMainPress = () => {
    if (direct) setChrome((v) => !v);
    else setFocusKey(null);
  };

  const ringLabel = delivered ? 'Ringing…' : 'Calling…';
  const status = phase === 'ringing' ? ringLabel
    : !live ? (direct ? 'Connecting…' : 'Opening the session…')
      : netNote || elapsed;

  // Picture-in-picture: just the video, no buttons.
  if (inPip) {
    return (
      <View style={styles.pipOnly}>
        {mainTile ? (
          <VideoTile {...tileProps(mainTile)} style={styles.mainTile} small />
        ) : (
          <View style={styles.pipAva}><Avatar name={other?.name} url={other?.avatar_url} size={rs(64)} /></View>
        )}
      </View>
    );
  }

  if (outcome) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <LinearGradient colors={[T.primaryGlow, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }} pointerEvents="none" />
        <View style={styles.stage}>
          <Avatar name={other?.name} url={other?.avatar_url} size={rs(124)} />
          <Text style={styles.stageName} numberOfLines={1}>{other?.name || 'Anonymous'}</Text>
          <Text style={styles.outcomeTitle}>{outcome.title}</Text>
          {outcome.sub ? <Text style={styles.stageStatus}>{outcome.sub}</Text> : null}
        </View>
        <View style={styles.outcomeActs}>
          <View style={styles.outcomeAct}>
            <TouchableOpacity style={styles.outcomeClose} onPress={leaveScreen} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Close">
              <X size={rs(24)} color={T.text} />
            </TouchableOpacity>
            <Text style={styles.outcomeLabel}>Close</Text>
          </View>
          {p.connectionId ? (
            <View style={styles.outcomeAct}>
              <TouchableOpacity style={styles.outcomeCall} onPress={redial} disabled={redialing} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Call again">
                {redialing ? <ActivityIndicator color="#fff" /> : wantVideo ? <Video size={rs(24)} color="#fff" /> : <Phone size={rs(24)} color="#fff" />}
              </TouchableOpacity>
              <Text style={styles.outcomeLabel}>Call again</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const weakNote = phase === 'live' && !netNote
    ? weak.me ? 'Your connection is weak' : weak.them ? `${other?.name || 'Their'}${other?.name ? '’s' : ''} connection is weak` : ''
    : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient colors={[T.primaryGlow, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }} pointerEvents="none" />
      {netNote || weakNote ? (
        <View style={styles.netBanner} pointerEvents="none">
          {netNote ? <WifiOff size={rs(14)} color="#fff" /> : <Wifi size={rs(14)} color="#fff" />}
          <Text style={styles.netBannerText}>{netNote || weakNote}</Text>
        </View>
      ) : null}

      {showChrome ? (
      <View style={styles.header}>
        {direct && p.connectionId && phase !== 'ringing' ? (
          <TouchableOpacity style={styles.minBtn} onPress={minimise} hitSlop={HIT_SLOP} accessibilityLabel="Minimise call and open the chat">
            <Minimize2 size={rs(18)} color={T.text} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {direct ? other?.name || 'Anonymous' : isHost ? 'Your session' : `${other?.name || 'Room'} session`}
          </Text>
          <Text style={[styles.headerSub, netNote && { color: T.warn }]}>
            {direct ? `${wantVideo ? 'Video' : 'Voice'} call · ${status}` : `${tiles.length} here · ${status}`}
          </Text>
        </View>
        {direct && phase === 'live' ? (
          <TouchableOpacity style={[styles.minBtn, styles.reactBtn, reactOpen && styles.reactBtnOn]} onPress={() => setReactOpen((v) => !v)} hitSlop={HIT_SLOP} accessibilityLabel="Send a reaction">
            <Smile size={rs(18)} color={reactOpen ? '#fff' : T.text} />
          </TouchableOpacity>
        ) : null}
        {phase !== 'ringing' && (canPip || !camOff) ? (
          <TouchableOpacity style={[styles.minBtn, styles.reactBtn, moreOpen && styles.reactBtnOn]} onPress={() => setMoreOpen((v) => !v)} hitSlop={HIT_SLOP} accessibilityLabel="More call options">
            <EllipsisVertical size={rs(18)} color={moreOpen ? '#fff' : T.text} />
          </TouchableOpacity>
        ) : null}
        {!direct && (
          <TouchableOpacity style={styles.peopleBtn} onPress={() => setPeopleOpen(true)} hitSlop={HIT_SLOP} accessibilityLabel="People in this session">
            <Users size={rs(16)} color={T.text} />
            <Text style={styles.peopleText}>{Math.max(people.length, tiles.length)}</Text>
          </TouchableOpacity>
        )}
      </View>
      ) : null}

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
          <Text style={styles.stageStatus}>{phase === 'ringing' ? ringLabel : status}</Text>
          {phase === 'ringing' && !delivered ? <Text style={styles.stageHint}>They’re offline. They’ll get a notification.</Text> : null}
          {phase === 'live' && remoteUids.some((u) => remoteMuted[u]) ? (
            <View style={styles.mutedPill}><MicOff size={rs(13)} color="#fff" /><Text style={styles.mutedPillText}>{other?.name || 'They'} muted</Text></View>
          ) : null}
          {/* My own camera, small, while waiting or when only I have video on. */}
          {!camOff && RtcView ? (
            <View style={styles.selfPip}><RtcView style={StyleSheet.absoluteFill} canvas={{ uid: 0, renderMode: 1 }} /></View>
          ) : null}
        </View>
      ) : mainTile ? (
        <View style={styles.focusWrap} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onMainPress} accessibilityLabel={direct ? 'Show or hide controls' : 'Back to everyone'}>
            <VideoTile key={`main-${mainTile.key}`} {...tileProps(mainTile)} style={styles.mainTile} />
          </Pressable>
          {direct ? (
            sideTiles[0] ? (
              <DraggablePip area={area} width={rs(104)} height={rs(148)} onTap={() => setFocusKey(sideTiles[0].key)} style={styles.pip}>
                <VideoTile key={`pip-${sideTiles[0].key}`} {...tileProps(sideTiles[0])} style={styles.pipTile} overlay small />
              </DraggablePip>
            ) : null
          ) : (
            <ScrollView horizontal style={styles.strip} contentContainerStyle={styles.stripIn} showsHorizontalScrollIndicator={false}>
              {sideTiles.map((t) => (
                <Pressable key={t.key} onPress={() => setFocusKey(t.key)} accessibilityLabel="Show full screen">
                  <VideoTile key={`strip-${t.key}`} {...tileProps(t)} style={styles.stripTile} overlay small />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <View style={styles.grid}>
          {tiles.map((t) => (
            <Pressable key={t.key} style={{ width: tileSize }} onPress={() => setFocusKey(t.key)} accessibilityLabel="Show full screen">
              <VideoTile {...tileProps(t)} style={styles.gridTile} />
            </Pressable>
          ))}
        </View>
      )}

      <ReactionLayer items={floaters} onDone={dropFloater} />

      {asking ? (
        <View style={styles.askPill} pointerEvents="none">
          <Video size={rs(14)} color="#fff" />
          <Text style={styles.askPillText}>Asking {other?.name || 'them'} to switch to video…</Text>
        </View>
      ) : null}

      {videoAsk ? (
        <View style={styles.askCard}>
          <Text style={styles.askTitle}>{videoAsk.name || other?.name || 'They'} wants to switch to video</Text>
          <View style={styles.askActs}>
            <TouchableOpacity style={styles.askNo} onPress={() => answerVideo(false)} accessibilityRole="button">
              <Text style={styles.askNoText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.askYes} onPress={() => answerVideo(true)} accessibilityRole="button">
              <Video size={rs(16)} color="#fff" />
              <Text style={styles.askYesText}>Switch</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!joined && phase !== 'ringing' && (
        <View style={styles.connectingOverlay} pointerEvents="none">
          <ActivityIndicator color={T.primary} size="large" />
        </View>
      )}

      {showChrome && reactOpen ? <ReactionPicker onPick={sendReaction} /> : null}

      {showChrome && moreOpen ? (
        <View style={styles.menu}>
          {canPip ? (
            <TouchableOpacity style={styles.menuRow} onPress={() => { setMoreOpen(false); nativeCalls.enterPip(); }} accessibilityRole="button">
              <PictureInPicture2 size={rs(18)} color={T.text} />
              <Text style={styles.menuText}>Picture in picture</Text>
            </TouchableOpacity>
          ) : null}
          {!camOff ? (
            <TouchableOpacity style={styles.menuRow} onPress={toggleBlur} accessibilityRole="button">
              <Sparkles size={rs(18)} color={blur ? T.primary : T.text} />
              <Text style={styles.menuText}>{blur ? 'Stop blurring background' : 'Blur background'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {showChrome && routeOpen ? (
        <View style={styles.menu}>
          {[
            !devices.wired && { key: 'earpiece', label: 'Phone', Icon: Smartphone },
            { key: 'speaker', label: 'Speaker', Icon: Volume2 },
            devices.bluetooth && { key: 'bluetooth', label: 'Bluetooth', Icon: Bluetooth },
            devices.wired && { key: 'wired', label: 'Headphones', Icon: Headphones },
          ].filter(Boolean).map(({ key, label, Icon }) => (
            <TouchableOpacity key={key} style={styles.menuRow} onPress={() => chooseRoute(key)} accessibilityRole="button" accessibilityState={{ selected: audioRoute === key }}>
              <Icon size={rs(18)} color={audioRoute === key ? T.primary : T.text} />
              <Text style={[styles.menuText, audioRoute === key && { color: T.primary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {showChrome ? (
      <View style={styles.controls}>
        <CtrlBtn on={micMuted} onPress={toggleMic} label={micMuted ? 'Unmute' : 'Mute'}
          icon={micMuted ? <MicOff size={rs(20)} color="#fff" /> : <Mic size={rs(20)} color={T.text} strokeWidth={2} />} />
        <CtrlBtn on={camOff} onPress={toggleCam} label={camOff ? 'Camera on' : 'Camera off'}
          icon={camOff ? <VideoOff size={rs(20)} color="#fff" /> : <Video size={rs(20)} color={T.text} strokeWidth={2} />} />
        <TouchableOpacity style={styles.endBtn} onPress={() => finish()} hitSlop={HIT_SLOP} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={!direct && isHost ? 'End session for everyone' : 'End call'}>
          <PhoneOff size={rs(24)} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <CtrlBtn on={audioRoute === 'earpiece'} onPress={toggleSpeaker}
          label={audioRoute === 'bluetooth' ? 'Bluetooth' : audioRoute === 'wired' ? 'Headphones' : speaker ? 'Speaker on' : 'Speaker off'}
          icon={audioRoute === 'bluetooth' ? <Bluetooth size={rs(20)} color={T.text} strokeWidth={2} />
            : audioRoute === 'wired' ? <Headphones size={rs(20)} color={T.text} strokeWidth={2} />
              : speaker ? <Volume2 size={rs(20)} color={T.text} strokeWidth={2} /> : <VolumeX size={rs(20)} color="#fff" />} />
        <CtrlBtn disabled={camOff} onPress={switchCamera} label="Flip camera"
          icon={<RefreshCw size={rs(20)} color={camOff ? T.textMute : T.text} strokeWidth={2} />} />
      </View>

      ) : null}

      {showChrome ? (
      <Text style={styles.hostNote}>
        {direct ? 'Ends the call. The chat stays open.'
          : isHost ? 'Ends it for everyone. Nobody leaves your Room.'
            : 'Leaving the session keeps you in the Room.'}
      </Text>
      ) : null}

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
  stageHint: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textMute, textAlign: 'center' },
  outcomeTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(18), color: T.primary, marginTop: rp(6) },
  outcomeActs: { flexDirection: 'row', justifyContent: 'space-evenly', paddingBottom: rp(40) },
  outcomeAct: { alignItems: 'center', gap: rp(10) },
  outcomeClose: { width: rs(66), height: rs(66), borderRadius: rs(33), alignItems: 'center', justifyContent: 'center', backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border },
  outcomeCall: { width: rs(66), height: rs(66), borderRadius: rs(33), alignItems: 'center', justifyContent: 'center', backgroundColor: T.success, elevation: 6 },
  outcomeLabel: { fontFamily: 'DMSans-SemiBold', fontSize: rf(13), color: T.text },
  netBanner: {
    position: 'absolute', top: rp(64), alignSelf: 'center', zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: rp(6),
    backgroundColor: 'rgba(245,158,11,0.92)', borderRadius: 999, paddingHorizontal: rp(12), paddingVertical: rp(6),
  },
  netBannerText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(12), color: '#fff' },
  stageStatus: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.textSecondary },
  selfPip: { position: 'absolute', right: SPACING.md, top: rp(8), width: rs(96), height: rs(132), borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surface },

  ava: { backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: T.primaryBorder },
  avaInitial: { fontFamily: 'DMSans-Bold', color: T.primary },

  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', alignItems: 'flex-start' },
  tile: { aspectRatio: 3 / 4, borderWidth: 1, borderColor: T.border, overflow: 'hidden', position: 'relative' },
  gridTile: { width: '100%' },
  focusWrap: { flex: 1, position: 'relative', backgroundColor: '#000' },
  mainTile: { width: '100%', height: '100%', aspectRatio: undefined, borderWidth: 0 },
  pip: {
    borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: T.surface, elevation: 8,
  },
  minBtn: {
    width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', marginRight: rp(10),
  },
  reactBtn: { marginRight: 0, marginLeft: rp(10) },
  reactBtnOn: { backgroundColor: T.primary },
  pipOnly: { flex: 1, backgroundColor: '#000' },
  pipAva: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  menu: {
    alignSelf: 'center', minWidth: rs(220), marginBottom: rp(6), paddingVertical: rp(6),
    borderRadius: RADIUS.lg, backgroundColor: 'rgba(17,19,24,0.96)', borderWidth: 1, borderColor: T.border,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: rp(12), paddingHorizontal: rp(16), paddingVertical: rp(12) },
  menuText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text },
  camOffText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(12), color: T.textSecondary, marginTop: rp(8) },
  mutedPill: {
    flexDirection: 'row', alignItems: 'center', gap: rp(6), marginTop: rp(6),
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: rp(10), paddingVertical: rp(4),
  },
  mutedPillText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(12), color: '#fff' },
  askPill: {
    position: 'absolute', top: rp(100), alignSelf: 'center', zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: rp(6),
    backgroundColor: 'rgba(17,19,24,0.9)', borderRadius: 999, paddingHorizontal: rp(12), paddingVertical: rp(7),
  },
  askPillText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(12), color: '#fff' },
  askCard: {
    position: 'absolute', left: SPACING.lg, right: SPACING.lg, bottom: rp(150), zIndex: 6, gap: rp(14),
    backgroundColor: 'rgba(17,19,24,0.96)', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: T.border, padding: rp(16),
  },
  askTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.text, textAlign: 'center' },
  askActs: { flexDirection: 'row', gap: rp(10) },
  askNo: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: rp(11), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  askNoText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text },
  askYes: { flex: 1, flexDirection: 'row', gap: rp(6), alignItems: 'center', justifyContent: 'center', paddingVertical: rp(11), borderRadius: 999, backgroundColor: T.success },
  askYesText: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: '#fff' },
  pipTile: { width: '100%', height: '100%', aspectRatio: undefined, borderWidth: 0 },
  strip: { position: 'absolute', left: 0, right: 0, bottom: rp(10), flexGrow: 0 },
  stripIn: { paddingHorizontal: SPACING.md, gap: rp(8) },
  stripTile: { width: rs(84), height: rs(112), aspectRatio: undefined, borderRadius: RADIUS.md, borderColor: 'rgba(255,255,255,0.35)' },
  tileFallback: { backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  tileLabelWrap: {
    position: 'absolute', bottom: rp(6), left: rp(8), flexDirection: 'row', alignItems: 'center', gap: rp(5),
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: RADIUS.sm, paddingHorizontal: rp(7), paddingVertical: rp(3),
  },
  tileLabel: { fontSize: rf(11), color: '#fff', fontWeight: '600', maxWidth: rs(110) },

  connectingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,15,24,0.5)' },

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
