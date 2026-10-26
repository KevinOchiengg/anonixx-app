/**
 * RoomScreen
 *
 * Someone's Room: their private space, painted in the theme they picked
 * (config/roomThemes.js). Anyone 18+ can peek through the window from an
 * avatar or a post: their name, picture, status, intro, the post they came
 * from, and whatever photos the owner shows through the window. Photos the
 * owner keeps for people inside show as veiled frames (a count, never the
 * images), and "only me" photos never appear at all.
 *
 * GET /chat-profile/{userId}/preview?drop_id= says where the viewer stands,
 * and the bottom bar follows it: Knock (free; coins move only on Let In),
 * knocked and waiting (take it back), a Knock this person sent *you* (Let In
 * / Decline right here), door closed, Edit Room on your own, or You're inside.
 * The first visit after a Let In plays the entrance: "You're inside", the
 * owner's welcome message, and optional openers that only fill the chat box.
 *
 * Route params: { userId, postId? }
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView,
  Animated, Modal, Pressable, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ChevronLeft, Lock, MoreHorizontal, X } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import AgeGate from '../../components/drops/AgeGate';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { CHAT_FONT_MAP, DEFAULT_CHAT_FONT } from '../../config/fonts';
import { intentLabel, timeLeft } from '../../config/linkup';
import { STARTERS, roomThemeById, statusLabel } from '../../config/roomThemes';
import KnockClues from '../../components/rooms/KnockClues';

const REPORT_REASONS = [
  ['abuse', 'Harassment or abuse'],
  ['explicit', 'Sexually explicit or unwanted'],
  ['doxxing', 'Shares private info'],
  ['spam', 'Spam or scam'],
  ['other', 'Something else'],
];

// Own component so useVideoPlayer runs once per frame, never conditionally.
function Frame({ item, onPress, index, th }) {
  const isVideo = item.media_type === 'video';
  const player = useVideoPlayer(isVideo ? { uri: item.media_url } : null, (p) => { p.loop = true; p.muted = true; p.play(); });
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 420, delay: 120 + index * 110, useNativeDriver: true }).start();
  }, [enter, index]);
  return (
    <Animated.View style={[s.frameWrap, { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}>
      <TouchableOpacity style={[s.frame, { borderColor: th.border, backgroundColor: th.surface }]} onPress={onPress} activeOpacity={0.9} accessibilityLabel={`Open photo ${index + 1}`}>
        {isVideo
          ? <VideoView player={player} style={s.fill} contentFit="cover" nativeControls={false} />
          : <Image source={{ uri: item.media_url }} style={s.fill} />}
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
            ? <VideoView player={player} style={s.fill} contentFit="contain" nativeControls />
            : <Image source={{ uri: item.media_url }} style={s.fill} resizeMode="contain" />}
        </View>
        <TouchableOpacity style={s.fullX} onPress={onClose} hitSlop={HIT_SLOP} accessibilityLabel="Close">
          <X size={rs(20)} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

function Entrance({ th, name, font, welcome, onStart, onClose }) {
  const door = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(door, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [door, rise]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.enter, { backgroundColor: th.bg }]}>
        <LinearGradient colors={[th.glow, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.6 }} />
        <ScrollView contentContainerStyle={s.enterIn}>
          <Animated.View style={{ opacity: door, transform: [{ scaleY: door.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }}>
            <LinearGradient colors={[th.accent, 'transparent']} style={[s.door, { borderColor: th.borderStrong, shadowColor: th.accent }]} />
          </Animated.View>
          <Animated.View style={{ width: '100%', alignItems: 'center', gap: rp(10), opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
            <Text style={[s.enterKicker, { color: th.accent }]}>YOU'RE INSIDE.</Text>
            <Text style={[s.enterTitle, { color: th.text, fontFamily: font }]}>Welcome to {name}'s Room.</Text>
            {welcome ? (
              <View style={[s.quote, { borderColor: th.border, backgroundColor: th.tint }]}>
                <Text style={[s.quoteText, { color: th.text, fontFamily: font }]}>“{welcome}”</Text>
              </View>
            ) : null}
            <Text style={[s.startersHint, { color: th.muted }]}>Need an opener? Tap one to put it in the box. You send it, not us.</Text>
            {STARTERS.map((line) => (
              <TouchableOpacity key={line} style={[s.starter, { borderColor: th.border }]} onPress={() => onStart(line)} activeOpacity={0.8}>
                <Text style={[s.starterText, { color: th.text }]}>{line}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.accentBtn, { backgroundColor: th.accent, alignSelf: 'stretch', marginTop: rp(6) }]} onPress={() => onStart(null)}>
              <Text style={[s.accentText, { color: th.bg }]}>Start the conversation</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP}>
              <Text style={[s.linkText, { color: th.muted }]}>Look around first</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const seenKey = (cid) => `anonixx.room.in.${cid}`;

export default function RoomScreen({ route, navigation }) {
  const { userId, postId } = route.params ?? {};
  const { showToast } = useToast();
  const me = useSelector((state) => state.auth.user?.id);
  const own = !!me && me === userId;

  const [p, setP] = useState(null);
  const [gate, setGate] = useState(false);
  const [error, setError] = useState('');
  const [big, setBig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [entrance, setEntrance] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;

  const call = useCallback(async (path, method = 'GET', body) => {
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }, []);

  const load = useCallback(async () => {
    try {
      const qs = postId ? `?drop_id=${encodeURIComponent(postId)}` : '';
      const { res, data } = await call(`/chat-profile/${userId}/preview${qs}`);
      if (res.status === 403 && data?.detail?.code === 'age_verification_required') {
        setGate(true);
        return;
      }
      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'Could not open this Room.');
        return;
      }
      setGate(false);
      setError('');
      setP(data);
      if (data.connection_id && !own) {
        const seen = await AsyncStorage.getItem(seenKey(data.connection_id)).catch(() => null);
        if (!seen) {
          AsyncStorage.setItem(seenKey(data.connection_id), '1').catch(() => {});
          setEntrance(true);
        }
      }
    } catch {
      setError('Could not open this Room.');
    }
  }, [userId, postId, own, call]);

  // Reload on focus so coming back from the Knock screen shows "You knocked".
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (p) Animated.timing(rise, { toValue: 1, duration: 520, useNativeDriver: true }).start();
  }, [p, rise]);

  const openChat = useCallback(async (connectionId, opener) => {
    if (opener) {
      // Same key DropChat's useDraft reads, so the opener waits in the box unsent.
      await AsyncStorage.setItem(`anonixx.draft.chat:${connectionId}`, JSON.stringify({ v: opener, t: Date.now() })).catch(() => {});
    }
    setEntrance(false);
    navigation.navigate('DropChat', { connectionId });
  }, [navigation]);

  const respond = useCallback(async (letIn) => {
    const req = p?.incoming_request;
    if (!req || busy) return;
    setBusy(true);
    try {
      const { res, data } = await call(`/unlock-requests/${req.id}/${letIn ? 'accept' : 'decline'}`, 'POST');
      if (!res.ok) {
        showToast({ type: 'warning', message: typeof data.detail === 'string' ? data.detail : 'Could not do that right now.' });
        return;
      }
      if (letIn && data.connection_id) navigation.replace('DropChat', { connectionId: data.connection_id });
      else navigation.goBack();
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }, [p, busy, call, navigation, showToast]);

  const takeBack = useCallback(async () => {
    if (!p?.my_request || busy) return;
    setBusy(true);
    try {
      const { res, data } = await call(`/unlock-requests/${p.my_request.id}/cancel`, 'POST');
      if (!res.ok) showToast({ type: 'warning', message: typeof data.detail === 'string' ? data.detail : 'Could not take it back.' });
      else showToast({ type: 'info', message: 'Knock taken back. Nothing was charged.' });
      await load();
    } finally {
      setBusy(false);
    }
  }, [p, busy, call, load, showToast]);

  const report = useCallback(async (reason) => {
    const { res } = await call(`/users/${userId}/report`, 'POST', { reason });
    showToast({ type: res.ok ? 'success' : 'error', message: res.ok ? 'Report received. Thank you.' : 'Could not send the report.' });
  }, [call, userId, showToast]);

  const block = useCallback(() => {
    Alert.alert('Block this person?', "Their Room closes for you and they can't knock on yours.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block', style: 'destructive',
        onPress: async () => {
          const { res } = await call(`/users/${userId}/block`, 'POST');
          if (res.ok) navigation.goBack();
          else showToast({ type: 'error', message: 'Could not block. Try again.' });
        },
      },
    ]);
  }, [call, userId, navigation, showToast]);

  const safety = useCallback(() => {
    Alert.alert('Report or block', undefined, [
      { text: 'Report', onPress: () => Alert.alert('Why are you reporting?', undefined, [
        ...REPORT_REASONS.map(([k, label]) => ({ text: label, onPress: () => report(k) })),
        { text: 'Cancel', style: 'cancel' },
      ]) },
      { text: 'Block', style: 'destructive', onPress: block },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [report, block]);

  if (gate || error || !p) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: T.background }]}>
        <View style={s.plainHead}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back"><ChevronLeft size={rs(24)} color={T.text} /></TouchableOpacity>
          <Text style={s.plainTitle}>Room</Text>
        </View>
        <View style={s.centered}>
          {gate ? <AgeGate onDone={load} /> : error ? (
            <>
              <Lock size={rs(30)} color={T.gold} strokeWidth={1.8} />
              <Text style={s.closedTitle}>This Room is closed.</Text>
              <Text style={s.muted}>{error}</Text>
            </>
          ) : <ActivityIndicator color={T.primary} />}
        </View>
      </SafeAreaView>
    );
  }

  const room = p.room || {};
  const th = roomThemeById(room.room_theme);
  const name = room.anonymous_name || 'Anonymous';
  const pic = room.profile_picture_url;
  const font = CHAT_FONT_MAP[room.font_style] || CHAT_FONT_MAP[DEFAULT_CHAT_FONT];
  const post = p.post;
  const live = !!post?.live;
  const isConfession = post?.kind === 'confession';
  const left = live ? timeLeft(post.live_until) : null;
  const h = post?.hookup;
  const inc = p.incoming_request;
  const cid = p.connection_id;
  const status = statusLabel(room.room_status);
  const gallery = room.gallery || [];
  const hidden = room.gallery_hidden || 0;
  const veiled = room.gallery_visibility === 'inside' && !own ? hidden : 0;
  const cost = p.linkup_cost;
  const card = { backgroundColor: th.surface, borderColor: th.border };
  const riseStyle = { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] };

  let bar;
  if (own) {
    bar = (
      <>
        <Text style={[s.barText, { color: th.muted }]}>This is your Room, the way visitors see it.</Text>
        <TouchableOpacity style={[s.ghostBtn, { borderColor: th.borderStrong }]} onPress={() => navigation.navigate('Main', { screen: 'Messages', params: { screen: 'ChatProfileSetup' } })}>
          <Text style={[s.ghostText, { color: th.text }]}>Edit Room</Text>
        </TouchableOpacity>
      </>
    );
  } else if (cid) {
    bar = (
      <>
        <View style={s.inRow}><View style={[s.dot, { backgroundColor: th.accent2 }]} /><Text style={[s.inText, { color: th.text }]}>You're inside</Text></View>
        <TouchableOpacity style={[s.accentBtn, { backgroundColor: th.accent, flex: 1 }]} onPress={() => openChat(cid)}>
          <Text style={[s.accentText, { color: th.bg }]}>Open conversation</Text>
        </TouchableOpacity>
      </>
    );
  } else if (inc) {
    bar = (
      <>
        <TouchableOpacity style={[s.ghostBtn, { borderColor: th.borderStrong, flex: 0.5 }]} disabled={busy} onPress={() => respond(false)}>
          <Text style={[s.ghostText, { color: th.text }]}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.accentBtn, { backgroundColor: th.accent, flex: 1 }]} disabled={busy} onPress={() => respond(true)}>
          {busy ? <ActivityIndicator color={th.bg} size="small" /> : <Text style={[s.accentText, { color: th.bg }]}>Let In</Text>}
        </TouchableOpacity>
      </>
    );
  } else if (p.my_request) {
    bar = (
      <>
        <View style={[s.dot, { backgroundColor: th.accent }]} />
        <Text style={[s.barText, { color: th.muted }]}>
          You knocked. {name} decides. {cost ? `${cost} coins leave your wallet only if they let you in.` : 'Nothing is charged.'}
        </Text>
        <TouchableOpacity style={[s.ghostBtn, s.smBtn, { borderColor: th.borderStrong }]} disabled={busy} onPress={takeBack}>
          <Text style={[s.ghostText, { color: th.text }]}>Take back</Text>
        </TouchableOpacity>
      </>
    );
  } else if (room.knocks_open === false) {
    bar = <Text style={[s.barText, { color: th.muted }]}>{name} isn't answering the door right now. Come back later.</Text>;
  } else if (live && post) {
    bar = (
      <View style={{ flex: 1, gap: rp(8) }}>
        <TouchableOpacity
          activeOpacity={0.88}
          accessibilityLabel={`Knock on ${name}'s door, free to knock`}
          onPress={() => navigation.navigate('PostUnlock', { post: { id: post.id, anonymous_name: name, avatar_url: pic, content: post.content }, fromRoom: true })}
        >
          <LinearGradient colors={[th.accent, th.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1.6, y: 1 }} style={s.knock}>
            <Text style={[s.knockText, { color: th.bg }]} numberOfLines={1}>Knock on {name}'s door</Text>
            <View style={[s.freePill, { backgroundColor: th.bg }]}><Text style={[s.freeText, { color: th.text }]}>Free to knock</Text></View>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={[s.fine, { color: th.muted }]}>
          {cost ? `If ${name} lets you in, ${cost} coins come out of your wallet automatically. Decline or no answer: nothing.` : 'Free for you. Nothing is charged.'}
        </Text>
      </View>
    );
  } else {
    bar = <Text style={[s.barText, { color: th.muted }]}>{name} isn't taking knocks right now. Catch their next post on the feed.</Text>;
  }

  return (
    <View style={[s.root, { backgroundColor: th.bg }]}>
      <LinearGradient colors={[th.glow, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.55 }} pointerEvents="none" />
      <LinearGradient colors={['transparent', th.glow2]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 1 }} pointerEvents="none" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={s.head}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back"><ChevronLeft size={rs(24)} color={th.text} /></TouchableOpacity>
          <Text style={[s.kicker, { color: th.muted }]} numberOfLines={1}>{th.room.toUpperCase()}</Text>
          {own ? <View style={{ width: rs(34) }} /> : (
            <TouchableOpacity style={[s.iconBtn, { borderColor: th.border }]} onPress={safety} hitSlop={HIT_SLOP} accessibilityLabel="Report or block">
              <MoreHorizontal size={rs(18)} color={th.muted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>
          <Animated.View style={[s.hero, riseStyle]}>
            <LinearGradient colors={[th.accent, th.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.ring, { shadowColor: th.accent }]}>
              <View style={[s.ava, { backgroundColor: th.surface, borderColor: th.bg }]}>
                {pic ? <Image source={{ uri: pic }} style={s.fill} /> : <Text style={[s.initial, { color: th.accent }]}>{name[0]?.toUpperCase() || 'A'}</Text>}
              </View>
            </LinearGradient>
            <Text style={[s.name, { color: th.text, fontFamily: font }]} numberOfLines={2}>{name}</Text>
            {status ? (
              <View style={[s.status, { borderColor: th.border, backgroundColor: th.tint }]}>
                <View style={[s.dot, s.dotSm, { backgroundColor: th.accent2 }]} />
                <Text style={[s.statusText, { color: th.text }]}>{status}</Text>
              </View>
            ) : null}
            {room.intro ? (
              <Text style={[s.intro, { color: th.muted, fontFamily: font }]}>{room.intro}</Text>
            ) : own ? (
              <Text style={[s.intro, s.introEmpty, { color: th.muted }]}>Add a line about you. It's the first thing visitors read.</Text>
            ) : null}
          </Animated.View>

          {post ? (
            <Animated.View style={[s.card, card, !live && { opacity: 0.7 }, riseStyle]}>
              <View style={s.labelRow}>
                <Text style={[s.label, { color: th.muted }]}>THROUGH THE WINDOW</Text>
                <Text style={[s.chip, { borderColor: live && !isConfession ? th.borderStrong : th.border, color: live && !isConfession ? th.accent : th.muted }]}>
                  {isConfession ? 'Confession' : live ? (left ? `Tonight · ${left}` : 'Live') : 'Ended'}
                </Text>
              </View>
              {!!h && (
                <View style={s.facts}>
                  <Text style={[s.age, { color: th.text }]}>{h.age}</Text>
                  {!!h.area && <Text style={[s.fact, { color: th.muted }]}>{h.area}</Text>}
                  {!!h.looking_for && <Text style={[s.fact, { color: th.muted }]}>· into {h.looking_for}</Text>}
                </View>
              )}
              {!!post.content && <Text style={[s.postText, { color: th.text }]}>“{post.content}”</Text>}
              {!!h?.vibes?.length && (
                <View style={s.chips}>{h.vibes.map((v) => <Text key={v} style={[s.vibe, { borderColor: th.borderStrong, color: th.text }]}>{v}</Text>)}</View>
              )}
              {!!post.linkup_count && <Text style={[s.fine, { color: th.muted, textAlign: 'left' }]}>{post.linkup_count} {post.linkup_count === 1 ? 'knock' : 'knocks'} on this one</Text>}
            </Animated.View>
          ) : null}

          {gallery.length || veiled ? (
            <View>
              <Text style={[s.label, { color: th.muted, marginBottom: rp(10) }]}>ON THE WALLS</Text>
              <View style={s.grid}>
                {gallery.map((g, k) => <Frame key={k} item={g} index={k} th={th} onPress={() => setBig(g)} />)}
                {Array.from({ length: veiled }).map((_, k) => (
                  <View key={`v${k}`} style={s.frameWrap}>
                    <LinearGradient colors={[th.surface, th.bg]} style={[s.frame, s.veiled, { borderColor: th.border }]}>
                      <Lock size={rs(18)} color={th.accent} strokeWidth={2} />
                    </LinearGradient>
                  </View>
                ))}
              </View>
              {veiled ? <Text style={[s.fine, { color: th.muted, textAlign: 'left', marginTop: rp(8) }]}>{name} keeps {veiled === 1 ? 'this photo' : 'these photos'} for people they let in.</Text> : null}
            </View>
          ) : own ? (
            <View style={[s.card, card]}>
              <Text style={[s.noteText, { color: th.muted }]}>Your walls are bare. Hang up to 3 photos so visitors know who they're knocking for.</Text>
            </View>
          ) : null}

          {inc ? (
            <View style={[s.card, { backgroundColor: th.tint, borderColor: th.borderStrong }]}>
              <Text style={[s.label, { color: th.muted, marginBottom: rp(8) }]}>{name.toUpperCase()} KNOCKED ON YOUR DOOR</Text>
              <Text style={[s.pitchText, { color: th.text }]}>{inc.pitch ? `“${inc.pitch}”` : 'No message, just the knock.'}</Text>
              <KnockClues item={inc} onOpenMedia={(m) => setBig({ media_url: m.url, media_type: m.type })} />
              {!!inc.intents?.length && (
                <View style={s.chips}>{inc.intents.map((i) => <Text key={i} style={[s.vibe, { borderColor: th.borderStrong, color: th.text }]}>{intentLabel(i)}</Text>)}</View>
              )}
            </View>
          ) : null}

          {!own && !cid && !inc ? (
            <View style={[s.card, card]}>
              <Text style={[s.label, { color: th.muted, marginBottom: rp(10) }]}>BEHIND THE DOOR</Text>
              {[
                `A private conversation with ${name}. No timer, no charge per message.`,
                `Voice and video calls, if ${name} opens them.`,
                ...(veiled ? [`${veiled} more ${veiled === 1 ? 'photo' : 'photos'} ${name} saves for people inside.`] : []),
              ].map((line) => (
                <View key={line} style={s.doorRow}>
                  <View style={[s.dot, s.dotSm, { backgroundColor: th.accent, marginTop: rp(7) }]} />
                  <Text style={[s.doorText, { color: th.text }]}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={[s.bar, { borderTopColor: th.border, backgroundColor: th.bg }]}>{bar}</View>
      </SafeAreaView>
      {big ? <FullView item={big} onClose={() => setBig(null)} /> : null}
      {entrance && cid ? (
        <Entrance
          th={th} name={name} font={font} welcome={room.welcome_message}
          onStart={(line) => openChat(cid, line)}
          onClose={() => setEntrance(false)}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: rp(10) },
  muted: { color: T.textSecondary, fontSize: FONT.sm, textAlign: 'center' },
  closedTitle: { color: T.text, fontSize: rf(20), fontFamily: 'PlayfairDisplay-Italic' },
  plainHead: { flexDirection: 'row', alignItems: 'center', gap: rp(12), paddingHorizontal: SPACING.md, paddingVertical: rp(12) },
  plainTitle: { color: T.text, fontSize: FONT.lg, fontFamily: 'PlayfairDisplay-Italic' },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rp(10), paddingHorizontal: SPACING.md, paddingVertical: rp(8) },
  kicker: { flex: 1, textAlign: 'center', fontSize: rf(10), letterSpacing: 2 },
  iconBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: SPACING.md, paddingBottom: rp(24), gap: rp(14) },
  hero: { alignItems: 'center', paddingTop: rp(6) },
  ring: { width: rs(112), height: rs(112), borderRadius: rs(56), padding: rs(3), shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  ava: { flex: 1, borderRadius: rs(53), borderWidth: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: rf(38), fontWeight: '700' },
  name: { marginTop: rp(14), fontSize: rf(27), textAlign: 'center' },
  status: { marginTop: rp(10), flexDirection: 'row', alignItems: 'center', gap: rp(7), borderWidth: 1, borderRadius: 999, paddingHorizontal: rp(11), paddingVertical: rp(5) },
  statusText: { fontSize: rf(12), fontWeight: '600' },
  intro: { marginTop: rp(12), fontSize: rf(15), lineHeight: rf(22), textAlign: 'center', maxWidth: '88%' },
  introEmpty: { fontSize: rf(13), textDecorationLine: 'underline', textDecorationStyle: 'dotted' },

  card: { borderRadius: rs(20), borderWidth: 1, padding: rp(16), gap: rp(8) },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rp(8) },
  label: { fontSize: rf(10), letterSpacing: 1.6, fontWeight: '600' },
  chip: { fontSize: rf(11), fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: rp(9), paddingVertical: rp(3), overflow: 'hidden' },
  facts: { flexDirection: 'row', alignItems: 'baseline', gap: rp(8), flexWrap: 'wrap' },
  age: { fontSize: rf(22), fontFamily: 'PlayfairDisplay-Bold' },
  fact: { fontSize: FONT.sm },
  postText: { fontSize: rf(17), lineHeight: rf(24), fontFamily: 'PlayfairDisplay-Italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6) },
  vibe: { fontSize: rf(11), borderWidth: 1, paddingHorizontal: rp(9), paddingVertical: rp(3), borderRadius: 999 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  frameWrap: { width: '31.6%' },
  frame: { width: '100%', aspectRatio: 3 / 4, borderRadius: rs(14), borderWidth: 1, overflow: 'hidden' },
  veiled: { alignItems: 'center', justifyContent: 'center' },
  noteText: { fontSize: FONT.sm, lineHeight: FONT.sm * 1.45 },
  pitchMedia: { width: rs(200), height: rs(200), borderRadius: RADIUS.md },
  pitchText: { fontSize: FONT.md, lineHeight: FONT.md * 1.45 },
  doorRow: { flexDirection: 'row', gap: rp(10) },
  doorText: { flex: 1, fontSize: FONT.sm, lineHeight: FONT.sm * 1.5 },

  bar: { flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingHorizontal: SPACING.md, paddingVertical: rp(12), borderTopWidth: 1 },
  barText: { flex: 1, fontSize: FONT.sm, lineHeight: FONT.sm * 1.45 },
  ghostBtn: { height: rs(48), paddingHorizontal: rp(16), borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  smBtn: { height: rs(38), paddingHorizontal: rp(12) },
  ghostText: { fontWeight: '700', fontSize: FONT.sm },
  accentBtn: { height: rs(48), borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(16) },
  accentText: { fontWeight: '800', fontSize: FONT.sm },
  inRow: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  inText: { fontWeight: '700', fontSize: FONT.sm },
  dot: { width: rs(9), height: rs(9), borderRadius: rs(5) },
  dotSm: { width: rs(7), height: rs(7) },
  knock: { height: rs(54), borderRadius: rs(16), flexDirection: 'row', alignItems: 'center', gap: rp(10), paddingLeft: rp(18), paddingRight: rp(8) },
  knockText: { flex: 1, fontSize: FONT.md, fontWeight: '800' },
  freePill: { borderRadius: 999, paddingHorizontal: rp(10), paddingVertical: rp(6), opacity: 0.85 },
  freeText: { fontSize: rf(11), fontWeight: '700' },
  fine: { fontSize: rf(12), lineHeight: rf(17), textAlign: 'center' },

  fullBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  fullWrap: { width: '100%', height: '78%' },
  fullX: { position: 'absolute', top: rp(16), right: rp(16), width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  enter: { flex: 1 },
  enterIn: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingVertical: rp(48), gap: rp(12) },
  door: { width: rs(64), height: rs(92), borderTopLeftRadius: rs(32), borderTopRightRadius: rs(32), borderBottomLeftRadius: rs(6), borderBottomRightRadius: rs(6), borderWidth: 1, shadowOpacity: 0.8, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, marginBottom: rp(6) },
  enterKicker: { fontSize: rf(12), letterSpacing: 2, fontWeight: '700' },
  enterTitle: { fontSize: rf(25), textAlign: 'center', lineHeight: rf(31) },
  quote: { alignSelf: 'stretch', borderWidth: 1, borderRadius: rs(14), padding: rp(14) },
  quoteText: { fontSize: FONT.md, lineHeight: FONT.md * 1.45 },
  startersHint: { fontSize: rf(12), textAlign: 'center', marginTop: rp(6) },
  starter: { alignSelf: 'stretch', borderWidth: 1, borderRadius: rs(12), paddingHorizontal: rp(14), paddingVertical: rp(11) },
  starterText: { fontSize: FONT.sm },
  linkText: { fontSize: FONT.sm, paddingVertical: rp(8) },
});
