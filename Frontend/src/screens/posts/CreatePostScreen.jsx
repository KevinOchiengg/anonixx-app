import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Image as ImageIcon, Video as VideoIcon, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  primaryDim:    'rgba(255, 99, 74, 0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.06)',
  inputBg:       'rgba(255,255,255,0.04)',
  error:         '#ef4444',
};

// ─── Cloudinary config (module level) ────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME   = 'dojbdm2e1';
const CLOUDINARY_UPLOAD_PRESET = 'anonix';

const uploadToCloudinary = async (uri, resourceType = 'image') => {
  const fileType = uri.split('.').pop();
  const formData = new FormData();
  formData.append('file', {
    uri,
    type: resourceType === 'video' ? `video/${fileType}` : `image/${fileType}`,
    name: `upload.${fileType}`,
  });
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body: formData, headers: { 'Content-Type': 'multipart/form-data' } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function CreatePostScreen({ navigation }) {
  const { isAuthenticated } = useAuth();
  const { showToast }       = useToast();

  const [content, setContent]             = useState('');
  const [isAnonymous, setIsAnonymous]     = useState(true);
  const [loading, setLoading]             = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [images, setImages]               = useState([]);
  const [videoUri, setVideoUri]           = useState(null);

  // ── Media pickers ────────────────────────────────────────────────────────────
  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Photo access is needed to add images.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      if (images.length + result.assets.length > 5) {
        showToast({ type: 'warning', message: 'You can add up to 5 images.' });
        return;
      }
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  }, [images.length, showToast]);

  const pickVideo = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Video access is needed to add a video.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (!result.canceled) {
      setVideoUri(result.assets[0].uri);
      setImages([]);
    }
  }, [showToast]);

  const removeImage = useCallback((index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const removeVideo = useCallback(() => setVideoUri(null), []);

  const toggleAnonymous = useCallback(() => setIsAnonymous(v => !v), []);

  // ── Post ─────────────────────────────────────────────────────────────────────
  const handlePost = useCallback(async () => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: 'Sign in to post your confession.' });
      navigation.navigate('Auth', { screen: 'Login' });
      return;
    }
    if (!content.trim()) {
      showToast({ type: 'warning', message: 'Write something first.' });
      return;
    }

    setLoading(true);
    setUploadProgress('Preparing…');

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', message: 'Session expired. Please log in again.' });
        return;
      }

      const postData = {
        content:      content.trim(),
        topics:       [],
        is_anonymous: isAnonymous,
      };

      if (images.length > 0) {
        const urls = [];
        for (let i = 0; i < images.length; i++) {
          setUploadProgress(`Uploading image ${i + 1} of ${images.length}…`);
          urls.push(await uploadToCloudinary(images[i], 'image'));
        }
        postData.images = urls;
      }

      if (videoUri) {
        setUploadProgress('Uploading video…');
        postData.video_url = await uploadToCloudinary(videoUri, 'video');
      }

      setUploadProgress('Posting…');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(postData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server error ${res.status}`);

      showToast({ type: 'success', title: 'Posted!', message: 'Your confession is out there.' });
      setContent('');
      setImages([]);
      setVideoUri(null);
      navigation.navigate('Feed');

    } catch (err) {
      showToast({ type: 'error', message: 'Could not post. Please try again.' });
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  }, [isAuthenticated, content, images, videoUri, isAnonymous, navigation, showToast]);

  // ── Char count color ─────────────────────────────────────────────────────────
  const charColor = useMemo(() => {
    if (content.length > 900) return T.error;
    if (content.length > 750) return '#FB923C';
    return T.textSecondary;
  }, [content.length]);

  const canPost = content.trim().length > 0 && !loading;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={HIT_SLOP}
            style={styles.closeBtn}
          >
            <X size={rs(22)} color={T.text} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Confess</Text>

          <TouchableOpacity
            onPress={handlePost}
            disabled={!canPost}
            hitSlop={HIT_SLOP}
            style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.postBtnText}>Post</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Upload progress banner */}
        {!!uploadProgress && (
          <View style={styles.progressBanner}>
            <ActivityIndicator size="small" color={T.primary} />
            <Text style={styles.progressText}>{uploadProgress}</Text>
          </View>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Text input ── */}
          <View style={styles.inputCard}>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Say the unsayable…"
              placeholderTextColor={T.textSecondary}
              multiline
              autoFocus
              style={styles.textInput}
              maxLength={1000}
              textAlignVertical="top"
              autoCorrect
              autoCapitalize="sentences"
            />
            <View style={styles.inputDivider} />
            <Text style={[styles.charCount, { color: charColor }]}>
              {content.length}/1000
            </Text>
          </View>

          {/* ── Media buttons ── */}
          <View style={styles.mediaRow}>
            <TouchableOpacity
              onPress={pickImage}
              disabled={!!videoUri || loading}
              hitSlop={HIT_SLOP}
              style={[styles.mediaBtn, (!!videoUri || loading) && styles.mediaBtnDisabled]}
            >
              <ImageIcon
                size={rs(18)}
                color={!!videoUri || loading ? T.textSecondary : T.primary}
              />
              <Text style={[
                styles.mediaBtnText,
                (!!videoUri || loading) && styles.mediaBtnTextDisabled,
              ]}>
                Add Images
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={pickVideo}
              disabled={images.length > 0 || loading}
              hitSlop={HIT_SLOP}
              style={[styles.mediaBtn, (images.length > 0 || loading) && styles.mediaBtnDisabled]}
            >
              <VideoIcon
                size={rs(18)}
                color={images.length > 0 || loading ? T.textSecondary : T.primary}
              />
              <Text style={[
                styles.mediaBtnText,
                (images.length > 0 || loading) && styles.mediaBtnTextDisabled,
              ]}>
                Add Video
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Image previews ── */}
          {images.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Images ({images.length}/5)</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.imagesRow}
              >
                {images.map((uri, i) => (
                  <View key={i} style={styles.imageThumb}>
                    <Image source={{ uri }} style={styles.thumbImage} />
                    <TouchableOpacity
                      onPress={() => removeImage(i)}
                      disabled={loading}
                      hitSlop={HIT_SLOP}
                      style={styles.removeBtn}
                    >
                      <Trash2 size={rs(14)} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── Video preview ── */}
          {!!videoUri && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Video</Text>
              <View style={styles.videoThumb}>
                <Image source={{ uri: videoUri }} style={styles.thumbVideo} />
                <TouchableOpacity
                  onPress={removeVideo}
                  disabled={loading}
                  hitSlop={HIT_SLOP}
                  style={styles.removeBtn}
                >
                  <Trash2 size={rs(18)} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Anonymous toggle ── */}
          <TouchableOpacity
            onPress={toggleAnonymous}
            disabled={loading}
            hitSlop={HIT_SLOP}
            style={styles.toggleRow}
            activeOpacity={0.8}
          >
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Post Anonymously</Text>
              <Text style={styles.toggleSub}>
                {isAnonymous ? "Nobody knows it's you" : 'Posting with your username'}
              </Text>
            </View>
            <View style={[styles.toggleTrack, isAnonymous && styles.toggleTrackActive]}>
              <View style={[styles.toggleThumb, isAnonymous && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>

          {/* ── Tagline ── */}
          <View style={styles.tagline}>
            <Text style={styles.taglineText}>No filters. No judgment. Just the raw truth.</Text>
          </View>

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  closeBtn: {
    padding: rp(4),
  },
  headerTitle: {
    fontSize: FONT.md,
    fontWeight: '600',
    color: T.text,
    letterSpacing: 0.2,
  },
  postBtn: {
    backgroundColor: T.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(8),
    borderRadius: RADIUS.full,
    minWidth: rs(70),
    alignItems: 'center',
  },
  postBtnDisabled: {
    opacity: 0.4,
  },
  postBtnText: {
    color: '#fff',
    fontSize: FONT.sm,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Progress banner
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: T.surface,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: rp(10),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  progressText: {
    fontSize: FONT.sm,
    color: T.text,
    fontWeight: '500',
  },

  // Scroll
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
  },

  // Text input card
  inputCard: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  textInput: {
    fontSize: FONT.lg,
    lineHeight: rf(28),
    minHeight: rs(200),
    color: T.text,
    textAlignVertical: 'top',
  },
  inputDivider: {
    height: 1,
    backgroundColor: T.border,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  charCount: {
    fontSize: FONT.xs,
    textAlign: 'right',
  },

  // Media buttons
  mediaRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: T.surface,
    paddingVertical: rp(14),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  mediaBtnDisabled: { opacity: 0.4 },
  mediaBtnText: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: T.text,
  },
  mediaBtnTextDisabled: { color: T.textSecondary },

  // Section
  section: { marginBottom: SPACING.md },
  sectionLabel: {
    fontSize: FONT.xs,
    fontWeight: '600',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },

  // Image previews
  imagesRow: { flexDirection: 'row', gap: SPACING.sm },
  imageThumb: { position: 'relative' },
  thumbImage: {
    width: rs(110),
    height: rs(110),
    borderRadius: RADIUS.md,
  },

  // Video preview
  videoThumb: {
    position: 'relative',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  thumbVideo: {
    width: '100%',
    height: rs(200),
    borderRadius: RADIUS.md,
  },

  // Remove button
  removeBtn: {
    position: 'absolute',
    top: rp(6),
    right: rp(6),
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: rp(6),
    borderRadius: RADIUS.full,
  },

  // Anonymous toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: SPACING.md,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: {
    fontSize: FONT.md,
    fontWeight: '600',
    color: T.text,
    marginBottom: rp(3),
  },
  toggleSub: {
    fontSize: FONT.xs,
    color: T.textSecondary,
  },
  toggleTrack: {
    width: rs(48),
    height: rs(26),
    borderRadius: rs(13),
    backgroundColor: T.border,
    padding: rp(2),
    justifyContent: 'center',
  },
  toggleTrackActive: {
    backgroundColor: T.primary,
  },
  toggleThumb: {
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },

  // Tagline
  tagline: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: T.border,
  },
  taglineText: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: rf(20),
    fontStyle: 'italic',
  },
});
