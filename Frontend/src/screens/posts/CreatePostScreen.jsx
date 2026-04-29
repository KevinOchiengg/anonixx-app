import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, ImageIcon, Film, Trash2, Lock, Unlock, BarChart2, Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP, SCREEN,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';

// ─── THEME ───────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  primaryDim:    'rgba(255, 99, 74, 0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#3e4558',
  border:        'rgba(255,255,255,0.06)',
  inputBg:       'rgba(255,255,255,0.04)',
  error:         '#ef4444',
};

// ─── STATIC ──────────────────────────────────────────────────────────────────
const STARS = Array.from({ length: 40 }, (_, i) => ({
  id:      i,
  top:     Math.random() * SCREEN.height,
  left:    Math.random() * SCREEN.width,
  size:    Math.random() * rs(2.5) + rs(0.5),
  opacity: Math.random() * 0.4 + 0.06,
}));

const StarryBackground = React.memo(() => (
  <>
    {STARS.map((s) => (
      <View
        key={s.id}
        pointerEvents="none"
        style={{
          position:        'absolute',
          backgroundColor: T.primary,
          borderRadius:    s.size,
          top: s.top, left: s.left,
          width: s.size, height: s.size,
          opacity: s.opacity,
        }}
      />
    ))}
  </>
));

const MAX_IMAGES               = 5;
const MAX_CHARS                = 2000;
const MAX_POLL_OPTIONS         = 4;
const MAX_VIDEO_DURATION_SECS  = 600;   // 10 minutes

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const PROMPTS = [
  'the thing you\'ve been carrying alone…',
  'what you can\'t say out loud…',
  'the thought that keeps you up at night…',
  'what nobody around you knows…',
  'the feeling you don\'t have words for yet…',
  'what happened that you still haven\'t processed…',
  'the part of you nobody sees…',
  'what\'s been sitting on your chest…',
  'the truth you\'ve been swallowing…',
  'what you wish someone would just ask you about…',
];

const uploadToCloudinary = async (uri, resourceType = 'image', token) => {
  // Get short-lived signed params from our backend (JWT-gated)
  const signRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ resource_type: resourceType === 'video' ? 'video' : 'image' }),
  });
  if (!signRes.ok) throw new Error('Could not get upload signature.');
  const { signature, timestamp, api_key, cloud_name, folder } = await signRes.json();

  const ext      = uri.split('?')[0].split('.').pop()?.toLowerCase() || '';
  const mimeType = resourceType === 'video' ? `video/${ext || 'mp4'}` : `image/${ext || 'jpeg'}`;
  const formData = new FormData();
  formData.append('file',      { uri, type: mimeType, name: `upload.${ext}` });
  formData.append('api_key',   api_key);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder',    folder);

  const res  = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`,
    { method: 'POST', body: formData },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
};

// ─── SCREEN ──────────────────────────────────────────────────────────────────
export default function CreatePostScreen({ route, navigation }) {
  const editMode       = route?.params?.editMode       || false;
  const editPostId     = route?.params?.postId         || null;
  const initialContent = route?.params?.initialContent || '';

  const { isAuthenticated } = useAuth();
  const { showToast }       = useToast();
  const dispatch            = useDispatch();

  const [content,        setContent]        = useState(editMode ? initialContent : '');
  const [isAnonymous,    setIsAnonymous]    = useState(true);
  const [loading,        setLoading]        = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [images,         setImages]         = useState([]);
  const [videoUri,       setVideoUri]       = useState(null);
  const [videoDuration,  setVideoDuration]  = useState(null);  // seconds
  const [promptIndex,    setPromptIndex]    = useState(0);
  const [isFocused,      setIsFocused]      = useState(false);

  // Poll state
  const [pollEnabled,    setPollEnabled]    = useState(false);
  const [pollQuestion,   setPollQuestion]   = useState('');
  const [pollOptions,    setPollOptions]    = useState(['', '']);

  // Animations
  const entranceFade   = useRef(new Animated.Value(0)).current;
  const promptFade     = useRef(new Animated.Value(1)).current;
  const thumbAnim      = useRef(new Animated.Value(1)).current;
  const postBtnScale   = useRef(new Animated.Value(0.95)).current;
  const postBtnOpacity = useRef(new Animated.Value(0.4)).current;
  const pollAnim       = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entranceFade, {
      toValue: 1, duration: 380, useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (content.length > 0 || isFocused) return;
    const interval = setInterval(() => {
      Animated.timing(promptFade, { toValue: 0, duration: 380, useNativeDriver: true })
        .start(() => {
          setPromptIndex((i) => (i + 1) % PROMPTS.length);
          Animated.timing(promptFade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
        });
    }, 4000);
    return () => clearInterval(interval);
  }, [content.length, isFocused, promptFade]);

  // Animate poll section in/out
  useEffect(() => {
    Animated.spring(pollAnim, {
      toValue:  pollEnabled ? 1 : 0,
      tension:  100,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [pollEnabled, pollAnim]);

  const pollValid = useMemo(() => {
    if (!pollEnabled) return true;
    const filledOptions = pollOptions.filter(o => o.trim().length > 0);
    return pollQuestion.trim().length > 0 && filledOptions.length >= 2;
  }, [pollEnabled, pollQuestion, pollOptions]);

  const canPost = useMemo(() => {
    if (loading) return false;
    if (!pollValid) return false;
    return content.trim().length > 0 || images.length > 0 || !!videoUri;
  }, [loading, content, images.length, videoUri, pollValid]);

  useEffect(() => {
    Animated.spring(postBtnScale, {
      toValue:  canPost ? 1 : 0.95,
      tension:  140,
      friction: 12,
      useNativeDriver: true,
    }).start();
    Animated.timing(postBtnOpacity, {
      toValue:  canPost ? 1 : 0.38,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [canPost, postBtnScale, postBtnOpacity]);

  const handleContentChange = useCallback((val) => {
    const cleaned = val.trimStart().replace(/\n{3,}/g, '\n\n');
    setContent(cleaned.slice(0, MAX_CHARS));
  }, []);

  const toggleAnonymous = useCallback(() => {
    setIsAnonymous((prev) => {
      Animated.spring(thumbAnim, {
        toValue:  prev ? 0 : 1,
        tension:  180,
        friction: 12,
        useNativeDriver: true,
      }).start();
      return !prev;
    });
  }, [thumbAnim]);

  const togglePoll = useCallback(() => {
    setPollEnabled(prev => {
      if (prev) {
        setPollQuestion('');
        setPollOptions(['', '']);
      }
      return !prev;
    });
  }, []);

  const updatePollOption = useCallback((index, value) => {
    setPollOptions(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const addPollOption = useCallback(() => {
    setPollOptions(prev => {
      if (prev.length >= MAX_POLL_OPTIONS) return prev;
      return [...prev, ''];
    });
  }, []);

  const removePollOption = useCallback((index) => {
    setPollOptions(prev => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // ── Media pickers ────────────────────────────────────────────────────────
  const pickImage = useCallback(async () => {
    if (pollEnabled) {
      setPollEnabled(false);
      setPollQuestion('');
      setPollOptions(['', '']);
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Photo access is needed to add images.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:              'images',
      allowsMultipleSelection: true,
      quality:                 0.85,
    });
    if (!result.canceled) {
      const slots = MAX_IMAGES - images.length;
      if (slots <= 0) {
        showToast({ type: 'warning', message: `Up to ${MAX_IMAGES} images.` });
        return;
      }
      setImages((prev) => [...prev, ...result.assets.slice(0, slots).map((a) => a.uri)]);
    }
  }, [images.length, pollEnabled, showToast]);

  const pickVideo = useCallback(async () => {
    if (pollEnabled) {
      setPollEnabled(false);
      setPollQuestion('');
      setPollOptions(['', '']);
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Video access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      quality:    0.85,
    });
    if (result.canceled) return;

    const asset          = result.assets[0];
    const durationSecs   = asset.duration ? asset.duration / 1000 : 0;

    if (durationSecs > MAX_VIDEO_DURATION_SECS) {
      showToast({
        type:    'warning',
        title:   'Video too long',
        message: `Max 10 minutes. Your video is ${formatDuration(durationSecs)}.`,
      });
      return;
    }

    setVideoUri(asset.uri);
    setVideoDuration(durationSecs > 0 ? durationSecs : null);
    setImages([]);
  }, [pollEnabled, showToast]);

  const removeImage = useCallback((index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeVideo = useCallback(() => {
    setVideoUri(null);
    setVideoDuration(null);
  }, []);

  // ── Post ─────────────────────────────────────────────────────────────────
  const handlePost = useCallback(async () => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: 'Sign in to confess.' });
      navigation.navigate('AuthNav', { screen: 'Login' });
      return;
    }
    if (!canPost) return;

    setLoading(true);
    setUploadProgress(editMode ? 'Saving…' : 'Preparing…');

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', message: 'Session expired. Sign in again.' });
        return;
      }

      if (editMode) {
        const res = await fetch(`${API_BASE_URL}/api/v1/posts/${editPostId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ content: content.trim() }),
        });
        if (!res.ok) throw new Error();
        showToast({ type: 'success', message: 'Post updated.' });
        navigation.goBack();
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
          urls.push(await uploadToCloudinary(images[i], 'image', token));
        }
        postData.images = urls;
      }

      if (videoUri) {
        setUploadProgress('Uploading video…');
        postData.video_url = await uploadToCloudinary(videoUri, 'video', token);
      }

      if (pollEnabled && pollQuestion.trim()) {
        const validOptions = pollOptions.map(o => o.trim()).filter(o => o.length > 0);
        if (validOptions.length >= 2) {
          postData.poll = {
            question: pollQuestion.trim(),
            options:  validOptions,
          };
        }
      }

      setUploadProgress('Releasing…');
      const res  = await fetch(`${API_BASE_URL}/api/v1/posts`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(postData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);

      dispatch(awardMilestone('first_post'));
      showToast({ type: 'success', message: 'It\'s out there. You did that.' });
      setContent('');
      setImages([]);
      setVideoUri(null);
      setVideoDuration(null);
      setPollEnabled(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      navigation.navigate('Feed', { screen: 'FeedMain', params: { refresh: Date.now() } });

    } catch (err) {
      showToast({ type: 'error', message: err?.message || 'Couldn\'t post. Please try again.' });
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  }, [
    isAuthenticated, canPost, content, images,
    videoUri, isAnonymous, pollEnabled, pollQuestion, pollOptions,
    navigation, showToast, dispatch,
  ]);

  const charColor = useMemo(() => {
    if (content.length > 950) return T.error;
    if (content.length > 800) return '#FB923C';
    return T.textSecondary;
  }, [content.length]);

  const thumbTranslate = thumbAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [rs(2), rs(24)],
  });

  const pollScale   = pollAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const pollOpacity = pollAnim;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StarryBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View style={[{ flex: 1 }, { opacity: entranceFade }]}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={HIT_SLOP}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <X size={rs(22)} color={T.text} strokeWidth={2} />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>say it.</Text>
            <View style={styles.headerRight} />
          </View>

          {/* ── Upload progress ─────────────────────────────────────────── */}
          {!!uploadProgress && (
            <View style={styles.progressBanner}>
              <ActivityIndicator size="small" color={T.primary} />
              <Text style={styles.progressText}>{uploadProgress}</Text>
            </View>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Text input card ───────────────────────────────────────── */}
            <View style={styles.inputCard}>
              {content.length === 0 && !isFocused && (
                <View style={styles.safetyRow}>
                  <Lock size={rs(11)} color={T.primary} strokeWidth={2.5} />
                  <Text style={styles.safetyText}>no one knows who you are here</Text>
                </View>
              )}

              {content.length === 0 && (
                <Animated.View
                  style={[styles.placeholderWrap, { opacity: promptFade }]}
                  pointerEvents="none"
                >
                  <Text style={styles.placeholderText}>{PROMPTS[promptIndex]}</Text>
                </Animated.View>
              )}

              <TextInput
                value={content}
                onChangeText={handleContentChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                multiline
                autoFocus
                style={styles.textInput}
                maxLength={MAX_CHARS}
                textAlignVertical="top"
                autoCorrect
                autoCapitalize="sentences"
                selectionColor={T.primary}
                scrollEnabled
              />

              <View style={styles.inputDivider} />
              <Text style={[styles.charCount, { color: charColor }]}>
                {content.length}/{MAX_CHARS}
              </Text>
            </View>

            {/* ── Media + Poll buttons ───────────────────────────────────── */}
            <View style={styles.mediaRow}>
              <TouchableOpacity
                onPress={pickImage}
                disabled={!!videoUri || loading}
                hitSlop={HIT_SLOP}
                style={[styles.mediaBtn, (!!videoUri || loading) && styles.mediaBtnDisabled]}
                activeOpacity={0.8}
              >
                <ImageIcon
                  size={rs(17)}
                  color={!!videoUri || loading ? T.textSecondary : T.primary}
                  strokeWidth={1.5}
                />
                <Text style={[styles.mediaBtnText, (!!videoUri || loading) && styles.mediaBtnTextDim]}>
                  Images
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={pickVideo}
                disabled={images.length > 0 || loading}
                hitSlop={HIT_SLOP}
                style={[styles.mediaBtn, (images.length > 0 || loading) && styles.mediaBtnDisabled]}
                activeOpacity={0.8}
              >
                <Film
                  size={rs(17)}
                  color={images.length > 0 || loading ? T.textSecondary : T.primary}
                  strokeWidth={1.5}
                />
                <Text style={[styles.mediaBtnText, (images.length > 0 || loading) && styles.mediaBtnTextDim]}>
                  Video
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={togglePoll}
                disabled={images.length > 0 || !!videoUri || loading}
                hitSlop={HIT_SLOP}
                style={[
                  styles.mediaBtn,
                  pollEnabled && styles.mediaBtnActive,
                  (images.length > 0 || !!videoUri || loading) && styles.mediaBtnDisabled,
                ]}
                activeOpacity={0.8}
              >
                <BarChart2
                  size={rs(17)}
                  color={
                    images.length > 0 || !!videoUri || loading
                      ? T.textSecondary
                      : pollEnabled ? T.primary : T.primary
                  }
                  strokeWidth={1.5}
                />
                <Text style={[styles.mediaBtnText, pollEnabled && styles.mediaBtnTextActive]}>
                  Poll
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Image previews ────────────────────────────────────────── */}
            {images.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  Images {images.length}/{MAX_IMAGES}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.imagesRow}
                >
                  {images.map((uri, i) => (
                    <View key={uri} style={styles.imageThumb}>
                      <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                      <TouchableOpacity
                        onPress={() => removeImage(i)}
                        disabled={loading}
                        hitSlop={HIT_SLOP}
                        style={styles.removeBtn}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={rs(13)} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── Video preview ─────────────────────────────────────────── */}
            {!!videoUri && (
              <View style={styles.section}>
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel}>Video</Text>
                  {videoDuration != null && (
                    <Text style={styles.videoDurationBadge}>
                      {formatDuration(videoDuration)} / 10:00
                    </Text>
                  )}
                </View>
                <View style={styles.videoRow}>
                  <Film size={rs(18)} color={T.primary} strokeWidth={1.5} />
                  <Text style={styles.videoName} numberOfLines={1}>
                    {videoUri.split('/').pop()}
                  </Text>
                  <TouchableOpacity
                    onPress={removeVideo}
                    disabled={loading}
                    hitSlop={HIT_SLOP}
                    style={styles.removeInline}
                    activeOpacity={0.8}
                  >
                    <Trash2 size={rs(15)} color={T.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── Poll builder ──────────────────────────────────────────── */}
            {pollEnabled && (
              <Animated.View
                style={[
                  styles.pollCard,
                  { opacity: pollOpacity, transform: [{ scale: pollScale }] },
                ]}
              >
                <View style={styles.pollHeader}>
                  <BarChart2 size={rs(14)} color={T.primary} strokeWidth={1.5} />
                  <Text style={styles.pollHeaderText}>Poll · expires in 24h</Text>
                </View>

                <TextInput
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  placeholder="Ask a question…"
                  placeholderTextColor={T.textMuted}
                  style={styles.pollQuestionInput}
                  maxLength={120}
                  selectionColor={T.primary}
                  autoCorrect
                  autoCapitalize="sentences"
                />

                <View style={styles.pollDivider} />

                {pollOptions.map((opt, i) => (
                  <View key={i} style={styles.pollOptionRow}>
                    <View style={styles.pollOptionDot} />
                    <TextInput
                      value={opt}
                      onChangeText={(v) => updatePollOption(i, v)}
                      placeholder={`Option ${i + 1}${i < 2 ? ' (required)' : ''}`}
                      placeholderTextColor={T.textMuted}
                      style={styles.pollOptionInput}
                      maxLength={60}
                      selectionColor={T.primary}
                    />
                    {pollOptions.length > 2 && (
                      <TouchableOpacity
                        onPress={() => removePollOption(i)}
                        hitSlop={HIT_SLOP}
                        activeOpacity={0.7}
                      >
                        <X size={rs(14)} color={T.textSecondary} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {pollOptions.length < MAX_POLL_OPTIONS && (
                  <TouchableOpacity
                    onPress={addPollOption}
                    hitSlop={HIT_SLOP}
                    style={styles.addOptionBtn}
                    activeOpacity={0.7}
                  >
                    <Plus size={rs(13)} color={T.primary} strokeWidth={2.5} />
                    <Text style={styles.addOptionText}>Add option</Text>
                  </TouchableOpacity>
                )}

                {pollEnabled && !pollValid && (
                  <Text style={styles.pollHint}>Add a question + at least 2 options</Text>
                )}
              </Animated.View>
            )}

            {/* ── Anonymous toggle ──────────────────────────────────────── */}
            <TouchableOpacity
              onPress={toggleAnonymous}
              disabled={loading}
              hitSlop={HIT_SLOP}
              style={styles.toggleRow}
              activeOpacity={0.8}
            >
              <View style={styles.toggleInfo}>
                <View style={styles.toggleLabelRow}>
                  {isAnonymous
                    ? <Lock size={rs(13)} color={T.primary} strokeWidth={2} />
                    : <Unlock size={rs(13)} color={T.textSecondary} strokeWidth={2} />
                  }
                  <Text style={[styles.toggleLabel, isAnonymous && styles.toggleLabelActive]}>
                    {isAnonymous ? 'Anonymous' : 'Visible'}
                  </Text>
                </View>
                <Text style={styles.toggleSub}>
                  {isAnonymous
                    ? 'Nobody knows it\'s you'
                    : 'Posting with your username'}
                </Text>
              </View>
              <View style={[styles.toggleTrack, isAnonymous && styles.toggleTrackActive]}>
                <Animated.View
                  style={[styles.toggleThumb, { transform: [{ translateX: thumbTranslate }] }]}
                />
              </View>
            </TouchableOpacity>

            {/* ── Release button ────────────────────────────────────────── */}
            <Animated.View style={{
              transform: [{ scale: postBtnScale }],
              opacity:   postBtnOpacity,
            }}>
              <TouchableOpacity
                onPress={handlePost}
                disabled={!canPost || loading}
                style={styles.releaseBtn}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.releaseBtnText}>Release</Text>
                }
              </TouchableOpacity>
            </Animated.View>

            {/* ── Tagline ───────────────────────────────────────────────── */}
            <View style={styles.tagline}>
              <Text style={styles.taglineText}>
                No filters. No judgment. Just the raw truth.
              </Text>
            </View>

            <View style={{ height: SPACING.xxl }} />
          </ScrollView>

        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  closeBtn:    { padding: rp(4) },
  headerRight: { width: rs(30) },
  headerTitle: {
    fontSize:      FONT.lg,
    fontWeight:    '700',
    color:         T.text,
    letterSpacing: rs(0.2),
    fontFamily:    'PlayfairDisplay-Bold',
  },

  releaseBtn: {
    marginBottom:    SPACING.md,
    height:          BUTTON_HEIGHT,
    borderRadius:    RADIUS.lg,
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rh(6) },
    shadowOpacity:   0.45,
    shadowRadius:    rs(16),
    elevation:       10,
  },
  releaseBtnText: {
    color:         '#fff',
    fontSize:      FONT.lg,
    fontWeight:    '700',
    letterSpacing: rs(0.5),
  },

  progressBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.sm,
    backgroundColor:   T.surface,
    marginHorizontal:  SPACING.md,
    marginTop:         SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
  },
  progressText: { fontSize: FONT.sm, color: T.text, fontWeight: '500' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },

  inputCard: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    marginBottom:    SPACING.md,
    borderWidth:     1,
    borderColor:     T.border,
    minHeight:       rh(200),
  },

  safetyRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(5),
    marginBottom:  SPACING.sm,
  },
  safetyText: {
    fontSize:  rf(11),
    color:     T.primary,
    fontStyle: 'italic',
    opacity:   0.85,
  },

  placeholderWrap: {
    position: 'absolute',
    top:      SPACING.md + rp(28),
    left:     SPACING.md,
    right:    SPACING.md,
  },
  placeholderText: {
    fontSize:   FONT.lg,
    lineHeight: rf(28),
    color:      T.textMuted,
    fontFamily: 'PlayfairDisplay-Italic',
    fontStyle:  'italic',
  },

  textInput: {
    fontSize:          FONT.lg,
    lineHeight:        rf(28),
    minHeight:         rh(160),
    maxHeight:         rh(340),
    color:             T.text,
    textAlignVertical: 'top',
    fontFamily:        'PlayfairDisplay-Regular',
  },
  inputDivider: {
    height:          1,
    backgroundColor: T.border,
    marginTop:       SPACING.sm,
    marginBottom:    SPACING.xs,
  },
  charCount: { fontSize: FONT.xs, textAlign: 'right' },

  mediaRow: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginBottom:  SPACING.md,
  },
  mediaBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SPACING.xs,
    backgroundColor: T.surface,
    paddingVertical: rp(14),
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
  },
  mediaBtnActive:   { borderColor: T.primary, backgroundColor: T.primaryDim },
  mediaBtnDisabled: { opacity: 0.4 },
  mediaBtnText:     { fontSize: FONT.sm, fontWeight: '600', color: T.text },
  mediaBtnTextDim:  { color: T.textSecondary },
  mediaBtnTextActive: { color: T.primary },

  section:      { marginBottom: SPACING.md },
  sectionLabelRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   SPACING.sm,
  },
  sectionLabel: {
    fontSize:      FONT.xs,
    fontWeight:    '600',
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: rs(1),
  },
  videoDurationBadge: {
    fontSize:        rf(11),
    color:           T.textSecondary,
    fontWeight:      '500',
    letterSpacing:   0.3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: rp(8),
    paddingVertical:   rp(2),
    borderRadius:    RADIUS.full,
  },

  imagesRow:  { flexDirection: 'row', gap: SPACING.sm },
  imageThumb: { position: 'relative' },
  thumbImage: {
    width:        rs(110),
    height:       rs(110),
    borderRadius: RADIUS.md,
  },
  removeBtn: {
    position:        'absolute',
    top:             rp(6),
    right:           rp(6),
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding:         rp(6),
    borderRadius:    RADIUS.full,
  },

  videoRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.sm,
    backgroundColor:   T.surface,
    paddingVertical:   rp(14),
    paddingHorizontal: SPACING.md,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
  },
  videoName:    { flex: 1, fontSize: FONT.sm, color: T.textSecondary, fontWeight: '500' },
  removeInline: { padding: rp(4) },

  // ── Poll card ──────────────────────────────────────────────────────────────
  pollCard: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    marginBottom:    SPACING.md,
    borderWidth:     1,
    borderColor:     'rgba(255,99,74,0.25)',
  },
  pollHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            rp(6),
    marginBottom:   SPACING.sm,
  },
  pollHeaderText: {
    fontSize:   FONT.xs,
    fontWeight: '700',
    color:      T.primary,
    textTransform: 'uppercase',
    letterSpacing: rs(0.8),
  },
  pollQuestionInput: {
    fontSize:   FONT.md,
    color:      T.text,
    fontFamily: 'DMSans-Medium',
    paddingVertical: rp(8),
    minHeight:  rh(44),
  },
  pollDivider: {
    height:          1,
    backgroundColor: T.border,
    marginBottom:    SPACING.sm,
  },
  pollOptionRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.sm,
    marginBottom:   SPACING.xs,
  },
  pollOptionDot: {
    width:           rs(7),
    height:          rs(7),
    borderRadius:    rs(4),
    borderWidth:     1.5,
    borderColor:     T.textSecondary,
    flexShrink:      0,
  },
  pollOptionInput: {
    flex:            1,
    fontSize:        FONT.sm,
    color:           T.text,
    fontFamily:      'DMSans-Regular',
    paddingVertical: rp(10),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  addOptionBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            rp(5),
    paddingVertical: rp(10),
    marginTop:      SPACING.xs,
  },
  addOptionText: {
    fontSize:   FONT.sm,
    color:      T.primary,
    fontWeight: '600',
  },
  pollHint: {
    fontSize:  FONT.xs,
    color:     T.textSecondary,
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },

  // ── Toggle ────────────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    backgroundColor:   T.surface,
    padding:           SPACING.md,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    marginBottom:      SPACING.md,
  },
  toggleInfo:        { flex: 1 },
  toggleLabelRow:    { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(3) },
  toggleLabel:       { fontSize: FONT.md, fontWeight: '700', color: T.text },
  toggleLabelActive: { color: T.primary },
  toggleSub:         { fontSize: FONT.xs, color: T.textSecondary },

  toggleTrack: {
    width:           rs(48),
    height:          rs(26),
    borderRadius:    rs(13),
    backgroundColor: T.border,
    justifyContent:  'center',
  },
  toggleTrackActive: { backgroundColor: T.primary },
  toggleThumb: {
    width:           rs(22),
    height:          rs(22),
    borderRadius:    rs(11),
    backgroundColor: '#fff',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rh(2) },
    shadowOpacity:   0.2,
    shadowRadius:    rs(3),
    elevation:       3,
  },

  tagline: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     T.border,
  },
  taglineText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    textAlign:  'center',
    lineHeight: rf(20),
    fontStyle:  'italic',
  },
});
