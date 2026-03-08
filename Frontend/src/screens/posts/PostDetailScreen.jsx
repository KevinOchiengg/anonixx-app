import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { FEATURES } from '../../config/featureFlags';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, SafeAreaView, Image, StyleSheet, Alert,
  StatusBar, Dimensions, Share, Modal, RefreshControl, Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video } from 'expo-av';
import {
  ArrowLeft, Send, Play, Bookmark, Share2, Heart,
  MessageCircle, X, ChevronLeft, ChevronRight, Reply,
  TrendingUp, Clock, Flame,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const { width, height } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  avatarBg: '#1e2330',
  input: 'rgba(30, 35, 45, 0.7)',
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

// ── Video Player Modal (real player, with thumbnail) ──────────
const VideoPlayerModal = ({ visible, videoUrl, onClose }) => {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [thumbnail, setThumbnail] = useState(null);

  useEffect(() => {
    if (!visible || !videoUrl) return;
    let cancelled = false;
    const generateThumb = async () => {
      try {
        if (!FEATURES.videoThumbnails) {
          console.log('ℹ️ Video thumbnails disabled in Expo Go');
          return;
        }
        const { VideoThumbnails } = await import('expo-video-thumbnails');
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, { time: 1000, quality: 0.7 });
        if (!cancelled) setThumbnail(uri);
      } catch (e) { console.log('Thumb failed:', e); }
    };
    generateThumb();
    return () => { cancelled = true; };
  }, [visible, videoUrl]);

  // Reset on close
  useEffect(() => {
    if (!visible) { setPlaying(false); setLoaded(false); }
  }, [visible]);

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (playing) { await videoRef.current.pauseAsync(); setPlaying(false); }
    else { await videoRef.current.playAsync(); setPlaying(true); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.videoModal}>
        <TouchableOpacity style={styles.videoClose} onPress={onClose}>
          <X size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.videoPlayerContainer}>
          {!playing && thumbnail && (
            <Image source={{ uri: thumbnail }} style={styles.videoPlayer} resizeMode="contain" />
          )}
          <Video
            ref={videoRef}
            source={{ uri: videoUrl }}
            style={[styles.videoPlayer, !playing && { position: 'absolute', opacity: 0 }]}
            resizeMode="contain"
            onLoad={() => setLoaded(true)}
            onPlaybackStatusUpdate={(s) => { if (s.didJustFinish) setPlaying(false); }}
            useNativeControls={false}
          />
          {!loaded && playing && (
            <View style={styles.videoLoadingOverlay}>
              <ActivityIndicator color={THEME.primary} size="large" />
            </View>
          )}
          <TouchableOpacity style={styles.videoPlayOverlay} onPress={togglePlay} activeOpacity={0.9}>
            {!playing && (
              <View style={styles.videoPlayButton}>
                <Play size={36} color="#fff" fill="#fff" />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ── Main Screen ───────────────────────────────────────────────
export default function PostDetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params;
  const { isAuthenticated } = useAuth();

  const [post, setPost] = useState(initialPost);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isLiked, setIsLiked] = useState(initialPost.is_liked || false);
  const [likeCount, setLikeCount] = useState(initialPost.likes_count || 0);
  const [sortBy, setSortBy] = useState('recent');
  const [replyingTo, setReplyingTo] = useState(null);
  const [imageGalleryVisible, setImageGalleryVisible] = useState(false);
  const [imageGalleryIndex, setImageGalleryIndex] = useState(0);
  const [videoModalVisible, setVideoModalVisible] = useState(false);

  useEffect(() => { loadThreads(); }, []);

  const loadThreads = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/thread`, { headers });
      const data = await response.json();
      if (response.ok) setThreads(data.threads || []);
    } catch (error) {
      console.error('❌ Error loading threads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Vibration.vibrate(10);
    loadThreads();
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
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
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
    Vibration.vibrate(10);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) setPost({ ...post, is_saved: data.saved });
    } catch (error) {
      console.error('❌ Error saving:', error);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `"${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}" — Anonixx`,
      });
    } catch (error) { console.log('Share error:', error); }
  };

  const handleReplyTo = (thread) => {
    Vibration.vibrate(10);
    setReplyingTo(thread);
    setReplyText(`@${thread.anonymous_name} `);
  };

  const handleAddReply = async () => {
    if (!replyText.trim()) return;
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to reply', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) },
      ]);
      return;
    }
    if (threads.length >= 2) {
      Alert.alert('Thread Closed', 'this thread is sealed. read it as it is.');
      return;
    }
    setSubmitting(true);
    Vibration.vibrate(10);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: replyText, parent_id: replyingTo?.id || null }),
      });
      const data = await response.json();
      if (response.ok) {
        setReplyText('');
        setReplyingTo(null);
        loadThreads();
        Alert.alert('Out there.', 'Your reply has been added');
      } else {
        Alert.alert('Error', data.detail || 'Failed to post reply');
      }
    } catch (error) {
      console.error('❌ Error adding reply:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const sortedThreads = useMemo(() => {
    const sorted = [...threads];
    if (sortBy === 'oldest') return sorted.reverse();
    if (sortBy === 'top') return sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    return sorted;
  }, [threads, sortBy]);

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
        {/* Post Card — matches feed card style */}
        <View style={styles.postCard}>
          {/* Author */}
          <View style={styles.postHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
            </View>
            <View style={styles.postHeaderInfo}>
              <Text style={styles.username}>{post.anonymous_name || 'Anonymous'}</Text>
              <Text style={styles.timestamp}>{post.time_ago}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Content */}
          <Text style={styles.content}>{post.content}</Text>

          {/* Images */}
          {post.images?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesContainer}>
              {post.images.map((imageUri, index) => (
                <TouchableOpacity key={index} onPress={() => { setImageGalleryIndex(index); setImageGalleryVisible(true); }} activeOpacity={0.9}>
                  <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
                  {post.images.length > 1 && (
                    <View style={styles.imageBadge}>
                      <Text style={styles.imageBadgeText}>{index + 1}/{post.images.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Video thumbnail → opens full player */}
          {post.video_url && (
            <TouchableOpacity onPress={() => setVideoModalVisible(true)} activeOpacity={0.9}>
              <View style={styles.videoContainer}>
                <Image source={{ uri: post.video_url }} style={styles.videoThumbnail} resizeMode="cover" />
                <View style={styles.videoOverlay}>
                  <View style={styles.playButton}>
                    <Play size={26} color="#fff" fill="#fff" />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          {/* Actions — save+share LEFT | like+comment RIGHT (matches feed) */}
          <View style={styles.actions}>
            <View style={styles.actionsLeft}>
              <TouchableOpacity onPress={handleSave} style={styles.action}>
                <Bookmark size={20} color={post.is_saved ? THEME.primary : THEME.textSecondary} fill={post.is_saved ? THEME.primary : 'none'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.action}>
                <Share2 size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.actionsRight}>
              <TouchableOpacity style={styles.action}>
                <MessageCircle size={20} color={THEME.textSecondary} />
                <Text style={styles.actionCount}>{threads.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLike} style={styles.action}>
                <Heart size={20} color={isLiked ? THEME.primary : THEME.textSecondary} fill={isLiked ? THEME.primary : 'none'} />
                <Text style={[styles.actionCount, isLiked && { color: THEME.primary }]}>{likeCount}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Replies Section */}
        <View style={styles.repliesSection}>
          <View style={styles.repliesHeader}>
            <Text style={styles.repliesTitle}>Replies ({threads.length}/2)</Text>
            <View style={styles.sortButtons}>
              {[
                { key: 'recent', icon: <Clock size={13} />, label: 'Recent' },
                { key: 'top', icon: <TrendingUp size={13} />, label: 'Top' },
                { key: 'oldest', icon: <Flame size={13} />, label: 'First' },
              ].map((btn) => (
                <TouchableOpacity
                  key={btn.key}
                  onPress={() => setSortBy(btn.key)}
                  style={[styles.sortButton, sortBy === btn.key && styles.sortButtonActive]}
                >
                  {React.cloneElement(btn.icon, { color: sortBy === btn.key ? THEME.primary : THEME.textSecondary })}
                  <Text style={[styles.sortText, sortBy === btn.key && styles.sortTextActive]}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={THEME.primary} style={{ marginTop: 20 }} />
          ) : sortedThreads.length > 0 ? (
            sortedThreads.map((thread) => (
              <View key={thread.id} style={styles.replyCard}>
                <View style={styles.replyHeader}>
                  <View style={styles.replyAvatar}>
                    <Text style={styles.replyAvatarText}>{thread.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
                  </View>
                  <View style={styles.replyHeaderInfo}>
                    <Text style={styles.replyUsername}>{thread.is_own_reply ? 'You' : thread.anonymous_name || 'Anonymous'}</Text>
                    <Text style={styles.replyTime}>{thread.time_ago}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleReplyTo(thread)} style={styles.replyIconButton}>
                    <Reply size={16} color={THEME.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.replyText}>{thread.content}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noReplies}>no one has said anything yet. say something.</Text>
          )}

          {threads.length >= 2 && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>this thread is sealed. read it as it is.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Reply Input */}
      {threads.length < 2 && (
        <View style={styles.replyInputContainer}>
          {replyingTo && (
            <View style={styles.replyingToBar}>
              <Text style={styles.replyingToText}>Replying to {replyingTo.anonymous_name}</Text>
              <TouchableOpacity onPress={() => { setReplyingTo(null); setReplyText(''); }}>
                <X size={16} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder={isAuthenticated ? 'say what you actually think...' : 'Sign in to reply...'}
              placeholderTextColor={THEME.textSecondary}
              style={styles.replyInput}
              multiline
              maxLength={500}
              editable={isAuthenticated}
            />
            <TouchableOpacity
              onPress={handleAddReply}
              disabled={!replyText.trim() || submitting}
              style={[styles.sendButton, { backgroundColor: replyText.trim() && !submitting ? THEME.primary : THEME.border }]}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modals */}
      {post.images && (
        <ImageGalleryModal
          visible={imageGalleryVisible}
          images={post.images}
          initialIndex={imageGalleryIndex}
          onClose={() => setImageGalleryVisible(false)}
        />
      )}
      <VideoPlayerModal
        visible={videoModalVisible}
        videoUrl={post.video_url}
        onClose={() => setVideoModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, zIndex: 10,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: THEME.text },
  scrollView: { flex: 1 },

  // Post card — same style as feed card
  postCard: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: THEME.surface,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderLeftWidth: 1,
    borderLeftColor: THEME.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center',
    marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: THEME.primary },
  postHeaderInfo: { flex: 1 },
  username: { fontSize: 15, fontWeight: '600', color: THEME.text },
  timestamp: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: THEME.border, marginVertical: 14 },
  content: { fontSize: 17, lineHeight: 28, color: THEME.text, letterSpacing: 0.2, marginBottom: 4 },
  imagesContainer: { marginBottom: 14 },
  image: { width: width - 80, height: 250, borderRadius: 12, marginRight: 8 },
  imageBadge: { position: 'absolute', bottom: 12, right: 20, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  imageBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  videoContainer: { position: 'relative', marginBottom: 14, borderRadius: 14, overflow: 'hidden', height: 220, backgroundColor: '#0d1018' },
  videoThumbnail: { width: '100%', height: '100%' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,99,74,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 12 },

  // Actions — matches feed layout
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 15, fontWeight: '500', color: THEME.textSecondary },

  // Replies
  repliesSection: { padding: 16 },
  repliesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  repliesTitle: { fontSize: 16, fontWeight: '700', color: THEME.text },
  sortButtons: { flexDirection: 'row', gap: 8 },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: THEME.surface },
  sortButtonActive: { backgroundColor: 'rgba(255, 99, 74, 0.1)' },
  sortText: { fontSize: 12, fontWeight: '600', color: THEME.textSecondary },
  sortTextActive: { color: THEME.primary },

  // Reply cards — same style as feed card
  replyCard: {
    backgroundColor: THEME.surface,
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,99,74,0.4)',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  replyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  replyAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center', marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,99,74,0.15)' },
  replyAvatarText: { fontSize: 13, fontWeight: '700', color: THEME.primary },
  replyHeaderInfo: { flex: 1 },
  replyUsername: { fontSize: 14, fontWeight: '600', color: THEME.text },
  replyTime: { fontSize: 11, color: THEME.textSecondary, marginTop: 1 },
  replyIconButton: { padding: 6 },
  replyText: { fontSize: 15, lineHeight: 23, color: THEME.text, letterSpacing: 0.2 },

  noReplies: { textAlign: 'center', fontSize: 14, color: THEME.textSecondary, fontStyle: 'italic', marginVertical: 32 },
  closedBanner: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 4, backgroundColor: 'rgba(255,99,74,0.06)', borderWidth: 1, borderColor: 'rgba(255,99,74,0.12)' },
  closedText: { fontSize: 13, fontStyle: 'italic', color: THEME.textSecondary },

  // Reply input
  replyInputContainer: { backgroundColor: THEME.surface, borderTopWidth: 1, borderTopColor: THEME.border, paddingBottom: 16 },
  replyingToBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(255,99,74,0.08)' },
  replyingToText: { fontSize: 13, color: THEME.primary, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 16, gap: 12 },
  replyInput: { flex: 1, minHeight: 44, maxHeight: 100, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: THEME.text, backgroundColor: THEME.input },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  // Image gallery modal
  galleryModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  galleryClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  galleryImage: { width, height: height * 0.8 },
  galleryPrev: { position: 'absolute', left: 20, top: '50%', marginTop: -25, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25 },
  galleryNext: { position: 'absolute', right: 20, top: '50%', marginTop: -25, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25 },
  galleryIndicator: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  galleryIndicatorText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Video modal
  videoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center', alignItems: 'center' },
  videoClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  videoPlayerContainer: { width, height: height * 0.65, justifyContent: 'center', alignItems: 'center' },
  videoPlayer: { width: '100%', height: '100%' },
  videoLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  videoPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  videoPlayButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,99,74,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 12 },
});
