/**
 * RoomScreen
 *
 * The Room: someone's chat interface, locked. Anyone 18+ can step in from
 * an avatar or a hookup post's Link up and see it the way it'll look once
 * they're in — the person's background, font, picture, their live hookup
 * post pinned up top and their 3 photos arriving like messages — but the
 * calls and the composer stay padlocked until a link up is accepted.
 *
 * GET /chat-profile/{userId}/preview?drop_id= says where the viewer
 * stands, and the bottom bar follows it: Link up, sent and waiting, a link
 * up this person sent *you* (Accept / Decline right here), not taking link
 * ups, or Edit Room on your own. Already connected dissolves straight into
 * DropChat.
 *
 * Route params: { userId, postId? }
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView,
  Animated, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ChevronLeft, Lock, Phone, Video as VideoIcon, X } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import ChatBackground from '../../components/chat/ChatBackground';
import AgeGate from '../../components/drops/AgeGate';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { CHAT_FONT_MAP, DEFAULT_CHAT_FONT } from '../../config/fonts';
import { DEFAULT_BACKGROUND_PATTERN } from '../../config/patterns';
import { intentLabel, timeLeft } from '../../config/linkup';

// Own component so useVideoPlayer runs once per bubble, never conditionally.
function Shot({ item, onPress, index }) {
  const isVideo = item.media_type === 'video';
  const player = useVideoPlayer(isVideo ? { uri: item.media_url } : null, (p) => { p.loop = true; p.muted = true; p.play(); });
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
  }, [enter]);
  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
      <TouchableOpacity style={s.shot} onPress={onPress} activeOpacity={0.9} accessibilityLabel={`Photo ${index + 1}`}>
        {isVideo
          ? <VideoView player={player} style={s.shotMedia} contentFit="cover" nativeControls={false} />
          : <Image source={{ uri: item.media_url }} style={s.shotMedia} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

function FullView({ item, onClose }) {
  const isVideo = item.media_type === 'video';
  const player = useVideoPlayer(isVideo ? { uri: item.media_url } : null, (p) => { p.loop = true; p.play(); });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={s.fullBack}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.fullWrap} pointerEvents="box-none">
          {isVideo
            ? <VideoView player={player} style={s.fullMedia} contentFit="contain" nativeControls />
            : <Image source={{ uri: item.media_url }} style={s.fullMedia} resizeMode="contain" />}
        </View>
        <TouchableOpacity style={s.fullX} onPress={onClose} hitSlop={HIT_SLOP}>
          <X size={rs(20)} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

function TypingDots() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={s.typing}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[s.dot, { opacity: a.interpolate({ inputRange: [0, (i + 1) / 4, 1], outputRange: [0.3, 1, 0.3] }) }]}
        />
      ))}
    </View>
  );
}

export default function RoomScreen({ route, navigation }) {
  const { userId, postId } = route.params ?? {};
  const { showToast } = useToast();
  const me = useSelector((state) => state.auth.user?.id);
  const own = !!me && me === userId;

  const [p, setP] = useState(null);
  const [gate, setGate] = useState(false);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(0);
  const [big, setBig] = useState(null);
  const [busy, setBusy] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const scroll = useRef(null);

  const enter = useCallback((connectionId) => {
    Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => {
      navigation.replace('DropChat', { connectionId });
    });
  }, [fade, navigation]);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const qs = postId ? `?drop_id=${encodeURIComponent(postId)}` : '';
      const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/${userId}/preview${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data?.detail?.code === 'age_verification_required') {
        setGate(true);
        return;
      }
      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'Could not open this Room.');
        return;
      }
      setGate(false);
      setP(data);
      if (data.connection_id && !own) enter(data.connection_id);
    } catch {
      setError('Could not open this Room.');
    }
  }, [userId, postId, own, enter]);

  // Reload on focus so coming back from PostUnlock shows "Link up sent".
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Gallery arrives like messages: typing dots, then the next photo.
  const total = p?.room?.gallery?.length || 0;
  useEffect(() => {
    if (shown >= total) return undefined;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 500 : 900);
    return () => clearTimeout(t);
  }, [shown, total]);

  const respond = useCallback(async (accept) => {
    const req = p?.incoming_request;
    if (!req || busy) return;
    setBusy(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${req.id}/${accept ? 'accept' : 'decline'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({ type: 'warning', message: typeof data.detail === 'string' ? data.detail : 'Could not do that right now.' });
        return;
      }
      if (accept && data.connection_id) enter(data.connection_id);
      else navigation.goBack();
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }, [p, busy, enter, navigation, showToast]);

  const locked = () => showToast({ type: 'info', message: own ? 'This is your Room as others see it.' : 'Calls open once you link up.' });

  if (gate || error || !p) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.plainHead}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}><ChevronLeft size={rs(24)} color={T.text} /></TouchableOpacity>
          <Text style={s.plainTitle}>Room</Text>
        </View>
        <View style={s.centered}>
          {gate ? <AgeGate onDone={load} /> : error ? <Text style={s.muted}>{error}</Text> : <ActivityIndicator color={T.primary} />}
        </View>
      </SafeAreaView>
    );
  }

  const room = p.room || {};
  const name = room.anonymous_name || 'Anonymous';
  const pic = room.profile_picture_url;
  const font = CHAT_FONT_MAP[room.font_style] || CHAT_FONT_MAP[DEFAULT_CHAT_FONT];
  const post = p.post;
  const live = !!post?.live;
  const isConfession = post?.kind === 'confession';   // no clock: open to link ups from here
  const left = live ? timeLeft(post.live_until) : null;
  const h = post?.hookup;
  const inc = p.incoming_request;

  let bar;
  if (own) {
    bar = (
      <View style={s.bar}>
        <Text style={[s.barText, { fontFamily: font }]}>This is your Room, as everyone else sees it.</Text>
        <TouchableOpacity style={s.ghostBtn} onPress={() => navigation.navigate('Main', { screen: 'Messages', params: { screen: 'ChatProfileSetup' } })}>
          <Text style={s.ghostText}>Edit Room</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (inc) {
    bar = (
      <View style={s.bar}>
        <TouchableOpacity style={[s.ghostBtn, { flex: 0.5 }]} disabled={busy} onPress={() => respond(false)}>
          <Text style={s.ghostText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.acceptBtn} disabled={busy} onPress={() => respond(true)}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.acceptText}>Accept, open the chat</Text>}
        </TouchableOpacity>
      </View>
    );
  } else if (p.my_request) {
    bar = (
      <View style={s.bar}>
        <View style={s.waitDot} />
        <Text style={[s.barText, { fontFamily: font }]}>Link up sent. {name} sees your line first, you pay nothing unless they say yes.</Text>
      </View>
    );
  } else if (live && post) {
    bar = (
      <View style={s.bar}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.88}
          onPress={() => navigation.navigate('PostUnlock', { post: { id: post.id, anonymous_name: name, avatar_url: pic, content: post.content }, fromRoom: true })}
        >
          <LinearGradient colors={['#5a0f24', '#8e1b3a', '#ff634a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.velvet}>
            <Lock size={rs(17)} color={T.gold} strokeWidth={2.2} />
            <Text style={[s.velvetText, { fontFamily: font }]} numberOfLines={1}>Link up with {name}</Text>
            <View style={s.costPill}><Text style={s.costText}>{p.linkup_cost ? `${p.linkup_cost} coins` : 'free'}</Text></View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  } else {
    bar = (
      <View style={s.bar}>
        <Text style={[s.barText, { fontFamily: font }]}>{name} isn't taking link ups right now. Catch their next post on the feed.</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[s.root, { opacity: fade }]}>
      <ChatBackground pattern={room.background_pattern || DEFAULT_BACKGROUND_PATTERN} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={s.head}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}><ChevronLeft size={rs(24)} color={T.text} /></TouchableOpacity>
            <View style={s.ava}>
              {pic ? <Image source={{ uri: pic }} style={s.avaImg} /> : <Text style={s.avaInitial}>{name[0]?.toUpperCase() || 'A'}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.name, { fontFamily: font }]} numberOfLines={1}>{name}</Text>
              <Text style={s.sub}>{own ? 'your Room' : isConfession ? 'open to link ups' : live ? 'taking link ups tonight' : 'Room locked'}</Text>
            </View>
            {[Phone, VideoIcon].map((Icon, i) => (
              <TouchableOpacity key={i} style={s.callBtn} onPress={locked} accessibilityLabel={i ? 'Video call, locked' : 'Voice call, locked'}>
                <Icon size={rs(17)} color={T.textSecondary} strokeWidth={1.8} />
                <View style={s.lockBadge}><Lock size={rs(9)} color={T.gold} strokeWidth={2.6} /></View>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={s.log}
            onContentSizeChange={() => shown && scroll.current?.scrollToEnd({ animated: true })}
          >
            {post ? (
              <View style={[s.pin, !live && { opacity: 0.75, borderColor: T.border }]}>
                <View style={s.chips}>
                  <Text style={[s.chip, live && !isConfession && s.chipHot]}>{isConfession ? 'Confession' : live ? (left ? `Tonight · ${left}` : 'Live') : 'Ended'}</Text>
                  {!!post.linkup_count && <Text style={s.chip}>{post.linkup_count} linked up</Text>}
                </View>
                {!!h && (
                  <View style={s.facts}>
                    <Text style={s.age}>{h.age}</Text>
                    {!!h.area && <Text style={s.fact}>{h.area}</Text>}
                    {!!h.looking_for && <Text style={s.fact}>· into {h.looking_for}</Text>}
                  </View>
                )}
                {!!post.content && <Text style={s.pinText}>&ldquo;{post.content}&rdquo;</Text>}
                {!!h?.vibes?.length && (
                  <View style={s.chips}>{h.vibes.map((v) => <Text key={v} style={s.vibe}>{v}</Text>)}</View>
                )}
              </View>
            ) : null}

            {(room.gallery || []).slice(0, shown).map((g, k) => (
              <Shot key={k} item={g} index={k} onPress={() => setBig(g)} />
            ))}
            {shown < total && <TypingDots />}
            {total === 0 && (
              <View style={s.note}>
                <Text style={[s.noteText, { fontFamily: font }]}>
                  {own ? "Your Room is empty. Add 3 photos so link ups know who they're meeting." : `${name} hasn't hung anything in their Room yet.`}
                </Text>
              </View>
            )}
            {inc ? (
              <LinearGradient colors={['#5a0f24', '#8e1b3a', '#c2344a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.pitch}>
                <Text style={s.pitchLabel}>THEIR LINE</Text>
                {!!inc.media_url && inc.media_type !== 'video' && <Image source={{ uri: inc.media_url }} style={s.pitchMedia} />}
                <Text style={[s.pitchText, { fontFamily: font }]}>{inc.pitch || `${name} wants to link up.`}</Text>
                {!!inc.intents?.length && (
                  <View style={s.chips}>{inc.intents.map((i) => <Text key={i} style={s.intent}>{intentLabel(i)}</Text>)}</View>
                )}
              </LinearGradient>
            ) : null}
          </ScrollView>

          {bar}
        </SafeAreaView>
      </ChatBackground>
      {big ? <FullView item={big} onClose={() => setBig(null)} /> : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg },
  muted: { color: T.textSecondary, fontSize: FONT.sm, textAlign: 'center' },
  plainHead: { flexDirection: 'row', alignItems: 'center', gap: rp(12), paddingHorizontal: SPACING.md, paddingVertical: rp(12) },
  plainTitle: { color: T.text, fontSize: FONT.lg, fontFamily: 'PlayfairDisplay-Italic' },

  head: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    paddingHorizontal: SPACING.md, paddingVertical: rp(10),
    backgroundColor: 'rgba(11,15,24,0.55)', borderBottomWidth: 1, borderBottomColor: T.border,
  },
  ava: { width: rs(38), height: rs(38), borderRadius: rs(19), overflow: 'hidden', backgroundColor: T.primaryDim, alignItems: 'center', justifyContent: 'center' },
  avaImg: { width: '100%', height: '100%' },
  avaInitial: { color: T.primary, fontWeight: '800', fontSize: FONT.md },
  name: { color: T.text, fontSize: FONT.md },
  sub: { color: T.gold, fontSize: rf(11), fontFamily: 'PlayfairDisplay-Italic' },
  callBtn: { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  lockBadge: { position: 'absolute', right: -rs(2), bottom: -rs(2), width: rs(16), height: rs(16), borderRadius: rs(8), backgroundColor: T.background, alignItems: 'center', justifyContent: 'center' },

  log: { padding: SPACING.md, gap: rp(10) },
  pin: {
    padding: rp(14), borderRadius: RADIUS.lg, backgroundColor: 'rgba(11,15,24,0.66)',
    borderWidth: 1, borderColor: T.goldBorder, gap: rp(8), marginBottom: rp(4),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6) },
  chip: { fontSize: rf(11), fontWeight: '700', color: T.textSecondary, backgroundColor: 'rgba(255,255,255,0.07)', paddingHorizontal: rp(9), paddingVertical: rp(4), borderRadius: 999, overflow: 'hidden' },
  chipHot: { color: T.primary, backgroundColor: T.primaryDim },
  facts: { flexDirection: 'row', alignItems: 'baseline', gap: rp(8), flexWrap: 'wrap' },
  age: { color: T.text, fontSize: rf(22), fontFamily: 'PlayfairDisplay-Bold' },
  fact: { color: T.textSecondary, fontSize: FONT.sm },
  pinText: { color: T.text, fontSize: rf(17), lineHeight: rf(23), fontFamily: 'PlayfairDisplay-Italic' },
  vibe: { color: T.text, fontSize: rf(11), borderWidth: 1, borderColor: T.borderStrong, paddingHorizontal: rp(9), paddingVertical: rp(3), borderRadius: 999 },

  shot: { width: rs(200), aspectRatio: 3 / 4, borderTopLeftRadius: rs(18), borderTopRightRadius: rs(18), borderBottomRightRadius: rs(18), borderBottomLeftRadius: rs(4), overflow: 'hidden', backgroundColor: '#1e2535' },
  shotMedia: { width: '100%', height: '100%' },
  typing: { alignSelf: 'flex-start', flexDirection: 'row', gap: rp(4), paddingHorizontal: rp(14), paddingVertical: rp(12), borderRadius: rs(16), borderBottomLeftRadius: rs(4), backgroundColor: '#1e2535' },
  dot: { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.textSecondary },
  note: { alignSelf: 'flex-start', maxWidth: '80%', padding: rp(12), borderRadius: rs(16), borderBottomLeftRadius: rs(4), backgroundColor: '#1e2535' },
  noteText: { color: T.textSecondary, fontSize: FONT.sm },
  pitch: { alignSelf: 'flex-start', maxWidth: '84%', padding: rp(14), borderRadius: rs(18), borderBottomLeftRadius: rs(4), borderWidth: 1, borderColor: T.goldBorder, gap: rp(6) },
  pitchLabel: { color: T.gold, fontSize: rf(10), letterSpacing: 1, fontWeight: '700' },
  pitchMedia: { width: rs(180), height: rs(180), borderRadius: RADIUS.md },
  pitchText: { color: '#fff', fontSize: FONT.md, lineHeight: FONT.md * 1.4 },
  intent: { color: '#fff', fontSize: rf(11), borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: rp(9), paddingVertical: rp(3), borderRadius: 999 },

  bar: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    backgroundColor: 'rgba(11,15,24,0.82)', borderTopWidth: 1, borderTopColor: T.border,
  },
  barText: { flex: 1, color: T.textSecondary, fontSize: FONT.sm, lineHeight: FONT.sm * 1.4 },
  ghostBtn: { flex: 0, height: rs(48), paddingHorizontal: rp(16), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: T.text, fontWeight: '700', fontSize: FONT.sm },
  acceptBtn: { flex: 1, height: rs(48), borderRadius: RADIUS.md, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: '#fff', fontWeight: '800', fontSize: FONT.sm },
  waitDot: { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: T.gold },
  velvet: { height: rs(52), borderRadius: RADIUS.md, flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingHorizontal: rp(16) },
  velvetText: { flex: 1, color: '#fff', fontSize: FONT.md },
  costPill: { backgroundColor: 'rgba(0,0,0,0.28)', paddingHorizontal: rp(10), paddingVertical: rp(4), borderRadius: 999 },
  costText: { color: T.gold, fontSize: rf(12), fontWeight: '700' },

  fullBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  fullWrap: { width: '100%', height: '78%' },
  fullMedia: { width: '100%', height: '100%' },
  fullX: { position: 'absolute', top: rp(16), right: rp(16), width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
