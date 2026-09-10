import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList, Image,
  KeyboardAvoidingView, Modal, PanResponder, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import {
  ChevronDown, CornerDownRight, Heart, ImageIcon, Pause, Pin, Play, X,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';
import VoiceNoteRecorder from '../common/VoiceNoteRecorder';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import AnonProfileSheet from '../connect/AnonProfileSheet';

// @mentions — plain-text markup, mirrors MENTION_RE in
// Backend/app/api/v1/drops.py. Parsed here purely for rendering (coral,
// tappable spans); nothing structural is stored for it.
const MENTION_RE = /@([A-Za-z0-9_.]{2,30})/g;

// Splits comment text into plain strings + tappable @mention spans. Nested
// Text children inherit the parent <Text>'s style, so only the mention
// spans need their own style passed in.
function renderMentionText(content, mentionStyle, onMentionPress) {
  if (!content) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
    const username = match[1];
    parts.push(
      <Text key={`${match.index}-${username}`} style={mentionStyle} onPress={() => onMentionPress?.(username)}>
        @{username}
      </Text>,
    );
    lastIndex = MENTION_RE.lastIndex;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts;
}

const { width: W, height: H } = Dimensions.get('window');

const AVATAR_BG = '#1e2330';

// ─── Voice note playback ────────────────────────────────────────
const AudioPlayer = React.memo(({ uri }) => {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loaded = useRef(false);

  const playing  = !!status.playing;
  const duration = status.duration || 0;

  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);

  useEffect(() => {
    if (status.didJustFinish) {
      try {
        player.pause();
        Promise.resolve(player.seekTo(0)).catch(() => {});
      } catch {}
    }
  }, [status.didJustFinish, player]);

  const toggle = useCallback(async () => {
    if (!uri) return;
    try {
      if (!loaded.current) {
        await setAudioModeAsync({ playsInSilentModeIOS: true });
        player.replace({ uri });
        loaded.current = true;
        player.play();
        return;
      }
      if (playing) player.pause();
      else player.play();
    } catch {}
  }, [uri, playing, player]);

  const fmt = (secs) => {
    const s = Math.max(0, Math.floor(secs || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity style={st.audioWrap} onPress={toggle} activeOpacity={0.85} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <View style={st.audioPlayBtn}>
        {playing ? <Pause size={14} color="#fff" fill="#fff" /> : <Play size={14} color="#fff" fill="#fff" />}
      </View>
      <Text style={st.audioTimeText}>
        {playing || status.currentTime > 0 ? fmt(status.currentTime) : fmt(duration)}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Emoji picker ─────────────────────────────────────────────
const EMOJI_CATS = [
  { tab: '🔥', emojis: ['🔥','💯','⚡','✨','💫','🌙','🌚','🌝','👀','💀','👻','🤡','🫠','🥶','🥵'] },
  { tab: '😂', emojis: ['😂','🤣','😭','😍','🥰','😘','😎','🥹','😳','🤯','😱','🤬','😡','🥺','😤'] },
  { tab: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖'] },
  { tab: '👍', emojis: ['👍','👎','🙌','👏','🤝','🙏','💪','✌️','🤞','🫶','🫂','🤦','🤷','💁','🙋'] },
  { tab: '😈', emojis: ['😈','👿','💩','🤮','🤢','🫡','🫣','🫤','😶','😑','😏','😒','🙄','😬','🤥'] },
];

const EmojiPicker = React.memo(({ onSelect }) => {
  const [tab, setTab] = useState(0);
  return (
    <View style={st.pickerPanel}>
      <View style={st.emojiTabsRow}>
        {EMOJI_CATS.map((c, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => setTab(i)}
            style={[st.emojiTab, i === tab && st.emojiTabActive]}
          >
            <Text style={st.emojiTabLabel}>{c.tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={st.emojiGrid}>
        {EMOJI_CATS[tab].emojis.map(e => (
          <TouchableOpacity key={e} onPress={() => onSelect(e)} style={st.emojiBtn}>
            <Text style={st.emojiText}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

// ─── Comment row ──────────────────────────────────────────────
const CommentItem = React.memo(({
  item, isFirst, isHot, onReply, replyingTo, onLike, onOpenImage, depth = 0,
  isOwner, onPin, onMentionPress,
}) => {
  const isReplying = replyingTo === item.id;
  const replies    = item.replies ?? [];
  const isOwn      = !!(item.is_own_reply || item._optimistic);
  const [expanded, setExpanded] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;

  const handleLike = useCallback(() => {
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.55, friction: 3, useNativeDriver: true }),
      Animated.spring(likeScale, { toValue: 1,    friction: 5, useNativeDriver: true }),
    ]).start();
    onLike(item.id, !item.liked_by_me);
  }, [item.id, item.liked_by_me, onLike, likeScale]);

  const likesDisplay = item.likes_count >= 1000
    ? `${(item.likes_count / 1000).toFixed(1)}k`
    : (item.likes_count || 0).toString();

  const mediaUri = item.image_url || item.gif_url;

  return (
    <View style={[st.commentItem, depth > 0 && st.commentItemReply]}>
      <View style={st.commentAvatar}>
        <Text style={st.commentAvatarText}>
          {item.anonymous_name?.[0]?.toUpperCase() || 'A'}
        </Text>
      </View>

      <View style={st.commentBody}>
        <View style={st.commentMetaRow}>
          <Text style={st.commentAuthor} numberOfLines={1}>
            {isOwn ? 'You' : (item.anonymous_name || 'Anonymous')}
          </Text>
          {item.pinned && (
            <View style={st.pinnedBadge}>
              <Pin size={9} color={T.primary} fill={T.primary} />
              <Text style={st.pinnedBadgeText}>pinned</Text>
            </View>
          )}
          {isFirst && !isHot && (
            <View style={st.firstBadge}>
              <Text style={st.firstBadgeText}>first 🎯</Text>
            </View>
          )}
          {isHot && (
            <View style={st.hotBadge}>
              <Text style={st.hotBadgeText}>🔥 hot</Text>
            </View>
          )}
        </View>

        {item.content ? (
          <Text style={st.commentText}>
            {renderMentionText(item.content, st.mentionText, onMentionPress)}
          </Text>
        ) : null}
        {mediaUri ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onOpenImage(mediaUri)}
            style={{ marginTop: item.content ? 6 : 0 }}
          >
            <Image source={{ uri: mediaUri }} style={st.commentImage} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}
        {item.voice_url ? <View style={{ marginTop: item.content ? 6 : 0 }}><AudioPlayer uri={item.voice_url} /></View> : null}

        <View style={st.commentFooterRow}>
          <Text style={st.commentTime}>{item.time_ago || 'just now'}</Text>
          {depth === 0 && (
            <TouchableOpacity
              onPress={() => onReply(isReplying ? null : item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[st.commentFooterAction, isReplying && { color: T.primary }]}>
                {isReplying ? 'Cancel' : 'Reply'}
              </Text>
            </TouchableOpacity>
          )}
          {depth === 0 && isOwner && (
            <TouchableOpacity
              onPress={() => onPin(item.id, !item.pinned)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[st.commentFooterAction, item.pinned && { color: T.primary }]}>
                {item.pinned ? 'Unpin' : 'Pin'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {depth === 0 && replies.length > 0 && (
          <TouchableOpacity
            onPress={() => setExpanded(v => !v)}
            style={st.viewRepliesBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={st.viewRepliesLine} />
            <Text style={st.viewRepliesText}>
              {expanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
            </Text>
          </TouchableOpacity>
        )}

        {depth === 0 && expanded && replies.length > 0 && (
          <View style={st.repliesWrap}>
            {replies.map(r => (
              <CommentItem
                key={r.id ?? r.content}
                item={r}
                isFirst={false}
                isHot={false}
                onReply={onReply}
                replyingTo={replyingTo}
                onLike={onLike}
                onOpenImage={onOpenImage}
                onMentionPress={onMentionPress}
                depth={1}
              />
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={handleLike}
        style={st.likeColumn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Animated.View style={{ transform: [{ scale: likeScale }] }}>
          <Heart
            size={16}
            color={item.liked_by_me ? T.primary : 'rgba(255,255,255,0.4)'}
            fill={item.liked_by_me ? T.primary : 'none'}
          />
        </Animated.View>
        {(item.likes_count || 0) > 0 && (
          <Text style={[st.likeCount, item.liked_by_me && { color: T.primary }]}>
            {likesDisplay}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
});

// ─── Main sheet ───────────────────────────────────────────────
export const CommentBottomSheet = React.memo(({
  visible, postId, isAuthenticated, navigation, onClose, onCountChange, isOwner,
}) => {
  const insets = useSafeAreaInsets();
  const { socketService } = useSocket();
  const { user } = useAuth();

  const [comments,       setComments]       = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [text,           setText]           = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [replyingTo,     setReplyingTo]     = useState(null);
  const [sortBy,         setSortBy]         = useState('new');
  const [picker,         setPicker]         = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [viewerUri,      setViewerUri]      = useState(null);

  // @mention autocomplete — null when not actively typing a mention,
  // '' or more once an "@" with no trailing space is in progress.
  const [mentionQuery,   setMentionQuery]   = useState(null);
  const [mentionResults, setMentionResults] = useState([]);
  // Tapping an @mention in a posted comment resolves the username to a
  // user id (comments only store plain text, no structured mention data)
  // and opens the same profile sheet the rest of the feed uses.
  const [mentionProfile, setMentionProfile] = useState({ visible: false, userId: null, anonymousName: '' });

  const slideAnim    = useRef(new Animated.Value(H)).current;
  const inputRef     = useRef(null);
  const mentionTimer = useRef(null);

  useEffect(() => {
    if (visible) {
      setComments([]);
      setReplyingTo(null);
      setPicker(null);
      setText('');
      loadComments();
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, friction: 9, tension: 70,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: H, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // ── Live thread — join this drop's comment room while the sheet is open,
  // so new_comment/comment_liked broadcasts (see Backend/app/websockets/
  // comments.py) reach everyone currently looking at it, not just whoever
  // sent the request. ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !postId) return;
    socketService.emit('join_drop_thread', { dropId: postId });
    return () => socketService.emit('leave_drop_thread', { dropId: postId });
  }, [visible, postId, socketService]);

  useEffect(() => {
    if (!visible || !postId) return;

    const handleNewComment = ({ dropId, comment }) => {
      if (dropId !== postId) return;
      // We already have our own comment from the HTTP response in `submit`
      // — the broadcast is an echo of it, not a new one.
      if (comment.user_id && comment.user_id === user?.id) return;

      const incoming = { ...comment, replies: comment.replies || [] };
      if (comment.parent_id) {
        setComments(prev => prev.map(c =>
          c.id === comment.parent_id
            ? { ...c, replies: [...(c.replies ?? []), incoming] }
            : c,
        ));
      } else {
        setComments(prev => {
          const next = [incoming, ...prev];
          onCountChange?.(next.length);
          return next;
        });
      }
    };

    const handleCommentLiked = ({ dropId, commentId, likesCount }) => {
      if (dropId !== postId) return;
      setComments(prev => prev.map(c => {
        if (c.id === commentId) return { ...c, likes_count: likesCount };
        if (c.replies?.some(r => r.id === commentId)) {
          return {
            ...c,
            replies: c.replies.map(r => r.id === commentId ? { ...r, likes_count: likesCount } : r),
          };
        }
        return c;
      }));
    };

    // Only one pinned comment per drop (enforced server-side) — pinning
    // sets it on the target and clears it everywhere else in one pass.
    const handleCommentPinned = ({ dropId, commentId }) => {
      if (dropId !== postId) return;
      setComments(prev => prev.map(c => ({ ...c, pinned: c.id === commentId })));
    };

    const handleCommentUnpinned = ({ dropId, commentId }) => {
      if (dropId !== postId) return;
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, pinned: false } : c));
    };

    socketService.on('new_comment',      handleNewComment);
    socketService.on('comment_liked',    handleCommentLiked);
    socketService.on('comment_pinned',   handleCommentPinned);
    socketService.on('comment_unpinned', handleCommentUnpinned);
    return () => {
      socketService.off('new_comment',      handleNewComment);
      socketService.off('comment_liked',    handleCommentLiked);
      socketService.off('comment_pinned',   handleCommentPinned);
      socketService.off('comment_unpinned', handleCommentUnpinned);
    };
  }, [visible, postId, user?.id, socketService]);

  useEffect(() => {
    if (replyingTo) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [replyingTo]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${postId}/thread`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        const threads = data.threads || [];
        setComments(threads);
        onCountChange?.(threads.length);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const submit = async (gifUrl = null, imageUrl = null, voiceUrl = null, voiceDuration = null) => {
    if (!gifUrl && !imageUrl && !voiceUrl && !text.trim()) return;
    if (!isAuthenticated) {
      navigation?.navigate?.('AuthNav', { screen: 'Login' });
      return;
    }
    const optimisticId = `opt_${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      content: (gifUrl || imageUrl || voiceUrl) ? '' : text.trim(),
      anonymous_name: 'You',
      time_ago: 'just now',
      likes_count: 0,
      liked_by_me: false,
      replies: [],
      gif_url:        gifUrl        ?? undefined,
      image_url:      imageUrl      ?? undefined,
      voice_url:      voiceUrl      ?? undefined,
      voice_duration: voiceDuration ?? undefined,
      _optimistic: true,
    };

    const savedText    = text.trim();
    const savedReplyTo = replyingTo;
    setText('');
    setReplyingTo(null);
    setPicker(null);
    setSubmitting(true);

    if (savedReplyTo) {
      setComments(prev =>
        prev.map(c =>
          c.id === savedReplyTo
            ? { ...c, replies: [...(c.replies ?? []), optimistic] }
            : c,
        ),
      );
    } else {
      setComments(prev => {
        const next = [optimistic, ...prev];
        onCountChange?.(next.length);
        return next;
      });
    }

    try {
      const token = await AsyncStorage.getItem('token');
      const body  = {
        content: (gifUrl || imageUrl || voiceUrl) ? '' : savedText,
        ...(gifUrl       && { gif_url:   gifUrl }),
        ...(imageUrl     && { image_url: imageUrl }),
        ...(voiceUrl     && { voice_url: voiceUrl, voice_duration: voiceDuration }),
        ...(savedReplyTo && { parent_id: savedReplyTo }),
      };
      const res  = await fetch(`${API_BASE_URL}/api/v1/drops/${postId}/thread`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        const real = {
          ...data,
          gif_url:        gifUrl        ?? undefined,
          image_url:      imageUrl      ?? undefined,
          voice_url:      voiceUrl      ?? undefined,
          voice_duration: voiceDuration ?? undefined,
          _optimistic: false,
        };
        if (savedReplyTo) {
          setComments(prev =>
            prev.map(c =>
              c.id === savedReplyTo
                ? { ...c, replies: (c.replies ?? []).map(r => r.id === optimisticId ? real : r) }
                : c,
            ),
          );
        } else {
          setComments(prev => prev.map(c => c.id === optimisticId ? real : c));
        }
      } else {
        if (savedReplyTo) {
          setComments(prev =>
            prev.map(c =>
              c.id === savedReplyTo
                ? { ...c, replies: (c.replies ?? []).filter(r => r.id !== optimisticId) }
                : c,
            ),
          );
        } else {
          setComments(prev => {
            const next = prev.filter(c => c.id !== optimisticId);
            onCountChange?.(next.length);
            return next;
          });
        }
      }
    } catch {
      setComments(prev => {
        const next = prev.filter(c => c.id !== optimisticId);
        onCountChange?.(next.length);
        return next;
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = useCallback(async (commentId, toLike) => {
    setComments(prev =>
      prev.map(c =>
        c.id === commentId
          ? { ...c, liked_by_me: toLike, likes_count: Math.max(0, (c.likes_count || 0) + (toLike ? 1 : -1)) }
          : c,
      ),
    );
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/drops/${postId}/thread/${commentId}/like`, {
        method:  toLike ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [postId]);

  // Owner-only, top-level only (enforced server-side too) — one pinned
  // comment per drop, so pinning a new one locally unpins whichever was
  // pinned before.
  const handlePin = useCallback(async (commentId, toPin) => {
    setComments(prev => prev.map(c => ({
      ...c,
      pinned: c.id === commentId ? toPin : (toPin ? false : c.pinned),
    })));
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/drops/${postId}/thread/${commentId}/pin`, {
        method:  toPin ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [postId]);

  // ── @mention autocomplete ───────────────────────────────────────
  // Simple heuristic (no cursor tracking): an active mention is whatever
  // trails the last "@" in the text, as long as nothing after it is a
  // space — same trigger Twitter/Instagram's compose boxes use.
  const handleTextChange = useCallback((value) => {
    setText(value);
    const match = value.match(/(?:^|\s)@([A-Za-z0-9_.]{0,30})$/);
    setMentionQuery(match ? match[1] : null);
  }, []);

  useEffect(() => {
    clearTimeout(mentionTimer.current);
    if (mentionQuery === null || !mentionQuery.trim()) {
      setMentionResults([]);
      return;
    }
    mentionTimer.current = setTimeout(async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(
          `${API_BASE_URL}/api/v1/users/search?q=${encodeURIComponent(mentionQuery.trim())}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (res.ok) {
          const data = await res.json();
          setMentionResults(data.users || []);
        }
      } catch {}
    }, 200);
    return () => clearTimeout(mentionTimer.current);
  }, [mentionQuery]);

  const handleSelectMention = useCallback((username) => {
    setText(prev => prev.replace(
      /(?:^|\s)@([A-Za-z0-9_.]{0,30})$/,
      (m) => `${m.startsWith(' ') ? ' ' : ''}@${username} `,
    ));
    setMentionQuery(null);
    setMentionResults([]);
    inputRef.current?.focus();
  }, []);

  // Comments only store the mention as plain "@username" text, so tapping
  // one resolves it to a user id on demand via the same search endpoint
  // the autocomplete above uses, then opens the standard profile sheet.
  const handleMentionPress = useCallback(async (username) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/users/search?q=${encodeURIComponent(username)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      const match = (data.users || []).find(
        u => u.username?.toLowerCase() === username.toLowerCase(),
      );
      if (match) {
        setMentionProfile({ visible: true, userId: match.id, anonymousName: match.anonymous_name });
      }
    } catch {}
  }, []);

  const pickImage = useCallback(async () => {
    if (!isAuthenticated) {
      navigation?.navigate?.('AuthNav', { screen: 'Login' });
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setImageUploading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      // Resize to max 800px wide, 70% quality so comment images stay compact
      let uploadUri = asset.uri;
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 800 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        uploadUri = manipResult.uri;
      } catch { /* use original if resize fails */ }
      const form  = new FormData();
      form.append('file', {
        uri:  uploadUri,
        name: 'comment_photo.jpg',
        type: 'image/jpeg',
      });
      form.append('watermark', 'true');
      const uploadRes  = await fetch(`${API_BASE_URL}/api/v1/upload/image`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      });
      const uploadData = await uploadRes.json();
      if (uploadRes.ok && uploadData.url) {
        await submit(null, uploadData.url);
      }
    } catch {}
    finally { setImageUploading(false); }
  }, [isAuthenticated, navigation, submit]);

  const handleVoiceSend = useCallback(({ url, duration }) => {
    submit(null, null, url, duration);
  }, [submit]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, { toValue: H, duration: 220, useNativeDriver: true }).start(onClose);
  }, [onClose]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove:    (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80) handleClose();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  const sortedComments = useMemo(() => {
    const base = sortBy === 'top'
      ? [...comments].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0))
      : comments;
    // Pinned comment always floats to the very top, ahead of whatever
    // sort is applied — matches the backend's initial-load ordering.
    const pinned = base.filter(c => c.pinned);
    if (!pinned.length) return base;
    return [...pinned, ...base.filter(c => !c.pinned)];
  }, [comments, sortBy]);

  const hotCommentId = useMemo(() => {
    if (!comments.length) return null;
    let max = 1, id = null;
    comments.forEach(c => {
      if ((c.likes_count || 0) > max) { max = c.likes_count; id = c.id; }
    });
    return id;
  }, [comments]);

  const firstCommentId = useMemo(() => {
    if (!comments.length) return null;
    return comments[comments.length - 1]?.id ?? null;
  }, [comments]);

  const replyingComment = useMemo(
    () => (replyingTo ? comments.find(c => c.id === replyingTo) : null),
    [replyingTo, comments],
  );

  const renderItem = useCallback(({ item }) => (
    <CommentItem
      item={item}
      isFirst={item.id === firstCommentId}
      isHot={item.id === hotCommentId}
      onReply={setReplyingTo}
      replyingTo={replyingTo}
      onLike={handleLike}
      onOpenImage={setViewerUri}
      isOwner={isOwner}
      onPin={handlePin}
      onMentionPress={handleMentionPress}
    />
  ), [firstCommentId, hotCommentId, replyingTo, handleLike, isOwner, handlePin, handleMentionPress]);

  const keyExtractor = useCallback((item, i) => item.id || String(i), []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={st.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[st.sheet, { transform: [{ translateY: slideAnim }] }]}
        {...pan.panHandlers}
      >
        {/* Handle */}
        <View style={st.handleRow}>
          <View style={st.handleBar} />
        </View>

        {/* Header — centered count, plain-text sort toggle, close on the
            right. No divider under it — TikTok's header blends straight
            into the list instead of boxing itself off. */}
        <View style={st.header}>
          <View style={st.headerSide} />
          <Text style={st.headerTitle} numberOfLines={1}>
            {comments.length} {comments.length === 1 ? 'drop' : 'drops'}
          </Text>
          <TouchableOpacity
            style={st.headerSide}
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ChevronDown size={20} color={T.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={st.sortRow}>
          <TouchableOpacity onPress={() => setSortBy('new')} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Text style={[st.sortText, sortBy === 'new' && st.sortTextActive]}>Newest</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSortBy('top')} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Text style={[st.sortText, sortBy === 'top' && st.sortTextActive]}>Top</Text>
          </TouchableOpacity>
        </View>

        {/* Reply banner — plain text row, no filled block */}
        {replyingTo && replyingComment && (
          <View style={st.replyBanner}>
            <CornerDownRight size={13} color={T.primary} />
            <Text style={st.replyBannerText} numberOfLines={1}>
              Replying to{' '}
              <Text style={{ fontWeight: '700', fontFamily: 'DMSans-Bold' }}>
                {replyingComment.anonymous_name || 'Anonymous'}
              </Text>
            </Text>
            <TouchableOpacity
              onPress={() => setReplyingTo(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={14} color={T.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Body */}
        {loading ? (
          <View style={st.center}>
            <ActivityIndicator color={T.primary} size="large" />
          </View>
        ) : sortedComments.length === 0 ? (
          <View style={st.emptyWrap}>
            <Text style={st.emptyEmoji}>🌑</Text>
            <Text style={st.emptyTitle}>dead silence.</Text>
            <Text style={st.emptyBody}>
              {'no one has been brave enough yet.\nbreak the silence.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={sortedComments}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            style={st.list}
            contentContainerStyle={st.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={8}
            windowSize={5}
            initialNumToRender={8}
          />
        )}

        {/* Emoji picker */}
        {picker === 'emoji' && (
          <EmojiPicker
            onSelect={e => {
              setText(prev => prev + e);
              inputRef.current?.focus();
            }}
          />
        )}

        {/* @mention autocomplete — floats right above the input, same spot
            the emoji picker takes over */}
        {mentionQuery !== null && mentionResults.length > 0 && (
          <View style={st.mentionDropdown}>
            {mentionResults.map(u => (
              <TouchableOpacity
                key={u.id}
                style={st.mentionRow}
                onPress={() => handleSelectMention(u.username)}
                activeOpacity={0.7}
              >
                <View style={st.mentionAvatar}>
                  <Text style={st.mentionAvatarText}>
                    {(u.anonymous_name || u.username)?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
                <Text style={st.mentionUsername} numberOfLines={1}>@{u.username}</Text>
                {!!u.anonymous_name && (
                  <Text style={st.mentionAnon} numberOfLines={1}>{u.anonymous_name}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Input — paddingBottom respects phone nav bar */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[st.inputRow, { paddingBottom: 12 + insets.bottom }]}>
            <View style={st.inputContainer}>
              <TextInput
                ref={inputRef}
                style={st.input}
                value={text}
                onChangeText={handleTextChange}
                onFocus={() => setPicker(null)}
                placeholder={
                  !isAuthenticated
                    ? "sign in. no one will know it's you."
                    : replyingTo
                    ? 'say whats really weighs you down'
                    : "No one knows it's you"
                }
                placeholderTextColor={T.textMuted}
                multiline
                maxLength={500}
                editable={!!isAuthenticated}
                returnKeyType="default"
              />
              {/* Emoji, photo, mic — mic goes last, closest to the send
                  button, and stays coral (compact) so it's clearly its
                  own thing rather than blending into the pill. */}
              <TouchableOpacity
                onPress={() => setPicker(p => (p === 'emoji' ? null : 'emoji'))}
                style={st.emojiToggle}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={st.emojiToggleText}>
                  {picker === 'emoji' ? '✕' : '😊'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickImage}
                style={st.imageInInput}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={imageUploading}
              >
                {imageUploading
                  ? <ActivityIndicator size="small" color={T.primary} />
                  : <ImageIcon size={20} color={T.textMuted} />}
              </TouchableOpacity>
              {/* Hold to record, release to send */}
              <VoiceNoteRecorder onSend={handleVoiceSend} disabled={!isAuthenticated} compact />
            </View>

            <TouchableOpacity
              style={st.sendBtn}
              onPress={() => submit()}
              disabled={!text.trim() || submitting}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              {submitting
                ? <ActivityIndicator size="small" color={T.primary} />
                : (
                  <Text style={[st.sendBtnText, !text.trim() && st.sendBtnTextDisabled]}>
                    Drop
                  </Text>
                )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <TouchableWithoutFeedback onPress={() => setViewerUri(null)}>
          <View style={st.viewerBackdrop}>
            <TouchableOpacity style={st.viewerCloseBtn} onPress={() => setViewerUri(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={22} color="#fff" />
            </TouchableOpacity>
            <Image source={{ uri: viewerUri }} style={st.viewerImage} resizeMode="contain" />
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <AnonProfileSheet
        visible={mentionProfile.visible}
        onClose={() => setMentionProfile(p => ({ ...p, visible: false }))}
        userId={mentionProfile.userId}
        anonymousName={mentionProfile.anonymousName}
      />
    </Modal>
  );
});

// ─── Styles ───────────────────────────────────────────────────
const st = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  // ── Full height sheet ──────────────────────────────────────
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: H * 0.80,
    backgroundColor: T.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6, shadowRadius: 28, elevation: 24,
  },
  handleRow: { alignItems: 'center', paddingTop: 12, paddingBottom: 6 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.borderStrong },
  // ── Header — centered count, no divider, blends into the list ──────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2,
  },
  headerSide:  { width: 24 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: T.text, fontFamily: 'DMSans-Bold' },
  // Plain-text sort toggle — no pill, no border, just weight/color for state
  sortRow: {
    flexDirection: 'row', gap: 18,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10,
  },
  sortText:       { fontSize: 12.5, fontWeight: '600', color: T.textMuted, fontFamily: 'DMSans-SemiBold' },
  sortTextActive: { color: T.text, fontWeight: '800', fontFamily: 'DMSans-Bold' },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  replyBannerText: { flex: 1, fontSize: 12, color: T.textMuted, fontFamily: 'DMSans-Regular' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 44, gap: 10 },
  emptyEmoji:{ fontSize: 42 },
  emptyTitle:{ fontSize: 18, fontWeight: '800', color: T.text, letterSpacing: 0.3, fontFamily: 'PlayfairDisplay-Bold' },
  emptyBody: { fontSize: 14, color: T.textMuted, textAlign: 'center', lineHeight: 21, fontFamily: 'PlayfairDisplay-Italic' },
  list:        { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  // ── TikTok-style flat comment row — no bubble, no border, coral is the
  // only color difference from TikTok's own layout. ──────────────────
  commentItem:      { flexDirection: 'row', gap: 12, marginBottom: 22, alignItems: 'flex-start' },
  commentItemReply: { marginTop: 16, marginBottom: 0 },
  commentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: AVATAR_BG,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  commentAvatarText: { fontSize: 13, fontWeight: '700', color: T.primary, fontFamily: 'DMSans-Bold' },
  commentBody:       { flex: 1 },
  commentMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 3, flexWrap: 'wrap',
  },
  commentAuthor: { fontSize: 12.5, fontWeight: '700', color: T.textMuted, fontFamily: 'DMSans-Bold' },
  firstBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: T.goldDim,
    borderWidth: 1, borderColor: T.goldBorder,
  },
  firstBadgeText: { fontSize: 10, fontWeight: '700', color: T.gold, fontFamily: 'DMSans-Bold' },
  hotBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: T.primaryDim,
    borderWidth: 1, borderColor: T.primaryBorder,
  },
  hotBadgeText:   { fontSize: 10, fontWeight: '700', color: T.primary, fontFamily: 'DMSans-Bold' },
  pinnedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: T.primaryDim,
    borderWidth: 1, borderColor: T.primaryBorder,
  },
  pinnedBadgeText: { fontSize: 10, fontWeight: '700', color: T.primary, fontFamily: 'DMSans-Bold' },
  commentText:  { fontSize: 14.5, color: T.text, lineHeight: 20, fontFamily: 'DMSans-Regular' },
  mentionText:  { color: T.primary, fontFamily: 'DMSans-Bold' },
  commentImage: { width: 160, height: 120, borderRadius: 10 },
  commentFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  commentTime:         { fontSize: 12, color: T.textMuted, fontFamily: 'DMSans-Regular' },
  commentFooterAction: { fontSize: 12, fontWeight: '700', color: T.textMuted, fontFamily: 'DMSans-Bold' },
  viewRepliesBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  viewRepliesLine: { width: 24, height: 1, backgroundColor: T.borderStrong },
  viewRepliesText: { fontSize: 12.5, fontWeight: '700', color: T.textMuted, fontFamily: 'DMSans-Bold' },
  audioWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: T.surfaceAlt, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start',
  },
  audioPlayBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
  },
  audioTimeText: { fontSize: 11, color: T.textSecondary, fontWeight: '600', fontFamily: 'DMSans-SemiBold' },
  likeColumn: { alignItems: 'center', gap: 3, paddingTop: 2, flexShrink: 0 },
  likeCount:  { fontSize: 11, color: T.textMuted, fontFamily: 'DMSans-Regular' },
  repliesWrap: { marginTop: 2 },
  pickerPanel: {
    backgroundColor: T.surfaceAlt,
    maxHeight: 220,
  },
  emojiTabsRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
  },
  emojiTab:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 4 },
  emojiTabActive: { backgroundColor: T.primaryDim },
  emojiTabLabel:  { fontSize: 18 },
  emojiGrid:      { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 8 },
  emojiBtn:       { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emojiText:      { fontSize: 24 },
  // ── @mention autocomplete dropdown ──────────────────────────
  mentionDropdown: {
    maxHeight: 180,
    backgroundColor: T.surface,
  },
  mentionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  mentionAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: T.primaryDim,
    alignItems: 'center', justifyContent: 'center',
  },
  mentionAvatarText: { fontSize: 13, fontWeight: '700', color: T.primary, fontFamily: 'DMSans-Bold' },
  mentionUsername:   { fontSize: 13, fontWeight: '700', color: T.text, fontFamily: 'DMSans-Bold' },
  mentionAnon:        { fontSize: 12, color: T.textMuted, fontFamily: 'DMSans-Regular', flex: 1 },
  // ── Input row — borderless, filled pill, "Drop" text button. TikTok's
  // compose bar has no divider above it and no circular send button —
  // paddingBottom set inline using insets. ───────────────────────────
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingTop: 12,
  },
  emojiToggle: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiToggleText: { fontSize: 23 },
  inputContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.surfaceAlt,
    borderRadius: 24,
    paddingLeft: 18, paddingRight: 8, paddingVertical: 10,
    maxHeight: 100,
  },
  input: { flex: 1, fontSize: 16, color: T.text, lineHeight: 22, paddingVertical: 2, fontFamily: 'DMSans-Regular' },
  imageInInput: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtn: {
    paddingHorizontal: 10, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText:         { fontSize: 16, fontWeight: '800', color: T.primary, fontFamily: 'DMSans-Bold' },
  sendBtnTextDisabled: { color: T.textMuted },
  viewerBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerCloseBtn: {
    position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8,
  },
  viewerImage: { width: W, height: H * 0.8 },
});
