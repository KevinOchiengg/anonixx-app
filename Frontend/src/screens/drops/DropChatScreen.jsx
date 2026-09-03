/**
 * DropChatScreen
 *
 * Anonymous chat for Drops connections. Includes reveal ceremony flow.
 *
 * Rebuilt to match DropsComposeScreen design language:
 *   • shared `T` palette
 *   • DropScreenHeader with anonymous name + reveal right-action
 *   • useToast (replaces Alert.alert)
 *   • responsive tokens (no hardcoded pixels)
 *   • PlayfairDisplay-Italic for anon names, reveal ceremony, confession banner
 *   • DMSans for chrome + message bodies
 *   • 320 ms entrance fade
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Modal, Image, ScrollView, Pressable, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Audio } from 'expo-av';
import {
  Send, Sparkles, CheckCircle, Eye, X, Video, Phone, MoreVertical,
  Mic, Play, Pause, RotateCcw, Settings, Flag, ShieldOff, Users, AlertTriangle,
} from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, SCREEN,
} from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import PulseLoader from '../../components/common/PulseLoader';
import ChatBackground from '../../components/chat/ChatBackground';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { WELCOME_SOUND_MAP } from '../../config/sounds';
import { CHAT_FONT_MAP, DEFAULT_CHAT_FONT } from '../../config/fonts';
import { DEFAULT_BACKGROUND_PATTERN } from '../../config/patterns';
import { useUnread } from '../../context/UnreadContext';

const REVEAL_PRICE = 1.0;
const POLL_INTERVAL_MS = 8000;
const REVEAL_POLL_MS   = 5000;
const MAX_REVEAL_ATTEMPTS = 24;

// ─── Mood board — 33 procedurally-styled cards shown while waiting for a
// first reply. Intentionally abstract (gradient + symbol, no photos) so it
// can never be mistaken for the other person's real pictures — Anonixx
// doesn't do real photos in the unlock flow at all, this is mood only.
const MOOD_SYMBOLS = ['🔥', '😈', '💋', '🖤', '✨', '🌙', '⛓️', '🍒', '😏', '💦', '🌹'];
const MOOD_GRADIENTS = [
  ['#2a0f18', '#14060a'],
  ['#1a0824', '#08020c'],
  ['#0a0418', '#02030a'],
  ['#3a0d1f', '#160510'],
];
const MOOD_CARDS = Array.from({ length: 33 }, (_, i) => ({
  id: i,
  symbol: MOOD_SYMBOLS[i % MOOD_SYMBOLS.length],
  gradient: MOOD_GRADIENTS[i % MOOD_GRADIENTS.length],
}));

// ─── Mood board — shown until the other person's first reply arrives ───
const MoodBoard = React.memo(() => (
  <View style={s.moodBoardWrap}>
    <Text style={s.moodBoardLabel}>their mood, while you wait</Text>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.moodBoardScroll}
    >
      {MOOD_CARDS.map((card) => (
        <LinearGradient
          key={card.id}
          colors={card.gradient}
          style={s.moodCard}
        >
          <Text style={s.moodCardSymbol}>{card.symbol}</Text>
        </LinearGradient>
      ))}
    </ScrollView>
  </View>
));

// ─── Voice note bubble — play/pause + duration, no autoplay ────
const VoiceBubble = React.memo(({ item, isOwn }) => {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [isFinished, setIsFinished] = useState(false);
  const pendingPlay = useRef(false);

  useEffect(() => {
    if (status.status === 'readyToPlay' && pendingPlay.current) {
      pendingPlay.current = false;
      player.play();
    }
  }, [status.status]);

  useEffect(() => {
    if (status.didJustFinish) {
      setIsFinished(true);
      player.seekTo(0);
    }
  }, [status.didJustFinish]);

  const handlePress = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (status.status === 'idle') {
        pendingPlay.current = true;
        player.replace({ uri: item.media_url });
      } else if (isFinished) {
        setIsFinished(false);
        player.seekTo(0);
        player.play();
      } else if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch { /* silent */ }
  }, [status.status, status.playing, isFinished, player]);

  const progress = isFinished ? 0 : (status.duration > 0 ? (status.currentTime || 0) / status.duration : 0);
  const displaySecs = (status.playing || (!isFinished && status.status === 'readyToPlay'))
    ? Math.floor(status.currentTime || 0)
    : Math.floor(status.duration || item.duration_seconds || 0);
  const timeLabel = `${Math.floor(displaySecs / 60)}:${String(displaySecs % 60).padStart(2, '0')}`;
  const isLoading = status.status === 'loading';
  const PlayIcon = isFinished ? RotateCcw : status.playing ? Pause : Play;

  return (
    <View style={s.voiceRow}>
      <TouchableOpacity
        onPress={handlePress}
        hitSlop={HIT_SLOP}
        activeOpacity={0.8}
        style={[s.voicePlayBtn, isOwn ? s.voicePlayBtnOwn : s.voicePlayBtnTheir]}
      >
        {isLoading
          ? <ActivityIndicator size="small" color={isOwn ? T.primary : '#fff'} />
          : <PlayIcon size={rs(15)} color={isOwn ? T.primary : '#fff'} strokeWidth={2.4} fill={status.playing ? (isOwn ? T.primary : '#fff') : 'none'} />}
      </TouchableOpacity>
      <View style={s.voiceTrack}>
        <View style={[s.voiceTrackFill, isOwn && s.voiceTrackFillOwn, { width: `${Math.max(progress * 100, 3)}%` }]} />
      </View>
      <Text style={[s.voiceTimeLabel, isOwn && s.voiceTimeLabelOwn]}>{timeLabel}</Text>
    </View>
  );
});

// ─── Message bubble ────────────────────────────────────────────
const Bubble = React.memo(({ item, fontFamily }) => {
  const isOwn = item.is_own;
  if (item.media_type === 'voice' && item.media_url) {
    return (
      <View style={[s.msgRow, isOwn && s.msgRowOwn]}>
        <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleTheir]}>
          <VoiceBubble item={item} isOwn={isOwn} />
          <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>{item.time_ago}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.msgRow, isOwn && s.msgRowOwn]}>
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleTheir]}>
        <Text style={[s.bubbleText, fontFamily && { fontFamily }, isOwn && s.bubbleTextOwn]}>
          {item.content}
        </Text>
        <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>
          {item.time_ago}
        </Text>
      </View>
    </View>
  );
});

// ─── One page of the welcome gallery — its own component so useVideoPlayer
// is only ever called once per item, not conditionally inside a .map() ──
const WelcomeGalleryPage = React.memo(({ item }) => {
  const isVideo = item?.media_type === 'video' && !!item?.media_url;
  const player = useVideoPlayer(
    isVideo ? { uri: item.media_url } : null,
    (p) => { p.loop = true; p.play(); },
  );

  if (!item?.media_url) return null;

  return isVideo ? (
    <VideoView player={player} style={s.welcomeMedia} contentFit="cover" />
  ) : (
    // Image handles animated gifs natively — same component for image/gif.
    <Image source={{ uri: item.media_url }} style={s.welcomeMedia} resizeMode="cover" />
  );
});

// ─── Welcome gallery takeover — up to 3 swipeable items (image/video/gif),
// shown once per unlocker on first open, to entertain them if the host
// isn't online yet ──
const WelcomeGalleryOverlay = React.memo(({ gallery, onDismiss }) => {
  const [page, setPage] = useState(0);
  const items = (gallery || []).filter((m) => m?.media_url).slice(0, 3);
  if (!items.length) return null;

  const handleScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN.width);
    setPage(idx);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDismiss}>
      <View style={s.welcomeOverlay}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {items.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              activeOpacity={1}
              onPress={onDismiss}
              style={{ width: SCREEN.width, alignItems: 'center', justifyContent: 'center' }}
            >
              <WelcomeGalleryPage item={item} />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {items.length > 1 && (
          <View style={s.welcomeDots} pointerEvents="none">
            {items.map((_, idx) => (
              <View key={idx} style={[s.welcomeDot, idx === page && s.welcomeDotActive]} />
            ))}
          </View>
        )}

        <TouchableOpacity style={s.welcomeClose} onPress={onDismiss} hitSlop={HIT_SLOP}>
          <X size={rs(18)} color="#fff" />
        </TouchableOpacity>

        <Text style={s.welcomeHint}>
          {items.length > 1 ? 'swipe to see more · tap to continue' : 'tap anywhere to continue'}
        </Text>
      </View>
    </Modal>
  );
});

// ─── Empty chat ────────────────────────────────────────────────
const EmptyChat = React.memo(() => (
  <View style={s.emptyChat}>
    <Text style={s.emptyChatEmoji}>👋</Text>
    <Text style={s.emptyChatText}>
      Say hi — you're both anonymous. Break the ice.
    </Text>
    <MoodBoard />
  </View>
));

// ─── Main Screen ───────────────────────────────────────────────
export default function DropChatScreen({ route, navigation }) {
  const { connectionId } = route.params;
  const insets          = useSafeAreaInsets();
  const { showToast }   = useToast();
  const { refreshUnread } = useUnread();

  const [messages, setMessages]     = useState([]);
  const [connection, setConnection] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);

  // ── Poster's themed chat surface (per-user chat_profiles doc) ──
  const [chatProfile, setChatProfile]     = useState(null);
  const [welcomeGallery, setWelcomeGallery] = useState([]);
  const [showWelcome, setShowWelcome]     = useState(false);
  // On-demand re-open of the same gallery, any time — not gated to the
  // once-only first-open welcome takeover above.
  const [galleryViewerOpen, setGalleryViewerOpen] = useState(false);
  // Room video call — polled from the same messages fetch (see
  // /drop-calls/start and /:id/join for what actually starts it).
  const [activeCall, setActiveCall]   = useState(null);
  const [callLoading, setCallLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [guestList, setGuestList]       = useState([]);
  const [guestsLoading, setGuestsLoading] = useState(false);

  // ── Voice note recording — press-and-hold mic, mirrors ChatScreen.jsx ──
  const [isRecording, setIsRecording]     = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const recordingRef   = useRef(null);
  const recordTimerRef = useRef(null);
  const pressStartRef  = useRef(0);

  const bubbleFontFamily = useMemo(
    () => CHAT_FONT_MAP[chatProfile?.font_style] || CHAT_FONT_MAP[DEFAULT_CHAT_FONT],
    [chatProfile?.font_style]
  );

  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealStep, setRevealStep]           = useState('idle'); // idle | phone | waiting | polling | done
  const [revealPhone, setRevealPhone]         = useState('');
  const [revealData, setRevealData]           = useState(null);

  const flatListRef  = useRef(null);
  const revealScale  = useRef(new Animated.Value(0)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const pollRef      = useRef(null);
  const revealPollRef = useRef(null);

  // Fires once, the first time an unlocker opens this chat — see
  // Frontend/src/config/sounds.js for what welcome_sound ids resolve to.
  const playWelcomeSound = useCallback(async (soundId) => {
    const asset = WELCOME_SOUND_MAP[soundId];
    if (!asset) return; // 'silence', unset, or no bundled asset yet
    try {
      const { createAudioPlayer } = await import('expo-audio');
      const player = createAudioPlayer(asset);
      player.play();
    } catch {
      /* playback unavailable — welcome media/text still shows */
    }
  }, []);

  // ── Fetchers ──────────────────────────────────────────────
  const checkRevealStatus = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/status`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.revealed) setRevealData(data);
      }
    } catch { /* silent */ }
  }, [connectionId]);

  const loadMessages = useCallback(async (silent = false) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/messages`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setConnection(data.connection);
        if (data.chat_profile) setChatProfile(data.chat_profile);
        setActiveCall(data.active_call || null);
        if ((data.welcome_gallery?.length || data.welcome_sound) && !welcomeGallery.length && !showWelcome) {
          setWelcomeGallery(data.welcome_gallery || []);
          setShowWelcome(true);
          playWelcomeSound(data.welcome_sound);
        }
        if (data.connection?.is_revealed && !revealData) {
          checkRevealStatus();
        }
      } else if (!silent) {
        showToast({ type: 'error', message: "Couldn't load messages." });
      }
    } catch {
      if (!silent) {
        showToast({ type: 'error', message: 'Network error.' });
      }
    }
  }, [connectionId, revealData, checkRevealStatus, showToast, welcomeGallery.length, showWelcome, playWelcomeSound]);

  // ── Initial load + polling ────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadMessages(false);
      setLoading(false);
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 320, useNativeDriver: true,
      }).start();
      // Opening the chat marks it read server-side (see get_drop_messages) —
      // nudge the tab badge now instead of waiting up to 30s for the next poll.
      refreshUnread();
    })();

    pollRef.current = setInterval(() => loadMessages(true), POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollRef.current);
      clearInterval(revealPollRef.current);
      clearInterval(recordTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Send ──────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    setSending(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/message`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
        },
      );
      await loadMessages(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      showToast({ type: 'error', message: 'Failed to send. Try again.' });
    } finally {
      setSending(false);
    }
  }, [text, connectionId, loadMessages, showToast]);

  // ── Voice note — upload direct to Cloudinary (signed), then send as
  //    a media message. Mirrors ChatScreen.jsx's uploadVoice exactly. ──
  const uploadVoice = useCallback(async (uri) => {
    const token = await AsyncStorage.getItem('token');
    const sigRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ resource_type: 'video' }), // Cloudinary uses "video" for audio
    });
    if (!sigRes.ok) {
      const err = await sigRes.json().catch(() => ({}));
      throw new Error(err?.detail || `Signature failed (${sigRes.status})`);
    }
    const { signature, timestamp, api_key, cloud_name, folder } = await sigRes.json();

    const form = new FormData();
    form.append('file',      { uri, name: `voice_${Date.now()}.m4a`, type: 'audio/m4a' });
    form.append('signature', signature);
    form.append('timestamp', String(timestamp));
    form.append('api_key',   api_key);
    form.append('folder',    folder);

    const uploadRes  = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
      { method: 'POST', body: form },
    );
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData?.error?.message || `Cloudinary error (${uploadRes.status})`);
    return uploadData.secure_url;
  }, []);

  const sendVoiceMessage = useCallback(async (mediaUrl, durationSeconds) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/message`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({
            media_url: mediaUrl, media_type: 'voice', duration_seconds: durationSeconds,
          }),
        },
      );
      await loadMessages(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      showToast({ type: 'error', message: 'Voice note sent, but the chat failed to refresh.' });
    }
  }, [connectionId, loadMessages, showToast]);

  const handleVoicePressIn = useCallback(async () => {
    if (isRecording) return;

    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch { /* already stopped */ }
      recordingRef.current = null;
    }

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Microphone permission is needed to record.' });
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:      true,
        playsInSilentModeIOS:    true,
        staysActiveInBackground: false,
        shouldDuckAndroid:       true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current  = recording;
      pressStartRef.current = Date.now();
      setIsRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (e) {
      recordingRef.current = null;
      setIsRecording(false);
      clearInterval(recordTimerRef.current);
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('permission')) {
        showToast({ type: 'warning', message: 'Microphone permission denied.' });
      } else {
        showToast({ type: 'error', message: `Recording error: ${msg || 'Could not start.'}` });
      }
    }
  }, [isRecording, showToast]);

  const handleVoicePressOut = useCallback(async () => {
    if (!isRecording || !recordingRef.current) return;

    clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    const heldMs = Date.now() - pressStartRef.current;

    try {
      const uri = recordingRef.current.getURI();
      const durationSeconds = recordDuration;
      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
      setIsRecording(false);
      setRecordDuration(0);

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      if (heldMs < 500) {
        showToast({ type: 'info', message: 'Hold to record, release to send.' });
        return;
      }
      if (!uri) {
        showToast({ type: 'error', message: 'Recording failed — no audio captured.' });
        return;
      }
      setVoiceUploading(true);
      const url = await uploadVoice(uri);
      setVoiceUploading(false);
      if (url) await sendVoiceMessage(url, durationSeconds);
    } catch {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
      recordingRef.current   = null;
      setIsRecording(false);
      setRecordDuration(0);
      setVoiceUploading(false);
      showToast({ type: 'error', message: 'Could not send voice note.' });
    }
  }, [isRecording, recordDuration, uploadVoice, sendVoiceMessage, showToast]);

  // ── Reveal flow ───────────────────────────────────────────
  const startRevealPolling = useCallback(() => {
    let attempts = 0;
    revealPollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > MAX_REVEAL_ATTEMPTS) {
        clearInterval(revealPollRef.current);
        setRevealStep('idle');
        showToast({ type: 'warning', message: 'Payment timed out. Try again.' });
        return;
      }
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/status`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (data.revealed) {
          clearInterval(revealPollRef.current);
          setRevealData(data);
          setRevealStep('done');
          Animated.spring(revealScale, {
            toValue: 1, friction: 5, useNativeDriver: true,
          }).start();
        }
      } catch { /* keep polling */ }
    }, REVEAL_POLL_MS);
  }, [connectionId, revealScale, showToast]);

  const handleRevealMpesa = useCallback(async () => {
    if (!revealPhone.trim()) return;
    setRevealStep('waiting');
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/reveal/mpesa`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({ phone_number: revealPhone.trim() }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setRevealStep('polling');
        startRevealPolling();
      } else {
        showToast({
          type:    'error',
          message: data.detail || 'Payment failed. Try again.',
        });
        setRevealStep('phone');
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong.' });
      setRevealStep('phone');
    }
  }, [revealPhone, connectionId, startRevealPolling, showToast]);

  // ── Helpers ───────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }) => <Bubble item={item} fontFamily={bubbleFontFamily} />,
    [bubbleFontFamily],
  );
  const keyExtractor  = useCallback((item) => item.id, []);

  const handleDismissWelcome = useCallback(() => setShowWelcome(false), []);

  const handleStartCall = useCallback(async (isAudioOnly = false) => {
    if (callLoading) return;
    setCallLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drop-calls/start`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not start the call.');
      navigation.navigate('DropCall', {
        callId: data.call_id, channel: data.channel, token: data.token,
        uid: data.uid, appId: data.app_id, isHost: true, isAudioOnly,
      });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Could not start the call.' });
    } finally {
      setCallLoading(false);
    }
  }, [callLoading, navigation, showToast]);

  const handleJoinCall = useCallback(async (isAudioOnly = false) => {
    if (callLoading || !activeCall) return;
    setCallLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drop-calls/${activeCall.id}/join`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not join the call.');
      navigation.navigate('DropCall', {
        callId: data.call_id, channel: data.channel, token: data.token,
        uid: data.uid, appId: data.app_id, isHost: false, isAudioOnly,
        hostName: connection?.other_anonymous_name || 'Anonymous',
      });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Could not join the call.' });
    } finally {
      setCallLoading(false);
    }
  }, [callLoading, activeCall, navigation, showToast, connection]);

  // Header call icons — host starts either flavor, guest joins whichever
  // is live. No lock/paywall here, unlike ChatScreen's unlockedFeatures —
  // every host's room supports both from the moment they unlock chat.
  const handlePressAudio = useCallback(() => {
    if (connection?.is_sender) return handleStartCall(true);
    if (activeCall) return handleJoinCall(true);
    showToast({ type: 'info', message: 'No live call right now.' });
  }, [connection, activeCall, handleStartCall, handleJoinCall, showToast]);

  const handlePressVideo = useCallback(() => {
    if (connection?.is_sender) return handleStartCall(false);
    if (activeCall) return handleJoinCall(false);
    showToast({ type: 'info', message: 'No live call right now.' });
  }, [connection, activeCall, handleStartCall, handleJoinCall, showToast]);

  const handleOpenReveal = useCallback(() => {
    setRevealStep('idle');
    setShowRevealModal(true);
  }, []);

  // ── 3-dot menu — roster behind the room, host/guest specific actions ──
  useEffect(() => {
    if (!showMoreMenu || !connection?.host_user_id) return;
    (async () => {
      setGuestsLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/drops/room/${connection.host_user_id}/guests`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setGuestList(data.guests || []);
        }
      } catch { /* silent — roster is a nice-to-have in this sheet */ }
      setGuestsLoading(false);
    })();
  }, [showMoreMenu, connection?.host_user_id]);

  const handleOpenSettings = useCallback(() => {
    setShowMoreMenu(false);
    navigation.navigate('ChatProfileSetup');
  }, [navigation]);

  const handleBlockHost = useCallback(() => {
    if (!connection?.host_user_id) return;
    Alert.alert(
      'Block this person?',
      "They won't be able to reach you, and their content will be hidden from your feed and Drops.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block', style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const res   = await fetch(`${API_BASE_URL}/api/v1/users/${connection.host_user_id}/block`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error();
              setShowMoreMenu(false);
              showToast({ type: 'success', message: 'User blocked.' });
              navigation.goBack();
            } catch {
              showToast({ type: 'error', message: 'Could not block. Try again.' });
            }
          },
        },
      ],
    );
  }, [connection, navigation, showToast]);

  const handleReportHost = useCallback(() => {
    if (!connection?.host_user_id) return;
    const reasons = [
      { id: 'abuse',             label: 'Abuse or harassment' },
      { id: 'spam',              label: 'Spam' },
      { id: 'explicit',          label: 'Unwanted explicit content' },
      { id: 'self-harm-concern', label: "I'm worried about them" },
      { id: 'other',             label: 'Other' },
    ];
    Alert.alert(
      'Report this person',
      "What's the issue?",
      [
        ...reasons.map((r) => ({
          text: r.label,
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const res   = await fetch(`${API_BASE_URL}/api/v1/users/${connection.host_user_id}/report`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body:    JSON.stringify({ reason: r.id }),
              });
              if (!res.ok) throw new Error();
              setShowMoreMenu(false);
              showToast({ type: 'success', message: 'Report received. Thank you.' });
            } catch {
              showToast({ type: 'error', message: 'Could not send report. Try again.' });
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [connection, showToast]);

  // Only the unlocker can file this — they're the one who actually paid
  // coins to link up, so they're the one who can say it was a bait
  // confession. An admin reviews before any refund/strike happens.
  const handleReportDeceptive = useCallback(() => {
    if (!connectionId) return;
    Alert.alert(
      'This confession was fake?',
      "We'll review it. If confirmed, you get your coins back and they take a strike.",
      [
        {
          text: 'Report it', style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const res   = await fetch(`${API_BASE_URL}/api/v1/deception-reports`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body:    JSON.stringify({ connection_id: connectionId }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.detail || 'Could not send report.');
              setShowMoreMenu(false);
              showToast({ type: 'success', message: 'Report sent for review.' });
            } catch (e) {
              showToast({ type: 'error', message: e.message || 'Could not send report. Try again.' });
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [connectionId, showToast]);

  // Header right: audio / video call icons + reveal pill/tag + 3-dot menu —
  // the room's controls live in the header now, not a full-width bar.
  const HeaderRight = useMemo(() => {
    if (!connection) return null;
    const callLive = !!activeCall;
    return (
      <View style={s.headerActions}>
        <TouchableOpacity
          style={[s.headerActionBtn, callLive && s.headerActionBtnLive]}
          onPress={handlePressAudio}
          disabled={callLoading}
          hitSlop={HIT_SLOP}
          activeOpacity={0.75}
        >
          <Phone size={rs(15)} color={callLive ? T.primary : T.textMute} strokeWidth={1.8} />
          {callLive && <View style={s.liveDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.headerActionBtn, callLive && s.headerActionBtnLive]}
          onPress={handlePressVideo}
          disabled={callLoading}
          hitSlop={HIT_SLOP}
          activeOpacity={0.75}
        >
          <Video size={rs(15)} color={callLive ? T.primary : T.textMute} strokeWidth={1.8} />
          {callLive && <View style={s.liveDot} />}
        </TouchableOpacity>

        {connection.is_revealed ? (
          <View style={s.revealedTag}>
            <CheckCircle size={rs(13)} color={T.success} strokeWidth={2} />
          </View>
        ) : (
          <TouchableOpacity
            style={s.revealBtn}
            onPress={handleOpenReveal}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            <Sparkles size={rs(14)} color={T.primary} strokeWidth={2} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={s.headerActionBtn}
          onPress={() => setShowMoreMenu(true)}
          hitSlop={HIT_SLOP}
          activeOpacity={0.75}
        >
          <MoreVertical size={rs(15)} color={T.textMute} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>
    );
  }, [connection, activeCall, callLoading, handlePressAudio, handlePressVideo, handleOpenReveal]);

  const headerTitle = useMemo(() => {
    if (!connection) return 'Anonymous';
    if (revealData?.revealed_name) {
      return `${revealData.revealed_name}`;
    }
    return connection.other_anonymous_name || 'Anonymous';
  }, [connection, revealData]);

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.safe, s.centered]} edges={['top', 'left', 'right']}>
        <PulseLoader size={52} color={T.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <DropScreenHeader
        title={headerTitle}
        navigation={navigation}
        right={HeaderRight}
      />

      <ChatBackground
        pattern={chatProfile?.background_pattern || DEFAULT_BACKGROUND_PATTERN}
        style={{ flex: 1 }}
      >

      {/* Poster's profile picture — only ever visible post-unlock, since
          this connection doc wouldn't exist otherwise. Falls back to their
          account avatar_url (see chat_profile.py's _sanitize), then to a
          first-initial circle if no photo exists anywhere. Tappable into
          the gallery any time it has items, for either side of the chat —
          not just the unlocker's one-time welcome takeover below. */}
      {chatProfile && (
        <TouchableOpacity
          style={s.profileRow}
          activeOpacity={chatProfile?.gallery?.length ? 0.8 : 1}
          onPress={() => chatProfile?.gallery?.length && setGalleryViewerOpen(true)}
        >
          <View>
            {chatProfile.profile_picture_url ? (
              <Image source={{ uri: chatProfile.profile_picture_url }} style={s.profileAvatar} />
            ) : (
              <View style={[s.profileAvatar, s.profileAvatarInitialWrap]}>
                <Text style={s.profileAvatarInitialText}>
                  {headerTitle?.[0]?.toUpperCase() || 'A'}
                </Text>
              </View>
            )}
            {chatProfile?.gallery?.length > 0 && (
              <View style={s.galleryBadge}>
                <Text style={s.galleryBadgeText}>{chatProfile.gallery.length}</Text>
              </View>
            )}
          </View>
          {chatProfile?.gallery?.length > 0 && (
            <Text style={s.galleryHint}>tap to view gallery</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Live-call status strip — the actual join/start controls now live
          in the header (Phone/Video icons); this just tells guests the
          room is occupied before they tap in. */}
      {activeCall ? (
        <View style={s.liveStrip}>
          <View style={s.liveStripDot} />
          <Text style={s.liveStripText}>
            {connection?.is_sender ? 'Your call is live' : 'Call live'} — {activeCall.guest_count}/{activeCall.max_guests} in room
          </Text>
        </View>
      ) : null}

      {showWelcome && welcomeGallery.length > 0 && (
        <WelcomeGalleryOverlay gallery={welcomeGallery} onDismiss={handleDismissWelcome} />
      )}

      {galleryViewerOpen && (
        <WelcomeGalleryOverlay
          gallery={chatProfile?.gallery || []}
          onDismiss={() => setGalleryViewerOpen(false)}
        />
      )}

      {/* Was-anonymous-as subtitle when revealed */}
      {revealData?.revealed_name && connection?.other_anonymous_name ? (
        <Text style={s.wasAnon}>
          was <Text style={{ color: T.primary }}>{connection.other_anonymous_name}</Text>
        </Text>
      ) : null}

      {/* Confession banner */}
      {connection?.confession ? (
        <View style={s.confessionBanner}>
          <Text style={s.confessionBannerKicker}>THEIR CONFESSION</Text>
          <Text style={s.confessionBannerText} numberOfLines={2}>
            "{connection.confession}"
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          {messages.length === 0 ? (
            <EmptyChat />
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={s.messageList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              initialNumToRender={14}
              maxToRenderPerBatch={10}
              windowSize={10}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: false })
              }
            />
          )}
        </Animated.View>

        {/* Input */}
        <View style={[s.inputBar, { paddingBottom: insets.bottom + rp(8) }]}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="say what you came here for…"
            placeholderTextColor={T.textMute}
            multiline
            maxLength={500}
          />

          {/* Voice note — press and hold to record, release to send */}
          <Pressable
            onPressIn={handleVoicePressIn}
            onPressOut={handleVoicePressOut}
            style={({ pressed }) => [
              s.micBtn,
              isRecording && s.micBtnRecording,
              pressed && !isRecording && { opacity: 0.7 },
            ]}
            hitSlop={HIT_SLOP}
          >
            {isRecording ? (
              <>
                <Mic size={rs(16)} color="#fff" strokeWidth={2} />
                <Text style={s.recordDurationLabel}>
                  {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}
                </Text>
              </>
            ) : voiceUploading ? (
              <ActivityIndicator size="small" color={T.primary} />
            ) : (
              <Mic size={rs(16)} color={T.textMute} strokeWidth={1.6} />
            )}
          </Pressable>

          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Send size={rs(18)} color="#fff" strokeWidth={2.2} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </ChatBackground>

      {/* ── Reveal modal ── */}
      <Modal
        visible={showRevealModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRevealModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {revealStep === 'done' ? (
              <Animated.View style={[s.revealSuccess, { transform: [{ scale: revealScale }] }]}>
                <Text style={s.revealSuccessEmoji}>🎭</Text>
                <Text style={s.revealSuccessKicker}>MYSTERY SOLVED</Text>
                <Text style={s.revealSuccessName}>{revealData?.revealed_name}</Text>
                <Text style={s.revealSuccessSub}>
                  <Text style={{ fontFamily: 'PlayfairDisplay-Italic' }}>
                    {connection?.other_anonymous_name}
                  </Text>
                  {' was '}
                  <Text style={{ color: T.primary, fontFamily: 'DMSans-Bold' }}>
                    {revealData?.revealed_name}
                  </Text>
                  {' all along.'}
                </Text>
                <TouchableOpacity
                  style={s.revealDoneBtn}
                  onPress={() => setShowRevealModal(false)}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.9}
                >
                  <Text style={s.revealDoneBtnText}>Close</Text>
                </TouchableOpacity>
              </Animated.View>

            ) : revealStep === 'polling' || revealStep === 'waiting' ? (
              <View style={s.revealWaiting}>
                <PulseLoader size={48} color={T.primary} />
                <Text style={s.revealWaitTitle}>
                  {revealStep === 'waiting'
                    ? 'Sending STK push…'
                    : 'Waiting for payment…'}
                </Text>
                <Text style={s.revealWaitSub}>
                  Enter your M-Pesa PIN on your phone
                </Text>
              </View>

            ) : (
              <>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>Reveal Identity</Text>
                <Text style={s.modalSub}>
                  Pay ${REVEAL_PRICE.toFixed(2)} to find out who{' '}
                  <Text style={{ color: T.primary, fontFamily: 'PlayfairDisplay-Italic' }}>
                    {connection?.other_anonymous_name}
                  </Text>
                  {' '}really is. Only their first name is revealed.
                </Text>

                <View style={s.revealPreviewCard}>
                  <Eye size={rs(22)} color={T.primary} strokeWidth={1.8} />
                  <Text style={s.revealPreviewTitle}>What you'll get</Text>
                  <Text style={s.revealPreviewText}>
                    Their real first name — the mystery becomes a person.
                  </Text>
                </View>

                {revealStep === 'phone' ? (
                  <>
                    <Text style={s.phoneLabel}>M-Pesa number</Text>
                    <View style={s.phoneRow}>
                      <TextInput
                        style={s.phoneInput}
                        value={revealPhone}
                        onChangeText={setRevealPhone}
                        placeholder="2547XXXXXXXX"
                        placeholderTextColor={T.textMute}
                        keyboardType="phone-pad"
                        maxLength={12}
                      />
                      <TouchableOpacity
                        style={[s.payBtn, !revealPhone.trim() && { opacity: 0.4 }]}
                        onPress={handleRevealMpesa}
                        disabled={!revealPhone.trim()}
                        hitSlop={HIT_SLOP}
                        activeOpacity={0.85}
                      >
                        <Text style={s.payBtnText}>Pay $1</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => setRevealStep('idle')}
                      hitSlop={HIT_SLOP}
                      style={s.cancelBtn}
                    >
                      <Text style={s.cancelBtnText}>Back</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={s.mpesaBtn}
                      onPress={() => setRevealStep('phone')}
                      hitSlop={HIT_SLOP}
                      activeOpacity={0.9}
                    >
                      <Text style={s.mpesaIcon}>📱</Text>
                      <Text style={s.mpesaBtnText}>Pay with M-Pesa</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowRevealModal(false)}
                      hitSlop={HIT_SLOP}
                      style={s.cancelBtn}
                    >
                      <Text style={s.cancelBtnText}>Maybe later</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 3-dot menu — room roster + host/guest actions ── */}
      <Modal
        visible={showMoreMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
        >
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.menuHeaderRow}>
              <Users size={rs(16)} color={T.textMute} strokeWidth={1.8} />
              <Text style={s.menuHeaderText}>
                {connection?.is_sender ? 'Your room' : `${headerTitle}'s room`}
              </Text>
            </View>

            {guestsLoading ? (
              <ActivityIndicator size="small" color={T.primary} style={{ marginVertical: rp(16) }} />
            ) : guestList.length > 0 ? (
              <ScrollView style={s.guestListScroll} showsVerticalScrollIndicator={false}>
                {guestList.map((g) => (
                  <View key={g.user_id} style={s.guestRow}>
                    <View style={s.guestRowLeft}>
                      <View style={s.guestDotWrap}>
                        {g.is_online && <View style={s.guestOnlineDot} />}
                      </View>
                      <Text style={s.guestName}>{g.anonymous_name}</Text>
                    </View>
                    <Text style={s.guestStatus}>{g.is_online ? 'online' : 'offline'}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={s.guestEmptyText}>No one's unlocked this room yet.</Text>
            )}

            <View style={s.menuDivider} />

            {connection?.is_sender ? (
              <TouchableOpacity style={s.menuAction} onPress={handleOpenSettings} hitSlop={HIT_SLOP}>
                <Settings size={rs(16)} color={T.text} strokeWidth={1.8} />
                <Text style={s.menuActionText}>Room settings</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={s.menuAction} onPress={handleReportHost} hitSlop={HIT_SLOP}>
                  <Flag size={rs(16)} color={T.text} strokeWidth={1.8} />
                  <Text style={s.menuActionText}>Report</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.menuAction} onPress={handleReportDeceptive} hitSlop={HIT_SLOP}>
                  <AlertTriangle size={rs(16)} color={T.error || '#E85D5D'} strokeWidth={1.8} />
                  <Text style={[s.menuActionText, { color: T.error || '#E85D5D' }]}>This wasn't real</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.menuAction} onPress={handleBlockHost} hitSlop={HIT_SLOP}>
                  <ShieldOff size={rs(16)} color={T.error || '#E85D5D'} strokeWidth={1.8} />
                  <Text style={[s.menuActionText, { color: T.error || '#E85D5D' }]}>Block</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              onPress={() => setShowMoreMenu(false)}
              hitSlop={HIT_SLOP}
              style={s.cancelBtn}
            >
              <Text style={s.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  centered: { justifyContent: 'center', alignItems: 'center' },

  profileRow: {
    alignItems:      'center',
    paddingVertical: rp(8),
  },
  galleryBadge: {
    position: 'absolute', bottom: -rp(2), right: -rp(2),
    backgroundColor: T.primary, borderRadius: rs(9),
    minWidth: rs(18), height: rs(18), paddingHorizontal: rp(4),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: T.background,
  },
  galleryBadgeText: { fontSize: rf(9), fontWeight: '800', color: '#fff' },
  galleryHint: {
    marginTop: rp(4), fontSize: rf(10), color: T.textMute, fontFamily: 'DMSans-Italic',
  },
  liveStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(6),
    alignSelf: 'center', marginBottom: rp(10),
    paddingHorizontal: rp(12), paddingVertical: rp(6),
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.primaryBorder,
    backgroundColor: T.primaryDim,
  },
  liveStripDot: {
    width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.online,
  },
  liveStripText: { fontSize: rf(11), fontWeight: '700', color: T.primary },

  // Header call/menu icons
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  headerActionBtn: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border, position: 'relative',
  },
  headerActionBtnLive: { borderColor: T.primaryBorder, backgroundColor: T.primaryDim },
  liveDot: {
    position: 'absolute', top: rp(3), right: rp(3),
    width: rs(6), height: rs(6), borderRadius: rs(3),
    backgroundColor: T.online, borderWidth: 1, borderColor: T.background,
  },
  profileAvatar: {
    width:        rs(56),
    height:       rs(56),
    borderRadius: rs(28),
    borderWidth:  2,
    borderColor:  T.primaryBorder,
  },
  profileAvatarInitialWrap: {
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  profileAvatarInitialText: {
    fontSize:   rf(22),
    fontWeight: '700',
    color:      T.primary,
  },
  welcomeOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  welcomeMedia: {
    width:  '88%',
    height: '70%',
    borderRadius: RADIUS.lg,
  },
  welcomeHint: {
    marginTop:  rp(16),
    color:      T.textMute,
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
  },
  welcomeDots: {
    flexDirection: 'row',
    gap:           rp(6),
    marginTop:     rp(14),
  },
  welcomeDot: {
    width: rs(6), height: rs(6), borderRadius: rs(3),
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  welcomeDotActive: { backgroundColor: T.primary, width: rs(16) },
  welcomeClose: {
    position: 'absolute', top: rp(50), right: rp(20),
    width: rs(34), height: rs(34), borderRadius: rs(17),
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Header right
  revealBtn: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor:   T.primaryDim,
    borderWidth:       1,
    borderColor:       T.primaryBorder,
  },
  revealedTag: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor:   T.successDim,
    borderWidth:       1,
    borderColor:       'rgba(34,197,94,0.4)',
  },

  // "was AnonXXX" pill below header after reveal
  wasAnon: {
    fontFamily:        'DMSans-Italic',
    fontSize:          rf(11),
    color:             T.textMute,
    textAlign:         'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(4),
    letterSpacing:     0.4,
  },

  // Confession banner
  confessionBanner: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    backgroundColor:   T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  confessionBannerKicker: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.textMute,
    letterSpacing: 1.8,
    marginBottom:  rp(3),
  },
  confessionBannerText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    lineHeight:    rf(20),
    letterSpacing: 0.2,
  },

  // Messages list
  messageList: {
    padding:       SPACING.md,
    gap:           SPACING.xs,
    paddingBottom: SPACING.lg,
  },
  msgRow:    { flexDirection: 'row', marginBottom: rp(6) },
  msgRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth:          '78%',
    borderRadius:      RADIUS.xl,
    paddingVertical:   rp(10),
    paddingHorizontal: rp(14),
  },
  bubbleOwn: {
    backgroundColor:         T.primary,
    borderBottomRightRadius: rs(4),
  },
  bubbleTheir: {
    backgroundColor:        T.surface,
    borderBottomLeftRadius: rs(4),
    borderWidth:            1,
    borderColor:            T.border,
  },
  bubbleText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      FONT.md,
    color:         T.text,
    lineHeight:    rf(22),
    letterSpacing: 0.2,
  },
  bubbleTextOwn: { color: '#fff' },
  bubbleTime: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    marginTop:     rp(4),
    textAlign:     'right',
    letterSpacing: 0.2,
  },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.65)' },

  // Voice note bubble
  voiceRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(9), minWidth: rs(160),
  },
  voicePlayBtn: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    alignItems: 'center', justifyContent: 'center',
  },
  voicePlayBtnOwn:   { backgroundColor: 'rgba(255,255,255,0.95)' },
  voicePlayBtnTheir: { backgroundColor: T.primary },
  voiceTrack: {
    flex: 1, height: rs(3), borderRadius: rs(2),
    backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden',
  },
  voiceTrackFill: {
    height: '100%', borderRadius: rs(2), backgroundColor: 'rgba(255,255,255,0.95)',
  },
  voiceTrackFillOwn: { backgroundColor: 'rgba(255,255,255,0.95)' },
  voiceTimeLabel: {
    fontFamily: 'DMSans-Bold', fontSize: rf(10), color: 'rgba(255,255,255,0.7)',
    minWidth: rs(26),
  },
  voiceTimeLabelOwn: { color: 'rgba(255,255,255,0.85)' },

  // Empty
  emptyChat: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        SPACING.xl,
  },
  emptyChatEmoji: { fontSize: rf(40), marginBottom: SPACING.md },
  emptyChatText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.md,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(22),
    letterSpacing: 0.3,
  },

  // Mood board
  moodBoardWrap: { marginTop: SPACING.xl, alignSelf: 'stretch' },
  moodBoardLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign:     'center',
    marginBottom:  rp(10),
  },
  moodBoardScroll: {
    paddingHorizontal: SPACING.md,
    gap:               rp(8),
  },
  moodCard: {
    width:          rs(56),
    height:         rs(56),
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    'rgba(255,255,255,0.06)',
  },
  moodCardSymbol: { fontSize: rf(22) },

  // Input bar
  inputBar: {
    flexDirection:     'row',
    alignItems:        'flex-end',
    gap:               rp(10),
    paddingHorizontal: SPACING.md,
    paddingTop:        rp(10),
    borderTopWidth:    1,
    borderTopColor:    T.border,
    backgroundColor:   T.background,
  },
  input: {
    flex:              1,
    backgroundColor:   T.surface,
    borderRadius:      RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
    paddingTop:        rp(10),
    fontFamily:        'DMSans-Regular',
    fontSize:          FONT.md,
    color:             T.text,
    maxHeight:         rs(100),
    borderWidth:       1,
    borderColor:       T.border,
  },
  micBtn: {
    width: rs(40), height: rs(40), borderRadius: rs(20),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: rp(2),
  },
  micBtnRecording: {
    backgroundColor: T.primary,
    borderRadius:    rs(20),
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(4),
    paddingHorizontal: rp(10),
    width: 'auto',
  },
  recordDurationLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         '#fff',
    letterSpacing: 0.5,
    minWidth:      rs(26),
  },
  sendBtn: {
    width:           rs(44),
    height:          rs(44),
    borderRadius:    rs(22),
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOpacity:   0.35,
    shadowRadius:    10,
    shadowOffset:    { width: 0, height: 3 },
    elevation:       4,
  },

  // ── Reveal modal ──
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent:  'flex-end',
  },
  modalSheet: {
    backgroundColor:      T.surface,
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding:              SPACING.lg,
    paddingBottom:        SPACING.xl,
    borderTopWidth:       1,
    borderTopColor:       T.border,
  },
  modalHandle: {
    width:           rs(40),
    height:          rs(4),
    backgroundColor: T.border,
    borderRadius:    rs(2),
    alignSelf:       'center',
    marginBottom:    SPACING.md,
  },
  modalTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(24),
    color:         T.text,
    marginBottom:  rp(8),
    textAlign:     'center',
    letterSpacing: 0.3,
  },
  modalSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(20),
    marginBottom:  SPACING.md,
    letterSpacing: 0.3,
  },

  revealPreviewCard: {
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    alignItems:      'center',
    gap:             rp(6),
    marginBottom:    SPACING.lg,
    borderWidth:     1,
    borderColor:     T.border,
  },
  revealPreviewTitle: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.text,
    letterSpacing: 0.3,
  },
  revealPreviewText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(12),
    color:         T.textSec,
    textAlign:     'center',
    letterSpacing: 0.2,
  },

  mpesaBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rp(10),
    backgroundColor: T.primary,
    borderRadius:    RADIUS.lg,
    paddingVertical: rp(15),
    marginBottom:    SPACING.sm,
    shadowColor:     T.primary,
    shadowOpacity:   0.35,
    shadowRadius:    12,
    shadowOffset:    { width: 0, height: 4 },
    elevation:       4,
  },
  mpesaIcon: { fontSize: rf(20) },
  mpesaBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.4,
  },

  phoneLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.textSec,
    marginBottom:  SPACING.xs,
    letterSpacing: 0.4,
  },
  phoneRow: {
    flexDirection: 'row',
    gap:           rp(10),
    marginBottom:  SPACING.sm,
  },
  phoneInput: {
    flex:              1,
    backgroundColor:   T.surfaceAlt,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    fontFamily:        'DMSans-Regular',
    fontSize:          FONT.md,
    color:             T.text,
    borderWidth:       1,
    borderColor:       T.border,
  },
  payBtn: {
    paddingHorizontal: rp(18),
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    backgroundColor:   T.primary,
    alignItems:        'center',
    justifyContent:    'center',
  },
  payBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         '#fff',
    letterSpacing: 0.4,
  },
  cancelBtn: { alignItems: 'center', paddingVertical: rp(10) },
  cancelBtnText: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
  },

  // 3-dot menu — room roster + actions
  menuHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8),
    marginBottom: SPACING.sm,
  },
  menuHeaderText: {
    fontFamily: 'PlayfairDisplay-Italic', fontSize: rf(16), color: T.text,
  },
  guestListScroll: { maxHeight: rs(220), marginBottom: rp(4) },
  guestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: rp(9),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  guestRowLeft: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  guestDotWrap: { width: rs(8), height: rs(8), alignItems: 'center', justifyContent: 'center' },
  guestOnlineDot: { width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: T.online },
  guestName: {
    fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.text,
  },
  guestStatus: {
    fontFamily: 'DMSans-Italic', fontSize: rf(11), color: T.textMute,
  },
  guestEmptyText: {
    fontFamily: 'DMSans-Italic', fontSize: FONT.sm, color: T.textMute,
    textAlign: 'center', paddingVertical: SPACING.md,
  },
  menuDivider: { height: 1, backgroundColor: T.border, marginVertical: SPACING.sm },
  menuAction: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    paddingVertical: rp(12),
  },
  menuActionText: {
    fontFamily: 'DMSans-Bold', fontSize: FONT.sm, color: T.text, letterSpacing: 0.2,
  },

  // Reveal success
  revealSuccess: { alignItems: 'center', paddingVertical: SPACING.sm },
  revealSuccessEmoji: {
    fontSize:     rf(56),
    marginBottom: SPACING.sm,
  },
  revealSuccessKicker: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 2.2,
    marginBottom:  rp(6),
  },
  revealSuccessName: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(40),
    color:         T.primary,
    marginBottom:  SPACING.sm,
    letterSpacing: 0.3,
  },
  revealSuccessSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.md,
    color:         T.textSec,
    textAlign:     'center',
    marginBottom:  SPACING.lg,
    lineHeight:    rf(22),
    letterSpacing: 0.2,
  },
  revealDoneBtn: {
    backgroundColor:   T.primary,
    borderRadius:      RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical:   rp(14),
    shadowColor:       T.primary,
    shadowOpacity:     0.35,
    shadowRadius:      12,
    shadowOffset:      { width: 0, height: 4 },
    elevation:         4,
  },
  revealDoneBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.4,
  },

  revealWaiting: { alignItems: 'center', padding: SPACING.md, gap: SPACING.sm },
  revealWaitTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.3,
  },
  revealWaitSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.2,
  },
});
