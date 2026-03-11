import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { FEATURES } from '../../config/featureFlags';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, SafeAreaView, Image, StyleSheet, Alert,
  StatusBar, Dimensions, Share, Modal, RefreshControl, Vibration,
  FlatList, Animated, PanResponder, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Send, Play, Bookmark, Share2, Heart,
  MessageCircle, X, ChevronLeft, ChevronRight,
  ChevronDown, MoreHorizontal,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const { width, height } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  borderStrong: 'rgba(255,255,255,0.10)',
  avatarBg: '#1e2330',
  input: 'rgba(30,35,45,0.8)',
};

// ── Starry Background ─────────────────────────────────────────
const StarryBackground = () => {
  const stars = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    id: i,
    top: Math.random() * height,
    left: Math.random() * width,
    size: Math.random() * 3 + 1,
    opacity: Math.random() * 0.6 + 0.2,
  })), []);
  return (
    <>
      {stars.map((star) => (
        <View key={star.id} style={{
          position: 'absolute', backgroundColor: THEME.primary, borderRadius: 50,
          top: star.top, left: star.left, width: star.size, height: star.size, opacity: star.opacity,
        }} />
      ))}
    </>
  );
};

// ── Image Gallery Modal ───────────────────────────────────────
const ImageGalleryModal = ({ visible, images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  useEffect(() => { setCurrentIndex(initialIndex); }, [initialIndex]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.galleryModal}>
        <TouchableOpacity style={styles.galleryClose} onPress={onClose}>
          <X size={28} color="#fff" />
        </TouchableOpacity>
        <Image source={{ uri: images[currentIndex] }} style={styles.galleryImage} resizeMode="contain" />
        {images.length > 1 && (
          <>
            <TouchableOpacity style={styles.galleryPrev} onPress={() => setCurrentIndex((p) => (p > 0 ? p - 1 : images.length - 1))}>
              <ChevronLeft size={32} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.galleryNext} onPress={() => setCurrentIndex((p) => (p < images.length - 1 ? p + 1 : 0))}>
              <ChevronRight size={32} color="#fff" />
            </TouchableOpacity>
            <View style={styles.galleryIndicator}>
              <Text style={styles.galleryIndicatorText}>{currentIndex + 1} / {images.length}</Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
};

// ── Comment Bottom Sheet (floats over everything) ─────────────
const CommentBottomSheet = ({ visible, postId, isAuthenticated, navigation, onClose, onCountChange }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      setComments([]);
      loadComments();
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 65 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: height, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        setComments(data.threads || []);
        onCountChange?.(data.threads?.length || 0);
      }
    } catch (e) {
      console.error('Load comments:', e);
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async () => {
    if (!text.trim()) return;
    if (!isAuthenticated) { navigation.navigate('Auth', { screen: 'Login' }); return; }
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        const newComment = { ...data, id: data.id, anonymous_name: data.anonymous_name, content: text.trim(), time_ago: 'just now' };
        setComments((prev) => [newComment, ...prev]);
        onCountChange?.(comments.length + 1);
        setText('');
      }
    } catch (e) {
      console.error('Submit comment:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: height, duration: 220, useNativeDriver: true }).start(onClose);
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80) handleClose();
      else Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <TouchableOpacity style={csStyles.backdrop} activeOpacity={1} onPress={handleClose} />
      <Animated.View style={[csStyles.sheet, { transform: [{ translateY: slideAnim }] }]} {...panResponder.panHandlers}>
        <View style={csStyles.handleRow}>
          <View style={csStyles.handleBar} />
        </View>
        <View style={csStyles.header}>
          <Text style={csStyles.headerText}>
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <ChevronDown size={20} color={THEME.textSecondary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={csStyles.loadingWrap}><ActivityIndicator color={THEME.primary} /></View>
        ) : comments.length === 0 ? (
          <View style={csStyles.emptyWrap}>
            <Text style={csStyles.emptyText}>no one has said anything yet. say something.</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item, i) => item.id || String(i)}
            style={csStyles.list}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item }) => (
              <View style={csStyles.commentItem}>
                <View style={csStyles.commentAvatar}>
                  <Text style={csStyles.commentAvatarText}>{item.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
                </View>
                <View style={csStyles.commentBody}>
                  <Text style={csStyles.commentAuthor}>{item.anonymous_name || 'Anonymous'}</Text>
                  <Text style={csStyles.commentText}>{item.content}</Text>
                  <Text style={csStyles.commentTime}>{item.time_ago}</Text>
                </View>
              </View>
            )}
          />
        )}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={csStyles.inputRow}>
            <TextInput
              style={csStyles.input}
              value={text}
              onChangeText={setText}
              placeholder={isAuthenticated ? 'say what you actually think...' : 'sign in to comment...'}
              placeholderTextColor={THEME.textSecondary}
              multiline
              maxLength={500}
              editable={isAuthenticated}
            />
            <TouchableOpacity
              style={[csStyles.sendBtn, (!text.trim() || submitting) && { opacity: 0.4 }]}
              onPress={submitComment}
              disabled={!text.trim() || submitting}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

// ── Related Confession Card (compact) ─────────────────────────
const RelatedCard = ({ post, onPress }) => {
  const preview = post.content?.length > 120 ? post.content.substring(0, 120) + '...' : post.content;
  return (
    <TouchableOpacity style={relStyles.card} onPress={() => onPress(post)} activeOpacity={0.85}>
      <View style={relStyles.cardHeader}>
        <View style={relStyles.avatar}>
          <Text style={relStyles.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
        </View>
        <View style={relStyles.meta}>
          <Text style={relStyles.name}>{post.anonymous_name || 'Anonymous'}</Text>
          <Text style={relStyles.time}>{post.time_ago}</Text>
        </View>
      </View>
      <Text style={relStyles.content}>{preview}</Text>
      <View style={relStyles.footer}>
        {post.topics?.slice(0, 2).map((t) => (
          <View key={t} style={relStyles.tag}>
            <Text style={relStyles.tagText}>{t}</Text>
          </View>
        ))}
        <View style={relStyles.stat}>
          <Heart size={12} color={THEME.textSecondary} />
          <Text style={relStyles.statText}>{post.likes_count || 0}</Text>
        </View>
        <View style={relStyles.stat}>
          <MessageCircle size={12} color={THEME.textSecondary} />
          <Text style={relStyles.statText}>{post.thread_count || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── Main Screen ───────────────────────────────────────────────
export default function PostDetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params;
  const { isAuthenticated } = useAuth();

  const [post, setPost] = useState(initialPost);
  const [threadCount, setThreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isLiked, setIsLiked] = useState(initialPost.is_liked || false);
  const [likeCount, setLikeCount] = useState(initialPost.likes_count || 0);
  const [showComments, setShowComments] = useState(false);
  const [imageGalleryVisible, setImageGalleryVisible] = useState(false);
  const [imageGalleryIndex, setImageGalleryIndex] = useState(0);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const likeScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadRelated();
    fetchInitialThreadCount();
  }, []);

  const fetchInitialThreadCount = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/thread`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) setThreadCount(data.threads?.length || 0);
    } catch (e) {}
  };

  const loadRelated = async () => {
    setRelatedLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      // Fetch fresh posts and filter by matching topics client-side
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/calm-feed?session_posts=0`, { headers });
      const data = await res.json();
      if (res.ok) {
        const topics = post.topics || [];
        const all = (data.posts || []).filter((p) => p.type === 'post' && p.id !== post.id);
        // Prioritise topic matches, then fill with others
        const matched = all.filter((p) => p.topics?.some((t) => topics.includes(t)));
        const rest = all.filter((p) => !p.topics?.some((t) => topics.includes(t)));
        setRelatedPosts([...matched, ...rest].slice(0, 10));
      }
    } catch (e) {
      console.error('Related posts:', e);
    } finally {
      setRelatedLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Vibration.vibrate(10);
    loadRelated().finally(() => setRefreshing(false));
  }, []);

  const handleLike = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to like confessions', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) },
      ]);
      return;
    }
    Vibration.vibrate(10);
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount(newLiked ? likeCount + 1 : likeCount - 1);
    Animated.sequence([
      Animated.timing(likeScaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(likeScaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setIsLiked(!newLiked);
      setLikeCount(newLiked ? likeCount - 1 : likeCount + 1);
    }
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to save confessions', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) },
      ]);
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setPost({ ...post, is_saved: data.saved });
    } catch (e) { console.error(e); }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `"${post.content?.substring(0, 100)}${post.content?.length > 100 ? '...' : ''}" — Anonixx`,
      });
    } catch (e) { console.log(e); }
  };

  const handleRelatedPress = (relPost) => {
    navigation.push('PostDetail', { post: relPost });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confession</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} colors={[THEME.primary]} />}
      >
        {/* ── Confession Card (matches feed card exactly) ─────── */}
        <View style={styles.postCard}>
          {/* Author */}
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
              <Text style={styles.timestamp}>{post.time_ago}</Text>
            </View>
            <TouchableOpacity style={styles.moreButton}>
              <MoreHorizontal size={18} color={THEME.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Content — full, no truncation on detail */}
          <Text style={styles.content}>{post.content}</Text>

          {/* Topics */}
          {post.topics?.length > 0 && (
            <View style={styles.topicsRow}>
              {post.topics.map((t) => (
                <View key={t} style={styles.topicTag}>
                  <Text style={styles.topicTagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Images */}
          {post.images?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesContainer}>
              {post.images.map((imageUri, index) => (
                <TouchableOpacity key={index} onPress={() => { setImageGalleryIndex(index); setImageGalleryVisible(true); }} activeOpacity={0.9}>
                  <Image source={{ uri: imageUri }} style={styles.postImage} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.divider} />

          {/* Actions — identical layout to feed card */}
          <View style={styles.actions}>
            <View style={styles.actionsLeft}>
              <TouchableOpacity onPress={handleSave} style={styles.action}>
                <Bookmark size={18} color={post.is_saved ? THEME.primary : THEME.textSecondary} fill={post.is_saved ? THEME.primary : 'none'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.action}>
                <Share2 size={18} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.actionsRight}>
              {/* Comment — opens floating bottom sheet */}
              <TouchableOpacity onPress={() => setShowComments(true)} style={styles.action}>
                <MessageCircle size={18} color={showComments ? THEME.primary : THEME.textSecondary} />
                <Text style={[styles.actionCount, showComments && { color: THEME.primary }]}>{threadCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLike} style={styles.action}>
                <Animated.View style={{ transform: [{ scale: likeScaleAnim }] }}>
                  <Heart size={18} color={isLiked ? THEME.primary : THEME.textSecondary} fill={isLiked ? THEME.primary : 'none'} />
                </Animated.View>
                <Text style={[styles.actionCount, isLiked && { color: THEME.primary }]}>{likeCount}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Related Confessions ─────────────────────────────── */}
        <View style={styles.relatedSection}>
          <View style={styles.relatedHeader}>
            <View style={styles.relatedHeaderLine} />
            <Text style={styles.relatedHeaderText}>related confessions</Text>
            <View style={styles.relatedHeaderLine} />
          </View>

          {relatedLoading ? (
            <ActivityIndicator color={THEME.primary} style={{ marginVertical: 24 }} />
          ) : relatedPosts.length === 0 ? (
            <Text style={styles.noRelated}>nothing else right now.</Text>
          ) : (
            relatedPosts.map((rp) => (
              <RelatedCard key={rp.id} post={rp} onPress={handleRelatedPress} />
            ))
          )}
        </View>
      </ScrollView>

      {/* Floating comment bottom sheet */}
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
          visible={imageGalleryVisible}
          images={post.images}
          initialIndex={imageGalleryIndex}
          onClose={() => setImageGalleryVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ── Comment Sheet Styles ──────────────────────────────────────
const csStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: height * 0.62,
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderTopColor: THEME.borderStrong,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 20,
  },
  handleRow: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: THEME.borderStrong },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  headerText: { fontSize: 14, fontWeight: '700', color: THEME.text },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: THEME.textSecondary, fontStyle: 'italic', textAlign: 'center' },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  commentItem: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  commentAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center',
  },
  commentAvatarText: { fontSize: 13, fontWeight: '700', color: THEME.primary },
  commentBody: { flex: 1 },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: THEME.text, marginBottom: 3 },
  commentText: { fontSize: 14, color: THEME.textSecondary, lineHeight: 20 },
  commentTime: { fontSize: 11, color: THEME.textSecondary, marginTop: 4, opacity: 0.6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: THEME.border,
  },
  input: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: THEME.text,
    borderWidth: 1, borderColor: THEME.border, maxHeight: 80,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center',
  },
});

// ── Related Card Styles ───────────────────────────────────────
const relStyles = StyleSheet.create({
  card: {
    backgroundColor: THEME.surface,
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderLeftWidth: 1, borderLeftColor: 'rgba(255,99,74,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center',
    marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,99,74,0.15)',
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: THEME.primary },
  meta: { flex: 1 },
  name: { fontSize: 13, fontWeight: '600', color: THEME.text },
  time: { fontSize: 11, color: THEME.textSecondary },
  content: { fontSize: 14, lineHeight: 21, color: THEME.textSecondary, marginBottom: 10 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: 'rgba(255,99,74,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.15)',
  },
  tagText: { fontSize: 11, color: THEME.primary, fontWeight: '500' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  statText: { fontSize: 12, color: THEME.textSecondary },
});

// ── Main Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, zIndex: 10,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: THEME.text },
  scrollView: { flex: 1 },

  // Post card — exactly like feed card
  postCard: {
    margin: 16, marginBottom: 8,
    backgroundColor: THEME.surface,
    paddingVertical: 20, paddingHorizontal: 20, paddingLeft: 22,
    borderRadius: 18,
    borderLeftWidth: 1, borderLeftColor: THEME.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 24, elevation: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center',
    marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: THEME.primary },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '600', color: THEME.text },
  timestamp: { fontSize: 12, color: THEME.textSecondary, marginTop: 1 },
  moreButton: { padding: 4 },
  divider: { height: 1, backgroundColor: THEME.border, marginVertical: 12 },
  content: { fontSize: 17, lineHeight: 28, color: THEME.text, letterSpacing: 0.2, marginBottom: 12 },

  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  topicTag: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    backgroundColor: 'rgba(255,99,74,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,99,74,0.18)',
  },
  topicTagText: { fontSize: 12, color: THEME.primary, fontWeight: '500' },

  imagesContainer: { marginBottom: 14 },
  postImage: { width: width - 80, height: 240, borderRadius: 12, marginRight: 8 },

  // Actions — identical to feed
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 14, fontWeight: '500', color: THEME.textSecondary },

  // Related section
  relatedSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  relatedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 16, marginTop: 8,
  },
  relatedHeaderLine: { flex: 1, height: 1, backgroundColor: THEME.border },
  relatedHeaderText: { fontSize: 12, fontWeight: '600', color: THEME.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  noRelated: { textAlign: 'center', fontSize: 13, color: THEME.textSecondary, fontStyle: 'italic', marginVertical: 24 },

  // Image gallery
  galleryModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  galleryClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  galleryImage: { width, height: height * 0.8 },
  galleryPrev: { position: 'absolute', left: 20, top: '50%', marginTop: -25, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25 },
  galleryNext: { position: 'absolute', right: 20, top: '50%', marginTop: -25, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25 },
  galleryIndicator: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  galleryIndicatorText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
