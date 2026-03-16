import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, StyleSheet, Dimensions,
  Modal, RefreshControl, Vibration, FlatList,
  Animated, PanResponder, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Send, Bookmark, Share2, Heart,
  MessageCircle, X, ChevronLeft, ChevronRight,
  ChevronDown, MoreHorizontal,
} from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:   '#0b0f18',
  surface:      '#151924',
  surfaceAlt:   '#1a1f2e',
  primary:      '#FF634A',
  primaryDim:   'rgba(255,99,74,0.08)',
  primaryBorder:'rgba(255,99,74,0.18)',
  text:         '#EAEAF0',
  textSecondary:'#9A9AA3',
  border:       'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  avatarBg:     '#1e2330',
};

const { width, height } = Dimensions.get('window');

// ─── Image Gallery Modal ──────────────────────────────────────────────────────
const ImageGalleryModal = React.memo(({ visible, images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => { setCurrentIndex(initialIndex); }, [initialIndex]);

  const goPrev = useCallback(() =>
    setCurrentIndex(p => (p > 0 ? p - 1 : images.length - 1)), [images.length]);
  const goNext = useCallback(() =>
    setCurrentIndex(p => (p < images.length - 1 ? p + 1 : 0)), [images.length]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={galleryStyles.overlay}>
        <TouchableOpacity style={galleryStyles.closeBtn} onPress={onClose} hitSlop={HIT_SLOP}>
          <X size={rs(26)} color="#fff" />
        </TouchableOpacity>

        <Image
          source={{ uri: images[currentIndex] }}
          style={galleryStyles.image}
          resizeMode="contain"
        />

        {images.length > 1 && (
          <>
            <TouchableOpacity style={galleryStyles.prevBtn} onPress={goPrev} hitSlop={HIT_SLOP}>
              <ChevronLeft size={rs(30)} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={galleryStyles.nextBtn} onPress={goNext} hitSlop={HIT_SLOP}>
              <ChevronRight size={rs(30)} color="#fff" />
            </TouchableOpacity>
            <View style={galleryStyles.counter}>
              <Text style={galleryStyles.counterText}>
                {currentIndex + 1} / {images.length}
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
});

// ─── Comment Bottom Sheet ─────────────────────────────────────────────────────
const CommentBottomSheet = React.memo(({
  visible, postId, isAuthenticated, navigation, onClose, onCountChange,
}) => {
  const { showToast }   = useToast();
  const [comments, setComments]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [text, setText]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      setComments([]);
      loadComments();
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, friction: 8, tension: 65,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: height, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        setComments(data.threads || []);
        onCountChange?.(data.threads?.length || 0);
      }
    } catch {
      showToast({ type: 'error', message: 'Could not load comments.' });
    } finally {
      setLoading(false);
    }
  }, [postId, onCountChange, showToast]);

  const submitComment = useCallback(async () => {
    if (!text.trim()) return;
    if (!isAuthenticated) {
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        const newComment = {
          ...data,
          id: data.id,
          anonymous_name: data.anonymous_name,
          content: text.trim(),
          time_ago: 'just now',
        };
        setComments(prev => [newComment, ...prev]);
        onCountChange?.(comments.length + 1);
        setText('');
      } else {
        showToast({ type: 'error', message: 'Could not post comment.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not post comment.' });
    } finally {
      setSubmitting(false);
    }
  }, [text, isAuthenticated, postId, comments.length, navigation, onCountChange, showToast]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: height, duration: 220, useNativeDriver: true,
    }).start(onClose);
  }, [slideAnim, onClose]);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80) handleClose();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  const renderComment = useCallback(({ item }) => (
    <View style={csStyles.commentItem}>
      <View style={csStyles.commentAvatar}>
        <Text style={csStyles.commentAvatarText}>
          {item.anonymous_name?.[0]?.toUpperCase() || 'A'}
        </Text>
      </View>
      <View style={csStyles.commentBody}>
        <Text style={csStyles.commentAuthor}>{item.anonymous_name || 'Anonymous'}</Text>
        <Text style={csStyles.commentText}>{item.content}</Text>
        <Text style={csStyles.commentTime}>{item.time_ago}</Text>
      </View>
    </View>
  ), []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={csStyles.backdrop} activeOpacity={1} onPress={handleClose} />

      <Animated.View
        style={[csStyles.sheet, { transform: [{ translateY: slideAnim }] }]}
        {...panResponder.panHandlers}
      >
        {/* Handle */}
        <View style={csStyles.handleRow}>
          <View style={csStyles.handleBar} />
        </View>

        {/* Sheet header */}
        <View style={csStyles.sheetHeader}>
          <Text style={csStyles.sheetTitle}>
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </Text>
          <TouchableOpacity onPress={handleClose} hitSlop={HIT_SLOP}>
            <ChevronDown size={rs(20)} color={T.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Comments list */}
        {loading ? (
          <View style={csStyles.center}>
            <ActivityIndicator color={T.primary} />
          </View>
        ) : comments.length === 0 ? (
          <View style={csStyles.center}>
            <Text style={csStyles.emptyText}>no one has said anything yet. say something.</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item, i) => item.id || String(i)}
            style={csStyles.list}
            contentContainerStyle={{ paddingBottom: SPACING.sm }}
            renderItem={renderComment}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={csStyles.inputRow}>
            <TextInput
              style={csStyles.input}
              value={text}
              onChangeText={setText}
              placeholder={
                isAuthenticated
                  ? 'say what you actually think…'
                  : 'sign in to comment…'
              }
              placeholderTextColor={T.textSecondary}
              multiline
              maxLength={500}
              editable={isAuthenticated}
              keyboardShouldPersistTaps="handled"
            />
            <TouchableOpacity
              style={[csStyles.sendBtn, (!text.trim() || submitting) && { opacity: 0.4 }]}
              onPress={submitComment}
              disabled={!text.trim() || submitting}
              hitSlop={HIT_SLOP}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Send size={rs(16)} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
});

// ─── Related Card ─────────────────────────────────────────────────────────────
const RelatedCard = React.memo(({ post, onPress }) => {
  const preview = post.content?.length > 120
    ? post.content.substring(0, 120) + '…'
    : post.content;

  const handlePress = useCallback(() => onPress(post), [post, onPress]);

  return (
    <TouchableOpacity style={relStyles.card} onPress={handlePress} activeOpacity={0.85}>
      <View style={relStyles.cardHeader}>
        <View style={relStyles.avatar}>
          <Text style={relStyles.avatarText}>
            {post.anonymous_name?.[0]?.toUpperCase() || 'A'}
          </Text>
        </View>
        <View style={relStyles.meta}>
          <Text style={relStyles.name}>{post.anonymous_name || 'Anonymous'}</Text>
          <Text style={relStyles.time}>{post.time_ago}</Text>
        </View>
      </View>

      <Text style={relStyles.content}>{preview}</Text>

      <View style={relStyles.footer}>
        {post.topics?.slice(0, 2).map(t => (
          <View key={t} style={relStyles.tag}>
            <Text style={relStyles.tagText}>{t}</Text>
          </View>
        ))}
        <View style={relStyles.statGroup}>
          <View style={relStyles.stat}>
            <Heart size={rs(12)} color={T.textSecondary} />
            <Text style={relStyles.statText}>{post.likes_count || 0}</Text>
          </View>
          <View style={relStyles.stat}>
            <MessageCircle size={rs(12)} color={T.textSecondary} />
            <Text style={relStyles.statText}>{post.thread_count || 0}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PostDetailScreen({ route, navigation }) {
  const { post: initialPost }  = route.params;
  const { isAuthenticated }    = useAuth();
  const { showToast }          = useToast();

  const [post, setPost]                       = useState(initialPost);
  const [threadCount, setThreadCount]         = useState(0);
  const [refreshing, setRefreshing]           = useState(false);
  const [isLiked, setIsLiked]                 = useState(initialPost.is_liked || false);
  const [likeCount, setLikeCount]             = useState(initialPost.likes_count || 0);
  const [showComments, setShowComments]       = useState(false);
  const [galleryVisible, setGalleryVisible]   = useState(false);
  const [galleryIndex, setGalleryIndex]       = useState(0);
  const [relatedPosts, setRelatedPosts]       = useState([]);
  const [relatedLoading, setRelatedLoading]   = useState(true);

  const likeScaleAnim = useRef(new Animated.Value(1)).current;

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
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
      const res     = await fetch(
        `${API_BASE_URL}/api/v1/posts/calm-feed?session_posts=0`, { headers }
      );
      const data = await res.json();
      if (res.ok) {
        const topics  = post.topics || [];
        const all     = (data.posts || []).filter(p => p.type === 'post' && p.id !== post.id);
        const matched = all.filter(p => p.topics?.some(t => topics.includes(t)));
        const rest    = all.filter(p => !p.topics?.some(t => topics.includes(t)));
        setRelatedPosts([...matched, ...rest].slice(0, 10));
      }
    } catch {
      // silent — related is non-critical
    } finally {
      setRelatedLoading(false);
    }
  }, [post.id, post.topics]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Vibration.vibrate(10);
    await fetchRelated();
    setRefreshing(false);
  }, [fetchRelated]);

  // ── Like ─────────────────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: 'Sign in to like confessions.' });
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    Vibration.vibrate(10);
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
        method:  newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert optimistic update
      setIsLiked(!newLiked);
      setLikeCount(c => newLiked ? c - 1 : c + 1);
    }
  }, [isAuthenticated, isLiked, post.id, likeScaleAnim, navigation, showToast]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: 'Sign in to save confessions.' });
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/save`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPost(p => ({ ...p, is_saved: data.saved }));
        showToast({
          type: 'success',
          message: data.saved ? 'Saved.' : 'Removed from saved.',
        });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not save. Try again.' });
    }
  }, [isAuthenticated, post.id, navigation, showToast]);

  // ── Share ─────────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      const preview = post.content?.substring(0, 100);
      const ellipsis = post.content?.length > 100 ? '…' : '';
      await Share.share({
        message: `"${preview}${ellipsis}" — Anonixx`,
      });
    } catch {}
  }, [post.content]);

  // ── Gallery ──────────────────────────────────────────────────────────────────
  const openGallery = useCallback((index) => {
    setGalleryIndex(index);
    setGalleryVisible(true);
  }, []);

  const closeGallery = useCallback(() => setGalleryVisible(false), []);

  // ── Related press ─────────────────────────────────────────────────────────────
  const handleRelatedPress = useCallback((relPost) => {
    navigation.push('PostDetail', { post: relPost });
  }, [navigation]);

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={styles.backBtn}>
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confession</Text>
        <View style={{ width: rs(38) }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={T.primary}
            colors={[T.primary]}
          />
        }
      >
        {/* ── Main confession card ── */}
        <View style={styles.postCard}>
          {/* Author row */}
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {post.anonymous_name?.[0]?.toUpperCase() || 'A'}
              </Text>
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

          {/* Full content — no truncation on detail */}
          <Text style={styles.content}>{post.content}</Text>

          {/* Topics */}
          {post.topics?.length > 0 && (
            <View style={styles.topicsRow}>
              {post.topics.map(t => (
                <View key={t} style={styles.topicTag}>
                  <Text style={styles.topicTagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Images */}
          {post.images?.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imagesScroll}
            >
              {post.images.map((uri, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => openGallery(i)}
                  activeOpacity={0.9}
                  hitSlop={HIT_SLOP}
                >
                  <Image source={{ uri }} style={styles.postImage} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.divider} />

          {/* Actions */}
          <View style={styles.actions}>
            <View style={styles.actionsLeft}>
              <TouchableOpacity onPress={handleSave} style={styles.action} hitSlop={HIT_SLOP}>
                <Bookmark
                  size={rs(18)}
                  color={post.is_saved ? T.primary : T.textSecondary}
                  fill={post.is_saved ? T.primary : 'none'}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.action} hitSlop={HIT_SLOP}>
                <Share2 size={rs(18)} color={T.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.actionsRight}>
              <TouchableOpacity
                onPress={() => setShowComments(true)}
                style={styles.action}
                hitSlop={HIT_SLOP}
              >
                <MessageCircle
                  size={rs(18)}
                  color={showComments ? T.primary : T.textSecondary}
                />
                <Text style={[styles.actionCount, showComments && { color: T.primary }]}>
                  {threadCount}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleLike} style={styles.action} hitSlop={HIT_SLOP}>
                <Animated.View style={{ transform: [{ scale: likeScaleAnim }] }}>
                  <Heart
                    size={rs(18)}
                    color={isLiked ? T.primary : T.textSecondary}
                    fill={isLiked ? T.primary : 'none'}
                  />
                </Animated.View>
                <Text style={[styles.actionCount, isLiked && { color: T.primary }]}>
                  {likeCount}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Related confessions ── */}
        <View style={styles.relatedSection}>
          <View style={styles.relatedHeader}>
            <View style={styles.relatedLine} />
            <Text style={styles.relatedLabel}>related confessions</Text>
            <View style={styles.relatedLine} />
          </View>

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

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* Floating comment sheet */}
      <CommentBottomSheet
        visible={showComments}
        postId={post.id}
        isAuthenticated={isAuthenticated}
        navigation={navigation}
        onClose={() => setShowComments(false)}
        onCountChange={setThreadCount}
      />

      {/* Image gallery */}
      {post.images?.length > 0 && (
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

// ─── Gallery Styles ───────────────────────────────────────────────────────────
const galleryStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: rp(50),
    right: SPACING.md,
    zIndex: 10,
    padding: rp(8),
  },
  image: {
    width,
    height: height * 0.8,
  },
  prevBtn: {
    position: 'absolute',
    left: SPACING.md,
    top: '50%',
    marginTop: -rs(25),
    padding: rp(10),
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: RADIUS.full,
  },
  nextBtn: {
    position: 'absolute',
    right: SPACING.md,
    top: '50%',
    marginTop: -rs(25),
    padding: rp(10),
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: RADIUS.full,
  },
  counter: {
    position: 'absolute',
    bottom: rp(50),
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(6),
    borderRadius: RADIUS.full,
  },
  counterText: {
    color: '#fff',
    fontSize: FONT.sm,
    fontWeight: '600',
  },
});

// ─── Comment Sheet Styles ─────────────────────────────────────────────────────
const csStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: height * 0.62,
    backgroundColor: T.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderTopColor: T.borderStrong,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: rp(12),
    paddingBottom: rp(4),
  },
  handleBar: {
    width: rs(36),
    height: rs(4),
    borderRadius: rs(2),
    backgroundColor: T.borderStrong,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  sheetTitle: {
    fontSize: FONT.sm,
    fontWeight: '700',
    color: T.text,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  list: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  commentItem: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  commentAvatar: {
    width: rs(32),
    height: rs(32),
    borderRadius: rs(16),
    backgroundColor: T.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    fontSize: FONT.sm,
    fontWeight: '700',
    color: T.primary,
  },
  commentBody: { flex: 1 },
  commentAuthor: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: T.text,
    marginBottom: rp(2),
  },
  commentText: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    lineHeight: rf(20),
  },
  commentTime: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    marginTop: rp(3),
    opacity: 0.6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(10),
    fontSize: FONT.sm,
    color: T.text,
    borderWidth: 1,
    borderColor: T.border,
    maxHeight: rs(80),
  },
  sendBtn: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Related Card Styles ──────────────────────────────────────────────────────
const relStyles = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,99,74,0.3)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatar: {
    width: rs(30),
    height: rs(30),
    borderRadius: rs(15),
    backgroundColor: T.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.15)',
  },
  avatarText: {
    fontSize: FONT.xs,
    fontWeight: '700',
    color: T.primary,
  },
  meta: { flex: 1 },
  name: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: T.text,
  },
  time: {
    fontSize: FONT.xs,
    color: T.textSecondary,
  },
  content: {
    fontSize: FONT.sm,
    lineHeight: rf(21),
    color: T.textSecondary,
    marginBottom: SPACING.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: rp(8),
    paddingVertical: rp(3),
    borderRadius: RADIUS.sm,
    backgroundColor: T.primaryDim,
    borderWidth: 1,
    borderColor: T.primaryBorder,
  },
  tagText: {
    fontSize: FONT.xs,
    color: T.primary,
    fontWeight: '500',
  },
  statGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginLeft: 'auto',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(4),
  },
  statText: {
    fontSize: FONT.xs,
    color: T.textSecondary,
  },
});

// ─── Main Screen Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: { padding: rp(4) },
  headerTitle: {
    fontSize: FONT.md,
    fontWeight: '600',
    color: T.text,
    letterSpacing: 0.2,
  },
  scroll: { flex: 1 },

  // Post card
  postCard: {
    margin: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: T.surface,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderLeftWidth: 1,
    borderLeftColor: T.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatar: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    backgroundColor: T.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.2)',
  },
  avatarText: {
    fontSize: FONT.md,
    fontWeight: '700',
    color: T.primary,
  },
  authorInfo: { flex: 1 },
  authorName: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: T.text,
  },
  timestamp: {
    fontSize: FONT.xs,
    color: T.textSecondary,
    marginTop: rp(2),
  },
  moreBtn: { padding: rp(4) },
  divider: {
    height: 1,
    backgroundColor: T.border,
    marginVertical: SPACING.sm,
  },
  content: {
    fontSize: rf(17),
    lineHeight: rf(28),
    color: T.text,
    letterSpacing: 0.2,
    marginBottom: SPACING.sm,
  },
  topicsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  topicTag: {
    paddingHorizontal: rp(10),
    paddingVertical: rp(4),
    borderRadius: RADIUS.sm,
    backgroundColor: T.primaryDim,
    borderWidth: 1,
    borderColor: T.primaryBorder,
  },
  topicTagText: {
    fontSize: FONT.xs,
    color: T.primary,
    fontWeight: '500',
  },
  imagesScroll: { marginBottom: SPACING.md },
  postImage: {
    width: width - rs(80),
    height: rs(240),
    borderRadius: RADIUS.md,
    marginRight: SPACING.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: rp(2),
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(5),
  },
  actionCount: {
    fontSize: FONT.sm,
    fontWeight: '500',
    color: T.textSecondary,
  },

  // Related
  relatedSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  relatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  relatedLine: {
    flex: 1,
    height: 1,
    backgroundColor: T.border,
  },
  relatedLabel: {
    fontSize: FONT.xs,
    fontWeight: '600',
    color: T.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  noRelated: {
    textAlign: 'center',
    fontSize: FONT.sm,
    color: T.textSecondary,
    fontStyle: 'italic',
    marginVertical: SPACING.lg,
  },
});
