/**
 * CommentBottomSheet — shared across CalmPostCard & MediaFeedScreen.
 * Features: comment likes, New/Top sort, color-coded avatars,
 * 🔥 hot badge, "first" badge, nested replies, emoji picker,
 * optimistic posting, spring animations.
 */
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
import {
  ChevronDown, CornerDownRight, Heart, ImageIcon, MessageCircle, Send, X,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';

const { width: W, height: H } = Dimensions.get('window');

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#0f1420',
  surfaceAlt:    '#161b28',
  surfaceHigh:   '#1c2235',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  primaryBorder: 'rgba(255,99,74,0.22)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a5068',
  border:        'rgba(255,255,255,0.05)',
  borderStrong:  'rgba(255,255,255,0.10)',
};

// Avatar background — solid dark, matching the main feed card style.
const AVATAR_BG = '#1e2330';

// ─── Emoji picker data ────────────────────────────────────────
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

// ─── Single comment row ───────────────────────────────────────
const CommentItem = React.memo(({
  item, isFirst, isHot, onReply, replyingTo, onLike, depth = 0,
}) => {
  const isReplying  = replyingTo === item.id;
  const replies     = item.replies ?? [];
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

  return (
    <View style={[st.commentItem, depth > 0 && st.commentItemReply]}>
      {/* Avatar */}
      <View style={st.commentAvatar}>
        <Text style={st.commentAvatarText}>
          {item.anonymous_name?.[0]?.toUpperCase() || 'A'}
        </Text>
      </View>

      <View style={st.commentBody}>
        {/* Meta row */}
        <View style={st.commentMetaRow}>
          <Text style={st.commentAuthor} numberOfLines={1}>
            {item.anonymous_name || 'Anonymous'}
          </Text>
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
          <Text style={st.commentTime}>{item.time_ago || 'just now'}</Text>
        </View>

        {/* Content */}
        {item.content ? (
          <Text style={st.commentText}>{item.content}</Text>
        ) : null}
        {item.gif_url ? (
          <Image source={{ uri: item.gif_url }} style={st.commentGif} resizeMode="cover" />
        ) : null}
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={st.commentImage} resizeMode="cover" />
        ) : null}

        {/* Action bar — reply/replies on left, like on right */}
        <View style={st.commentActions}>
          {/* Left side */}
          <View style={st.commentActionsLeft}>
            {depth === 0 && (
              <TouchableOpacity
                onPress={() => onReply(isReplying ? null : item.id)}
                style={st.commentActionBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <CornerDownRight
                  size={13}
                  color={isReplying ? T.primary : 'rgba(255,255,255,0.3)'}
                />
                <Text style={[st.commentActionText, isReplying && { color: T.primary }]}>
                  {isReplying ? 'cancel' : 'reply'}
                </Text>
              </TouchableOpacity>
            )}
            {depth === 0 && replies.length > 0 && (
              <TouchableOpacity
                onPress={() => setExpanded(v => !v)}
                style={st.commentActionBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MessageCircle size={12} color={T.primary} />
                <Text style={st.repliesCountText}>
                  {expanded ? 'hide' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Right side — like button */}
          <TouchableOpacity
            onPress={handleLike}
            style={st.commentLikeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {(item.likes_count || 0) > 0 && (
              <Text style={[st.commentActionCount, item.liked_by_me && { color: T.primary }]}>
                {likesDisplay}
              </Text>
            )}
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Heart
                size={15}
                color={item.liked_by_me ? T.primary : 'rgba(255,255,255,0.35)'}
                fill={item.liked_by_me ? T.primary : 'none'}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* Nested replies */}
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
                depth={1}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
});

// ─── Main exported component ──────────────────────────────────
export const CommentBottomSheet = React.memo(({
  visible,
  postId,
  isAuthenticated,
  navigation,
  onClose,
  onCountChange,
}) => {
  const [comments,   setComments]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [text,       setText]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [sortBy,       setSortBy]       = useState('new');
  const [picker,       setPicker]       = useState(null);
  const [imageUploading, setImageUploading] = useState(false);

  const slideAnim = useRef(new Animated.Value(H)).current;
  const inputRef  = useRef(null);

  // open / close animation
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

  // focus input when replying
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
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
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

  // optimistic post — gifUrl for gif, imageUrl for photo comment
  const submit = async (gifUrl = null, imageUrl = null) => {
    if (!gifUrl && !imageUrl && !text.trim()) return;
    if (!isAuthenticated) {
      navigation?.navigate?.('Auth', { screen: 'Login' });
      return;
    }
    const optimisticId = `opt_${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      content: (gifUrl || imageUrl) ? '' : text.trim(),
      anonymous_name: 'You',
      time_ago: 'just now',
      likes_count: 0,
      liked_by_me: false,
      replies: [],
      gif_url:   gifUrl   ?? undefined,
      image_url: imageUrl ?? undefined,
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
      setComments(prev => [optimistic, ...prev]);
      onCountChange?.(comments.length + 1);
    }

    try {
      const token = await AsyncStorage.getItem('token');
      const body  = {
        content: (gifUrl || imageUrl) ? '' : savedText,
        ...(gifUrl       && { gif_url:   gifUrl }),
        ...(imageUrl     && { image_url: imageUrl }),
        ...(savedReplyTo && { parent_id: savedReplyTo }),
      };
      const res  = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        const real = { ...data, gif_url: gifUrl ?? undefined, image_url: imageUrl ?? undefined, _optimistic: false };
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
          setComments(prev => prev.filter(c => c.id !== optimisticId));
          onCountChange?.(comments.length);
        }
      }
    } catch {
      setComments(prev => prev.filter(c => c.id !== optimisticId));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = useCallback(async (commentId, toLike) => {
    // optimistic
    setComments(prev =>
      prev.map(c =>
        c.id === commentId
          ? { ...c, liked_by_me: toLike, likes_count: Math.max(0, (c.likes_count || 0) + (toLike ? 1 : -1)) }
          : c,
      ),
    );
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread/${commentId}/like`, {
        method:  toLike ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [postId]);

  const pickImage = useCallback(async () => {
    if (!isAuthenticated) {
      navigation?.navigate?.('Auth', { screen: 'Login' });
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
      const form  = new FormData();
      form.append('file', {
        uri:  asset.uri,
        name: asset.fileName || 'photo.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      const uploadRes = await fetch(`${API_BASE_URL}/api/v1/upload/image`, {
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

  // derived
  const sortedComments = useMemo(() => {
    if (sortBy === 'top') {
      return [...comments].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
    }
    return comments;
  }, [comments, sortBy]);

  const hotCommentId = useMemo(() => {
    if (!comments.length) return null;
    let max = 1, id = null; // threshold > 1 like
    comments.forEach(c => {
      if ((c.likes_count || 0) > max) { max = c.likes_count; id = c.id; }
    });
    return id;
  }, [comments]);

  // chronologically the very first comment posted
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
    />
  ), [firstCommentId, hotCommentId, replyingTo, handleLike]);

  const keyExtractor = useCallback((item, i) => item.id || String(i), []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={st.backdrop} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View
        style={[st.sheet, { transform: [{ translateY: slideAnim }] }]}
        {...pan.panHandlers}
      >
        {/* Handle bar */}
        <View style={st.handleRow}>
          <View style={st.handleBar} />
        </View>

        {/* Header: title + sort toggle + close */}
        <View style={st.header}>
          <Text style={st.headerTitle}>
            {comments.length}{' '}
            <Text style={st.headerSub}>{comments.length === 1 ? 'thought' : 'thoughts'}</Text>
          </Text>

          <View style={st.sortPill}>
            <TouchableOpacity
              onPress={() => setSortBy('new')}
              style={[st.sortBtn, sortBy === 'new' && st.sortBtnActive]}
            >
              <Text style={[st.sortBtnText, sortBy === 'new' && st.sortBtnTextActive]}>
                New
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSortBy('top')}
              style={[st.sortBtn, sortBy === 'top' && st.sortBtnActive]}
            >
              <Text style={[st.sortBtnText, sortBy === 'top' && st.sortBtnTextActive]}>
                🔥 Top
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ChevronDown size={20} color={T.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Replying-to banner */}
        {replyingTo && replyingComment && (
          <View style={st.replyBanner}>
            <CornerDownRight size={13} color={T.primary} />
            <Text style={st.replyBannerText} numberOfLines={1}>
              Replying to{' '}
              <Text style={{ fontWeight: '700' }}>
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

        {/* Emoji picker panel */}
        {picker === 'emoji' && (
          <EmojiPicker
            onSelect={e => {
              setText(prev => prev + e);
              inputRef.current?.focus();
            }}
          />
        )}

        {/* Input area */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.inputRow}>
            {/* Emoji toggle */}
            <TouchableOpacity
              onPress={() => setPicker(p => (p === 'emoji' ? null : 'emoji'))}
              style={[st.emojiToggle, picker === 'emoji' && st.emojiToggleActive]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={st.emojiToggleText}>
                {picker === 'emoji' ? '✕' : '😊'}
              </Text>
            </TouchableOpacity>

            {/* Input container — image icon lives inside the field */}
            <View style={st.inputContainer}>
              <TextInput
                ref={inputRef}
                style={st.input}
                value={text}
                onChangeText={setText}
                onFocus={() => setPicker(null)}
                placeholder={
                  !isAuthenticated
                    ? 'sign in. no one will know it\'s you.'
                    : replyingTo
                    ? 'say what you really think...'
                    : 'no one knows it\'s you. confess.'
                }
                placeholderTextColor={T.textMuted}
                multiline
                maxLength={500}
                editable={!!isAuthenticated}
                returnKeyType="default"
              />
              {/* Image icon — inside the field, right side */}
              <TouchableOpacity
                onPress={pickImage}
                style={st.imageInInput}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={imageUploading}
              >
                {imageUploading
                  ? <ActivityIndicator size="small" color={T.primary} />
                  : <ImageIcon size={17} color={T.textMuted} />}
              </TouchableOpacity>
            </View>

            {/* Send */}
            <TouchableOpacity
              style={[st.sendBtn, (!text.trim() || submitting) && st.sendBtnDisabled]}
              onPress={() => submit()}
              disabled={!text.trim() || submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Send size={15} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
});

// ─── Styles ───────────────────────────────────────────────────
const st = StyleSheet.create({
  // Sheet & backdrop
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: H * 0.78,
    backgroundColor: T.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderTopColor: T.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6, shadowRadius: 28, elevation: 24,
  },
  handleRow: { alignItems: 'center', paddingTop: 12, paddingBottom: 6 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.borderStrong },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: T.text },
  headerSub:   { fontWeight: '500', color: T.textSecondary },

  // Sort pill
  sortPill: {
    flexDirection: 'row',
    backgroundColor: T.surfaceAlt,
    borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: T.borderStrong,
  },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  sortBtnActive: { backgroundColor: T.primaryDim },
  sortBtnText: { fontSize: 12, fontWeight: '700', color: T.textMuted },
  sortBtnTextActive: { color: T.primary },

  // Reply banner
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: T.primaryDim,
    borderBottomWidth: 1, borderBottomColor: T.primaryBorder,
  },
  replyBannerText: { flex: 1, fontSize: 12, color: T.primary },

  // States
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 44, gap: 10 },
  emptyEmoji:{ fontSize: 42 },
  emptyTitle:{ fontSize: 18, fontWeight: '800', color: T.text, letterSpacing: 0.3 },
  emptyBody: { fontSize: 14, color: T.textMuted, textAlign: 'center', lineHeight: 21, fontStyle: 'italic' },

  // List
  list:        { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },

  // Comment item
  commentItem: {
    flexDirection: 'row', gap: 11, marginBottom: 18,
  },
  commentItemReply: {
    marginTop: 10, marginLeft: 2, marginBottom: 10,
  },
  // Avatar matches main feed card style: solid dark bg, same border + text weight
  commentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: AVATAR_BG,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)',
    flexShrink: 0,
  },
  commentAvatarText: { fontSize: 13, fontWeight: '700', color: T.primary },
  commentBody:       { flex: 1 },

  commentMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 4, flexWrap: 'wrap',
  },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: T.text },
  commentTime:   { fontSize: 11, color: T.textMuted, marginLeft: 'auto' },

  // Badges
  firstBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)',
  },
  firstBadgeText: { fontSize: 10, fontWeight: '700', color: '#FBBF24' },
  hotBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: 'rgba(255,99,74,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.35)',
  },
  hotBadgeText: { fontSize: 10, fontWeight: '700', color: '#FF634A' },

  // Comment text & media
  commentText: { fontSize: 14, color: T.textSecondary, lineHeight: 21 },
  commentGif:   { width: 160, height: 100, borderRadius: 10, marginTop: 6 },
  // 4:3 aspect ratio matches the crop applied during pick
  commentImage: {
    width: 220, height: 165, borderRadius: 12, marginTop: 8,
    borderWidth: 1, borderColor: T.borderStrong,
  },

  // Action bar
  commentActions:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  commentActionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  commentActionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  commentLikeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 8 },
  commentActionCount: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  commentActionText:  { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  repliesCountText:   { fontSize: 12, fontWeight: '700', color: T.primary },

  // Nested replies
  repliesWrap: { marginTop: 10, paddingLeft: 4 },
  replyAvatar: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: AVATAR_BG,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)',
    flexShrink: 0,
  },
  replyAvatarText: { fontSize: 10, fontWeight: '700', color: T.primary },

  // Emoji picker
  pickerPanel: {
    backgroundColor: T.surfaceAlt,
    borderTopWidth: 1, borderTopColor: T.border,
    maxHeight: 220,
  },
  emojiTabsRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  emojiTab:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 4 },
  emojiTabActive: { backgroundColor: T.primaryDim },
  emojiTabLabel:  { fontSize: 18 },
  emojiGrid:      { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 8 },
  emojiBtn:       { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emojiText:      { fontSize: 24 },

  // Input row
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  emojiToggle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.borderStrong,
  },
  emojiToggleActive: { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  emojiToggleText:   { fontSize: 18 },
  // Container wraps the text input + image icon so they appear as one field
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surfaceAlt,
    borderRadius: 22,
    borderWidth: 1, borderColor: T.borderStrong,
    paddingLeft: 16, paddingRight: 8,
    paddingVertical: 8,
    maxHeight: 90,
  },
  input: {
    flex: 1,
    fontSize: 14, color: T.text,
    lineHeight: 20,
    paddingVertical: 2,
  },
  // Image icon sits flush inside the right edge of the input field
  imageInInput: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  sendBtnDisabled: { opacity: 0.4 },
});
