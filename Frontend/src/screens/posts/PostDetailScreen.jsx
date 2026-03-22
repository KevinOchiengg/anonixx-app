/**
 * PostDetailScreen.jsx
 * Full confession view with comments, related confessions.
 *
 * Fixes applied:
 * 1. Comment sheet → 80% height, reply threading, full content visible
 * 2. Related confessions → navigate to Feed tab at that post (not PostDetail)
 * 3. Related cards → no like/message buttons
 * 4. Entrance animations
 * 5. All 17 rules applied
 */
import React, {
  useCallback, useEffect, useRef, useState, useMemo,
} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, StyleSheet, Dimensions,
  Modal, RefreshControl, FlatList,
  Animated, PanResponder, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Send, Bookmark, Share2, Heart,
  MessageCircle, X, ChevronLeft, ChevronRight,
  ChevronDown, MoreHorizontal, CornerDownRight,
} from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP,
} from '../../utils/responsive';
import { useToast }  from '../../components/ui/Toast';
import { useAuth }   from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const { width: W, height: H } = Dimensions.get('window');

const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.08)',
  primaryBorder: 'rgba(255,99,74,0.18)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#5a5f70',
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  'rgba(255,255,255,0.10)',
  avatarBg:      '#1e2330',
};

// ─── GIF / Emoji config ───────────────────────────────────────
const TENOR_API_KEY = 'YOUR_TENOR_API_KEY';
const EMOJI_CATEGORIES = [
  { label: '🔥',  emojis: ['🔥','💯','⚡','✨','💫','🌙','🌚','🌝','👀','💀','👻','🤡','🫠','🥶','🥵'] },
  { label: '😂',  emojis: ['😂','🤣','😭','😍','🥰','😘','😎','🥹','😳','🤯','😱','🤬','😡','🥺','😤'] },
  { label: '❤️',  emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖'] },
  { label: '👍',  emojis: ['👍','👎','🙌','👏','🤝','🙏','💪','✌️','🤞','🫶','🫂','🤦','🤷','💁','🙋'] },
  { label: '😈',  emojis: ['😈','👿','💩','🤮','🤢','🫡','🫣','🫤','😶','😑','😏','😒','🙄','😬','🤥'] },
];

// ─── Image Gallery ────────────────────────────────────────────
const ImageGalleryModal = React.memo(({ visible, images, initialIndex, onClose }) => {
  const [idx, setIdx] = useState(initialIndex);
  useEffect(() => { setIdx(initialIndex); }, [initialIndex]);
  const prev = useCallback(() => setIdx(i => i > 0 ? i - 1 : images.length - 1), [images.length]);
  const next = useCallback(() => setIdx(i => i < images.length - 1 ? i + 1 : 0), [images.length]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={gStyles.overlay}>
        <TouchableOpacity style={gStyles.closeBtn} onPress={onClose} hitSlop={HIT_SLOP}>
          <X size={rs(26)} color="#fff" />
        </TouchableOpacity>
        <Image source={{ uri: images[idx] }} style={gStyles.image} resizeMode="contain" />
        {images.length > 1 && (
          <>
            <TouchableOpacity style={gStyles.prevBtn} onPress={prev} hitSlop={HIT_SLOP}>
              <ChevronLeft size={rs(30)} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={gStyles.nextBtn} onPress={next} hitSlop={HIT_SLOP}>
              <ChevronRight size={rs(30)} color="#fff" />
            </TouchableOpacity>
            <View style={gStyles.counter}>
              <Text style={gStyles.counterText}>{idx + 1} / {images.length}</Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
});

// ─── Emoji Picker ─────────────────────────────────────────────
const EmojiPicker = React.memo(({ onSelect }) => {
  const [activeCategory, setActiveCategory] = useState(0);
  return (
    <View style={csStyles.pickerPanel}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={csStyles.emojiTabs}>
        {EMOJI_CATEGORIES.map((cat, i) => (
          <TouchableOpacity key={i} onPress={() => setActiveCategory(i)} hitSlop={HIT_SLOP}
            style={[csStyles.emojiTab, activeCategory === i && csStyles.emojiTabActive]}>
            <Text style={csStyles.emojiTabLabel}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={csStyles.emojiGrid}>
        {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
          <TouchableOpacity key={i} onPress={() => onSelect(emoji)} hitSlop={HIT_SLOP} style={csStyles.emojiBtn}>
            <Text style={csStyles.emojiText}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

// ─── GIF Picker ───────────────────────────────────────────────
const GifPicker = React.memo(({ onSelect }) => {
  const [query,   setQuery]   = useState('');
  const [gifs,    setGifs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    searchGifs('');
    setTimeout(() => searchRef.current?.focus(), 150);
  }, []);

  const searchGifs = useCallback(async (q) => {
    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&limit=20&media_filter=gif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=20&media_filter=gif`;
      const res  = await fetch(endpoint);
      const data = await res.json();
      setGifs(data.results ?? []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const handleSearch = useCallback((t) => {
    setQuery(t);
    if (t.length === 0 || t.length >= 2) searchGifs(t);
  }, [searchGifs]);

  return (
    <View style={csStyles.pickerPanel}>
      <View style={csStyles.gifSearchRow}>
        <TextInput ref={searchRef} value={query} onChangeText={handleSearch}
          placeholder="Search GIFs…" placeholderTextColor={T.textMuted}
          style={csStyles.gifSearchInput} returnKeyType="search"
          onSubmitEditing={() => searchGifs(query)} />
      </View>
      {loading ? (
        <View style={csStyles.gifLoading}><ActivityIndicator color={T.primary} size="small" /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={csStyles.gifGrid} keyboardShouldPersistTaps="handled">
          <View style={csStyles.gifGridInner}>
            {gifs.map((gif, i) => {
              const url = gif.media_formats?.gif?.url ?? gif.media_formats?.tinygif?.url;
              if (!url) return null;
              return (
                <TouchableOpacity key={gif.id ?? i} onPress={() => onSelect(url)}
                  activeOpacity={0.85} style={csStyles.gifThumb}>
                  <Image source={{ uri: url }} style={csStyles.gifThumbImg} resizeMode="cover" />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
});

// ─── Comment Item (TikTok-style collapsible replies) ─────────
const CommentItem = React.memo(({ item, onReply, replyingTo }) => {
  const active     = replyingTo === item.id;
  const replies    = item.replies ?? [];
  const replyCount = replies.length;
  const [expanded, setExpanded] = useState(false);

  const toggleReplies = useCallback((e) => {
    e?.stopPropagation?.();
    setExpanded(prev => !prev);
  }, []);

  return (
    <View style={csStyles.commentItem}>
      <View style={csStyles.commentAvatar}>
        <Text style={csStyles.commentAvatarText}>
          {item.anonymous_name?.[0]?.toUpperCase() || 'A'}
        </Text>
      </View>
      <View style={csStyles.commentBody}>
        <Text style={csStyles.commentAuthor}>{item.anonymous_name || 'Anonymous'}</Text>
        <Text style={csStyles.commentText}>{item.content}</Text>
        {item.gif_url ? (
          <Image source={{ uri: item.gif_url }} style={csStyles.commentGif} resizeMode="cover" />
        ) : null}
        <Text style={csStyles.commentTime}>{item.time_ago}</Text>

        {replyCount > 0 && !expanded && (
          <TouchableOpacity onPress={toggleReplies} hitSlop={HIT_SLOP} style={csStyles.expandRepliesBtn}>
            <View style={csStyles.expandRepliesLine} />
            <Text style={csStyles.expandRepliesText}>
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'} ▾
            </Text>
          </TouchableOpacity>
        )}

        {expanded && (
          <>
            {replies.map(r => (
              <View key={r.id ?? r.content} style={csStyles.replyItem}>
                <CornerDownRight size={rs(12)} color={T.textMuted} />
                <View style={csStyles.replyAvatar}>
                  <Text style={csStyles.replyAvatarText}>{r.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
                </View>
                <View style={csStyles.replyBody}>
                  <Text style={csStyles.replyAuthor}>{r.anonymous_name || 'Anonymous'}</Text>
                  <Text style={csStyles.replyText}>{r.content}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={toggleReplies} hitSlop={HIT_SLOP} style={csStyles.expandRepliesBtn}>
              <View style={csStyles.expandRepliesLine} />
              <Text style={csStyles.expandRepliesText}>Hide replies ▴</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          onPress={(e) => { e?.stopPropagation?.(); onReply(active ? null : item.id); }}
          hitSlop={HIT_SLOP}
          style={csStyles.replyBtn}
        >
          <Text style={[csStyles.replyBtnText, active && { color: T.primary }]}>
            {active ? 'cancel reply' : 'reply'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── Comment Sheet — 80% ─────────────────────────────────────
const CommentBottomSheet = React.memo(({
  visible, postId, isAuthenticated, navigation, onClose, onCountChange,
}) => {
  const { showToast } = useToast();
  const [comments,   setComments]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [text,       setText]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [picker,     setPicker]     = useState(null); // null | 'emoji' | 'gif'
  const slideAnim = useRef(new Animated.Value(H)).current;
  const inputRef  = useRef(null);

  useEffect(() => {
    if (visible) {
      setComments([]); setReplyingTo(null);
      loadComments();
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 65 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: H, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  // Focus input when reply target is set — delay lets re-render settle
  useEffect(() => {
    if (replyingTo) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [replyingTo]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) { setComments(data.threads || []); onCountChange?.(data.threads?.length || 0); }
    } catch { showToast({ type: 'error', message: 'Could not load comments.' }); }
    finally { setLoading(false); }
  }, [postId, onCountChange, showToast]);

  const submitComment = useCallback(async (gifUrl = null) => {
    if (!gifUrl && !text.trim()) return;
    if (!isAuthenticated) { navigation.navigate('Auth', { screen: 'Login' }); return; }
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const body  = {
        content:    gifUrl ? '' : text.trim(),
        ...(gifUrl     && { gif_url:   gifUrl }),
        ...(replyingTo && { parent_id: replyingTo }),
      };
      const res  = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        const newComment = { ...data, gif_url: gifUrl ?? undefined };
        if (replyingTo) {
          setComments(prev => prev.map(c =>
            c.id === replyingTo ? { ...c, replies: [...(c.replies ?? []), newComment] } : c
          ));
        } else {
          setComments(prev => [newComment, ...prev]);
          onCountChange?.(comments.length + 1);
        }
        setText(''); setReplyingTo(null); setPicker(null);
      } else { showToast({ type: 'error', message: 'Could not post comment.' }); }
    } catch { showToast({ type: 'error', message: 'Could not post comment.' }); }
    finally { setSubmitting(false); }
  }, [text, isAuthenticated, postId, replyingTo, comments.length, navigation, onCountChange, showToast]);

  const handleEmojiSelect = useCallback((emoji) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  }, []);

  const handleGifSelect = useCallback((url) => {
    submitComment(url);
  }, [submitComment]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, { toValue: H, duration: 220, useNativeDriver: true }).start(onClose);
  }, [onClose]);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80) handleClose();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  const handleReply  = useCallback((id) => setReplyingTo(id), []);
  const keyExtractor = useCallback((item, i) => item.id || String(i), []);
  const renderItem   = useCallback(({ item }) => (
    <CommentItem item={item} onReply={handleReply} replyingTo={replyingTo} />
  ), [handleReply, replyingTo]);

  const replyingComment = useMemo(
    () => replyingTo ? comments.find(c => c.id === replyingTo) : null,
    [replyingTo, comments]
  );

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <TouchableOpacity style={csStyles.backdrop} activeOpacity={1} onPress={handleClose} />
      <Animated.View style={[csStyles.sheet, { transform: [{ translateY: slideAnim }] }]} {...panResponder.panHandlers}>
        <View style={csStyles.handleRow}><View style={csStyles.handleBar} /></View>
        <View style={csStyles.sheetHeader}>
          <Text style={csStyles.sheetTitle}>{comments.length} {comments.length === 1 ? 'thought' : 'thoughts'}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={HIT_SLOP}>
            <ChevronDown size={rs(20)} color={T.textSecondary} />
          </TouchableOpacity>
        </View>

        {replyingTo && replyingComment && (
          <View style={csStyles.replyIndicator}>
            <CornerDownRight size={rs(13)} color={T.primary} />
            <Text style={csStyles.replyIndicatorText} numberOfLines={1}>
              Replying to {replyingComment.anonymous_name || 'Anonymous'}
            </Text>
            <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={HIT_SLOP}>
              <X size={rs(14)} color={T.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={csStyles.center}><ActivityIndicator color={T.primary} /></View>
        ) : comments.length === 0 ? (
          <View style={csStyles.center}>
            <Text style={csStyles.emptyEmoji}>🌑</Text>
            <Text style={csStyles.emptyText}>no one has said anything yet.{'\n'}say something.</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            style={csStyles.list}
            contentContainerStyle={csStyles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={8}
            windowSize={5}
            initialNumToRender={6}
          />
        )}

        {picker === 'emoji' && <EmojiPicker onSelect={handleEmojiSelect} />}
        {picker === 'gif'   && <GifPicker   onSelect={handleGifSelect}   />}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={csStyles.inputRow}>
            <TouchableOpacity onPress={() => setPicker(p => p === 'emoji' ? null : 'emoji')}
              hitSlop={HIT_SLOP} style={[csStyles.pickerToggle, picker === 'emoji' && csStyles.pickerToggleActive]}>
              <Text style={csStyles.pickerToggleText}>😊</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPicker(p => p === 'gif' ? null : 'gif')}
              hitSlop={HIT_SLOP} style={[csStyles.pickerToggle, picker === 'gif' && csStyles.pickerToggleActive]}>
              <Text style={csStyles.pickerToggleLabel}>GIF</Text>
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              style={csStyles.input}
              value={text}
              onChangeText={setText}
              onFocus={() => setPicker(null)}
              placeholder={replyingTo ? 'write a reply…' : isAuthenticated ? 'say what you actually think…' : 'sign in to comment…'}
              placeholderTextColor={T.textMuted}
              multiline
              maxLength={500}
              editable={isAuthenticated}
            />
            <TouchableOpacity
              style={[csStyles.sendBtn, (!text.trim() || submitting) && { opacity: 0.4 }]}
              onPress={() => submitComment()}
              disabled={!text.trim() || submitting}
              hitSlop={HIT_SLOP}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={rs(16)} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
});

// ─── Related Card — no like/message ──────────────────────────
const RelatedCard = React.memo(({ post, onPress }) => {
  const preview     = (post.content?.length ?? 0) > 120 ? post.content.substring(0, 120) + '…' : post.content;
  const handlePress = useCallback(() => onPress(post), [post, onPress]);

  return (
    <TouchableOpacity style={rStyles.card} onPress={handlePress} activeOpacity={0.85} hitSlop={HIT_SLOP}>
      <View style={rStyles.cardHeader}>
        <View style={rStyles.avatar}>
          <Text style={rStyles.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
        </View>
        <View style={rStyles.meta}>
          <Text style={rStyles.name}>{post.anonymous_name || 'Anonymous'}</Text>
          <Text style={rStyles.time}>{post.time_ago}</Text>
        </View>
        <Text style={rStyles.arrow}>→</Text>
      </View>
      <Text style={rStyles.content}>{preview}</Text>
      {post.topics?.length > 0 && (
        <View style={rStyles.tagsRow}>
          {post.topics.slice(0, 3).map(t => (
            <View key={t} style={rStyles.tag}><Text style={rStyles.tagText}>{t}</Text></View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─── Main Screen ──────────────────────────────────────────────
export default function PostDetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params;
  const { isAuthenticated }   = useAuth();
  const { showToast }         = useToast();

  const [post,           setPost]           = useState(initialPost);
  const [threadCount,    setThreadCount]    = useState(0);
  const [refreshing,     setRefreshing]     = useState(false);
  const [isLiked,        setIsLiked]        = useState(initialPost.is_liked || false);
  const [likeCount,      setLikeCount]      = useState(initialPost.likes_count || 0);
  const [showComments,   setShowComments]   = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryIndex,   setGalleryIndex]   = useState(0);
  const [relatedPosts,   setRelatedPosts]   = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(true);

  const likeScaleAnim = useRef(new Animated.Value(1)).current;
  const headerOp      = useRef(new Animated.Value(0)).current;
  const contentOp     = useRef(new Animated.Value(0)).current;
  const contentY      = useRef(new Animated.Value(rs(16))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOp,  { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(contentOp, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(contentY,  { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
    fetchThreadCount();
    fetchRelated();
  }, []);

  const fetchThreadCount = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/thread`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) setThreadCount(data.threads?.length || 0);
    } catch {}
  }, [post.id]);

  const fetchRelated = useCallback(async () => {
    setRelatedLoading(true);
    try {
      const token   = await AsyncStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res     = await fetch(`${API_BASE_URL}/api/v1/posts/calm-feed?session_posts=0`, { headers });
      const data    = await res.json();
      if (res.ok) {
        const topics  = post.topics || [];
        const all     = (data.posts || []).filter(p => p.type === 'post' && p.id !== post.id);
        const matched = all.filter(p => p.topics?.some(t => topics.includes(t)));
        const rest    = all.filter(p => !p.topics?.some(t => topics.includes(t)));
        setRelatedPosts([...matched, ...rest].slice(0, 10));
      }
    } catch {}
    finally { setRelatedLoading(false); }
  }, [post.id, post.topics]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRelated();
    setRefreshing(false);
  }, [fetchRelated]);

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      showToast({ type: 'info', message: 'Sign in to like confessions.' });
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : c - 1);
    Animated.sequence([
      Animated.timing(likeScaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(likeScaleAnim, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start();
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
    } catch {
      setIsLiked(!newLiked);
      setLikeCount(c => newLiked ? c - 1 : c + 1);
    }
  }, [isAuthenticated, isLiked, post.id, likeScaleAnim, navigation, showToast]);

  const handleSave = useCallback(async () => {
    if (!isAuthenticated) {
      showToast({ type: 'info', message: 'Sign in to save confessions.' });
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/save`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPost(p => ({ ...p, is_saved: data.saved }));
        showToast({ type: 'success', message: data.saved ? 'Saved.' : 'Removed from saved.' });
      }
    } catch { showToast({ type: 'error', message: 'Could not save. Try again.' }); }
  }, [isAuthenticated, post.id, navigation, showToast]);

  const handleShare = useCallback(async () => {
    try {
      const link = `anonixx://confession/${post.id}`;
      const preview = post.content?.substring(0, 100) ?? '';
      const ellipsis = (post.content?.length ?? 0) > 100 ? '…' : '';
      await Share.share({
        message: `"${preview}${ellipsis}"\n\nRead on Anonixx 👇\n${link}`,
        url: link,
      });
    } catch {}
  }, [post.id, post.content]);

  const openGallery  = useCallback((i) => { setGalleryIndex(i); setGalleryVisible(true);  }, []);
  const closeGallery = useCallback(() => setGalleryVisible(false), []);

  // ── Related → navigate to Feed tab, scroll to that post ───
  const handleRelatedPress = useCallback((relPost) => {
    navigation.navigate('Feed', {
      screen: 'FeedMain',
      params: { scrollToPostId: relPost.id },
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Animated.View style={[styles.header, { opacity: headerOp }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={styles.backBtn}>
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confession</Text>
        <View style={{ width: rs(38) }} />
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} colors={[T.primary]} />
        }
      >
        <Animated.View style={{ opacity: contentOp, transform: [{ translateY: contentY }] }}>
          {/* Main confession card */}
          <View style={styles.postCard}>
            <View style={styles.cardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
              </View>
              <View style={styles.authorInfo}>
                <Text style={styles.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
                <Text style={styles.timestamp}>{post.time_ago}</Text>
              </View>
              <TouchableOpacity hitSlop={HIT_SLOP} style={styles.moreBtn}>
                <MoreHorizontal size={rs(18)} color={T.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />
            <Text style={styles.content}>{post.content}</Text>

            {post.topics?.length > 0 && (
              <View style={styles.topicsRow}>
                {post.topics.map(t => (
                  <View key={t} style={styles.topicTag}>
                    <Text style={styles.topicTagText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}

            {post.images?.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
                {post.images.map((uri, i) => (
                  <TouchableOpacity key={i} onPress={() => openGallery(i)} activeOpacity={0.9} hitSlop={HIT_SLOP}>
                    <Image source={{ uri }} style={styles.postImage} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.divider} />

            <View style={styles.actions}>
              <View style={styles.actionsLeft}>
                <TouchableOpacity onPress={handleSave} style={styles.action} hitSlop={HIT_SLOP}>
                  <Bookmark size={rs(18)} color={post.is_saved ? T.primary : T.textSecondary} fill={post.is_saved ? T.primary : 'none'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShare} style={styles.action} hitSlop={HIT_SLOP}>
                  <Share2 size={rs(18)} color={T.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.actionsRight}>
                <TouchableOpacity onPress={() => setShowComments(true)} style={styles.action} hitSlop={HIT_SLOP}>
                  <MessageCircle size={rs(18)} color={showComments ? T.primary : T.textSecondary} />
                  <Text style={[styles.actionCount, showComments && { color: T.primary }]}>{threadCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLike} style={styles.action} hitSlop={HIT_SLOP}>
                  <Animated.View style={{ transform: [{ scale: likeScaleAnim }] }}>
                    <Heart size={rs(18)} color={isLiked ? T.primary : T.textSecondary} fill={isLiked ? T.primary : 'none'} />
                  </Animated.View>
                  <Text style={[styles.actionCount, isLiked && { color: T.primary }]}>{likeCount}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Related confessions */}
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <View style={styles.relatedLine} />
              <Text style={styles.relatedLabel}>related confessions</Text>
              <View style={styles.relatedLine} />
            </View>
            <Text style={styles.relatedSub}>Tap to continue scrolling from there.</Text>

            {relatedLoading ? (
              <ActivityIndicator color={T.primary} style={{ marginVertical: SPACING.lg }} />
            ) : relatedPosts.length === 0 ? (
              <Text style={styles.noRelated}>nothing else right now.</Text>
            ) : (
              relatedPosts.map(rp => (
                <RelatedCard key={rp.id} post={rp} onPress={handleRelatedPress} />
              ))
            )}
          </View>

          <View style={{ height: SPACING.xl }} />
        </Animated.View>
      </ScrollView>

      <CommentBottomSheet
        visible={showComments}
        postId={post.id}
        isAuthenticated={isAuthenticated}
        navigation={navigation}
        onClose={() => setShowComments(false)}
        onCountChange={setThreadCount}
      />

      {(post.images?.length ?? 0) > 0 && (
        <ImageGalleryModal
          visible={galleryVisible}
          images={post.images}
          initialIndex={galleryIndex}
          onClose={closeGallery}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const gStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeBtn:   { position: 'absolute', top: rp(50), right: SPACING.md, zIndex: 10, padding: rp(8) },
  image:      { width: W, height: H * 0.8 },
  prevBtn:    { position: 'absolute', left: SPACING.md, top: '50%', marginTop: -rs(25), padding: rp(10), backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: RADIUS.full },
  nextBtn:    { position: 'absolute', right: SPACING.md, top: '50%', marginTop: -rs(25), padding: rp(10), backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: RADIUS.full },
  counter:    { position: 'absolute', bottom: rp(50), alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: SPACING.md, paddingVertical: rp(6), borderRadius: RADIUS.full },
  counterText:{ color: '#fff', fontSize: FONT.sm, fontWeight: '600' },
});

const csStyles = StyleSheet.create({
  backdrop:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:         { position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.80, backgroundColor: T.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderTopWidth: 1, borderTopColor: T.borderStrong, shadowColor: '#000', shadowOffset: { width: 0, height: -rs(8) }, shadowOpacity: 0.5, shadowRadius: rs(24), elevation: 20 },
  handleRow:     { alignItems: 'center', paddingTop: rp(12), paddingBottom: rp(4) },
  handleBar:     { width: rs(36), height: rp(4), borderRadius: rp(2), backgroundColor: T.borderStrong },
  sheetHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: T.border },
  sheetTitle:    { fontSize: FONT.sm, fontWeight: '700', color: T.text },
  replyIndicator:{ flexDirection: 'row', alignItems: 'center', gap: rp(8), paddingHorizontal: SPACING.md, paddingVertical: rp(8), backgroundColor: T.primaryDim, borderBottomWidth: 1, borderBottomColor: T.primaryBorder },
  replyIndicatorText: { flex: 1, fontSize: FONT.xs, color: T.primary, fontWeight: '600' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  emptyEmoji:    { fontSize: rf(32) },
  emptyText:     { fontSize: FONT.sm, color: T.textSecondary, fontStyle: 'italic', textAlign: 'center', lineHeight: rf(22) },
  list:          { flex: 1, paddingHorizontal: SPACING.md },
  listContent:   { paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
  commentItem:   { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  commentAvatar: { width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: T.avatarBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.primaryBorder, flexShrink: 0 },
  commentAvatarText: { fontSize: FONT.sm, fontWeight: '700', color: T.primary },
  commentBody:   { flex: 1 },
  commentAuthor: { fontSize: FONT.sm, fontWeight: '600', color: T.text, marginBottom: rp(3) },
  commentText:   { fontSize: FONT.sm, color: T.textSecondary, lineHeight: rf(20) },
  commentTime:   { fontSize: FONT.xs, color: T.textMuted, marginTop: rp(3), opacity: 0.7 },
  replyItem:     { flexDirection: 'row', alignItems: 'flex-start', gap: rp(6), marginTop: rp(10), paddingLeft: rp(4) },
  replyAvatar:   { width: rs(24), height: rs(24), borderRadius: rs(12), backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  replyAvatarText:{ fontSize: rf(10), fontWeight: '700', color: T.primary },
  replyBody:     { flex: 1 },
  replyAuthor:   { fontSize: FONT.xs, fontWeight: '600', color: T.text, marginBottom: rp(2) },
  replyText:     { fontSize: FONT.xs, color: T.textSecondary, lineHeight: rf(17) },
  pickerPanel:       { backgroundColor: T.surfaceAlt, borderTopWidth: 1, borderTopColor: T.border, maxHeight: rs(220) },
  emojiTabs:         { flexDirection: 'row', paddingHorizontal: rp(12), paddingVertical: rp(8), borderBottomWidth: 1, borderBottomColor: T.border },
  emojiTab:          { paddingHorizontal: rp(12), paddingVertical: rp(6), borderRadius: RADIUS.sm, marginRight: rp(4) },
  emojiTabActive:    { backgroundColor: T.primaryDim },
  emojiTabLabel:     { fontSize: rf(18) },
  emojiGrid:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: rp(8), paddingVertical: rp(8) },
  emojiBtn:          { width: rs(44), height: rs(44), alignItems: 'center', justifyContent: 'center' },
  emojiText:         { fontSize: rf(24) },
  gifSearchRow:      { paddingHorizontal: rp(12), paddingVertical: rp(8), borderBottomWidth: 1, borderBottomColor: T.border },
  gifSearchInput:    { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: RADIUS.sm, paddingHorizontal: rp(12), paddingVertical: rp(8), fontSize: FONT.sm, color: T.text, borderWidth: 1, borderColor: T.border },
  gifLoading:        { height: rs(100), alignItems: 'center', justifyContent: 'center' },
  gifGrid:           { flex: 1 },
  gifGridInner:      { flexDirection: 'row', flexWrap: 'wrap', padding: rp(4), gap: rp(4) },
  gifThumb:          { width: (W - rp(32)) / 3, height: rs(80), borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: T.surface },
  gifThumbImg:       { width: '100%', height: '100%' },
  commentGif:        { width: rs(160), height: rs(100), borderRadius: RADIUS.sm, marginTop: rp(6) },
  pickerToggle:      { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  pickerToggleActive:{ backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  pickerToggleText:  { fontSize: rf(17) },
  pickerToggleLabel: { fontSize: rf(9), fontWeight: '800', color: T.primary, letterSpacing: 0.5 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: rp(6), paddingHorizontal: rp(12), paddingVertical: rp(10), borderTopWidth: 1, borderTopColor: T.border },
  input:      { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: rs(22), paddingHorizontal: rp(14), paddingVertical: rp(10), fontSize: FONT.sm, color: T.text, borderWidth: 1, borderColor: T.border, maxHeight: rs(80) },
  sendBtn:    { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  expandRepliesBtn:  { flexDirection: 'row', alignItems: 'center', gap: rp(8), marginTop: rp(8), paddingVertical: rp(4) },
  expandRepliesLine: { width: rs(20), height: 1, backgroundColor: T.primaryBorder },
  expandRepliesText: { fontSize: FONT.xs, color: T.primary, fontWeight: '600' },
  replyBtn:          { marginTop: rp(6) },
  replyBtnText:      { fontSize: FONT.xs, color: T.textMuted, fontWeight: '500' },
});

const rStyles = StyleSheet.create({
  card:       { backgroundColor: T.surface, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderLeftWidth: 1, borderLeftColor: 'rgba(255,99,74,0.3)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  avatar:     { width: rs(30), height: rs(30), borderRadius: rs(15), backgroundColor: T.avatarBg, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, borderWidth: 1, borderColor: T.primaryBorder },
  avatarText: { fontSize: FONT.xs, fontWeight: '700', color: T.primary },
  meta:       { flex: 1 },
  name:       { fontSize: FONT.sm, fontWeight: '600', color: T.text },
  time:       { fontSize: FONT.xs, color: T.textSecondary },
  arrow:      { fontSize: FONT.md, color: T.textMuted },
  content:    { fontSize: FONT.sm, lineHeight: rf(21), color: T.textSecondary, marginBottom: SPACING.sm, fontStyle: 'italic' },
  tagsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6) },
  tag:        { paddingHorizontal: rp(8), paddingVertical: rp(3), borderRadius: RADIUS.sm, backgroundColor: T.primaryDim, borderWidth: 1, borderColor: T.primaryBorder },
  tagText:    { fontSize: FONT.xs, color: T.primary, fontWeight: '500' },
});

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: T.background },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: T.border },
  backBtn:     { padding: rp(4) },
  headerTitle: { fontSize: FONT.md, fontWeight: '600', color: T.text, letterSpacing: 0.2, fontFamily: 'PlayfairDisplay-Regular' },
  scroll:      { flex: 1 },
  postCard:    { margin: SPACING.md, marginBottom: SPACING.sm, backgroundColor: T.surface, paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, borderRadius: RADIUS.lg, borderLeftWidth: 1, borderLeftColor: T.primary },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  avatar:      { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: T.avatarBg, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm, borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)' },
  avatarText:  { fontSize: FONT.md, fontWeight: '700', color: T.primary },
  authorInfo:  { flex: 1 },
  authorName:  { fontSize: FONT.sm, fontWeight: '600', color: T.text },
  timestamp:   { fontSize: FONT.xs, color: T.textSecondary, marginTop: rp(2) },
  moreBtn:     { padding: rp(4) },
  divider:     { height: 1, backgroundColor: T.border, marginVertical: SPACING.sm },
  content:     { fontSize: rf(17), lineHeight: rf(28), color: T.text, letterSpacing: 0.2, marginBottom: SPACING.sm, fontFamily: 'PlayfairDisplay-Regular' },
  topicsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.md },
  topicTag:    { paddingHorizontal: rp(10), paddingVertical: rp(4), borderRadius: RADIUS.sm, backgroundColor: T.primaryDim, borderWidth: 1, borderColor: T.primaryBorder },
  topicTagText:{ fontSize: FONT.xs, color: T.primary, fontWeight: '500' },
  imagesScroll:{ marginBottom: SPACING.md },
  postImage:   { width: W - rs(80), height: rs(240), borderRadius: RADIUS.md, marginRight: SPACING.sm },
  actions:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: rp(2) },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  actionsRight:{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  action:      { flexDirection: 'row', alignItems: 'center', gap: rp(5) },
  actionCount: { fontSize: FONT.sm, fontWeight: '500', color: T.textSecondary },
  relatedSection:{ paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  relatedHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs, marginTop: SPACING.sm },
  relatedLine:   { flex: 1, height: 1, backgroundColor: T.border },
  relatedLabel:  { fontSize: FONT.xs, fontWeight: '600', color: T.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  relatedSub:    { fontSize: FONT.xs, color: T.textMuted, fontStyle: 'italic', textAlign: 'center', marginBottom: SPACING.md },
  noRelated:     { textAlign: 'center', fontSize: FONT.sm, color: T.textSecondary, fontStyle: 'italic', marginVertical: SPACING.lg },
});
