/**
 * DropChatScreen
 *
 * Anonymous chat for Drops connections.
 *
 * Rebuilt to match DropsComposeScreen design language:
 *   • shared `T` palette
 *   • DropScreenHeader with anonymous name
 *   • useToast (replaces Alert.alert)
 *   • responsive tokens (no hardcoded pixels)
 *   • PlayfairDisplay-Italic for anon names, confession banner
 *   • DMSans for chrome + message bodies
 *   • 320 ms entrance fade
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Modal, Image, ScrollView, Pressable, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Swipeable, Pressable as GHPressable, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioRecorder, RecordingPresets,
  requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';
import {
  Send, X, Video, Phone, MoreVertical,
  Mic, Play, Settings, Flag, ShieldOff, Users, AlertTriangle,
  Reply, Trash2,
} from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, SCREEN,
} from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import PulseLoader from '../../components/common/PulseLoader';
import VoiceWaveform from '../../components/common/VoiceWaveform';
import ChatInputBar from '../../components/common/ChatInputBar';
import ChatBackground from '../../components/chat/ChatBackground';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { WELCOME_SOUND_MAP } from '../../config/sounds';
import { CHAT_FONT_MAP, DEFAULT_CHAT_FONT } from '../../config/fonts';
import { DEFAULT_BACKGROUND_PATTERN } from '../../config/patterns';
import { useUnread } from '../../context/UnreadContext';
import { useSocket } from '../../context/SocketContext';

// Real-time delivery (see new_message socket handling below) covers the
// common case now — this is just a safety net for missed/dropped socket
// events, so it can be far less frequent than the old 8s-only polling.
const POLL_INTERVAL_MS = 25000;

// ─── Quick emoji strip — toggled from the input bar's Smile icon ──
const QUICK_EMOJIS = ['🔥','😏','💋','🖤','😈','✨','🥵','👀','💦','🍒','😩','🤍'];

// ─── "Today" / "Yesterday" / date separators between message groups ──
function formatDateLabel(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

// Cloudinary serves a poster frame for any video delivery URL by swapping
// the file extension to an image format — no separate thumbnail upload.
function videoPosterUrl(url) {
  return url ? url.replace(/\.\w+(\?.*)?$/, '.jpg$1') : url;
}

// Short label for the reply banner (the draft, client-side, before the
// server computes its own copy of this same thing) — mirrors
// _message_preview_text in Backend/app/api/v1/drops.py.
function messagePreviewLabel(item) {
  if (!item) return '';
  if (item.deleted) return 'This message was deleted';
  if (item.media_type === 'voice') return '🎙 Voice note';
  if (item.media_type === 'image') return '📷 Photo';
  if (item.media_type === 'video') return '🎥 Video';
  return item.content || '';
}

// Same dedicated avatar palette as MessagesScreen's chat list — deliberately
// not coral (the action color) or gold/violet (already mean coins/premium
// and drop-type chats elsewhere) — kept as its own local copy rather than a
// shared util, matching how each screen in this app already carries its own
// copy of small helpers like this.
const AVATAR_COLORS = ['#C96F53', '#C97B84', '#D98E4A', '#B56576', '#A8674F'];
function avatarColorFor(seed) {
  if (!seed) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const DateSeparator = React.memo(({ label }) => (
  <View style={s.dateSeparatorRow}>
    <Text style={s.dateSeparatorText}>{label}</Text>
  </View>
));

// ─── Typing indicator — an actual bubble in the thread (received-bubble
// shape/shadow), not just the header's "typing…" subtitle — matches the
// mockup, which shows three dots as its own message rather than plain text.
const TypingBubble = React.memo(() => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: 1,   duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.delay(600),
      ]),
    ).start();
    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);
  }, [dot1, dot2, dot3]);

  return (
    <View style={s.msgRow}>
      <View style={[s.bubble, s.bubbleTheir, s.typingBubble]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[s.typingBubbleDot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
});

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
// Shared implementation, see VoiceWaveform.jsx.
const VoiceBubble = React.memo(({ item }) => (
  <VoiceWaveform uri={item.media_url} durationSeconds={item.duration_seconds} />
));

// ─── Quoted reply block — sits above the real content, inside whichever
// container that content itself uses (bubble, media, or the bare voice
// wrap). Not shown at all for messages that aren't replies. ────────────
const ReplyQuote = React.memo(({ replyTo, isOwn, otherName }) => (
  <View style={[s.replyQuote, isOwn && s.replyQuoteOwn]}>
    <View style={[s.replyQuoteBar, isOwn && s.replyQuoteBarOwn]} />
    <View style={{ flex: 1 }}>
      <Text style={[s.replyQuoteName, isOwn && s.replyQuoteNameOwn]} numberOfLines={1}>
        {replyTo.is_own ? 'You' : (otherName || 'them')}
      </Text>
      <Text style={[s.replyQuotePreview, isOwn && s.replyQuotePreviewOwn]} numberOfLines={1}>
        {replyTo.preview}
      </Text>
    </View>
  </View>
));

// ─── Message bubble ────────────────────────────────────────────
// Swipe right (WhatsApp's own direction, regardless of which side the
// bubble is on) to reply; long-press for reply/delete. Both call back up
// to the screen rather than owning any state themselves, since replying
// affects the input bar and deleting affects the whole message list.
const Bubble = React.memo(({ item, fontFamily, onMediaPress, otherName, onReply, onLongPressMessage }) => {
  const isOwn = item.is_own;
  const swipeableRef = useRef(null);
  // WhatsApp-style ticks — single = sent, double (accent-colored) = seen.
  // Only ever shown on my own messages; nothing rendered on received ones.
  const tick = isOwn ? (item.seen ? '✓✓' : '✓') : null;

  const handleSwipeableOpen = useCallback(() => {
    swipeableRef.current?.close();
    onReply?.(item);
  }, [item, onReply]);

  const renderLeftActions = useCallback((progress) => (
    <Animated.View style={[
      s.replyActionWrap,
      { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
    ]}>
      <Reply size={rs(18)} color={T.primary} strokeWidth={2.2} />
    </Animated.View>
  ), []);

  const handleLongPress = useCallback(() => {
    if (item.deleted) return;
    onLongPressMessage?.(item);
  }, [item, onLongPressMessage]);

  let content;

  if (item.deleted) {
    // Same container as a normal text bubble (own/received alike) — just
    // the content replaced, not the shape.
    content = (
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleTheir]}>
        <Text style={[s.deletedText, isOwn && s.deletedTextOwn]}>
          This message was deleted
        </Text>
      </View>
    );
  } else if (item.media_type === 'voice' && item.media_url) {
    // No bubble background here on purpose — voice notes float bare, the
    // same way an image/video attachment does below (see mediaBubble).
    // Only actual text messages get a background container.
    content = (
      <View style={s.voiceMessageWrap}>
        <VoiceBubble item={item} />
        {item.reply_to && <ReplyQuote replyTo={item.reply_to} isOwn={isOwn} otherName={otherName} />}
        <Text style={s.bubbleTime}>
          {item.time_ago}
          {tick && <Text style={item.seen ? s.tickSeen : null}> {tick}</Text>}
        </Text>
      </View>
    );
  } else if ((item.media_type === 'image' || item.media_type === 'video') && item.media_url) {
    const isVideo = item.media_type === 'video';
    content = (
      <GHTouchableOpacity
        activeOpacity={0.9}
        onPress={() => onMediaPress?.(item)}
        onLongPress={handleLongPress}
        style={s.mediaBubble}
      >
        <View style={s.mediaImageWrap}>
          <Image
            source={{ uri: isVideo ? videoPosterUrl(item.media_url) : item.media_url }}
            style={s.mediaImage}
            resizeMode="cover"
          />
          {isVideo && (
            <View style={s.videoPlayOverlay}>
              <Play size={rs(22)} color="#fff" fill="#fff" strokeWidth={0} />
            </View>
          )}
          <Text style={[s.mediaBubbleTime, isOwn && s.mediaBubbleTimeOwn]}>
            {item.time_ago}
            {tick && <Text style={item.seen ? s.tickSeen : null}> {tick}</Text>}
          </Text>
        </View>
        {item.reply_to && (
          <View style={s.replyQuoteOnMedia}>
            <ReplyQuote replyTo={item.reply_to} isOwn={isOwn} otherName={otherName} />
          </View>
        )}
      </GHTouchableOpacity>
    );
  } else {
    // Own messages keep the time trailing inline with the text (matches the
    // mockup's sent bubbles); received messages drop it onto its own
    // right-aligned line below instead — matches the mockup's received
    // bubbles, which never run time into the message itself.
    content = (
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleTheir]}>
        {isOwn ? (
          <>
            <Text style={[s.bubbleText, fontFamily && { fontFamily }, s.bubbleTextOwn]}>
              {item.content}
              <Text style={s.bubbleTimeInlineOwn}>
                {'  '}{item.time_ago}
              </Text>
              {tick && <Text style={item.seen ? s.tickSeen : s.bubbleTimeInlineOwn}> {tick}</Text>}
            </Text>
            {item.reply_to && <ReplyQuote replyTo={item.reply_to} isOwn={isOwn} otherName={otherName} />}
          </>
        ) : (
          <>
            <Text style={[s.bubbleText, fontFamily && { fontFamily }]}>{item.content}</Text>
            {item.reply_to && <ReplyQuote replyTo={item.reply_to} isOwn={isOwn} otherName={otherName} />}
            <Text style={s.bubbleTime}>{item.time_ago}</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={handleSwipeableOpen}
      overshootLeft={false}
      leftThreshold={44}
      enabled={!item.deleted}
    >
      <GHPressable onLongPress={handleLongPress} delayLongPress={350}>
        <View style={[s.msgRow, isOwn && s.msgRowOwn]}>
          {content}
        </View>
      </GHPressable>
    </Swipeable>
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

// ─── Full-screen viewer for a single tapped chat photo/video ───
const ChatMediaViewer = React.memo(({ media, onClose }) => {
  const isVideo = media?.media_type === 'video';
  const player = useVideoPlayer(
    isVideo && media?.media_url ? { uri: media.media_url } : null,
    (p) => { p.play(); },
  );

  if (!media?.media_url) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={s.welcomeOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          {isVideo ? (
            <VideoView player={player} style={s.welcomeMedia} contentFit="contain" nativeControls />
          ) : (
            <Image source={{ uri: media.media_url }} style={s.welcomeMedia} resizeMode="contain" />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={s.welcomeClose} onPress={onClose} hitSlop={HIT_SLOP}>
          <X size={rs(18)} color="#fff" />
        </TouchableOpacity>
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
  const { socketService } = useSocket();

  const [messages, setMessages]     = useState([]);
  const [connection, setConnection] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);
  const [showEmojiStrip, setShowEmojiStrip] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [viewerMedia, setViewerMedia]       = useState(null);
  const [isOtherTyping, setIsOtherTyping]   = useState(false);
  const typingTimeoutRef = useRef(null);
  const lastTypingEmitRef = useRef(0);

  // ── Reply / delete — WhatsApp-style message actions ──────────
  const [replyingTo, setReplyingTo]     = useState(null); // full message being replied to, or null
  const [actionSheetItem, setActionSheetItem] = useState(null); // message long-pressed, for the reply/delete sheet
  const inputRef = useRef(null);

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

  // ── Voice note recording — press-and-hold mic ──
  const [isRecording, setIsRecording]     = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const recorder        = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordTimerRef = useRef(null);
  const pressStartRef  = useRef(0);
  const recordPulse    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isRecording) { recordPulse.setValue(1); return; }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(recordPulse, { toValue: 0.3, duration: 550, useNativeDriver: true }),
        Animated.timing(recordPulse, { toValue: 1,   duration: 550, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isRecording, recordPulse]);

  const bubbleFontFamily = useMemo(
    () => CHAT_FONT_MAP[chatProfile?.font_style] || CHAT_FONT_MAP[DEFAULT_CHAT_FONT],
    [chatProfile?.font_style]
  );

  const flatListRef  = useRef(null);
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const pollRef      = useRef(null);

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
      } else if (!silent) {
        showToast({ type: 'error', message: "Couldn't load messages." });
      }
    } catch {
      if (!silent) {
        showToast({ type: 'error', message: 'Network error.' });
      }
    }
  }, [connectionId, showToast, welcomeGallery.length, showWelcome, playWelcomeSound]);

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
      clearInterval(recordTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live delivery — the other party's message arrives over the socket
  // the instant they send it (see emit_new_message in drops.py), instead
  // of waiting for the next poll. Appended, not replaced, since a poll
  // firing moments later re-fetches the full canonical list anyway and
  // naturally reconciles — duplicate-by-id guard just covers the gap
  // between the two. ─────────────────────────────────────────────────
  useEffect(() => {
    const handleNewMessage = ({ connectionId: incomingId, message }) => {
      if (incomingId !== connectionId) return;
      setMessages(prev => (
        prev.some(m => m.id === message.id) ? prev : [...prev, message]
      ));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };
    socketService.on('new_message', handleNewMessage);
    return () => socketService.off('new_message', handleNewMessage);
  }, [connectionId, socketService]);

  // ── Typing indicator — mirrors MessagesScreen's list-level handling
  // (same user_typing event, 3s auto-clear), filtered to this connection.
  useEffect(() => {
    const handleUserTyping = ({ connectionId: incomingId }) => {
      if (incomingId !== connectionId) return;
      setIsOtherTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000);
    };
    socketService.on('user_typing', handleUserTyping);
    return () => {
      socketService.off('user_typing', handleUserTyping);
      clearTimeout(typingTimeoutRef.current);
    };
  }, [connectionId, socketService]);

  // ── Seen ticks going live — the other party just read up to seenAt, so
  // every one of my own messages sent before that instant flips to seen.
  useEffect(() => {
    const handleMessagesSeen = ({ connectionId: incomingId, seenAt }) => {
      if (incomingId !== connectionId) return;
      setMessages(prev => prev.map(m => (
        m.is_own && m.created_at <= seenAt ? { ...m, seen: true } : m
      )));
    };
    socketService.on('messages_seen', handleMessagesSeen);
    return () => socketService.off('messages_seen', handleMessagesSeen);
  }, [connectionId, socketService]);

  // ── Delete-for-everyone going live — the other party just masked a
  // message, so swap it for the placeholder now instead of waiting for
  // the next poll (see emit_message_deleted in drops.py).
  useEffect(() => {
    const handleMessageDeleted = ({ connectionId: incomingId, messageId }) => {
      if (incomingId !== connectionId) return;
      setMessages(prev => prev.map(m => (
        m.id === messageId
          ? { ...m, deleted: true, content: '', media_url: null, media_type: null }
          : m
      )));
    };
    socketService.on('message_deleted', handleMessageDeleted);
    return () => socketService.off('message_deleted', handleMessageDeleted);
  }, [connectionId, socketService]);

  // Throttled — the server relays this to the other party as user_typing
  // (see the `typing` handler in events.py); at most once every 2s so
  // every keystroke doesn't turn into a socket emit.
  const handleTextChange = useCallback((value) => {
    setText(value);
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2000) {
      lastTypingEmitRef.current = now;
      socketService.emit('typing', { connectionId });
    }
  }, [connectionId, socketService]);

  // ── Send ──────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;
    const replyToId = replyingTo?.id;
    setText('');
    setReplyingTo(null);
    setSending(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/message`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({ content, ...(replyToId && { reply_to_id: replyToId }) }),
        },
      );
      if (!res.ok) throw new Error();
      const sent = await res.json();
      // Append straight from the POST response instead of refetching the
      // whole thread — the message appears the instant this resolves,
      // not after a second round-trip that reloads everything else too.
      setMessages((prev) => [...prev, { ...sent, is_own: true, seen: false }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      showToast({ type: 'error', message: 'Failed to send. Try again.' });
    } finally {
      setSending(false);
    }
  }, [text, connectionId, showToast, replyingTo]);

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
    const replyToId = replyingTo?.id;
    setReplyingTo(null);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/message`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({
            media_url: mediaUrl, media_type: 'voice', duration_seconds: durationSeconds,
            ...(replyToId && { reply_to_id: replyToId }),
          }),
        },
      );
      if (!res.ok) throw new Error();
      const sent = await res.json();
      setMessages((prev) => [...prev, { ...sent, is_own: true, seen: false }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      showToast({ type: 'error', message: 'Could not send the voice note. Try again.' });
    }
  }, [connectionId, showToast, replyingTo]);

  // ── Media (photo/video) — same signed-upload-to-Cloudinary pattern as
  //    voice notes, just routed through the "image"/"video" resource type.
  //    No watermark: that's only for publicly-shared drop posts, not
  //    private messages between two people. ──
  const uploadMedia = useCallback(async (uri, mediaType) => {
    const token = await AsyncStorage.getItem('token');
    const resourceType = mediaType === 'video' ? 'video' : 'image';
    const sigRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ resource_type: resourceType }),
    });
    if (!sigRes.ok) {
      const err = await sigRes.json().catch(() => ({}));
      throw new Error(err?.detail || `Signature failed (${sigRes.status})`);
    }
    const { signature, timestamp, api_key, cloud_name, folder } = await sigRes.json();

    const ext = mediaType === 'video' ? 'mp4' : 'jpg';
    const form = new FormData();
    form.append('file', {
      uri, name: `media_${Date.now()}.${ext}`,
      type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
    });
    form.append('signature', signature);
    form.append('timestamp', String(timestamp));
    form.append('api_key',   api_key);
    form.append('folder',    folder);

    const uploadRes  = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`,
      { method: 'POST', body: form },
    );
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData?.error?.message || `Cloudinary error (${uploadRes.status})`);
    return uploadData.secure_url;
  }, []);

  const sendMediaMessage = useCallback(async (mediaUrl, mediaType) => {
    const replyToId = replyingTo?.id;
    setReplyingTo(null);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/message`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${token}`,
          },
          body: JSON.stringify({
            media_url: mediaUrl, media_type: mediaType,
            ...(replyToId && { reply_to_id: replyToId }),
          }),
        },
      );
      if (!res.ok) throw new Error();
      const sent = await res.json();
      setMessages((prev) => [...prev, { ...sent, is_own: true, seen: false }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      showToast({ type: 'error', message: 'Could not send. Try again.' });
    }
  }, [connectionId, showToast, replyingTo]);

  const pickMedia = useCallback(async () => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        showToast({ type: 'warning', message: 'Photo library permission is needed to attach media.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const mediaType = asset.type === 'video' ? 'video' : 'image';
      setMediaUploading(true);
      const url = await uploadMedia(asset.uri, mediaType);
      setMediaUploading(false);
      if (url) await sendMediaMessage(url, mediaType);
    } catch (e) {
      setMediaUploading(false);
      showToast({ type: 'error', message: e?.message || 'Could not send media.' });
    }
  }, [uploadMedia, sendMediaMessage, showToast]);

  const handleVoicePressIn = useCallback(async () => {
    if (isRecording) return;

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        showToast({ type: 'warning', message: 'Microphone permission is needed to record.' });
        return;
      }

      await setAudioModeAsync({
        allowsRecording:        true,
        playsInSilentMode:      true,
        shouldPlayInBackground: false,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      pressStartRef.current = Date.now();
      setIsRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (e) {
      setIsRecording(false);
      clearInterval(recordTimerRef.current);
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('permission')) {
        showToast({ type: 'warning', message: 'Microphone permission denied.' });
      } else {
        showToast({ type: 'error', message: `Recording error: ${msg || 'Could not start.'}` });
      }
    }
  }, [isRecording, showToast, recorder]);

  const handleVoicePressOut = useCallback(async () => {
    if (!isRecording) return;

    clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    const heldMs = Date.now() - pressStartRef.current;

    try {
      const durationSeconds = recordDuration;
      await recorder.stop();
      const uri = recorder.uri;
      setIsRecording(false);
      setRecordDuration(0);

      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

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
      setIsRecording(false);
      setRecordDuration(0);
      setVoiceUploading(false);
      showToast({ type: 'error', message: 'Could not send voice note.' });
    }
  }, [isRecording, recordDuration, uploadVoice, sendVoiceMessage, showToast]);

  // ── Helpers ───────────────────────────────────────────────
  // Inject a "Today" / "Yesterday" / date separator row whenever the day
  // changes between consecutive messages.
  const messagesWithDates = useMemo(() => {
    const out = [];
    let lastLabel = null;
    for (const m of messages) {
      const label = formatDateLabel(m.created_at);
      if (label && label !== lastLabel) {
        out.push({ id: `sep-${m.id}`, kind: 'date_separator', label });
        lastLabel = label;
      }
      out.push(m);
    }
    return out;
  }, [messages]);

  const handleMediaPress = useCallback((item) => {
    setViewerMedia({ media_url: item.media_url, media_type: item.media_type });
  }, []);

  // ── Reply ─────────────────────────────────────────────────
  const handleReply = useCallback((item) => {
    setReplyingTo(item);
    setActionSheetItem(null);
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  const handleCancelReply = useCallback(() => setReplyingTo(null), []);

  const handleLongPressMessage = useCallback((item) => {
    setActionSheetItem(item);
  }, []);

  // ── Delete — "for me" just hides it from my own view (server-side
  // filter, see get_drop_messages); "for everyone" masks the real content
  // for both sides and replaces it with a placeholder, live for the other
  // party via the message_deleted socket event below. ─────────────────
  const handleDeleteMessage = useCallback(async (item, forEveryone) => {
    setActionSheetItem(null);
    setMessages(prev => (
      forEveryone
        ? prev.map(m => (m.id === item.id
            ? { ...m, deleted: true, content: '', media_url: null, media_type: null }
            : m))
        : prev.filter(m => m.id !== item.id)
    ));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/api/v1/drops/connections/${connectionId}/messages/${item.id}/delete`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ for_everyone: forEveryone }),
        },
      );
      if (!res.ok) throw new Error();
    } catch {
      showToast({ type: 'error', message: 'Could not delete. Try again.' });
      loadMessages(true); // resync — the optimistic update above may be wrong
    }
  }, [connectionId, showToast, loadMessages]);

  const confirmDeleteForEveryone = useCallback((item) => {
    Alert.alert(
      'Delete for everyone?',
      "They'll see \"This message was deleted\" instead. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteMessage(item, true) },
      ],
    );
  }, [handleDeleteMessage]);

  const otherName = connection?.other_anonymous_name;

  const renderMessage = useCallback(
    ({ item }) => item.kind === 'date_separator'
      ? <DateSeparator label={item.label} />
      : (
        <Bubble
          item={item}
          fontFamily={bubbleFontFamily}
          onMediaPress={handleMediaPress}
          otherName={otherName}
          onReply={handleReply}
          onLongPressMessage={handleLongPressMessage}
        />
      ),
    [bubbleFontFamily, handleMediaPress, otherName, handleReply, handleLongPressMessage],
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

  // Header right: audio / video call icons + 3-dot menu — the room's
  // controls live in the header now, not a full-width bar.
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
          <Phone size={rs(19)} color={callLive ? T.primary : T.textMute} strokeWidth={1.8} />
          {callLive && <View style={s.liveDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.headerActionBtn, callLive && s.headerActionBtnLive]}
          onPress={handlePressVideo}
          disabled={callLoading}
          hitSlop={HIT_SLOP}
          activeOpacity={0.75}
        >
          <Video size={rs(19)} color={callLive ? T.primary : T.textMute} strokeWidth={1.8} />
          {callLive && <View style={s.liveDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.headerActionBtn}
          onPress={() => setShowMoreMenu(true)}
          hitSlop={HIT_SLOP}
          activeOpacity={0.75}
        >
          <MoreVertical size={rs(19)} color={T.textMute} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>
    );
  }, [connection, activeCall, callLoading, handlePressAudio, handlePressVideo]);

  const headerTitle = useMemo(() => {
    if (!connection) return 'Anonymous';
    return connection.other_anonymous_name || 'Anonymous';
  }, [connection]);

  // Header centre — small avatar (tappable into the gallery, same as the
  // old profile row) + name, with "typing…" (live, socket-driven — see
  // the user_typing handler above) taking over from the "online" line
  // (connection.other_is_online) whenever the other party is composing.
  const HeaderTitle = useMemo(() => (
    <TouchableOpacity
      style={s.headerTitleRow}
      activeOpacity={chatProfile?.gallery?.length ? 0.75 : 1}
      onPress={() => chatProfile?.gallery?.length && setGalleryViewerOpen(true)}
    >
      <View style={s.headerAvatarWrap}>
        {chatProfile?.profile_picture_url ? (
          <Image source={{ uri: chatProfile.profile_picture_url }} style={s.headerAvatar} />
        ) : (
          <View style={[s.headerAvatar, s.headerAvatarInitialWrap, { backgroundColor: avatarColorFor(headerTitle) }]}>
            <Text style={s.headerAvatarInitialText}>{headerTitle?.[0]?.toUpperCase() || 'A'}</Text>
          </View>
        )}
        {chatProfile?.gallery?.length > 0 && (
          <View style={s.headerGalleryBadge}>
            <Text style={s.headerGalleryBadgeText}>{chatProfile.gallery.length}</Text>
          </View>
        )}
      </View>
      <View style={s.headerTitleTextWrap}>
        <Text style={s.headerTitleName} numberOfLines={1}>{headerTitle}</Text>
        {isOtherTyping ? (
          <Text style={s.headerTypingText}>typing…</Text>
        ) : connection?.other_is_online && (
          <View style={s.headerOnlineRow}>
            <View style={s.headerOnlineDot} />
            <Text style={s.headerOnlineText}>online</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  ), [chatProfile, headerTitle, connection?.other_is_online, isOtherTyping]);

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
        titleNode={HeaderTitle}
        navigation={navigation}
        right={HeaderRight}
      />

      <ChatBackground
        pattern={chatProfile?.background_pattern || DEFAULT_BACKGROUND_PATTERN}
        style={{ flex: 1 }}
      >

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
              data={messagesWithDates}
              keyExtractor={keyExtractor}
              renderItem={renderMessage}
              contentContainerStyle={s.messageList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              initialNumToRender={14}
              maxToRenderPerBatch={10}
              windowSize={10}
              ListFooterComponent={isOtherTyping ? <TypingBubble /> : null}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: false })
              }
            />
          )}
        </Animated.View>

        {/* Quick emoji strip — toggled by the Smile icon below */}
        {showEmojiStrip && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.emojiStrip}
            contentContainerStyle={s.emojiStripContent}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                style={s.emojiStripBtn}
                onPress={() => setText((t) => t + e)}
                hitSlop={HIT_SLOP}
              >
                <Text style={s.emojiStripEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Reply banner — shows above the composer while replying to a
            message; tapping X clears it without sending anything. */}
        {replyingTo && (
          <View style={s.replyBanner}>
            <View style={s.replyBannerBar} />
            <View style={{ flex: 1 }}>
              <Text style={s.replyBannerName} numberOfLines={1}>
                {replyingTo.is_own ? 'You' : (otherName || 'them')}
              </Text>
              <Text style={s.replyBannerPreview} numberOfLines={1}>
                {messagePreviewLabel(replyingTo)}
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancelReply} hitSlop={HIT_SLOP}>
              <X size={rs(16)} color={T.textMute} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input — shared ChatInputBar shell (same one the comment sheet
            uses). The trailing button stays screen-specific: it presses
            and holds to record here (vs. comments' tap-only VoiceNoteRecorder
            with slide-to-cancel), so it's built here and passed in rather
            than owned by the shared component. */}
        <ChatInputBar
          inputRef={inputRef}
          value={text}
          onChangeText={handleTextChange}
          placeholder="Drop your desires"
          maxLength={500}
          onAttachPress={!isRecording ? pickMedia : undefined}
          attachUploading={mediaUploading}
          onEmojiPress={!isRecording ? () => setShowEmojiStrip((v) => !v) : undefined}
          emojiActive={showEmojiStrip}
          paddingBottom={insets.bottom + rp(8)}
          recordingContent={isRecording ? (
            // Recording takes over the field itself — nothing to type while
            // a voice note is being recorded, so the timer gets the space
            // instead of squeezing in next to a dead input.
            <View style={s.recordingRow}>
              <Animated.View style={[s.recordDot, { opacity: recordPulse }]} />
              <Text style={s.recordDurationLabel}>
                {Math.floor(recordDuration / 60)}:{String(recordDuration % 60).padStart(2, '0')}
              </Text>
              <Text style={s.recordHint}>release to send</Text>
            </View>
          ) : null}
          trailing={
            // One button, two jobs — empty field: press and hold to record
            // a voice note (mic); typed field: tap to send. Matches
            // WhatsApp/Telegram's morph instead of two buttons competing
            // for the same slot.
            <Pressable
              onPressIn={!text.trim() ? handleVoicePressIn : undefined}
              onPressOut={!text.trim() ? handleVoicePressOut : undefined}
              onPress={text.trim() ? handleSend : undefined}
              disabled={text.trim() ? sending : false}
              hitSlop={HIT_SLOP}
              style={({ pressed }) => [
                s.sendBtn,
                text.trim() && sending && { opacity: 0.4 },
                pressed && !isRecording && { opacity: 0.85 },
              ]}
            >
              {text.trim() ? (
                sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Send size={rs(21)} color="#fff" strokeWidth={2.2} />
              ) : (
                voiceUploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Mic size={rs(22)} color="#fff" strokeWidth={2} />
              )}
            </Pressable>
          }
        />
      </KeyboardAvoidingView>
      </ChatBackground>

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

      {/* Long-press action sheet — reply / delete for a single message */}
      <Modal
        visible={!!actionSheetItem}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetItem(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setActionSheetItem(null)}
        >
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            <View style={s.modalHandle} />
            <TouchableOpacity
              style={s.menuAction}
              onPress={() => handleReply(actionSheetItem)}
              hitSlop={HIT_SLOP}
            >
              <Reply size={rs(16)} color={T.text} strokeWidth={1.8} />
              <Text style={s.menuActionText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.menuAction}
              onPress={() => handleDeleteMessage(actionSheetItem, false)}
              hitSlop={HIT_SLOP}
            >
              <Trash2 size={rs(16)} color={T.text} strokeWidth={1.8} />
              <Text style={s.menuActionText}>Delete for me</Text>
            </TouchableOpacity>
            {actionSheetItem?.is_own && (
              <TouchableOpacity
                style={s.menuAction}
                onPress={() => confirmDeleteForEveryone(actionSheetItem)}
                hitSlop={HIT_SLOP}
              >
                <Trash2 size={rs(16)} color={T.error || '#E85D5D'} strokeWidth={1.8} />
                <Text style={[s.menuActionText, { color: T.error || '#E85D5D' }]}>Delete for everyone</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setActionSheetItem(null)}
              hitSlop={HIT_SLOP}
              style={s.cancelBtn}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {viewerMedia && (
        <ChatMediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  centered: { justifyContent: 'center', alignItems: 'center' },

  // Header title — small avatar + name + truthful online line, in place
  // of the old full-width profile row.
  //
  // `flex: 1` is load-bearing: DropScreenHeader lays this out with
  // justifyContent:'space-between' against the back button (~32px, fixed)
  // and the right-side icon cluster (width varies with icon count). Without
  // flex, this block's position comes from space-between's equal-gap math,
  // which pulls it off-center by half the width difference between those
  // two sides — and shifts again every time the icon count on the right
  // changes. Flex anchors it flush after the back button instead, which is
  // also how WhatsApp/Telegram/Messenger actually lay out a chat header.
  headerTitleRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(8),
  },
  headerAvatarWrap: { position: 'relative', flexShrink: 0 },
  headerAvatar: {
    width: rs(34), height: rs(34), borderRadius: rs(17),
    borderWidth: 1.5, borderColor: T.primaryBorder,
  },
  headerAvatarInitialWrap: {
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarInitialText: { fontSize: rf(14), fontWeight: '800', color: '#fff' },
  headerGalleryBadge: {
    position: 'absolute', bottom: -rp(2), right: -rp(2),
    backgroundColor: T.primary, borderRadius: rs(8),
    minWidth: rs(15), height: rs(15), paddingHorizontal: rp(3),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: T.background,
  },
  headerGalleryBadgeText: { fontSize: rf(8), fontWeight: '800', color: '#fff' },
  headerTitleTextWrap: { flexShrink: 1, alignItems: 'flex-start' },
  headerTitleName: {
    fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg, color: T.text, letterSpacing: 0.3,
  },
  headerOnlineRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4), marginTop: rp(1),
  },
  headerOnlineDot: {
    width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.online,
  },
  headerOnlineText: {
    fontFamily: 'DMSans-Regular', fontSize: rf(11), color: T.online,
  },
  headerTypingText: {
    fontFamily: 'DMSans-Italic', fontSize: rf(11), color: T.primary,
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

  // Header call/menu icons — plain, unboxed icon buttons like the mockup;
  // only an active call gets a highlighted pill, since that's real state
  // worth calling out, not just decoration.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: rp(14) },
  headerActionBtn: {
    width: rs(32), height: rs(32), alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  headerActionBtnLive: {
    borderRadius: rs(16), borderWidth: 1,
    borderColor: T.primaryBorder, backgroundColor: T.primaryDim,
  },
  liveDot: {
    position: 'absolute', top: rp(3), right: rp(3),
    width: rs(6), height: rs(6), borderRadius: rs(3),
    backgroundColor: T.online, borderWidth: 1, borderColor: T.background,
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
  dateSeparatorRow: {
    alignItems: 'center', alignSelf: 'stretch', marginVertical: rp(6),
  },
  dateSeparatorText: {
    fontFamily: 'DMSans-Bold', fontSize: rf(10), color: T.textMute,
    letterSpacing: 1, textTransform: 'uppercase',
    backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full,
    paddingHorizontal: rp(10), paddingVertical: rp(3),
    overflow: 'hidden',
  },
  msgRow:    { flexDirection: 'row', marginBottom: rp(4) },
  msgRowOwn: { justifyContent: 'flex-end' },
  // Photo/video message bubble — sharp bottom-right corner, same as every
  // other message container in this chat (voice notes are the one
  // exception — they have no container at all, see voiceMessageWrap).
  mediaBubble: {
    maxWidth: '68%', borderRadius: RADIUS.lg, borderBottomRightRadius: rs(4),
    overflow: 'hidden',
  },
  // Wraps the image + its overlay + its overlaid timestamp, so the
  // bottom-right time stays pinned to the photo itself even once a reply
  // quote is added as a sibling below it.
  mediaImageWrap: { position: 'relative' },
  mediaImage: {
    width: rs(220), height: rs(220), backgroundColor: T.surfaceAlt,
  },
  videoPlayOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  mediaBubbleTime: {
    position: 'absolute', bottom: rp(6), right: rp(8),
    fontFamily: 'DMSans-Bold', fontSize: rf(10), color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3,
  },
  mediaBubbleTimeOwn: { color: '#fff' },
  // Sharp bottom-right corner instead of uniform rounding — every message
  // container in this chat gets this (text bubbles, media, the typing
  // bubble below), except voice notes, which have no container at all.
  bubble: {
    maxWidth:               '78%',
    borderRadius:           RADIUS.lg,
    borderBottomRightRadius: rs(4),
    paddingVertical:        rp(8),
    paddingHorizontal:      rp(12),
    shadowColor:            '#000',
    shadowOffset:           { width: 0, height: 2 },
    shadowOpacity:          0.18,
    shadowRadius:           6,
    elevation:              2,
  },
  bubbleOwn: {
    backgroundColor: T.primary,
  },
  bubbleTheir: {
    backgroundColor: T.surface,
    borderWidth:     1,
    borderColor:     T.border,
  },
  // No background/border here — voice notes render bare, same convention
  // as mediaBubble below. maxWidth just keeps it from stretching full width.
  voiceMessageWrap: { maxWidth: '78%' },
  bubbleText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      FONT.md,
    color:         T.text,
    lineHeight:    rf(22),
    letterSpacing: 0.2,
  },
  bubbleTextOwn: { color: '#fff' },
  // Own messages: time flows inline at the end of the text. Received
  // messages use `bubbleTime` below instead — its own right-aligned line.
  bubbleTimeInlineOwn: {
    fontFamily: 'DMSans-Italic',
    fontSize:   rf(10),
    color:      'rgba(255,255,255,0.65)',
  },
  bubbleTime: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    marginTop:     rp(4),
    textAlign:     'right',
    letterSpacing: 0.2,
  },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.65)' },
  // Seen tick — the one place a sent message's status turns accent-colored
  // instead of staying muted, same "seen" signal WhatsApp's blue ticks give.
  tickSeen: { color: T.primary, fontFamily: 'DMSans-Bold' },

  // Swipe-to-reply — the icon revealed behind a bubble as it's dragged right.
  replyActionWrap: {
    width: rs(56), alignItems: 'center', justifyContent: 'center',
  },

  // Quoted reply block sitting inside a bubble, above its own content.
  // Own bubbles are solid coral, so the quote reads as a translucent white
  // strip; received bubbles are dark/surface, so it reads as a coral tint —
  // same accent-bar language WhatsApp/Telegram use for "this replies to X".
  replyQuote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: rp(6),
    backgroundColor: T.primaryDim,
    borderRadius: rs(8),
    paddingVertical: rp(5), paddingHorizontal: rp(7),
    marginTop: rp(6),
  },
  replyQuoteOwn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  replyQuoteBar: {
    width: rs(3), alignSelf: 'stretch', borderRadius: rs(2),
    backgroundColor: T.primary, minHeight: rs(24),
  },
  replyQuoteBarOwn: { backgroundColor: '#fff' },
  replyQuoteName: {
    fontFamily: 'DMSans-Bold', fontSize: rf(11), color: T.primary,
  },
  replyQuoteNameOwn: { color: '#fff' },
  replyQuotePreview: {
    fontFamily: 'DMSans-Regular', fontSize: rf(11), color: T.textMute,
    marginTop: rp(1),
  },
  replyQuotePreviewOwn: { color: 'rgba(255,255,255,0.85)' },
  // Same reply quote, but sitting on top of an image/video bubble instead
  // of inside a text bubble — needs its own opaque backing so it stays
  // readable over the photo underneath.
  // Sits below the photo now (not layered on top of it), so it no longer
  // needs an opaque backing of its own — ReplyQuote already carries one.
  replyQuoteOnMedia: { padding: rp(6) },

  // "This message was deleted" placeholder — same bubble shape, muted
  // italic text instead of real content.
  deletedText: {
    fontFamily: 'DMSans-Italic', fontSize: FONT.md, color: T.textMute,
  },
  deletedTextOwn: { color: 'rgba(255,255,255,0.75)' },

  // Reply banner — shown above the composer while replying to a message.
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8),
    paddingHorizontal: rp(16), paddingVertical: rp(8),
    backgroundColor: T.surfaceAlt,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  replyBannerBar: {
    width: rs(3), alignSelf: 'stretch', borderRadius: rs(2),
    backgroundColor: T.primary, minHeight: rs(28),
  },
  replyBannerName: {
    fontFamily: 'DMSans-Bold', fontSize: rf(12.5), color: T.primary,
  },
  replyBannerPreview: {
    fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textMute,
    marginTop: rp(1),
  },

  // Typing indicator bubble
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4),
    paddingVertical: rp(12),
  },
  typingBubbleDot: {
    width: rs(6), height: rs(6), borderRadius: rs(3),
    backgroundColor: T.textMute,
  },

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

  // Input bar itself now lives in the shared <ChatInputBar> component —
  // see components/common/ChatInputBar.jsx. What's left here is the quick
  // emoji strip and the recording-row content passed into it.
  emojiStrip: {
    borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.background,
  },
  emojiStripContent: {
    paddingHorizontal: SPACING.md, paddingVertical: rp(8), gap: rp(4),
  },
  emojiStripBtn: {
    width: rs(38), height: rs(38), alignItems: 'center', justifyContent: 'center',
    borderRadius: rs(19), backgroundColor: T.surface,
  },
  emojiStripEmoji: { fontSize: rf(20) },
  // Replaces the text input while recording — nothing to type, so the
  // timer/hint get the space instead of squeezing in beside a dead field.
  recordingRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rp(8),
    paddingVertical: rp(10), paddingLeft: rp(4),
  },
  recordDot: {
    width: rs(9), height: rs(9), borderRadius: rs(5),
    backgroundColor: T.danger,
  },
  recordDurationLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(13),
    color:         T.text,
    letterSpacing: 0.5,
    minWidth:      rs(32),
  },
  recordHint: {
    flex: 1,
    fontFamily: 'DMSans-Italic',
    fontSize:   rf(12),
    color:      T.textMute,
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

  // ── Shared modal chrome (more-options menu) ──
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

});
