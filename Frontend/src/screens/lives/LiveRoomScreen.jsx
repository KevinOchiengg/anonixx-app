import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, Image, KeyboardAvoidingView, Modal, PermissionsAndroid, Platform, Pressable,
  Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import {
  Bell, BellRing, Coins, Eye, Flag, Gift as GiftIcon, Lock, Megaphone, Mic, MicOff, Send, Share2, Users, Video, VideoOff, X,
} from 'lucide-react-native';
import AuthorAvatar from '../../components/common/AuthorAvatar';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { fetchBalance } from '../../store/slices/coinsSlice';
import { confirm } from '../../utils/confirm';
import { GIFT_EMOJI, PROMO_OPTIONS, livesApi, startsLabel } from '../../utils/lives';
import { HIT_SLOP, rf, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

const HEARTBEAT_MS = 20000;
const POLL_MS = 5000;
const CHAT_KEEP = 80;

export default function LiveRoomScreen({ navigation, route }) {
  const { liveId, autoStart = false } = route.params || {};
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { socketService } = useSocket();
  const user = useSelector((st) => st.auth.user);
  const balance = useSelector((st) => st.coins.balance);

  const [detail, setDetail] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [previewEnds, setPreviewEnds] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [messages, setMessages] = useState([]);
  const [viewers, setViewers] = useState(0);
  const [gifts, setGifts] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [text, setText] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hostUid, setHostUid] = useState(null);
  const [hostVideo, setHostVideo] = useState(false);
  const [burst, setBurst] = useState(null);

  const engine = useRef(null);
  const RtcView = useRef(null);
  const lastId = useRef(undefined);
  const chatRef = useRef(null);
  const phaseRef = useRef('loading');
  const burstAnim = useRef(new Animated.Value(0)).current;
  phaseRef.current = phase;

  const flash = useCallback((message, type = 'info') => showToast({ type, message }), [showToast]);

  const showBurst = useCallback((m) => {
    setBurst(m);
    burstAnim.setValue(0);
    Animated.sequence([
      Animated.timing(burstAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(burstAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setBurst(null));
  }, [burstAnim]);

  const addMessages = useCallback((incoming) => {
    if (!incoming?.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (!fresh.length) return prev;
      lastId.current = fresh[fresh.length - 1].id;
      const gift = [...fresh].reverse().find((m) => m.kind === 'gift');
      if (gift) showBurst(gift);
      return [...prev, ...fresh].slice(-CHAT_KEEP);
    });
  }, [showBurst]);

  const leave = useCallback(() => {
    try { engine.current?.leaveChannel(); engine.current?.release(); } catch { /* already released */ }
    engine.current = null;
    setHostVideo(false);
  }, []);

  const connect = useCallback(async (stream, role) => {
    leave();
    let agora;
    try { agora = await import('react-native-agora'); } catch {
      throw new Error('Lives need the full app build. They don’t run in Expo Go.');
    }
    const { createAgoraRtcEngine, ChannelProfileType, ClientRoleType, AudienceLatencyLevelType, RtcSurfaceView } = agora;
    RtcView.current = RtcSurfaceView;

    if (role === 'host' && Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]);
      if (Object.values(granted).some((g) => g !== PermissionsAndroid.RESULTS.GRANTED)) {
        throw new Error('Allow the camera and microphone in Settings to go live.');
      }
    }

    const e = createAgoraRtcEngine();
    engine.current = e;
    e.initialize({ appId: stream.app_id });
    e.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
    e.enableVideo();
    e.enableAudio();
    e.setDefaultAudioRouteToSpeakerphone(true);
    setHostUid(stream.host_uid);

    e.addListener('onUserJoined', (_c, uid) => { if (uid === stream.host_uid) setHostVideo(true); });
    e.addListener('onUserOffline', (_c, uid) => { if (uid === stream.host_uid) setHostVideo(false); });
    e.addListener('onTokenPrivilegeWillExpire', async () => {
      if (phaseRef.current === 'preview') return;
      try { const r = await livesApi.renew(liveId); engine.current?.renewToken(r.stream.token); } catch { /* handled on expiry */ }
    });
    e.addListener('onRequestToken', () => {
      if (phaseRef.current === 'preview') { setPhase('locked'); leave(); }
    });

    if (role === 'host') {
      e.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      e.startPreview();
      setHostVideo(true);
    } else {
      e.setClientRole(ClientRoleType.ClientRoleAudience, { audienceLatencyLevel: AudienceLatencyLevelType.AudienceLatencyLevelLowLatency });
    }
    e.joinChannel(stream.token, stream.channel, stream.uid, {});
  }, [leave, liveId]);

  const startWatching = useCallback(async (reply) => {
    setPhase('connecting');
    await connect(reply.stream, 'audience');
    if (reply.member) {
      setPreviewEnds(null);
      setPhase('watching');
      addMessages((await livesApi.messages(liveId)).messages);
    } else {
      setPreviewEnds(reply.preview_ends_at ? new Date(reply.preview_ends_at).getTime() : Date.now() + 30000);
      setPhase('preview');
    }
  }, [connect, liveId, addMessages]);

  const startHosting = useCallback(async () => {
    setPhase('connecting');
    const r = await livesApi.start(liveId);
    await connect(r.stream, 'host');
    setPhase('hosting');
    addMessages((await livesApi.messages(liveId)).messages);
  }, [connect, liveId, addMessages]);

  const load = useCallback(async () => {
    try {
      const d = await livesApi.detail(liveId);
      setDetail(d);
      setViewers(d.live.viewers);
      if (d.live.status === 'ended') { setPhase('ended'); return; }
      if (d.live.status === 'scheduled' && !(autoStart && d.viewer.is_host)) { setPhase('scheduled'); return; }
      if (!user) { setPhase('locked'); return; }
      if (d.viewer.is_host) { await startHosting(); return; }
      try {
        await startWatching(await livesApi.watch(liveId));
      } catch (e) {
        if (e.code === 'preview_over') setPhase('locked');
        else throw e;
      }
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }, [liveId, autoStart, user, startHosting, startWatching]);

  useEffect(() => { load(); return leave; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { livesApi.gifts().then((r) => setGifts(r.gifts)).catch(() => {}); }, []);

  useEffect(() => {
    if (phase !== 'preview' || !previewEnds) return undefined;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= previewEnds) { setPhase('locked'); leave(); }
    }, 500);
    return () => clearInterval(t);
  }, [phase, previewEnds, leave]);

  const inRoom = phase === 'watching' || phase === 'hosting';
  const onAir = inRoom || phase === 'preview';

  useEffect(() => {
    if (!onAir) return undefined;
    const beat = () => livesApi.heartbeat(liveId).then((r) => setViewers(r.viewers)).catch(() => {});
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [onAir, liveId]);

  useEffect(() => {
    if (!inRoom) return undefined;
    const onMessage = (p) => { if (p?.live_id === liveId) addMessages([p.message]); };
    const onEnded = (p) => { if (p?.live_id === liveId) { setPhase('ended'); leave(); } };
    socketService?.on('live_message', onMessage);
    socketService?.on('live_ended', onEnded);
    const poll = setInterval(async () => {
      try {
        const r = await livesApi.messages(liveId, lastId.current);
        addMessages(r.messages);
        if (r.status === 'ended') { setPhase('ended'); leave(); }
      } catch { /* next tick */ }
    }, POLL_MS);
    return () => {
      clearInterval(poll);
      socketService?.off('live_message', onMessage);
      socketService?.off('live_ended', onEnded);
    };
  }, [inRoom, liveId, addMessages, leave, socketService]);

  const handlePaymentError = (e) => {
    if (e.code === 'coins_short') navigation.navigate('Coins');
    else flash(e.message, 'error');
  };

  const join = async () => {
    if (!detail) return;
    if (!user) { navigation.navigate('AuthNav', { screen: 'Login' }); return; }
    const { price, host } = detail.live;
    const ok = await confirm({
      title: `Join ${host.name || 'this'}'s live?`,
      message: 'You stay a member until the live ends. Chat with the host and send gifts.',
      rows: [
        { label: 'Entry', value: `${price} coins`, highlight: true },
        { label: 'Your balance', value: `${balance ?? 0} coins` },
      ],
      confirmLabel: `Pay ${price} coins`,
    });
    if (!ok) return;
    try {
      const reply = await livesApi.join(liveId);
      dispatch(fetchBalance());
      await startWatching(reply);
    } catch (e) { handlePaymentError(e); }
  };

  const goLiveNow = async () => {
    const ok = await confirm({ title: 'Go live now?', message: 'Your camera and mic turn on, and your followers get notified.', confirmLabel: 'Go live' });
    if (!ok) return;
    try {
      await startHosting();
      setDetail((d) => (d ? { ...d, live: { ...d.live, status: 'live' } } : d));
    } catch (e) { flash(e.message, 'error'); setPhase('scheduled'); }
  };

  const endLive = async () => {
    const ok = await confirm({ title: 'End this live?', message: "Everyone is sent out and the live can't be restarted.", confirmLabel: 'End live', tone: 'danger' });
    if (!ok) return;
    try { await livesApi.end(liveId); leave(); setPhase('ended'); } catch (e) { flash(e.message, 'error'); }
  };

  const sendGift = async (g) => {
    const ok = await confirm({
      title: `Send a ${g.label}?`,
      message: `${GIFT_EMOJI[g.id] || ''} It goes straight to ${detail?.live.host.name || 'the host'}.`,
      rows: [{ label: 'Cost', value: `${g.coins} coin${g.coins === 1 ? '' : 's'}`, highlight: true }],
      confirmLabel: `Send ${g.label}`,
    });
    if (!ok) return;
    try {
      const r = await livesApi.gift(liveId, g.id);
      addMessages([r.message]);
      dispatch(fetchBalance());
      setSheet(null);
    } catch (e) { handlePaymentError(e); }
  };

  const promote = async (o) => {
    const ok = await confirm({
      title: `Promote for ${o.label}?`,
      message: 'Your live shows up in the main feed for everyone.',
      rows: [{ label: 'Cost', value: `${o.coins} coins`, highlight: true }],
      confirmLabel: `Pay ${o.coins} coins`,
    });
    if (!ok) return;
    try {
      await livesApi.promote(liveId, o.hours);
      dispatch(fetchBalance());
      setSheet(null);
      flash('Your live is promoted in the feed.', 'success');
    } catch (e) { handlePaymentError(e); }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try { addMessages([(await livesApi.send(liveId, body)).message]); } catch (e) { setText(body); flash(e.message, 'error'); }
  };

  const toggleFollow = async () => {
    if (!detail || !user) return;
    try {
      const r = await livesApi.follow(detail.live.host.id);
      setDetail({ ...detail, host_followers: r.followers, viewer: { ...detail.viewer, following: r.following } });
    } catch (e) { flash(e.message, 'error'); }
  };

  const toggleRemind = async () => {
    if (!detail) return;
    if (!user) { navigation.navigate('AuthNav', { screen: 'Login' }); return; }
    try {
      const r = await livesApi.remind(liveId);
      setDetail({ ...detail, viewer: { ...detail.viewer, reminded: r.reminded } });
      flash(r.reminded ? "We'll tell you when it starts." : 'Reminder off.');
    } catch (e) { flash(e.message, 'error'); }
  };

  const report = async () => {
    const ok = await confirm({ title: 'Report this live?', message: "Our team will review it. The host won't know who reported.", confirmLabel: 'Report', tone: 'danger' });
    if (!ok) return;
    try { await livesApi.report(liveId, 'Reported from the live room'); flash("Thanks. We'll take a look.", 'success'); } catch (e) { flash(e.message, 'error'); }
  };

  const share = () => Share.share({ message: `Someone is live on Anonixx.\nhttps://anonixx.com/lives/${liveId}` }).catch(() => {});

  const toggleMic = () => { engine.current?.muteLocalAudioStream(micOn); setMicOn(!micOn); };
  const toggleCam = () => {
    engine.current?.muteLocalVideoStream(camOn);
    if (camOn) engine.current?.stopPreview(); else engine.current?.startPreview();
    setCamOn(!camOn);
  };

  const live = detail?.live;
  const host = live?.host;
  const isHost = Boolean(detail?.viewer.is_host);
  const previewLeft = previewEnds ? Math.max(0, Math.ceil((previewEnds - now) / 1000)) : 0;
  const Rtc = RtcView.current;
  const showVideo = Rtc && hostVideo && onAir && (isHost ? camOn : true);

  if (phase === 'error') {
    return (
      <View style={[s.shell, s.center]}>
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.pill} onPress={() => navigation.goBack()}><Text style={s.pillText}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.shell}>
      {showVideo ? (
        <Rtc style={StyleSheet.absoluteFill} canvas={{ uid: isHost ? 0 : hostUid, renderMode: 1 }} />
      ) : (
        <View style={s.placeholder}>
          {live?.cover_url ? <Image source={{ uri: live.cover_url }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} blurRadius={24} /> : null}
          {host ? <View style={s.bigAva}><AuthorAvatar uri={host.avatar_url} seed={host.id} name={host.name} gender={host.gender} /></View> : null}
        </View>
      )}

      <View style={[s.top, { paddingTop: insets.top + rp(10) }]}>
        {host ? (
          <View style={s.hostPill}>
            <View style={s.hostAva}><AuthorAvatar uri={host.avatar_url} seed={host.id} name={host.name} gender={host.gender} /></View>
            <View style={{ maxWidth: rs(120) }}>
              <Text style={s.hostName} numberOfLines={1}>{host.name || 'Anonymous'}</Text>
              <Text style={s.hostSub}>{detail?.host_followers ?? 0} followers</Text>
            </View>
            {!isHost && user && (
              <TouchableOpacity style={[s.follow, detail?.viewer.following && s.followOn]} onPress={toggleFollow}>
                <Text style={s.followText}>{detail?.viewer.following ? 'Following' : 'Follow'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : <View />}
        <View style={s.topRight}>
          {onAir && <View style={[s.chip, s.chipLive]}><Text style={s.chipText}>LIVE</Text></View>}
          {onAir && <View style={s.chip}><Eye size={rs(12)} color="#fff" /><Text style={s.chipText}>{viewers}</Text></View>}
          <TouchableOpacity style={s.round} onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Close"><X size={rs(20)} color="#fff" /></TouchableOpacity>
        </View>
      </View>

      {!!detail?.top_gifters?.length && (
        <View style={[s.gifters, { top: insets.top + rs(66) }]}>
          {detail.top_gifters.slice(0, 3).map((g, i) => (
            <View key={g.user_id} style={s.gifter}>
              <AuthorAvatar uri={g.avatar_url} seed={g.user_id} name={g.name} gender={g.gender} />
              <Text style={s.gifterRank}>{i + 1}</Text>
            </View>
          ))}
        </View>
      )}

      {phase === 'preview' && (
        <View style={[s.preview, { top: insets.top + rs(66) }]}><Text style={s.previewText}>Preview · 0:{String(previewLeft).padStart(2, '0')}</Text></View>
      )}

      {burst && (
        <Animated.View style={[s.burst, { opacity: burstAnim, transform: [{ translateX: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [-200, 0] }) }] }]}>
          <Text style={s.burstEmoji}>{GIFT_EMOJI[burst.gift] || '🎁'}</Text>
          <Text style={s.burstText}><Text style={{ fontFamily: 'DMSans-Bold' }}>{burst.user.name}</Text> sent a {burst.gift}</Text>
        </Animated.View>
      )}

      {(phase === 'loading' || phase === 'connecting') && <View style={s.overlay}><ActivityIndicator size="large" color={T.primary} /></View>}

      {phase === 'scheduled' && live && (
        <View style={[s.overlay, s.card]}>
          <Text style={s.cardTitle}>{live.title}</Text>
          {!!live.about && <Text style={s.cardText}>{live.about}</Text>}
          <Text style={s.when}>Starts {startsLabel(live.starts_at)}</Text>
          {isHost ? (
            <TouchableOpacity style={s.pill} onPress={goLiveNow}><Text style={s.pillText}>Go live now</Text></TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.pill, detail?.viewer.reminded && s.pillGhost]} onPress={toggleRemind}>
              {detail?.viewer.reminded ? <BellRing size={rs(16)} color="#fff" /> : <Bell size={rs(16)} color="#fff" />}
              <Text style={s.pillText}>{detail?.viewer.reminded ? 'Reminder set' : 'Remind me'}</Text>
            </TouchableOpacity>
          )}
          <View style={s.inline}><Coins size={rs(13)} color={T.gold} /><Text style={s.cardSmall}>{live.price} coins to join</Text></View>
        </View>
      )}

      {phase === 'locked' && live && (
        <View style={[s.overlay, s.card]}>
          <Lock size={rs(40)} color={T.primary} />
          <Text style={s.cardTitle}>{user ? 'Your preview is over' : live.title}</Text>
          <Text style={s.cardText}>{user ? `Join to keep watching ${host?.name || 'the host'} and chat live.` : 'Sign in to watch a free 30-second preview.'}</Text>
          {user ? (
            <TouchableOpacity style={[s.pill, s.joinBig]} onPress={join}>
              <Text style={s.pillText}>Join ·</Text><Coins size={rs(16)} color={T.gold} /><Text style={s.pillText}>{live.price}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.pill} onPress={() => navigation.navigate('AuthNav', { screen: 'Login' })}><Text style={s.pillText}>Sign in</Text></TouchableOpacity>
          )}
          <View style={s.inline}><Users size={rs(13)} color={T.textSecondary} /><Text style={s.cardSmall}>{live.members} members inside</Text></View>
        </View>
      )}

      {phase === 'ended' && (
        <View style={[s.overlay, s.card]}>
          <Text style={s.cardTitle}>This live has ended</Text>
          <Text style={s.cardText}>{isHost ? 'Thanks for hosting. Your earnings are on the way at the end of the week.' : 'Follow the host to hear about their next live.'}</Text>
          <View style={s.row}>
            {isHost && <TouchableOpacity style={s.pill} onPress={() => navigation.replace('LiveEarnings')}><Text style={s.pillText}>See earnings</Text></TouchableOpacity>}
            <TouchableOpacity style={[s.pill, s.pillGhost]} onPress={() => navigation.goBack()}><Text style={s.pillText}>More lives</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {onAir && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.bottom, { paddingBottom: insets.bottom + rp(10) }]}>
          {inRoom && (
            <FlatList
              style={s.chat}
              data={messages}
              keyExtractor={(m) => m.id}
              ref={chatRef}
              onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item: m }) => (
                <View style={[s.msg, m.kind === 'gift' && s.msgGift, m.kind === 'join' && s.msgJoin]}>
                  <Text style={[s.msgText, m.kind === 'join' && s.msgJoinText]}>
                    <Text style={s.msgName}>{m.user.name} </Text>
                    {m.kind === 'gift' ? `sent a ${m.gift} ${GIFT_EMOJI[m.gift] || ''}` : m.kind === 'join' ? 'joined' : m.text}
                  </Text>
                </View>
              )}
            />
          )}
          <View style={s.actions}>
            {phase === 'preview' ? (
              <TouchableOpacity style={[s.pill, s.joinWide]} onPress={join}>
                <Text style={s.pillText}>Join ·</Text><Coins size={rs(16)} color={T.gold} /><Text style={s.pillText}>{live?.price}</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.input}>
                <TextInput
                  style={s.inputText} value={text} onChangeText={setText} maxLength={300} onSubmitEditing={send} returnKeyType="send"
                  placeholder={isHost ? 'Talk to your members…' : 'Say something…'} placeholderTextColor="rgba(255,255,255,0.6)"
                />
                <TouchableOpacity style={[s.sendBtn, !text.trim() && { opacity: 0.4 }]} onPress={send} disabled={!text.trim()} accessibilityLabel="Send">
                  <Send size={rs(16)} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            {phase === 'watching' && (
              <TouchableOpacity style={[s.round, s.roundHot]} onPress={() => setSheet('gifts')} accessibilityLabel="Send a gift"><GiftIcon size={rs(20)} color="#fff" /></TouchableOpacity>
            )}
            {isHost && phase === 'hosting' && (
              <>
                <TouchableOpacity style={s.round} onPress={toggleMic} accessibilityLabel={micOn ? 'Mute mic' : 'Unmute mic'}>{micOn ? <Mic size={rs(20)} color="#fff" /> : <MicOff size={rs(20)} color="#fff" />}</TouchableOpacity>
                <TouchableOpacity style={s.round} onPress={toggleCam} accessibilityLabel={camOn ? 'Turn camera off' : 'Turn camera on'}>{camOn ? <Video size={rs(20)} color="#fff" /> : <VideoOff size={rs(20)} color="#fff" />}</TouchableOpacity>
                <TouchableOpacity style={s.round} onPress={() => setSheet('promote')} accessibilityLabel="Promote in the feed"><Megaphone size={rs(20)} color="#fff" /></TouchableOpacity>
                <TouchableOpacity style={s.endBtn} onPress={endLive}><Text style={s.pillText}>End</Text></TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={s.round} onPress={share} accessibilityLabel="Share"><Share2 size={rs(20)} color="#fff" /></TouchableOpacity>
            {!isHost && <TouchableOpacity style={s.round} onPress={report} accessibilityLabel="Report"><Flag size={rs(20)} color="#fff" /></TouchableOpacity>}
          </View>
        </KeyboardAvoidingView>
      )}

      <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={s.sheetBack} onPress={() => setSheet(null)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + rp(18) }]}>
            {sheet === 'gifts' ? (
              <>
                <Text style={s.sheetTitle}>Send a gift</Text>
                <Text style={s.sheetSub}>Gifts go fully to {host?.name || 'the host'}. Balance: {balance ?? 0} coins</Text>
                <View style={s.giftGrid}>
                  {gifts.map((g) => (
                    <TouchableOpacity key={g.id} style={s.giftBtn} onPress={() => sendGift(g)} activeOpacity={0.8}>
                      <Text style={s.giftEmoji}>{GIFT_EMOJI[g.id]}</Text>
                      <Text style={s.giftLabel}>{g.label}</Text>
                      <View style={s.inline}><Coins size={rs(11)} color={T.gold} /><Text style={s.giftCost}>{g.coins}</Text></View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={s.sheetTitle}>Promote in the feed</Text>
                <Text style={s.sheetSub}>Your live appears in everyone's main feed while it's promoted.</Text>
                <View style={s.giftGrid}>
                  {PROMO_OPTIONS.map((o) => (
                    <TouchableOpacity key={o.hours} style={[s.giftBtn, { flexBasis: '31%' }]} onPress={() => promote(o)} activeOpacity={0.8}>
                      <Text style={s.giftLabel}>{o.label}</Text>
                      <View style={s.inline}><Coins size={rs(11)} color={T.gold} /><Text style={s.giftCost}>{o.coins}</Text></View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: rp(14), padding: rp(16) },
  errorText: { color: '#fff', fontFamily: 'DMSans-Regular', fontSize: rf(15), textAlign: 'center' },
  placeholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#140d18' },
  bigAva: { width: rs(96), height: rs(96), borderRadius: rs(48), overflow: 'hidden', borderWidth: 3, borderColor: T.primary },
  top: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: rp(12) },
  hostPill: { flexDirection: 'row', alignItems: 'center', gap: rp(8), paddingVertical: rp(4), paddingLeft: rp(4), paddingRight: rp(6), borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)' },
  hostAva: { width: rs(36), height: rs(36), borderRadius: rs(18), overflow: 'hidden' },
  hostName: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: '#fff' },
  hostSub: { fontFamily: 'DMSans-Regular', fontSize: rf(11), color: 'rgba(255,255,255,0.75)' },
  follow: { height: rs(30), paddingHorizontal: rp(14), borderRadius: 999, backgroundColor: T.primary, justifyContent: 'center' },
  followOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  followText: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: '#fff' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: rp(4), height: rs(26), paddingHorizontal: rp(9), borderRadius: rs(8), backgroundColor: 'rgba(0,0,0,0.45)' },
  chipLive: { backgroundColor: '#EF4444' },
  chipText: { fontFamily: 'DMSans-Bold', fontSize: rf(12), color: '#fff' },
  round: { width: rs(42), height: rs(42), borderRadius: rs(21), backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  roundHot: { backgroundColor: '#FF5A6E' },
  gifters: { position: 'absolute', left: rp(12), zIndex: 3, flexDirection: 'row', gap: rp(6) },
  gifter: { width: rs(26), height: rs(26), borderRadius: rs(13), overflow: 'hidden', borderWidth: 1.5, borderColor: T.gold },
  gifterRank: { position: 'absolute', right: 0, bottom: 0, fontSize: rf(8), fontWeight: '800', backgroundColor: T.gold, color: '#000', paddingHorizontal: 2, borderRadius: 4 },
  preview: { position: 'absolute', alignSelf: 'center', zIndex: 3, paddingHorizontal: rp(14), paddingVertical: rp(6), borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  previewText: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: '#fff' },
  burst: { position: 'absolute', left: rp(12), top: '38%', zIndex: 4, flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingVertical: rp(8), paddingLeft: rp(8), paddingRight: rp(16), borderRadius: 999, backgroundColor: 'rgba(255,99,74,0.9)' },
  burstEmoji: { fontSize: rf(28) },
  burstText: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: '#fff' },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 5, alignItems: 'center', justifyContent: 'center' },
  card: { gap: rp(12), padding: rp(24), backgroundColor: 'rgba(5,7,12,0.78)' },
  cardTitle: { fontFamily: 'PlayfairDisplay-Bold', fontSize: rf(24), color: '#fff', textAlign: 'center' },
  cardText: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.textSecondary, textAlign: 'center', maxWidth: rs(320) },
  cardSmall: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary },
  when: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.gold },
  inline: { flexDirection: 'row', alignItems: 'center', gap: rp(4) },
  row: { flexDirection: 'row', gap: rp(10) },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(6), height: rs(46), paddingHorizontal: rp(22), borderRadius: 999, backgroundColor: T.primary },
  pillGhost: { backgroundColor: 'rgba(255,255,255,0.14)' },
  pillText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: '#fff' },
  joinBig: { height: rs(52), paddingHorizontal: rp(28) },
  joinWide: { flex: 1 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, paddingHorizontal: rp(12), paddingTop: rp(30) },
  chat: { maxHeight: rs(240), maxWidth: '82%', marginBottom: rp(10) },
  msg: { alignSelf: 'flex-start', paddingHorizontal: rp(10), paddingVertical: rp(6), borderRadius: rs(12), backgroundColor: 'rgba(0,0,0,0.35)', marginBottom: rp(6) },
  msgGift: { backgroundColor: 'rgba(255,99,74,0.4)' },
  msgJoin: { backgroundColor: 'transparent', paddingVertical: rp(2) },
  msgText: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: '#fff' },
  msgJoinText: { fontSize: rf(12), opacity: 0.75 },
  msgName: { fontFamily: 'DMSans-Bold', color: '#ffb4a6' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', height: rs(44), paddingLeft: rp(14), paddingRight: rp(4), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  inputText: { flex: 1, fontFamily: 'DMSans-Regular', fontSize: rf(14), color: '#fff', paddingVertical: 0 },
  sendBtn: { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  endBtn: { height: rs(42), paddingHorizontal: rp(18), borderRadius: 999, backgroundColor: '#EF4444', justifyContent: 'center' },
  sheetBack: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { paddingHorizontal: rp(16), paddingTop: rp(18), borderTopLeftRadius: rs(22), borderTopRightRadius: rs(22), backgroundColor: T.surface },
  sheetTitle: { fontFamily: 'DMSans-Bold', fontSize: rf(17), color: T.text },
  sheetSub: { fontFamily: 'DMSans-Regular', fontSize: rf(13), color: T.textSecondary, marginTop: rp(4) },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8), marginTop: rp(14) },
  giftBtn: { flexBasis: '18%', flexGrow: 1, alignItems: 'center', gap: rp(4), paddingVertical: rp(12), borderRadius: rs(14), borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceAlt },
  giftEmoji: { fontSize: rf(28) },
  giftLabel: { fontFamily: 'DMSans-Bold', fontSize: rf(12), color: T.text },
  giftCost: { fontFamily: 'DMSans-Bold', fontSize: rf(12), color: T.gold },
});
