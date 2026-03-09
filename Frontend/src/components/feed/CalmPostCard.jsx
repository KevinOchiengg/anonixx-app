import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { FEATURES } from '../../config/featureFlags';
// expo-video only works in EAS builds, not Expo Go
// Stubs keep hooks valid in Expo Go (hooks can't be called conditionally)
let VideoView = null;
let useVideoPlayer = () => ({
  play: () => {}, pause: () => {}, replace: () => {},
  loop: false, muted: false, playing: false,
  addListener: () => ({ remove: () => {} }),
  removeListener: () => {},
});
let useEvent = (_player, _event, defaultVal) => defaultVal ?? {};

if (FEATURES.nativeVideo) {
  const expoVideo = require('expo-video');
  VideoView = expoVideo.VideoView;
  useVideoPlayer = expoVideo.useVideoPlayer;
  useEvent = expoVideo.useEvent;
}

// expo-video-thumbnails only works in EAS builds
let VideoThumbnails = null;
if (FEATURES.videoThumbnails) {
  VideoThumbnails = require('expo-video-thumbnails');
}
import {
  Bookmark,
  ChevronDown,
  EyeOff,
  Flag,
  Heart,
  Link,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Subtitles,
  Share2,
  UserX,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { API_BASE_URL } from '../../config/api';
import AnonProfileSheet from '../connect/AnonProfileSheet';
import { useAuth } from '../../context/AuthContext';

const { width, height } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  borderStrong: 'rgba(255,255,255,0.10)',
  avatarBg: '#1e2330',
  avatarIcon: '#5a5f70',
  inputBg: 'rgba(255,255,255,0.05)',
};

// ─── DOUBLE TAP ───────────────────────────────────────────────
const DoubleTapLike = ({ children, onDoubleTap }) => {
  const [showHeart, setShowHeart] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const lastTap = useRef(null);

  const handleTap = () => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < 300) {
      triggerHeart();
    } else {
      lastTap.current = now;
    }
  };

  const triggerHeart = () => {
    setShowHeart(true);
    scaleAnim.setValue(0);
    opacityAnim.setValue(1);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 900, delay: 200, useNativeDriver: true }),
    ]).start(() => setShowHeart(false));
    onDoubleTap?.();
  };

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={{ position: 'relative' }}>
        {children}
        {showHeart && (
          <Animated.View
            pointerEvents="none"
            style={[styles.heartAnimation, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
          >
            <Heart size={80} color={THEME.primary} fill={THEME.primary} />
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

// ─── AUDIO PLAYER ─────────────────────────────────────────────
const AudioPlayer = ({ audioUrl }) => {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const togglePlay = async () => {
    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        soundRef.current = sound;
        setPlaying(true);
      } else {
        const status = await soundRef.current.getStatusAsync();
        if (status.isPlaying) {
          await soundRef.current.pauseAsync();
          setPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setPlaying(true);
        }
      }
    } catch (e) {
      console.error('Audio error:', e);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);
      setProgress(status.durationMillis ? status.positionMillis / status.durationMillis : 0);
      if (status.didJustFinish) { setPlaying(false); setProgress(0); setPosition(0); }
    }
  };

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const bars = Array.from({ length: 28 }, (_, i) => ({
    height: Math.sin(i * 0.8) * 12 + Math.random() * 10 + 8,
    played: progress > 0 && i / 28 <= progress,
  }));

  return (
    <View style={styles.audioContainer}>
      <TouchableOpacity style={styles.audioPlayBtn} onPress={togglePlay}>
        {playing ? <Pause size={18} color="#fff" fill="#fff" /> : <Play size={18} color="#fff" fill="#fff" />}
      </TouchableOpacity>
      <View style={styles.audioRight}>
        <View style={styles.waveform}>
          {bars.map((bar, i) => (
            <View key={i} style={[styles.waveBar, { height: bar.height }, bar.played ? styles.waveBarPlayed : styles.waveBarUnplayed]} />
          ))}
        </View>
        <View style={styles.audioMeta}>
          <Text style={styles.audioTimeText}>{duration > 0 ? formatTime(position) : '0:00'}</Text>
          <Text style={styles.audioTimeText}>{duration > 0 ? formatTime(duration) : '—'}</Text>
        </View>
      </View>
    </View>
  );
};

// ─── FULL SCREEN VIDEO PLAYER (expo-video) ────────────────────
const FullScreenVideoPlayer = ({ visible, videoUrl: initialVideoUrl, thumbnail: initialThumbnail, onClose, postId: initialPostId, onLike, liked, nextVideo, onVideoChange, postContent }) => {
  const [currentUrl, setCurrentUrl] = useState(initialVideoUrl);
  const [currentThumb, setCurrentThumb] = useState(initialThumbnail);
  const [muted, setMuted] = useState(false);
  const [looping, setLooping] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [ended, setEnded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  const slideAnim = useRef(new Animated.Value(height)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const captionsOpacity = useRef(new Animated.Value(0)).current;
  const transitionOpacity = useRef(new Animated.Value(1)).current;
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(1)).current;
  const controlsTimer = useRef(null);
  const lastTap = useRef(null);
  const progressBarWidth = useRef(0);
  const [showHeart, setShowHeart] = useState(false);

  // ── expo-video player ────────────────────────────────────────
  const player = useVideoPlayer(currentUrl, (p) => {
    p.loop = looping;
    p.muted = muted;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0 });

  // Sync progress bar from currentTime
  useEffect(() => {
    if (duration > 0) {
      const prog = currentTime / duration;
      Animated.timing(progressAnim, { toValue: prog, duration: 200, useNativeDriver: false }).start();
      setPosition(currentTime);
    }
  }, [currentTime, duration]);

  // Get duration once loaded
  useEffect(() => {
    const sub = player.addListener('statusChange', (status) => {
      if (status.status === 'readyToPlay') {
        setDuration(player.duration || 0);
      }
      if (status.status === 'idle' && ended === false && visible) {
        // Video ended
        handleVideoEnd();
      }
    });
    return () => sub.remove();
  }, [player, nextVideo, looping, visible]);

  const handleVideoEnd = () => {
    if (looping) return;
    if (nextVideo) {
      setTimeout(() => advanceToNext(), 1200);
    }
    setEnded(true);
    setShowControls(true);
  };

  const advanceToNext = () => {
    Animated.timing(transitionOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setCurrentUrl(nextVideo.video_url);
      setCurrentThumb(nextVideo.thumbnail);
      setEnded(false);
      setPosition(0);
      setDuration(0);
      progressAnim.setValue(0);
      player.replace(nextVideo.video_url);
      onVideoChange?.(nextVideo.id);
      Animated.timing(transitionOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      setTimeout(() => player.play(), 200);
    });
  };

  // Load mute preference
  useEffect(() => {
    AsyncStorage.getItem('video_muted').then((val) => {
      if (val !== null) {
        const m = val === 'true';
        setMuted(m);
        player.muted = m;
      }
    });
  }, []);

  // Sync initial props when visible changes
  useEffect(() => {
    if (visible) {
      setCurrentUrl(initialVideoUrl);
      setCurrentThumb(initialThumbnail);
      player.replace(initialVideoUrl);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 9, tension: 60 }).start();
      setTimeout(() => { player.play(); }, 350);
      flashControls();
    } else {
      Animated.timing(slideAnim, { toValue: height, duration: 250, useNativeDriver: true }).start();
      player.pause();
      setEnded(false);
      setPosition(0);
      setDuration(0);
      progressAnim.setValue(0);
    }
  }, [visible]);

  const toggleMute = async () => {
    const newMuted = !muted;
    setMuted(newMuted);
    player.muted = newMuted;
    AsyncStorage.setItem('video_muted', String(newMuted));
  };

  const togglePlay = () => {
    if (ended && !nextVideo) {
      player.seekBy(-player.currentTime);
      player.play();
      setEnded(false);
    } else if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    flashControls();
  };

  const flashControls = () => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 2800);
  };

  const toggleCaptions = () => {
    const next = !captionsOn;
    setCaptionsOn(next);
    Animated.timing(captionsOpacity, { toValue: next ? 1 : 0, duration: 250, useNativeDriver: true }).start();
    flashControls();
  };

  const formatTime = (secs) => {
    const s = Math.floor(secs || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const handleScrub = (evt) => {
    if (!progressBarWidth.current || !duration) return;
    const ratio = Math.min(Math.max(evt.nativeEvent.locationX / progressBarWidth.current, 0), 1);
    const seekTo = ratio * duration;
    progressAnim.setValue(ratio);
    player.currentTime = seekTo;
    flashControls();
  };

  // Double-tap to like
  const handleTap = () => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < 300) {
      triggerHeartBurst();
      onLike?.();
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 280) {
          togglePlay();
        }
      }, 310);
    }
    lastTap.current = now;
  };

  const triggerHeartBurst = () => {
    setShowHeart(true);
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(heartOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]).start(() => setShowHeart(false));
  };

  // Swipe down to close
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 100) { onClose(); }
      else { Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start(); }
    },
  })).current;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[fsStyles.container, { transform: [{ translateY: slideAnim }] }]} {...panResponder.panHandlers}>

        {/* Swipe hint */}
        <View style={fsStyles.swipeHint} pointerEvents="none">
          <View style={fsStyles.swipeBar} />
        </View>

        {/* Video */}
        <TouchableWithoutFeedback onPress={handleTap}>
          <Animated.View style={[fsStyles.videoWrapper, { opacity: transitionOpacity }]}>
            {currentThumb && !isPlaying && (
              <Image source={{ uri: currentThumb }} style={fsStyles.video} resizeMode="contain" />
            )}
            {VideoView && (
              <VideoView
                player={player}
                style={fsStyles.video}
                contentFit="contain"
                allowsPictureInPicture={FEATURES.pictureInPicture}
                startsPictureInPictureAutomatically={false}
                nativeControls={false}
              />
            )}
          </Animated.View>
        </TouchableWithoutFeedback>

        {/* Captions overlay */}
        {postContent && (
          <Animated.View style={[fsStyles.captionsOverlay, { opacity: captionsOpacity }]} pointerEvents="none">
            <ScrollView style={fsStyles.captionsScroll} showsVerticalScrollIndicator={false}>
              <Text style={fsStyles.captionsText}>{postContent}</Text>
            </ScrollView>
          </Animated.View>
        )}

        {/* Heart burst */}
        {showHeart && (
          <Animated.View pointerEvents="none" style={[fsStyles.heartBurst, { transform: [{ scale: heartScale }], opacity: heartOpacity }]}>
            <Heart size={100} color={THEME.primary} fill={THEME.primary} />
          </Animated.View>
        )}

        {/* Controls */}
        {showControls && (
          <View style={fsStyles.controls} pointerEvents="box-none">
            {/* Top row */}
            <View style={fsStyles.topRow}>
              <TouchableOpacity style={fsStyles.controlBtn} onPress={onClose}>
                <X size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {postContent ? (
                  <TouchableOpacity style={[fsStyles.controlBtn, captionsOn && fsStyles.controlBtnActive]} onPress={toggleCaptions}>
                    <Subtitles size={18} color={captionsOn ? THEME.primary : 'rgba(255,255,255,0.7)'} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[fsStyles.controlBtn, looping && fsStyles.controlBtnActive]} onPress={() => { setLooping((v) => !v); player.loop = !looping; }}>
                  <RotateCcw size={18} color={looping ? THEME.primary : 'rgba(255,255,255,0.7)'} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Center play/pause */}
            <TouchableOpacity style={fsStyles.centerPlay} onPress={togglePlay} activeOpacity={0.7}>
              {ended && nextVideo ? (
                <View style={fsStyles.upNextWrapper}>
                  <Text style={fsStyles.upNextLabel}>up next</Text>
                  <RefreshCw size={28} color="#fff" />
                </View>
              ) : ended ? (
                <RefreshCw size={44} color="#fff" />
              ) : isPlaying ? (
                <Pause size={44} color="#fff" fill="#fff" />
              ) : (
                <Play size={44} color="#fff" fill="#fff" />
              )}
            </TouchableOpacity>

            {/* Bottom bar */}
            <View style={fsStyles.bottomRow}>
              <Text style={fsStyles.timeText}>{formatTime(position)}</Text>
              <TouchableOpacity
                style={fsStyles.progressHit}
                onLayout={(e) => { progressBarWidth.current = e.nativeEvent.layout.width; }}
                onPress={handleScrub}
                activeOpacity={1}
              >
                <View style={fsStyles.progressTrack}>
                  <Animated.View style={[fsStyles.progressFill, {
                    width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  }]} />
                  <Animated.View style={[fsStyles.progressThumb, {
                    left: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  }]} />
                </View>
              </TouchableOpacity>
              <Text style={fsStyles.timeText}>{formatTime(duration)}</Text>
              <TouchableOpacity style={fsStyles.muteBtn} onPress={toggleMute}>
                {muted ? <VolumeX size={20} color="rgba(255,255,255,0.8)" /> : <Volume2 size={20} color="rgba(255,255,255,0.8)" />}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
};

// ─── VIDEO PLAYER (feed card thumbnail) ───────────────────────
const VideoPlayer = ({ videoUrl, isActive, postId, onLike, liked, viewCount, nextVideo, onVideoChange, postContent }) => {
  const [thumbnail, setThumbnail] = useState(null);
  const [thumbLoading, setThumbLoading] = useState(true);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);

  // Inline player — muted autoplay
  const inlinePlayer = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const { isPlaying: inlinePlaying } = useEvent(inlinePlayer, 'playingChange', { isPlaying: false });

  // Auto-play/pause based on feed visibility
  useEffect(() => {
    if (isActive) {
      inlinePlayer.play();
    } else {
      inlinePlayer.pause();
    }
  }, [isActive]);

  // Thumbnail
  useEffect(() => {
    let cancelled = false;
    const generateThumb = async () => {
      try {
        if (!VideoThumbnails?.getThumbnailAsync) {
          if (!cancelled) setThumbLoading(false);
          return;
        }
        const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, { time: 1000, quality: 0.7 });
        if (!cancelled) setThumbnail(uri);
      } catch (e) {
        // Silently fail in Expo Go
      } finally {
        if (!cancelled) setThumbLoading(false);
      }
    };
    generateThumb();
    return () => { cancelled = true; };
  }, [videoUrl]);

  return (
    <>
      <TouchableOpacity
        style={styles.videoContainer}
        onPress={async () => {
          setFullscreenVisible(true);
          try {
            const token = await AsyncStorage.getItem('token');
            await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/view`, {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
          } catch (e) {}
        }}
        activeOpacity={0.97}
      >
        {thumbLoading && <View style={styles.videoLoading}><ActivityIndicator color={THEME.primary} /></View>}
        {thumbnail && !inlinePlaying && (
          <Image source={{ uri: thumbnail }} style={styles.video} resizeMode="cover" />
        )}
        {/* Inline autoplay — muted (EAS build only) */}
        {VideoView && (
          <VideoView
            player={inlinePlayer}
            style={[styles.video, !inlinePlaying && { position: 'absolute', opacity: 0 }]}
            contentFit="cover"
            nativeControls={false}
            allowsPictureInPicture={FEATURES.pictureInPicture}
          />
        )}
        <View style={styles.videoOverlay} pointerEvents="none">
          {!inlinePlaying && (
            <View style={styles.playButton}>
              <Play size={26} color="#fff" fill="#fff" />
            </View>
          )}
          {inlinePlaying && (
            <View style={styles.videoLiveBar}>
              <View style={styles.videoLiveDot} />
              <Text style={styles.videoLiveText}>tap for fullscreen</Text>
            </View>
          )}
        </View>
        {inlinePlaying && (
          <View style={styles.videoMutedBadge}>
            <VolumeX size={12} color="rgba(255,255,255,0.7)" />
          </View>
        )}
        <View style={styles.videoTapBadge}>
          {viewCount > 0 && (
            <Text style={styles.videoTapText}>👁 {viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}k` : viewCount} views</Text>
          )}
        </View>
      </TouchableOpacity>

      <FullScreenVideoPlayer
        visible={fullscreenVisible}
        videoUrl={videoUrl}
        thumbnail={thumbnail}
        onClose={() => setFullscreenVisible(false)}
        postId={postId}
        onLike={onLike}
        liked={liked}
        nextVideo={nextVideo}
        onVideoChange={onVideoChange}
        postContent={postContent}
      />
    </>
  );
};

// ─── COMMENT SECTION (TikTok style inline) ────────────────────
const CommentSection = ({ postId, isAuthenticated, navigation, onClose }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    loadComments();
  }, []);

  const loadComments = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/thread`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) setComments(data.threads || []);
    } catch (e) {
      console.error('Load comments error:', e);
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
      if (res.ok) { setComments((prev) => [data, ...prev]); setText(''); }
    } catch (e) {
      console.error('Submit comment error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start(onClose);
  };

  return (
    <Animated.View style={[styles.commentSection, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.commentHandle} onPress={handleClose}>
        <View style={styles.handleBar} />
      </TouchableOpacity>
      <View style={styles.commentHeader}>
        <Text style={styles.commentHeaderText}>
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </Text>
        <TouchableOpacity onPress={handleClose}>
          <ChevronDown size={20} color={THEME.textSecondary} />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.commentLoading}><ActivityIndicator color={THEME.primary} size="small" /></View>
      ) : comments.length === 0 ? (
        <View style={styles.commentEmpty}>
          <Text style={styles.commentEmptyText}>no one has said anything yet. say something.</Text>
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item, i) => item.id || String(i)}
          style={styles.commentList}
          renderItem={({ item }) => (
            <View style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>{item.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
              </View>
              <View style={styles.commentBody}>
                <Text style={styles.commentAuthor}>{item.anonymous_name || 'Anonymous'}</Text>
                <Text style={styles.commentText}>{item.content}</Text>
              </View>
            </View>
          )}
        />
      )}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.commentInput}>
          <TextInput
            style={styles.commentTextInput}
            value={text}
            onChangeText={setText}
            placeholder="say what you actually think..."
            placeholderTextColor={THEME.textSecondary}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || submitting) && { opacity: 0.4 }]}
            onPress={submitComment}
            disabled={!text.trim() || submitting}
          >
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
};

// ─── MAIN CARD ────────────────────────────────────────────────
function CalmPostCard({ post, onResponse, onSave, onViewThread, onPress, navigation, activeVideoId, nextVideo, onVideoChange }) {
  const { isAuthenticated } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [profileSheetVisible, setProfileSheetVisible] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(post.is_liked || false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [animating, setAnimating] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setLiked(post.is_liked || false);
    setLikesCount(post.likes_count || 0);
  }, [post.is_liked, post.likes_count]);

  const handleLike = async () => {
    if (animating) return;
    if (!isAuthenticated) {
      Alert.alert('Sign in Required', 'Please sign in to like posts', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Auth', { screen: 'Login' }) },
      ]);
      return;
    }
    setAnimating(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount((c) => (newLiked ? c + 1 : c - 1));
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start(() => setAnimating(false));
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) { setLiked(data.liked); setLikesCount(data.likes_count); }
      else { setLiked(!newLiked); setLikesCount((c) => (newLiked ? c - 1 : c + 1)); }
    } catch {
      setLiked(!newLiked);
      setLikesCount((c) => (newLiked ? c - 1 : c + 1));
    }
  };

  const handleDoubleTap = async () => {
    if (liked || !isAuthenticated) return;
    setLiked(true);
    setLikesCount((c) => c + 1);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) { setLiked(data.liked); setLikesCount(data.likes_count); }
    } catch (e) { console.error(e); }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: `"${post.content?.substring(0, 120)}..." — Anonixx` });
    } catch (e) { console.log(e); }
  };

  const handleCopyLink = () => {
    Clipboard.setString(`anonixx://post/${post.id}`);
    setMenuVisible(false);
    Alert.alert('Copied', 'Link copied to clipboard');
  };

  const handleReport = () => {
    setMenuVisible(false);
    Alert.alert('Report Post', 'Why are you reporting this?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Harmful', onPress: () => submitReport('harmful') },
      { text: 'Spam', onPress: () => submitReport('spam') },
      { text: 'Inappropriate', onPress: () => submitReport('inappropriate') },
    ]);
  };

  const submitReport = async (reason) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
      Alert.alert('Reported', 'Thank you for keeping Anonixx safe.');
    } catch (e) { console.error(e); }
  };

  const handleBlockUser = () => {
    setMenuVisible(false);
    Alert.alert('Block User', `Block ${post.anonymous_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block', style: 'destructive',
        onPress: async () => {
          const token = await AsyncStorage.getItem('token');
          await fetch(`${API_BASE_URL}/api/v1/users/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ user_id: post.user_id }),
          });
        },
      },
    ]);
  };

  const isTextOnly = !post.images?.length && !post.video_url && !post.audio_url;
  const shouldTruncate = post.content?.length > 400;
  const displayContent = shouldTruncate && !showFullContent ? post.content.substring(0, 400) + '...' : post.content;

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.card}>
        {/* Header — outside DoubleTapLike so avatar/name tap works */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.leftSection}
            onPress={() => setProfileSheetVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
              <Text style={styles.timestamp}>{post.time_ago}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.moreButton}>
            <MoreHorizontal size={18} color={THEME.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <DoubleTapLike onDoubleTap={handleDoubleTap}>
          <TouchableOpacity style={styles.cardBody} onPress={() => onPress?.(post)} activeOpacity={0.97}>

          {/* Text content */}
          {post.content ? (
            <>
              <Text style={styles.content}>{displayContent}</Text>
              {shouldTruncate && !showFullContent && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowFullContent(true); }}>
                  <Text style={styles.readMore}>Read more</Text>
                </TouchableOpacity>
              )}
              {shouldTruncate && showFullContent && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowFullContent(false); }}>
                  <Text style={styles.readMore}>Show less</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}

          {/* Images */}
          {post.images?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
              {post.images.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.postImage} resizeMode="cover" />
              ))}
            </ScrollView>
          )}

          {/* Video */}
          {post.video_url && (
            <VideoPlayer
              videoUrl={post.video_url}
              isActive={activeVideoId === post.id}
              postId={post.id}
              onLike={handleLike}
              liked={liked}
              viewCount={post.views_count || 0}
              nextVideo={post.id === activeVideoId ? nextVideo : null}
              onVideoChange={onVideoChange}
              postContent={post.content || null}
            />
          )}

          {/* Audio */}
          {post.audio_url && <AudioPlayer audioUrl={post.audio_url} />}

          <View style={styles.divider} />

          {/* Nudge */}
          {isTextOnly && <Text style={styles.hint}>say something if it hits.</Text>}
          {(post.video_url || post.audio_url) && <Text style={styles.hint}>react or drop a comment.</Text>}

          {/* Actions: save+share LEFT | like+comment RIGHT */}
          <View style={styles.actions}>
            <View style={styles.actionsLeft}>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); onSave(post.id); }} style={styles.action}>
                <Bookmark size={17} color={post.is_saved ? THEME.primary : THEME.textSecondary} fill={post.is_saved ? THEME.primary : 'none'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleShare(); }} style={styles.action}>
                <Share2 size={17} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.actionsRight}>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowComments((v) => !v); }} style={styles.action}>
                <MessageCircle size={18} color={showComments ? THEME.primary : THEME.textSecondary} />
                <Text style={[styles.actionCount, showComments && { color: THEME.primary }]}>{post.thread_count || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleLike(); }} style={styles.action}>
                <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                  <Heart size={18} color={liked ? THEME.primary : THEME.textSecondary} fill={liked ? THEME.primary : 'none'} />
                </Animated.View>
                <Text style={[styles.actionCount, liked && { color: THEME.primary }]}>{likesCount}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Inline comments */}
          {showComments && (
            <CommentSection
              postId={post.id}
              isAuthenticated={isAuthenticated}
              navigation={navigation}
              onClose={() => setShowComments(false)}
            />
          )}
          </TouchableOpacity>
        </DoubleTapLike>
      </View>

      {/* Options Menu */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Options</Text>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <X size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
            {[
              { icon: <Bookmark size={18} color={post.is_saved ? THEME.primary : THEME.textSecondary} fill={post.is_saved ? THEME.primary : 'none'} />, label: post.is_saved ? 'Unsave' : 'Save', onPress: () => { setMenuVisible(false); onSave(post.id); } },
              { icon: <Share2 size={18} color={THEME.textSecondary} />, label: 'Share', onPress: () => { setMenuVisible(false); handleShare(); } },
              { icon: <Link size={18} color={THEME.textSecondary} />, label: 'Copy Link', onPress: handleCopyLink },
              { icon: <EyeOff size={18} color={THEME.textSecondary} />, label: 'Hide Post', onPress: () => setMenuVisible(false) },
              { icon: <Flag size={18} color={THEME.primary} />, label: 'Report', onPress: handleReport, danger: true },
              { icon: <UserX size={18} color={THEME.primary} />, label: 'Block User', onPress: handleBlockUser, danger: true },
            ].map((item, i) => (
              <TouchableOpacity key={i} style={styles.menuItem} onPress={item.onPress}>
                {item.icon}
                <Text style={[styles.menuItemText, item.danger && { color: THEME.primary }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelButton} onPress={() => setMenuVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    <AnonProfileSheet
        visible={profileSheetVisible}
        onClose={() => setProfileSheetVisible(false)}
        userId={post.user_id}
        anonymousName={post.anonymous_name}
        navigation={navigation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: { position: 'relative', marginBottom: 24, marginHorizontal: 16 },
  cardBody: { paddingBottom: 4 },
  card: {
    backgroundColor: THEME.surface,
    paddingVertical: 20,
    paddingHorizontal: 20,
    paddingLeft: 22,
    borderRadius: 18,
    borderLeftWidth: 1,
    borderLeftColor: THEME.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  heartAnimation: { position: 'absolute', top: '40%', left: '50%', marginLeft: -40, marginTop: -40, zIndex: 1000 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  leftSection: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center', marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,99,74,0.2)' },
  avatarText: { fontSize: 15, fontWeight: '700', color: THEME.primary },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '600', color: THEME.text },
  timestamp: { fontSize: 12, color: THEME.textSecondary, marginTop: 1 },
  moreButton: { padding: 4 },
  divider: { height: 1, backgroundColor: THEME.border, marginVertical: 12 },
  content: { fontSize: 16, lineHeight: 26, color: THEME.text, letterSpacing: 0.2, marginBottom: 10 },
  readMore: { fontSize: 14, fontWeight: '500', color: THEME.primary, marginBottom: 12 },
  imagesScroll: { marginBottom: 14 },
  postImage: { width: width - 90, height: 200, borderRadius: 12, marginRight: 8 },

  // Video
  videoContainer: { position: 'relative', marginBottom: 14, borderRadius: 14, overflow: 'hidden', height: 220, backgroundColor: '#0d1018' },
  video: { width: '100%', height: '100%' },
  videoLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1018' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,99,74,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 12 },

  // Audio
  audioContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,99,74,0.07)', borderWidth: 1, borderColor: 'rgba(255,99,74,0.15)', padding: 14, borderRadius: 14, marginBottom: 14 },
  audioPlayBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center', shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 },
  audioRight: { flex: 1 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 36 },
  waveBar: { width: 3, borderRadius: 2 },
  waveBarPlayed: { backgroundColor: THEME.primary },
  waveBarUnplayed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  audioMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  audioTimeText: { fontSize: 11, color: THEME.textSecondary },

  hint: { fontSize: 13, color: THEME.textSecondary, fontStyle: 'italic', marginBottom: 12 },

  // Actions
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 14, fontWeight: '500', color: THEME.textSecondary },

  // Comment section
  commentSection: { marginTop: 14, borderTopWidth: 1, borderTopColor: THEME.border, paddingTop: 8, maxHeight: 320 },
  commentHandle: { alignItems: 'center', paddingVertical: 6 },
  handleBar: { width: 32, height: 3, borderRadius: 2, backgroundColor: THEME.borderStrong },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 10 },
  commentHeaderText: { fontSize: 13, fontWeight: '600', color: THEME.textSecondary },
  commentLoading: { paddingVertical: 20, alignItems: 'center' },
  commentEmpty: { paddingVertical: 16, alignItems: 'center' },
  commentEmptyText: { fontSize: 13, color: THEME.textSecondary, fontStyle: 'italic' },
  commentList: { maxHeight: 180 },
  commentItem: { flexDirection: 'row', gap: 10, marginBottom: 12, paddingHorizontal: 4 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: THEME.avatarBg, alignItems: 'center', justifyContent: 'center' },
  commentAvatarText: { fontSize: 12, fontWeight: '700', color: THEME.primary },
  commentBody: { flex: 1 },
  commentAuthor: { fontSize: 12, fontWeight: '600', color: THEME.text, marginBottom: 2 },
  commentText: { fontSize: 13, color: THEME.textSecondary, lineHeight: 18 },
  commentInput: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 4 },
  commentTextInput: { flex: 1, backgroundColor: THEME.inputBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: THEME.text, borderWidth: 1, borderColor: THEME.border, maxHeight: 80 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center' },

  // Menu
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: THEME.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: THEME.border },
  menuTitle: { fontSize: 16, fontWeight: '700', color: THEME.text },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: THEME.border },
  menuItemText: { fontSize: 15, fontWeight: '500', color: THEME.text },
  cancelButton: { margin: 16, padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  cancelText: { fontSize: 15, fontWeight: '600', color: THEME.textSecondary },
  videoTapBadge: { position: 'absolute', bottom: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  videoTapText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  videoLiveBar: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  videoLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: THEME.primary },
  videoLiveText: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  videoMutedBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', padding: 6, borderRadius: 10 },
});

// ─── FULLSCREEN VIDEO STYLES ───────────────────────────────────
const fsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  swipeHint: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  swipeBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  videoWrapper: { flex: 1, justifyContent: 'center', backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)',
  },
  controls: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'space-between', paddingTop: 50, paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  controlBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  controlBtnActive: { backgroundColor: 'rgba(255,99,74,0.2)' },
  centerPlay: {
    alignSelf: 'center',
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 10,
  },
  timeText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500', minWidth: 36 },
  progressHit: { flex: 1, paddingVertical: 12 },
  progressTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2, position: 'relative',
  },
  progressFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: THEME.primary, borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute', top: -5,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: '#fff',
    marginLeft: -6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4,
    elevation: 4,
  },
  muteBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  captionsOverlay: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    right: 20,
    maxHeight: 160,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  captionsScroll: { maxHeight: 140 },
  captionsText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#fff',
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
  upNextWrapper: { alignItems: 'center', gap: 8 },
  upNextLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)', letterSpacing: 1, textTransform: 'uppercase' },
  // Heart burst
  heartBurst: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -50,
    marginTop: -50,
    zIndex: 100,
  },
});

const areEqual = (prev, next) =>
  prev.post.id === next.post.id &&
  prev.post.is_saved === next.post.is_saved &&
  prev.post.is_liked === next.post.is_liked &&
  prev.post.likes_count === next.post.likes_count &&
  prev.post.thread_count === next.post.thread_count;

export default React.memo(CalmPostCard, areEqual);
