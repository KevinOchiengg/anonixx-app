import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  ArrowLeft,
  Bookmark,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Share2,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommentBottomSheet } from '../../components/feed/CommentBottomSheet';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const { width, height } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  borderStrong: 'rgba(255,255,255,0.12)',
  avatarBg: '#1e2330',
};

// ─── VIDEO SLIDE ──────────────────────────────────────────────
const VideoSlide = ({
  post,
  isActive,
  initialTime,
  onLike,
  liked,
  likesCount,
  onSave,
  saved,
  onComment,
  commentCount,
  navigation,
  isOwnPost,
  onDelete,
}) => {
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimer = useRef(null);
  const lastTap = useRef(null);
  const [showHeart, setShowHeart] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(1)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const [expanded, setExpanded] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const isSeekingRef = useRef(false);
  const hasSeededTime = useRef(false);
  const controlsOpacity = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(post.video_url, (p) => {
    p.loop = true;
    p.muted = false;
    if (initialTime && initialTime > 0) {
      p.seekBy(initialTime);
    }
  });

  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => {
    const sub = player.addListener(
      'playingChange',
      ({ isPlaying: playing }) => {
        setIsPlaying(playing);
      }
    );
    return () => sub.remove();
  }, [player]);

  // Poll currentTime + duration every 250 ms while active
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      if (isSeekingRef.current) return;
      const ct = player.currentTime;
      const d = player.duration;
      if (typeof ct === 'number' && !isNaN(ct)) setVideoCurrentTime(ct);
      if (typeof d === 'number' && !isNaN(d) && d > 0) setVideoDuration(d);
    }, 250);
    return () => clearInterval(id);
  }, [isActive, player]);

  useEffect(() => {
    if (isActive) {
      player.muted = muted;
      if (!hasSeededTime.current && initialTime > 0) {
        hasSeededTime.current = true;
        player.seekBy(initialTime);
      }
      player.play();
    } else {
      player.pause();
      setVideoCurrentTime(0);
      setVideoDuration(0);
    }
  }, [isActive]);

  useEffect(() => {
    player.muted = muted;
  }, [muted]);

  const showControlsAnimated = () => {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    }, 2200);
  };

  const handleTap = () => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < 280) {
      triggerHeart();
      if (!liked) handleLikeWithAnim();
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 260) showControlsAnimated();
      }, 290);
    }
    lastTap.current = now;
  };

  const handleLikeWithAnim = () => {
    Animated.sequence([
      Animated.spring(likeScale, {
        toValue: 1.4,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.spring(likeScale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
    onLike();
  };

  const triggerHeart = () => {
    setShowHeart(true);
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => setShowHeart(false));
  };

  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const shouldTruncate = (post.content?.length || 0) > 100;
  const displayContent =
    shouldTruncate && !expanded
      ? post.content.substring(0, 100) + '...'
      : post.content;

  return (
    <View style={ss.slide}>
      {/* Video layer */}
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill}>
          {VideoView ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
              allowsPictureInPicture={false}
              pointerEvents="none"
            />
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Gradients */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={ss.gradientTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.82)']}
        style={ss.gradientBottom}
        pointerEvents="none"
      />

      {/* Double-tap heart burst */}
      {showHeart && (
        <Animated.View
          pointerEvents="none"
          style={[
            ss.heartBurst,
            { transform: [{ scale: heartScale }], opacity: heartOpacity },
          ]}
        >
          <Heart size={100} color={THEME.primary} fill={THEME.primary} />
        </Animated.View>
      )}

      {/* Play/pause overlay — fades in/out */}
      {showControls && (
        <Animated.View
          style={[ss.playOverlay, { opacity: controlsOpacity }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={() => {
              isPlaying ? player.pause() : player.play();
              showControlsAnimated();
            }}
            activeOpacity={0.9}
          >
            <View style={ss.playBtn}>
              {isPlaying ? (
                <Pause size={38} color="#fff" fill="#fff" />
              ) : (
                <Play size={38} color="#fff" fill="#fff" />
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Right action rail */}
      <View style={ss.rail}>
        <AnimatedActionBtn
          icon={
            <Heart
              size={28}
              color={liked ? THEME.primary : '#fff'}
              fill={liked ? THEME.primary : 'none'}
            />
          }
          count={likesCount}
          onPress={handleLikeWithAnim}
          active={liked}
          scaleRef={likeScale}
        />
        <ActionBtn
          icon={<MessageCircle size={28} color="#fff" />}
          count={commentCount}
          onPress={onComment}
        />
        <ActionBtn
          icon={
            <Bookmark
              size={28}
              color={saved ? THEME.primary : '#fff'}
              fill={saved ? THEME.primary : 'none'}
            />
          }
          count={null}
          onPress={onSave}
          active={saved}
        />
        <ActionBtn
          icon={<Share2 size={28} color="#fff" />}
          count={null}
          onPress={async () => {
            try {
              await Share.share({
                message: `"${post.content?.substring(0, 100)}..." — Anonixx`,
              });
            } catch (e) {}
          }}
        />
        {isOwnPost && <DeleteBtn onDelete={onDelete} />}
        <TouchableOpacity
          style={ss.muteBtn}
          onPress={() => setMuted((v) => !v)}
        >
          {muted ? (
            <VolumeX size={22} color="#fff" />
          ) : (
            <Volume2 size={22} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={ss.bottomInfo}>
        {/* Author */}
        <View style={ss.authorRow}>
          <View style={ss.avatarGlow}>
            <View style={ss.avatar}>
              <Text style={ss.avatarText}>
                {post.anonymous_name?.[0]?.toUpperCase() || 'A'}
              </Text>
            </View>
          </View>
          <View style={ss.authorMeta}>
            <Text style={ss.authorName}>
              {post.anonymous_name || 'Anonymous'}
            </Text>
            <Text style={ss.timeAgo}>{post.time_ago}</Text>
          </View>
        </View>

        {/* Caption */}
        {post.content ? (
          <TouchableOpacity
            onPress={() => setExpanded((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={ss.contentText}>
              {displayContent}
              {shouldTruncate && (
                <Text style={ss.moreText}>{expanded ? ' less' : ' more'}</Text>
              )}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Topic pills */}
        {post.topics?.length > 0 && (
          <View style={ss.topicsRow}>
            {post.topics
              .filter((t) => t !== 'general')
              .slice(0, 3)
              .map((t) => (
                <View key={t} style={ss.topicTag}>
                  <Text style={ss.topicText}>#{t}</Text>
                </View>
              ))}
          </View>
        )}
      </View>

      {/* Bottom progress bar with time */}
      {videoDuration > 0 && (
        <View style={ss.progressWrap}>
          <View style={ss.progressTimeRow}>
            <Text style={ss.progressTime}>{formatTime(videoCurrentTime)}</Text>
            <Text style={ss.progressTime}>{formatTime(videoDuration)}</Text>
          </View>
          <Slider
            style={ss.progressSlider}
            minimumValue={0}
            maximumValue={videoDuration}
            value={videoCurrentTime}
            minimumTrackTintColor={THEME.primary}
            maximumTrackTintColor="rgba(255,255,255,0.2)"
            thumbTintColor={THEME.primary}
            onSlidingStart={() => {
              isSeekingRef.current = true;
            }}
            onValueChange={(val) => setVideoCurrentTime(val)}
            onSlidingComplete={(val) => {
              player.seekBy(val - player.currentTime);
              setVideoCurrentTime(val);
              isSeekingRef.current = false;
            }}
          />
        </View>
      )}
    </View>
  );
};

// ─── AUDIO SLIDE ──────────────────────────────────────────────
const AudioSlide = ({
  post,
  isActive,
  onLike,
  liked,
  likesCount,
  onSave,
  saved,
  onComment,
  commentCount,
  isOwnPost,
  onDelete,
}) => {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Auto-pause when slide leaves view
  useEffect(() => {
    if (!isActive && playing) {
      soundRef.current?.pauseAsync();
      setPlaying(false);
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const togglePlay = async () => {
    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: post.audio_url },
          { shouldPlay: true },
          onStatus
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

  const onStatus = (status) => {
    if (status.isLoaded) {
      const pos = status.positionMillis;
      const dur = status.durationMillis || 0;
      setPosition(pos);
      setDuration(dur);
      const prog = dur > 0 ? pos / dur : 0;
      setProgress(prog);
      Animated.timing(progressAnim, {
        toValue: prog,
        duration: 100,
        useNativeDriver: false,
      }).start();
      if (status.didJustFinish) {
        setPlaying(false);
        setProgress(0);
        setPosition(0);
        progressAnim.setValue(0);
      }
    }
  };

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const bars = Array.from({ length: 48 }, (_, i) => ({
    h: Math.sin(i * 0.55) * 20 + Math.cos(i * 0.3) * 10 + 28,
    played: progress > 0 && i / 48 <= progress,
  }));

  const shouldTruncate = (post.content?.length || 0) > 120;
  const displayContent =
    shouldTruncate && !expanded
      ? post.content.substring(0, 120) + '...'
      : post.content;

  return (
    <View style={[ss.slide, { backgroundColor: THEME.background }]}>
      {/* Subtle animated background */}
      <View style={as.bgAccent} />
      <View style={as.bgAccent2} />

      {/* Right action rail */}
      <View style={ss.rail}>
        <ActionBtn
          icon={
            <Heart
              size={26}
              color={liked ? THEME.primary : '#fff'}
              fill={liked ? THEME.primary : 'none'}
            />
          }
          count={likesCount}
          onPress={onLike}
          active={liked}
        />
        <ActionBtn
          icon={<MessageCircle size={26} color="#fff" />}
          count={commentCount}
          onPress={onComment}
        />
        <ActionBtn
          icon={
            <Bookmark
              size={26}
              color={saved ? THEME.primary : '#fff'}
              fill={saved ? THEME.primary : 'none'}
            />
          }
          count={null}
          onPress={onSave}
          active={saved}
        />
        <ActionBtn
          icon={<Share2 size={26} color="#fff" />}
          count={null}
          onPress={async () => {
            try {
              await Share.share({
                message: `"${post.content?.substring(0, 100)}..." — Anonixx`,
              });
            } catch (e) {}
          }}
        />
        {isOwnPost && <DeleteBtn onDelete={onDelete} />}
      </View>

      {/* Center audio player */}
      <View style={as.center}>
        {/* Author */}
        <View style={as.authorRow}>
          <View style={as.avatar}>
            <Text style={as.avatarText}>
              {post.anonymous_name?.[0]?.toUpperCase() || 'A'}
            </Text>
          </View>
          <View>
            <Text style={as.authorName}>
              {post.anonymous_name || 'Anonymous'}
            </Text>
            <Text style={as.timeAgo}>{post.time_ago}</Text>
          </View>
        </View>

        {/* Content */}
        {post.content ? (
          <TouchableOpacity
            onPress={() => setExpanded((v) => !v)}
            activeOpacity={0.85}
            style={as.contentWrap}
          >
            <Text style={as.contentText}>
              {displayContent}
              {shouldTruncate && (
                <Text style={as.moreText}>{expanded ? ' less' : ' more'}</Text>
              )}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Waveform */}
        <View style={as.waveformWrap}>
          {bars.map((bar, i) => (
            <View
              key={i}
              style={[
                as.bar,
                { height: bar.h },
                bar.played ? as.barPlayed : as.barUnplayed,
              ]}
            />
          ))}
        </View>

        {/* Progress bar */}
        <View style={as.progressTrack}>
          <Animated.View
            style={[
              as.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {/* Time */}
        <View style={as.timeRow}>
          <Text style={as.timeText}>{formatTime(position)}</Text>
          <Text style={as.timeText}>
            {duration > 0 ? formatTime(duration) : '--:--'}
          </Text>
        </View>

        {/* Play button */}
        <TouchableOpacity
          style={as.playBtn}
          onPress={togglePlay}
          activeOpacity={0.85}
        >
          {playing ? (
            <Pause size={32} color="#fff" fill="#fff" />
          ) : (
            <Play size={32} color="#fff" fill="#fff" />
          )}
        </TouchableOpacity>

        {/* Topics */}
        {post.topics?.length > 0 && (
          <View style={as.topicsRow}>
            {post.topics
              .filter((t) => t !== 'general')
              .slice(0, 3)
              .map((t) => (
                <View key={t} style={as.topicTag}>
                  <Text style={as.topicText}>{t}</Text>
                </View>
              ))}
          </View>
        )}
      </View>
    </View>
  );
};

// ─── ACTION BUTTONS (right rail) ──────────────────────────────
const ActionBtn = ({ icon, count, onPress, active }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 0.82,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
    onPress?.();
  };
  return (
    <TouchableOpacity
      style={ss.actionBtn}
      onPress={handlePress}
      activeOpacity={0.9}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{icon}</Animated.View>
      {count !== null && count !== undefined && (
        <Text style={[ss.actionCount, active && { color: THEME.primary }]}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const AnimatedActionBtn = ({ icon, count, onPress, active, scaleRef }) => (
  <TouchableOpacity style={ss.actionBtn} onPress={onPress} activeOpacity={0.9}>
    <Animated.View style={{ transform: [{ scale: scaleRef }] }}>
      {icon}
    </Animated.View>
    {count !== null && count !== undefined && (
      <Text style={[ss.actionCount, active && { color: THEME.primary }]}>
        {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
      </Text>
    )}
  </TouchableOpacity>
);

const DeleteBtn = React.memo(({ onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);

  const handlePress = () => {
    if (confirming) {
      clearTimeout(timerRef.current);
      setConfirming(false);
      onDelete();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 2500);
    }
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <TouchableOpacity
      style={ss.actionBtn}
      onPress={handlePress}
      activeOpacity={0.9}
    >
      <Trash2 size={26} color={confirming ? '#ef4444' : '#fff'} />
      <Text style={[ss.actionCount, confirming && { color: '#ef4444' }]}>
        {confirming ? 'confirm' : 'delete'}
      </Text>
    </TouchableOpacity>
  );
});

// ─── MEDIA FEED SCREEN ────────────────────────────────────────
export default function MediaFeedScreen({ route, navigation }) {
  const { posts, startIndex = 0, startTime = 0 } = route.params;
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const slideHeight = height - tabBarHeight;
  const [listHeight, setListHeight] = useState(slideHeight);

  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [likeMap, setLikeMap] = useState(() => {
    const m = {};
    posts.forEach((p) => {
      m[p.id] = { liked: p.is_liked || false, count: p.likes_count || 0 };
    });
    return m;
  });
  const [saveMap, setSaveMap] = useState(() => {
    const m = {};
    posts.forEach((p) => {
      m[p.id] = p.is_saved || false;
    });
    return m;
  });
  const [commentCounts, setCommentCounts] = useState(() => {
    const m = {};
    posts.forEach((p) => {
      m[p.id] = p.thread_count || 0;
    });
    return m;
  });
  const [commentSheet, setCommentSheet] = useState({
    visible: false,
    postId: null,
  });

  const flatListRef = useRef(null);

  // Scroll to startIndex on mount
  useEffect(() => {
    if (startIndex > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: startIndex,
          animated: false,
        });
      }, 50);
    }
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const handleLike = useCallback(
    async (postId) => {
      if (!isAuthenticated) {
        showToast({ type: 'info', message: 'Sign in to like this.' });
        navigation.navigate('Auth', { screen: 'Login' });
        return;
      }
      const current = likeMap[postId];
      const newLiked = !current.liked;
      setLikeMap((prev) => ({
        ...prev,
        [postId]: {
          liked: newLiked,
          count: newLiked ? current.count + 1 : current.count - 1,
        },
      }));
      try {
        const token = await AsyncStorage.getItem('token');
        await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/like`, {
          method: newLiked ? 'POST' : 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        // Revert on failure
        setLikeMap((prev) => ({ ...prev, [postId]: current }));
      }
    },
    [isAuthenticated, likeMap]
  );

  const handleDelete = useCallback(
    async (postId) => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/v1/posts/${postId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        showToast({ type: 'success', message: 'Post deleted.' });
        navigation.goBack();
      } catch {
        showToast({ type: 'error', message: 'Could not delete. Try again.' });
      }
    },
    [navigation, showToast]
  );

  const handleSave = useCallback(
    async (postId) => {
      if (!isAuthenticated) return;
      const wasSaved = saveMap[postId];
      setSaveMap((prev) => ({ ...prev, [postId]: !wasSaved }));
      try {
        const token = await AsyncStorage.getItem('token');
        await fetch(`${API_BASE_URL}/api/v1/posts/${postId}/save`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        setSaveMap((prev) => ({ ...prev, [postId]: wasSaved }));
      }
    },
    [isAuthenticated, saveMap]
  );

  const getItemLayout = useCallback(
    (_, index) => ({
      length: listHeight,
      offset: listHeight * index,
      index,
    }),
    [listHeight]
  );

  const renderItem = useCallback(
    ({ item, index }) => {
      const isActive = index === activeIndex;
      const likeState = likeMap[item.id] || { liked: false, count: 0 };

      const commonProps = {
        post: item,
        isActive,
        liked: likeState.liked,
        likesCount: likeState.count,
        saved: saveMap[item.id] || false,
        commentCount: commentCounts[item.id] || 0,
        onLike: () => handleLike(item.id),
        onSave: () => handleSave(item.id),
        onComment: () => setCommentSheet({ visible: true, postId: item.id }),
        isOwnPost: item.is_own_post || false,
        onDelete: () => handleDelete(item.id),
        navigation,
      };

      const slide = item.video_url ? (
        <VideoSlide
          key={item.id}
          {...commonProps}
          initialTime={index === startIndex ? startTime : 0}
        />
      ) : (
        <AudioSlide key={item.id} {...commonProps} />
      );
      return <View style={{ height: listHeight, width }}>{slide}</View>;
    },
    [
      activeIndex,
      likeMap,
      saveMap,
      commentCounts,
      handleLike,
      handleSave,
      listHeight,
    ]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <View style={ss.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Back button */}
      <TouchableOpacity
        style={[ss.backBtn, { top: insets.top + 10 }]}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ArrowLeft size={20} color="#fff" />
      </TouchableOpacity>

      {/* Center "For You" pill */}
      <View style={[ss.forYouPill, { top: insets.top + 14 }]}>
        <Text style={ss.forYouText}>For You</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={listHeight}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== listHeight) setListHeight(h);
        }}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialScrollIndex={startIndex}
        removeClippedSubviews
        maxToRenderPerBatch={3}
        windowSize={3}
        initialNumToRender={2}
      />

      {/* Comment sheet */}
      <CommentBottomSheet
        visible={commentSheet.visible}
        postId={commentSheet.postId}
        isAuthenticated={isAuthenticated}
        navigation={navigation}
        onClose={() => setCommentSheet({ visible: false, postId: null })}
        onCountChange={(count) => {
          if (commentSheet.postId) {
            setCommentCounts((prev) => ({
              ...prev,
              [commentSheet.postId]: count,
            }));
          }
        }}
      />
    </View>
  );
}

// ─── SLIDE STYLES ─────────────────────────────────────────────
const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  slide: { width, height: '100%', backgroundColor: '#000' },

  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    zIndex: 1,
  },
  gradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 340,
    zIndex: 1,
  },

  // Right action rail
  rail: {
    position: 'absolute',
    right: 12,
    bottom: 110,
    alignItems: 'center',
    gap: 24,
    zIndex: 10,
  },
  actionBtn: { alignItems: 'center', gap: 5 },
  actionCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  muteBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginTop: 4,
  },

  // Bottom info (video)
  bottomInfo: {
    position: 'absolute',
    bottom: 52,
    left: 16,
    right: 76,
    zIndex: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  avatarGlow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,99,74,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: THEME.primary,
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: THEME.primary },
  authorMeta: { flex: 1 },
  authorName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
  timeAgo: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  contentText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 21,
    marginBottom: 10,
    letterSpacing: 0.1,
  },
  moreText: { color: THEME.primary, fontWeight: '700' },
  topicsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  topicTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,99,74,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.4)',
  },
  topicText: {
    fontSize: 11,
    color: THEME.primary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Progress bar
  progressWrap: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    zIndex: 10,
  },
  progressTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: -2,
  },
  progressTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
  },
  progressSlider: { width: '100%', height: 30 },

  // Play/pause overlay
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  playBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  // Heart burst
  heartBurst: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -50,
    marginTop: -50,
    zIndex: 100,
  },

  // Nav overlay
  backBtn: {
    position: 'absolute',
    left: 14,
    zIndex: 100,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  forYouPill: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  forYouText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
});

// ─── AUDIO SLIDE STYLES ───────────────────────────────────────
const as = StyleSheet.create({
  bgAccent: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(255,99,74,0.09)',
  },
  bgAccent2: {
    position: 'absolute',
    bottom: -100,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,99,74,0.06)',
  },
  center: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 100,
    paddingBottom: 120,
    justifyContent: 'center',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: THEME.primary,
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: THEME.primary },
  authorName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  timeAgo: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  contentWrap: { marginBottom: 28 },
  contentText: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.2,
  },
  moreText: { color: THEME.primary, fontWeight: '600' },

  waveformWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 64,
    marginBottom: 12,
  },
  bar: { width: 4, borderRadius: 3 },
  barPlayed: { backgroundColor: THEME.primary },
  barUnplayed: { backgroundColor: 'rgba(255,255,255,0.15)' },

  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.primary,
    borderRadius: 2,
  },

  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  timeText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },

  playBtn: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },

  topicsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  topicTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,99,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.25)',
  },
  topicText: { fontSize: 12, color: THEME.primary, fontWeight: '600' },
});
