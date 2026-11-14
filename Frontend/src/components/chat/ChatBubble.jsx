/** One message in a Room chat, plus the date pill and the typing dots.
 * Swipe right to reply, double-tap to react, long-press for the message sheet. */
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable, Pressable as GHPressable, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { Eye, Lock, Play, Reply } from 'lucide-react-native';
import { T } from '../../utils/colorTokens';
import { rs, rf, rp, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import VoiceWaveform from '../common/VoiceWaveform';

// Reactions (same set the backend accepts). Double-tap a message for the first one.
export const REACTIONS = ['🔥', '😈', '💋', '🥵', '😂', '🖤'];

// Short label for the reply banner (same as the backend's _message_preview_text).
export function messagePreviewLabel(item) {
  if (!item) return '';
  if (item.deleted) return 'This message was deleted';
  if (item.media_type === 'voice') return '🎙 Voice note';
  if (item.media_type === 'image') return '📷 Photo';
  if (item.media_type === 'video') return '🎥 Video';
  return item.content || '';
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

// View-once photo/video: sealed until opened, then gone for the receiver.
const ViewOnceBubble = React.memo(({ item, onOpen, onLongPress }) => {
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
      style={[s.viewOnce, sealed && s.viewOnceSealed, isOwn && s.viewOnceOwn]}
    >
      {item.opened || isOwn
        ? <Eye size={rs(16)} color={isOwn ? '#fff' : T.textMute} strokeWidth={2} />
        : <Lock size={rs(16)} color={T.gold} strokeWidth={2} />}
      <Text style={[s.viewOnceText, sealed && s.viewOnceTextSealed, isOwn && { color: '#fff' }]}>{label}</Text>
      <Text style={[s.viewOnceTime, isOwn && { color: 'rgba(255,255,255,0.65)' }]}>{item.time_ago}</Text>
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
      <Text style={[s.replyQuotePreview, isOwn && s.replyQuotePreviewOwn]} numberOfLines={1}>
        {replyTo.preview}
      </Text>
    </View>
  </View>
));

export const DateSeparator = React.memo(({ label }) => (
  <View style={s.dateSeparatorRow}>
    <Text style={s.dateSeparatorText}>{label}</Text>
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
    <View style={s.msgRow}>
      <View style={[s.bubble, s.bubbleTheir, s.typingBubble]}>
        {dots.map((dot, i) => <Animated.View key={i} style={[s.typingDot, { opacity: dot }]} />)}
      </View>
    </View>
  );
});

function Time({ item, style, tickStyle }) {
  // Ticks on my messages: single = sent, double (accent) = seen.
  const tick = item.is_own ? (item.seen ? '✓✓' : '✓') : null;
  return (
    <Text style={style}>
      {item.time_ago}
      {tick && <Text style={item.seen ? s.tickSeen : tickStyle}> {tick}</Text>}
    </Text>
  );
}

export default React.memo(function ChatBubble({ item, fontFamily, otherName, onMediaPress, onReply, onLongPress, onReact, onOpenViewOnce }) {
  const isOwn = item.is_own;
  const swipeRef = useRef(null);
  const lastTapRef = useRef(0);

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
      <Reply size={rs(18)} color={T.primary} strokeWidth={2} />
    </Animated.View>
  ), []);

  const handleLongPress = useCallback(() => {
    if (!item.deleted) onLongPress?.(item);
  }, [item, onLongPress]);

  const quote = item.reply_to ? <ReplyQuote replyTo={item.reply_to} isOwn={isOwn} otherName={otherName} /> : null;
  let content;

  if (item.deleted) {
    content = (
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleTheir]}>
        <Text style={[s.deletedText, isOwn && s.deletedTextOwn]}>This message was deleted</Text>
      </View>
    );
  } else if (item.view_once) {
    content = <ViewOnceBubble item={item} onOpen={onOpenViewOnce} onLongPress={handleLongPress} />;
  } else if (item.media_type === 'voice' && item.media_url) {
    // Voice notes have no bubble background.
    content = (
      <View style={s.voiceWrap}>
        <VoiceWaveform uri={item.media_url} durationSeconds={item.duration_seconds} speed />
        {quote}
        <Time item={item} style={s.bubbleTime} />
      </View>
    );
  } else if ((item.media_type === 'image' || item.media_type === 'video') && item.media_url) {
    const isVideo = item.media_type === 'video';
    content = (
      <GHTouchableOpacity activeOpacity={0.9} onPress={() => onMediaPress?.(item)} onLongPress={handleLongPress} style={s.mediaBubble}>
        <View>
          <Image source={{ uri: isVideo ? videoPosterUrl(item.media_url) : item.media_url }} style={s.mediaImage} resizeMode="cover" />
          {isVideo && (
            <View style={s.videoPlayOverlay}>
              <Play size={rs(22)} color="#fff" fill="#fff" strokeWidth={0} />
            </View>
          )}
          <Time item={item} style={s.mediaTime} />
        </View>
        {quote ? <View style={s.quoteOnMedia}>{quote}</View> : null}
      </GHTouchableOpacity>
    );
  } else {
    // Sent: time inline at the end of the text. Received: time on its own line.
    content = (
      <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleTheir]}>
        {isOwn ? (
          <Text style={[s.bubbleText, fontFamily && { fontFamily }, s.bubbleTextOwn]}>
            {item.content}
            <Text style={s.timeInlineOwn}>{'  '}{item.time_ago}</Text>
            <Text style={item.seen ? s.tickSeen : s.timeInlineOwn}> {item.seen ? '✓✓' : '✓'}</Text>
          </Text>
        ) : (
          <Text style={[s.bubbleText, fontFamily && { fontFamily }]}>{item.content}</Text>
        )}
        {quote}
        {!isOwn && <Text style={s.bubbleTime}>{item.time_ago}</Text>}
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={handleSwipeOpen}
      overshootLeft={false}
      leftThreshold={44}
      enabled={!item.deleted}
    >
      <GHPressable onPress={handleTap} onLongPress={handleLongPress} delayLongPress={350}>
        <View style={[s.msgRow, isOwn && s.msgRowOwn]}>{content}</View>
        <ReactionRow item={item} onReact={onReact} />
      </GHPressable>
    </Swipeable>
  );
});

const s = StyleSheet.create({
  dateSeparatorRow: { alignItems: 'center', alignSelf: 'stretch', marginVertical: rp(6) },
  dateSeparatorText: {
    fontFamily: 'DMSans-Bold', fontSize: rf(10), color: T.textMute, letterSpacing: 1, textTransform: 'uppercase',
    backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full, paddingHorizontal: rp(10), paddingVertical: rp(3), overflow: 'hidden',
  },
  msgRow: { flexDirection: 'row', marginBottom: rp(4) },
  msgRowOwn: { justifyContent: 'flex-end' },
  // Every container but voice notes has a sharp bottom-right corner.
  bubble: {
    maxWidth: '78%', borderRadius: RADIUS.lg, borderBottomRightRadius: rs(4),
    paddingVertical: rp(8), paddingHorizontal: rp(12),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 2,
  },
  bubbleOwn: { backgroundColor: T.primary },
  bubbleTheir: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  bubbleText: { fontFamily: 'DMSans-Regular', fontSize: FONT.md, color: T.text, lineHeight: rf(22), letterSpacing: 0.2 },
  bubbleTextOwn: { color: '#fff' },
  timeInlineOwn: { fontFamily: 'DMSans-Italic', fontSize: rf(10), color: 'rgba(255,255,255,0.65)' },
  bubbleTime: { fontFamily: 'DMSans-Italic', fontSize: rf(10), color: T.textMute, marginTop: rp(4), textAlign: 'right', letterSpacing: 0.2 },
  tickSeen: { color: T.primary, fontFamily: 'DMSans-Bold' },
  voiceWrap: { maxWidth: '78%' },
  mediaBubble: { maxWidth: '68%', borderRadius: RADIUS.lg, borderBottomRightRadius: rs(4), overflow: 'hidden' },
  mediaImage: { width: rs(220), height: rs(220), backgroundColor: T.surfaceAlt },
  videoPlayOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)',
  },
  mediaTime: {
    position: 'absolute', bottom: rp(6), right: rp(8), fontFamily: 'DMSans-Bold', fontSize: rf(10), color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3,
  },
  quoteOnMedia: { padding: rp(6) },
  replyActionWrap: { width: rs(56), alignItems: 'center', justifyContent: 'center' },
  replyQuote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: rp(6), backgroundColor: T.primaryDim,
    borderRadius: rs(8), paddingVertical: rp(5), paddingHorizontal: rp(7), marginTop: rp(6),
  },
  replyQuoteOwn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  replyQuoteBar: { width: rs(3), alignSelf: 'stretch', borderRadius: rs(2), backgroundColor: T.primary, minHeight: rs(24) },
  replyQuoteBarOwn: { backgroundColor: '#fff' },
  replyQuoteName: { fontFamily: 'DMSans-Bold', fontSize: rf(11), color: T.primary },
  replyQuoteNameOwn: { color: '#fff' },
  replyQuotePreview: { fontFamily: 'DMSans-Regular', fontSize: rf(11), color: T.textMute, marginTop: rp(1) },
  replyQuotePreviewOwn: { color: 'rgba(255,255,255,0.85)' },
  deletedText: { fontFamily: 'DMSans-Italic', fontSize: FONT.md, color: T.textMute },
  deletedTextOwn: { color: 'rgba(255,255,255,0.75)' },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: rp(4), paddingVertical: rp(12) },
  typingDot: { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.textMute },
  reactionRow: { flexDirection: 'row', gap: rp(4), marginTop: rp(-2), marginBottom: rp(4), marginLeft: rp(6) },
  reactionRowOwn: { justifyContent: 'flex-end', marginLeft: 0, marginRight: rp(6) },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: rp(3), paddingHorizontal: rp(7), paddingVertical: rp(2),
    borderRadius: 999, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
  },
  reactionPillMine: { borderColor: T.primaryBorder, backgroundColor: T.primaryDim },
  reactionEmoji: { fontSize: rf(13) },
  reactionCount: { fontFamily: 'DMSans-Bold', fontSize: rf(10), color: T.textSec },
  viewOnce: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8), maxWidth: '78%',
    paddingVertical: rp(10), paddingHorizontal: rp(12), borderRadius: RADIUS.lg, borderBottomRightRadius: rs(4),
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
  },
  viewOnceSealed: { borderColor: 'rgba(251,191,36,0.45)', backgroundColor: 'rgba(251,191,36,0.08)' },
  viewOnceOwn: { backgroundColor: T.primary, borderColor: T.primary },
  viewOnceText: { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.textSec, flexShrink: 1 },
  viewOnceTextSealed: { fontFamily: 'DMSans-Bold', color: T.gold },
  viewOnceTime: { fontFamily: 'DMSans-Italic', fontSize: rf(10), color: T.textMute },
});
