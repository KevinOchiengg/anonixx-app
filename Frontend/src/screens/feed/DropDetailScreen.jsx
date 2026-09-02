/**
 * DropDetailScreen.jsx
 * Full drop view with comments, related drops. Replaces the old
 * PostDetailScreen — same layout/behavior, repointed at the native
 * /api/v1/drops/* endpoints instead of the removed posts feature.
 */
import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, StyleSheet, Dimensions,
  Modal, RefreshControl,
  Animated, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Bookmark, Share2, Heart,
  MessageCircle, X, ChevronLeft, ChevronRight,
  MoreHorizontal,
} from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT,
} from '../../utils/responsive';
import { useToast }  from '../../components/ui/Toast';
import { useAuth }   from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';
import { CommentBottomSheet } from '../../components/feed/CommentBottomSheet';

const { width: W, height: H } = Dimensions.get('window');

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

// ─── Related Card — no like/message ──────────────────────────
const RelatedCard = React.memo(({ post, onPress }) => {
  const preview     = (post.content?.length ?? 0) > 120 ? post.content.substring(0, 120) + '…' : post.content;
  const handlePress = useCallback(() => onPress(post), [post, onPress]);
  const hasCaption  = (post.content?.length ?? 0) > 0;
  const hasImage    = !!(post.media_url && post.media_type === 'image');
  const hasVideo    = !!post.video_url;

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
        <ChevronRight size={rs(16)} color={T.textMuted} />
      </View>
      {hasCaption ? (
        <Text style={rStyles.content}>{preview}</Text>
      ) : null}
      {!hasCaption && hasImage ? (
        <Image
          source={{ uri: post.media_url }}
          style={rStyles.mediaThumb}
          resizeMode="cover"
        />
      ) : !hasCaption && hasVideo ? (
        <View style={rStyles.videoThumb}>
          <Text style={rStyles.videoThumbIcon}>▶</Text>
          <Text style={rStyles.videoThumbLabel}>video</Text>
        </View>
      ) : null}
      {post.mood_tag && (
        <View style={rStyles.tagsRow}>
          <View style={rStyles.tag}><Text style={rStyles.tagText}>{post.mood_tag}</Text></View>
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─── Main Screen ──────────────────────────────────────────────
export default function DropDetailScreen({ route, navigation }) {
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
  const [showOptions,      setShowOptions]      = useState(false);
  const [deleting,         setDeleting]         = useState(false);
  const [contentExpanded,  setContentExpanded]  = useState(false);
  const [editVisible,      setEditVisible]      = useState(false);
  const [editText,         setEditText]         = useState('');
  const [saving,           setSaving]           = useState(false);

  const likeScaleAnim = useRef(new Animated.Value(1)).current;
  const headerOp      = useRef(new Animated.Value(0)).current;
  const contentOp     = useRef(new Animated.Value(0)).current;
  const contentY      = useRef(new Animated.Value(rs(16))).current;

  const images = (post.media_url && post.media_type === 'image') ? [post.media_url] : [];

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
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${post.id}/thread`, {
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
      const res     = await fetch(`${API_BASE_URL}/api/v1/drops/feed?session_posts=0`, { headers });
      const data    = await res.json();
      if (res.ok) {
        const mood    = post.mood_tag;
        const all     = (data.posts || []).filter(p => p.type === 'drop' && p.id !== post.id);
        const matched = all.filter(p => mood && p.mood_tag === mood);
        const rest    = all.filter(p => !(mood && p.mood_tag === mood));
        setRelatedPosts([...matched, ...rest].slice(0, 10));
      }
    } catch {}
    finally { setRelatedLoading(false); }
  }, [post.id, post.mood_tag]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRelated();
    setRefreshing(false);
  }, [fetchRelated]);

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: "Sign in to like it — they'll never know it was you." });
      navigation.navigate('AuthNav', { screen: 'Login' });
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
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${post.id}/like`, {
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
      showToast({ type: 'info', message: 'Sign in to save it for later.' });
      navigation.navigate('AuthNav', { screen: 'Login' });
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${post.id}/save`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPost(p => ({ ...p, is_saved: data.saved }));
        showToast({ type: 'success', message: data.saved ? 'Saved for later.' : 'Removed from saved.' });
      }
    } catch { showToast({ type: 'error', message: 'Could not save. Try again.' }); }
  }, [isAuthenticated, post.id, navigation, showToast]);

  const handleShare = useCallback(async () => {
    try {
      const preview  = post.content?.substring(0, 120) ?? '';
      const ellipsis = (post.content?.length ?? 0) > 120 ? '…' : '';
      await Share.share({ message: `"${preview}${ellipsis}" — Anonixx` });
    } catch {}
  }, [post.content]);

  const openGallery  = useCallback((i) => { setGalleryIndex(i); setGalleryVisible(true);  }, []);
  const closeGallery = useCallback(() => setGalleryVisible(false), []);

  const handleEdit = useCallback(() => {
    setShowOptions(false);
    setEditText(post.content || '');
    setEditVisible(true);
  }, [post.content]);

  const handleSaveEdit = useCallback(async () => {
    if (!editText.trim()) {
      showToast({ type: 'warning', message: 'Content cannot be empty.' });
      return;
    }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${post.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ content: editText.trim() }),
      });
      if (!res.ok) throw new Error();
      setPost(p => ({ ...p, content: editText.trim() }));
      setEditVisible(false);
      showToast({ type: 'success', message: 'Drop updated.' });
    } catch {
      showToast({ type: 'error', message: 'Could not save changes. Try again.' });
    } finally {
      setSaving(false);
    }
  }, [editText, post.id, showToast]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/${post.id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setShowOptions(false);
      showToast({ type: 'success', message: 'Gone for good.' });
      navigation.goBack();
    } catch {
      showToast({ type: 'error', message: 'Could not delete. Try again.' });
    } finally {
      setDeleting(false);
    }
  }, [post.id, navigation, showToast]);

  // ── Related → navigate to Feed tab, scroll to that drop ───
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
              {post.is_own_post && (
                <TouchableOpacity
                  onPress={() => setShowOptions(true)}
                  hitSlop={HIT_SLOP}
                  style={styles.moreBtn}
                >
                  <MoreHorizontal size={rs(18)} color={T.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />
            {(() => {
              const LIMIT = 280;
              const isLong = (post.content?.length || 0) > LIMIT;
              const displayed = isLong && !contentExpanded
                ? post.content.substring(0, LIMIT) + '…'
                : post.content;
              return (
                <TouchableOpacity
                  onPress={() => setContentExpanded(v => !v)}
                  activeOpacity={isLong ? 0.85 : 1}
                >
                  <Text style={styles.content}>
                    {displayed}
                    {isLong && (
                      <Text style={styles.readMore}>
                        {contentExpanded ? ' less' : ' more'}
                      </Text>
                    )}
                  </Text>
                </TouchableOpacity>
              );
            })()}

            {post.mood_tag && (
              <View style={styles.topicsRow}>
                <View style={styles.topicTag}>
                  <Text style={styles.topicTagText}>{post.mood_tag}</Text>
                </View>
              </View>
            )}

            {images.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
                {images.map((uri, i) => (
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

      {images.length > 0 && (
        <ImageGalleryModal
          visible={galleryVisible}
          images={images}
          initialIndex={galleryIndex}
          onClose={closeGallery}
        />
      )}

      {/* ── Drop options sheet (own drops only) ─────────────── */}
      <Modal
        visible={showOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptions(false)}
      >
        <TouchableOpacity
          style={optStyles.backdrop}
          activeOpacity={1}
          onPress={() => setShowOptions(false)}
        >
          <View style={optStyles.sheet}>
            <View style={optStyles.handle} />

            <TouchableOpacity
              onPress={handleEdit}
              style={optStyles.option}
              activeOpacity={0.7}
            >
              <Text style={optStyles.optionText}>Edit drop</Text>
            </TouchableOpacity>

            <View style={optStyles.divider} />

            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleting}
              style={optStyles.option}
              activeOpacity={0.7}
            >
              {deleting
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <Text style={[optStyles.optionText, optStyles.optionDestructive]}>Delete drop</Text>
              }
            </TouchableOpacity>

            <View style={optStyles.divider} />

            <TouchableOpacity
              onPress={() => setShowOptions(false)}
              style={optStyles.option}
              activeOpacity={0.7}
            >
              <Text style={optStyles.optionCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Edit drop modal ──────────────────────────────────── */}
      <Modal
        visible={editVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditVisible(false)}
      >
        <View style={editStyles.backdrop}>
          <View style={editStyles.card}>
            <Text style={editStyles.title}>Edit drop</Text>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              style={editStyles.input}
              multiline
              maxLength={2000}
              placeholder="What's on your mind?"
              placeholderTextColor={T.textMuted}
              autoFocus
            />
            <View style={editStyles.row}>
              <TouchableOpacity
                onPress={() => setEditVisible(false)}
                style={[editStyles.btn, editStyles.btnSecondary]}
                activeOpacity={0.8}
              >
                <Text style={editStyles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveEdit}
                disabled={saving}
                style={[editStyles.btn, editStyles.btnPrimary]}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={editStyles.btnPrimaryText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  mediaThumb: { width: '100%', height: rs(120), borderRadius: RADIUS.sm, backgroundColor: T.surfaceAlt, marginBottom: SPACING.sm },
  videoThumb: { width: '100%', height: rs(80), borderRadius: RADIUS.sm, backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: rp(6), flexDirection: 'row', marginBottom: SPACING.sm },
  videoThumbIcon: { fontSize: rf(20), color: T.primary },
  videoThumbLabel: { fontSize: FONT.xs, color: T.textSecondary, fontWeight: '600' },
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
  readMore:    { color: T.primary, fontWeight: '700', fontSize: rf(15) },
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

const optStyles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent:  'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingBottom:   rp(32),
    paddingTop:      rp(12),
  },
  handle: {
    width:           rs(36),
    height:          rp(4),
    borderRadius:    rp(2),
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf:       'center',
    marginBottom:    rp(8),
  },
  option: {
    paddingVertical:   rp(18),
    paddingHorizontal: SPACING.lg,
    alignItems:        'center',
  },
  divider:           { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  optionText:        { fontSize: FONT.md, fontWeight: '600', color: T.text },
  optionDestructive: { color: '#ef4444' },
  optionCancel:      { fontSize: FONT.md, color: T.textSecondary, fontWeight: '500' },
});

const editStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  card: {
    width: '100%', backgroundColor: T.surface, borderRadius: RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: T.border,
  },
  title: { fontSize: FONT.md, fontWeight: '700', color: T.text, marginBottom: SPACING.sm },
  input: {
    minHeight: rs(120), maxHeight: rs(240), borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surfaceAlt,
    color: T.text, fontSize: FONT.sm, padding: SPACING.sm, textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  btn: { flex: 1, height: BUTTON_HEIGHT, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  btnSecondary: { backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border },
  btnSecondaryText: { color: T.text, fontSize: FONT.sm, fontWeight: '600' },
  btnPrimary: { backgroundColor: T.primary },
  btnPrimaryText: { color: '#fff', fontSize: FONT.sm, fontWeight: '700' },
});
