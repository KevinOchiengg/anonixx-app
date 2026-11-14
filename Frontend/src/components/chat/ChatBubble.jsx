/** One message in a Room chat, plus the date pill and the typing dots.
 * Swipe right to reply, double-tap to react, long-press for the message sheet.
 * Back-to-back messages from one side group together; only the last one gets the tail. */
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Swipeable, Pressable as GHPressable, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { Check, CheckCheck, Eye, Image as ImageIcon, Lock, Mic, Play, Reply, Video } from 'lucide-react-native';
import { T } from '../../utils/colorTokens';
import { rs, rf, rp, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import VoiceWaveform from '../common/VoiceWaveform';

// Reactions (same set the backend accepts). Double-tap a message for the first one.
export const REACTIONS = ['🔥', '😈', '💋', '🥵', '😂', '🖤'];

// My bubbles: coral into rose. Seen ticks are a bright ice blue so they read on coral.
export const OWN_GRADIENT = ['#FF6B4F', '#E8456E'];
const SEEN = '#A8E6FF';

// Short label for the reply banner (same idea as the backend's _message_preview_text).
export function messagePreviewLabel(item) {
  if (!item) return '';
  if (item.deleted) return 'This message was deleted';
  if (item.media_type === 'voice') return 'Voice note';
  if (item.media_type === 'image') return 'Photo';
  if (item.media_type === 'video') return 'Video';
  return item.content || '';
}

// The matching icon for a media preview, or null for text.
export function PreviewIcon({ type, color, size = rs(12) }) {
  const Icon = type === 'voice' ? Mic : type === 'image' ? ImageIcon : type === 'video' ? Video : null;
  return Icon ? <Icon size={size} color={color} strokeWidth={2} /> : null;
}

// Poster frame by swapping the extension to .jpg (only works for older Cloudinary videos).
const videoPosterUrl = (url) => (url ? url.replace(/\.\w+(\?.*)?$/, '.jpg$1') : url);

// Reactions under a message; tap one to add or take back yours.
const ReactionRow = React.memo(({ item, onReact }) => {
  if (!item.reactions?.length) return null;
  return (
    <View style={[s.reactionRow, item.is_own && s.reactionRowOwn]}>
      {item.reactions.map((r) => (
        <TouchableOpacity
          key={r.emoji}
          style={[s.reactionPill, r.mine && s.reactionPillMine]}
          onPress={() => onReact?.(item, r.emoji)}
          hitSlop={HIT_SLOP}
          activeOpacity={0.8}
        >
          <Text style={s.reactionEmoji}>{r.emoji}</Text>
          {r.count > 1 && <Text style={s.reactionCount}>{r.count}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
});

// Time, and on my messages a tick: one = sent, two in ice blue = seen.
function Meta({ item, light, overlay }) {
  const color = overlay ? '#fff' : light ? 'rgba(255,255,255,0.75)' : T.textMute;
  return (
    <View style={[s.meta, overlay && s.metaOverlay]}>
      <Text style={[s.time, { color }]}>{item.time_ago}</Text>
      {item.is_own && !item.deleted ? (
        item.seen
          ? <CheckCheck size={rs(14)} color={SEEN} strokeWidth={2.4} />
          : <Check size={rs(14)} color={color} strokeWidth={2.4} />
      ) : null}
    </View>
  );
}

// View-once photo/video: sealed until opened, then gone for the receiver.
const ViewOnceBubble = React.memo(({ item, onOpen, onLongPress, corner }) => {
  const isOwn = item.is_own;
  const kind = item.media_type === 'video' ? 'video' : 'photo';
  let label;
  if (isOwn) label = item.opened ? `View-once ${kind} · opened` : `View-once ${kind} · not opened yet`;
  else label = item.opened ? `${kind[0].toUpperCase()}${kind.slice(1)} opened` : 'Tap to open · view once';
  const sealed = !isOwn && !item.opened;
  return (
    <GHTouchableOpacity
      activeOpacity={0.85}
      onPress={() => sealed && onOpen?.(item)}
      onLongPress={onLongPress}
      style={[s.viewOnce, corner, sealed && s.viewOnceSealed, isOwn && s.viewOnceOwn]}
    >
      {item.opened || isOwn
        ? <Eye size={rs(16)} color={isOwn ? '#fff' : T.textMute} strokeWidth={2} />
        : <Lock size={rs(16)} color={T.gold} strokeWidth={2} />}
      <Text style={[s.viewOnceText, sealed && s.viewOnceTextSealed, isOwn && { color: '#fff' }]}>{label}</Text>
      <Meta item={item} light={isOwn} />
    </GHTouchableOpacity>
  );
});

// Quoted reply, shown with a reply's content.
const ReplyQuote = React.memo(({ replyTo, isOwn, otherName }) => (
  <View style={[s.replyQuote, isOwn && s.replyQuoteOwn]}>
    <View style={[s.replyQuoteBar, isOwn && s.replyQuoteBarOwn]} />
    <View style={{ flex: 1 }}>
      <Text style={[s.replyQuoteName, isOwn && s.replyQuoteNameOwn]} numberOfLines={1}>
        {replyTo.is_own ? 'You' : (otherName || 'them')}
      </Text>
      <View style={s.replyQuoteRow}>
        <PreviewIcon type={replyTo.media_type} color={isOwn ? 'rgba(255,255,255,0.85)' : T.textMute} size={rs(11)} />
        <Text style={[s.replyQuotePreview, isOwn && s.replyQuotePreviewOwn]} numberOfLines={1}>
          {replyTo.preview}
        </Text>
      </View>
    </View>
  </View>
));

export const DateSeparator = React.memo(({ label }) => (
  <View style={s.dateRow}>
    <Text style={s.dateText}>{label}</Text>
  </View>
));

// Typing indicator: three dots as a received bubble.
export const TypingBubble = React.memo(() => {
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    const loops = dots.map((dot, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 200),
      Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      Animated.delay(600),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={[s.msgRow, s.groupEnd]}>
      <View style={[s.bubble, s.bubbleTheir, s.tailTheir, s.typingBubble]}>
        {dots.map((dot, i) => <Animated.View key={i} style={[s.typingDot, { opacity: dot }]} />)}
      </View>
    </View>
  );
});

export default React.memo(function ChatBubble({
  item, fontFamily, otherName, groupEnd = true, fresh = false,
  onMediaPress, onReply, onLongPress, onReact, onOpenViewOnce,
}) {
  const isOwn = item.is_own;
  const swipeRef = useRef(null);
  const lastTapRef = useRef(0);

  // A message that arrives while you're here slides up softly; history just appears.
  const enter = useRef(new Animated.Value(fresh ? 0 : 1)).current;
  useEffect(() => {
    if (fresh) Animated.timing(enter, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [fresh, enter]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 280 && !item.deleted) {
      lastTapRef.current = 0;
      onReact?.(item, REACTIONS[0], true);
    } else {
      lastTapRef.current = now;
    }
  }, [item, onReact]);

  const handleSwipeOpen = useCallback(() => {
    swipeRef.current?.close();
    onReply?.(item);
  }, [item, onReply]);

  const renderLeftActions = useCallback((progress) => (
    <Animated.View style={[s.replyActionWrap, { opacity: progress }]}>
      <View style={s.replyActionCircle}><Reply size={rs(16)} color={T.primary} strokeWidth={2} /></View>
    </Animated.View>
  ), []);

  const handleLongPress = useCallback(() => {
    if (!item.deleted) onLongPress?.(item);
  }, [item, onLongPress]);

  // Only the last message of a run gets the pointed corner.
  const corner = groupEnd ? (isOwn ? s.tailOwn : s.tailTheir) : null;
  const quote = item.reply_to ? <ReplyQuote replyTo={item.reply_to} isOwn={isOwn} otherName={otherName} /> : null;
  let content;

  if (item.deleted) {
    content = (
      <View style={[s.bubble, s.bubbleTheir, corner]}>
        <Text style={s.deletedText}>This message was deleted</Text>
      </View>
    );
  } else if (item.view_once) {
    content = <ViewOnceBubble item={item} onOpen={onOpenViewOnce} onLongPress={handleLongPress} corner={corner} />;
  } else if (item.media_type === 'voice' && item.media_url) {
    // Voice notes sit in a soft glass pill.
    content = (
      <View style={[s.voiceWrap, isOwn ? s.voiceOwn : s.voiceTheir, corner]}>
        <VoiceWaveform uri={item.media_url} durationSeconds={item.duration_seconds} speed />
        {quote}
        <Meta item={item} />
      </View>
    );
  } else if ((item.media_type === 'image' || item.media_type === 'video') && item.media_url) {
    const isVideo = item.media_type === 'video';
    content = (
      <GHTouchableOpacity activeOpacity={0.9} onPress={() => onMediaPress?.(item)} onLongPress={handleLongPress} style={[s.mediaBubble, corner]}>
        <View>
          <Image source={{ uri: isVideo ? videoPosterUrl(item.media_url) : item.media_url }} style={s.mediaImage} resizeMode="cover" />
          {isVideo && (
            <View style={s.videoPlayOverlay}>
              <View style={s.playCircle}><Play size={rs(20)} color="#fff" fill="#fff" strokeWidth={0} /></View>
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={s.mediaShade} pointerEvents="none" />
          <Meta item={item} overlay />
        </View>
        {quote ? <View style={s.quoteOnMedia}>{quote}</View> : null}
      </GHTouchableOpacity>
    );
  } else if (isOwn) {
    content = (
      <LinearGradient colors={OWN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.bubble, s.bubbleOwn, corner]}>
        {quote}
        <Text style={[s.bubbleText, fontFamily && { fontFamily }, s.bubbleTextOwn]}>{item.content}</Text>
        <Meta item={item} light />
      </LinearGradient>
    );
  } else {
    content = (
      <View style={[s.bubble, s.bubbleTheir, corner]}>
        {quote}
        <Text style={[s.bubbleText, fontFamily && { fontFamily }]}>{item.content}</Text>
        <Meta item={item} />
      </View>
    );
  }

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      <Swipeable
        ref={swipeRef}
        renderLeftActions={renderLeftActions}
        onSwipeableOpen={handleSwipeOpen}
        overshootLeft={false}
        leftThreshold={44}
        enabled={!item.deleted}
      >
        <GHPressable onPress={handleTap} onLongPress={handleLongPress} delayLongPress={350}>
          <View style={[s.msgRow, isOwn && s.msgRowOwn, groupEnd && s.groupEnd]}>{content}</View>
          <ReactionRow item={item} onReact={onReact} />
        </GHPressable>
      </Swipeable>
    </Animated.View>
  );
});

const R = RADIUS.lg + rs(2);
const s = StyleSheet.create({
  // Frosted date pill
  dateRow: { alignItems: 'center', alignSelf: 'stretch', marginVertical: rp(10) },
  dateText: {
    fontFamily: 'DMSans-SemiBold', fontSize: rf(11), color: 'rgba(255,255,255,0.75)', letterSpacing: 0.4,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: RADIUS.full, paddingHorizontal: rp(12), paddingVertical: rp(4), overflow: 'hidden',
  },
  msgRow: { flexDirection: 'row', marginBottom: rp(2) },
  msgRowOwn: { justifyContent: 'flex-end' },
  groupEnd: { marginBottom: rp(10) },
  bubble: {
    maxWidth: '80%', borderRadius: R, paddingTop: rp(8), paddingBottom: rp(6), paddingHorizontal: rp(13), gap: rp(2),
  },
  bubbleOwn: {
    shadowColor: '#E8456E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 3,
  },
  bubbleTheir: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  tailOwn: { borderBottomRightRadius: rs(5) },
  tailTheir: { borderBottomLeftRadius: rs(5) },
  bubbleText: { fontFamily: 'DMSans-Regular', fontSize: FONT.md, color: T.text, lineHeight: rf(22), letterSpacing: 0.15 },
  bubbleTextOwn: { color: '#fff' },
  meta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: rp(3), marginTop: rp(1) },
  metaOverlay: { position: 'absolute', right: rp(9), bottom: rp(7) },
  time: { fontFamily: 'DMSans-Medium', fontSize: rf(10.5), letterSpacing: 0.2 },
  voiceWrap: { maxWidth: '82%', borderRadius: R, paddingHorizontal: rp(10), paddingTop: rp(8), paddingBottom: rp(6), gap: rp(2) },
  voiceOwn: { backgroundColor: 'rgba(255,107,79,0.16)', borderWidth: 1, borderColor: 'rgba(255,107,79,0.28)' },
  voiceTheir: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  mediaBubble: { maxWidth: '70%', borderRadius: R, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  mediaImage: { width: rs(224), height: rs(240), backgroundColor: T.surfaceAlt },
  mediaShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: rs(44) },
  videoPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: rs(48), height: rs(48), borderRadius: rs(24), alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingLeft: rp(3),
  },
  quoteOnMedia: { padding: rp(6), backgroundColor: 'rgba(0,0,0,0.35)' },
  replyActionWrap: { width: rs(56), alignItems: 'center', justifyContent: 'center' },
  replyActionCircle: { width: rs(32), height: rs(32), borderRadius: rs(16), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,99,74,0.14)' },
  replyQuote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: rp(7), backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: rs(10), paddingVertical: rp(6), paddingHorizontal: rp(8), marginBottom: rp(4),
  },
  replyQuoteOwn: { backgroundColor: 'rgba(0,0,0,0.16)' },
  replyQuoteBar: { width: rs(3), alignSelf: 'stretch', borderRadius: rs(2), backgroundColor: T.primary, minHeight: rs(24) },
  replyQuoteBarOwn: { backgroundColor: '#fff' },
  replyQuoteName: { fontFamily: 'DMSans-Bold', fontSize: rf(11.5), color: T.primary },
  replyQuoteNameOwn: { color: '#fff' },
  replyQuoteRow: { flexDirection: 'row', alignItems: 'center', gap: rp(4), marginTop: rp(1) },
  replyQuotePreview: { flexShrink: 1, fontFamily: 'DMSans-Regular', fontSize: rf(11.5), color: T.textMute },
  replyQuotePreviewOwn: { color: 'rgba(255,255,255,0.85)' },
  deletedText: { fontFamily: 'DMSans-Italic', fontSize: FONT.sm, color: T.textMute },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: rp(4), paddingVertical: rp(13) },
  typingDot: { width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: 'rgba(255,255,255,0.6)' },
  reactionRow: { flexDirection: 'row', gap: rp(4), marginTop: rp(-6), marginBottom: rp(8), marginLeft: rp(8) },
  reactionRowOwn: { justifyContent: 'flex-end', marginLeft: 0, marginRight: rp(8) },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: rp(3), paddingHorizontal: rp(7), paddingVertical: rp(2),
    borderRadius: 999, backgroundColor: '#141c2e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  reactionPillMine: { borderColor: T.primaryBorder, backgroundColor: '#1c2236' },
  reactionEmoji: { fontSize: rf(13) },
  reactionCount: { fontFamily: 'DMSans-Bold', fontSize: rf(10), color: T.textSec },
  viewOnce: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8), maxWidth: '80%',
    paddingVertical: rp(10), paddingHorizontal: rp(12), borderRadius: R,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  viewOnceSealed: { borderColor: 'rgba(251,191,36,0.45)', backgroundColor: 'rgba(251,191,36,0.08)' },
  viewOnceOwn: { backgroundColor: '#E8566A', borderColor: 'transparent' },
  viewOnceText: { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.textSec, flexShrink: 1 },
  viewOnceTextSealed: { fontFamily: 'DMSans-Bold', color: T.gold },
});
