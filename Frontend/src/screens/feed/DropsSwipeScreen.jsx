/**
 * DropsSwipeScreen.jsx
 *
 * The Feed tab's landing screen, and the only feed screen — every
 * confession (text, image, video, audio, poll) as one full-screen,
 * TikTok-style vertical swipe, instead of a scrollable list of cards. One
 * confession gets your full attention at a time; the next is a swipe away.
 * The old card-list feed (DropsFeedScreen) has been retired; everything it
 * did — market promo cards, house/sponsored ads, the daily-claim banner,
 * location-scoped feed, session limit — now happens here instead.
 *
 * Video and audio slides are ported from MediaFeedScreen.jsx (which already
 * proved this interaction pattern, just as a secondary destination reached
 * by tapping into a video). Text/image slides are full-bleed, same as
 * video — an attached image fills the whole slide with the confession as
 * a caption underneath (not a small graphic card floating on a black
 * background); a pure-text confession fills the slide with its own
 * intent/mood gradient and large centered auto-sized text instead. Poll
 * reuses DropCard's exported PollCard on that same gradient background so
 * there's one voting implementation, not two that can drift apart. Market
 * and ad slides reuse MarketCard/FeedAdCard, wrapped in a full-screen
 * surface with a pinned CTA underneath — the "TikTok shows a button on an
 * ad post" pattern applied to both.
 *
 * (MoodBalancer, also imported by the old feed, was already dead code
 * before this screen existed — its only producer, the old `posts` feature,
 * was removed in an earlier commit, so it never actually fired. Not
 * ported; nothing here regresses by leaving it out.)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList, Image, Linking, Modal,
  ScrollView, Share, StatusBar, StyleSheet, Text, TouchableOpacity,
  TouchableWithoutFeedback, View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useDispatch, useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import {
  Bookmark, Coins, Eye, ExternalLink, Heart, Link2, MapPin, Menu, MessageCircle,
  MoreHorizontal, Pause, Play, Search, Share2, X,
} from 'lucide-react-native';

import { CommentBottomSheet } from '../../components/feed/CommentBottomSheet';
import AnonProfileSheet from '../../components/connect/AnonProfileSheet';
import { PollCard } from '../../components/feed/DropCard';
import MarketCard from '../../components/feed/MarketCard';
import FeedAdCard from '../../components/feed/FeedAdCard';
import DailyRewardBanner from '../../components/rewards/DailyRewardBanner';
import HamburgerMenu from '../../components/ui/HamburgerMenu';
import { useToast } from '../../components/ui/Toast';
import ReportSheet from '../../components/feed/ReportSheet';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { getDeviceId } from '../../utils/deviceId';
import { rs, rf, rp, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { THEME } from '../../utils/theme';
import { CARD_INTENTS, DROP_THEMES } from '../../components/drops/DropCardRenderer';
import { fetchMarketItems, selectMarketFeed } from '../../store/slices/marketSlice';

// Matches the injection frequency in the old DropsFeedScreen.jsx — every
// 7th drop gets a market slide, every 8th (DEFAULT_FEED_AD_FREQUENCY in
// Backend/app/api/v1/ads.py) gets an ad slide. Independent moduli, same
// as before — both can land on the same position.
const MARKET_FREQUENCY = 7;
const FEED_AD_FREQUENCY = 8;

const { width, height } = Dimensions.get('window');

// Matches COINS_UNLOCK_COST in Backend/app/api/v1/drops.py
const UNLOCK_COST = 6;

// Mirrors LOCATION_SCOPE_LABELS in DropsFeedScreen.jsx
const LOCATION_SCOPE_LABELS = {
  country: 'Country', county: 'Region', sub_county: 'Area', estate: 'Nearby',
};

// ─── Shared: Link Up button ─────────────────────────────────────
// Same coin-gated CTA as DropCard.jsx's card-feed version (Link2 icon,
// "Link up" label, coin-cost pill) — positioned like a TikTok ad's CTA,
// pinned near the bottom of the slide instead of squeezed into a caption.
const LinkUpButton = React.memo(({ onPress }) => (
  <TouchableOpacity onPress={onPress} style={sw.linkUpBtn} activeOpacity={0.85} hitSlop={HIT_SLOP}>
    <Link2 size={rs(16)} color="#fff" strokeWidth={2} />
    <Text style={sw.linkUpBtnText}>Link up</Text>
    <View style={sw.linkUpCostPill}>
      <Coins size={rs(11)} color="#fff" />
      <Text style={sw.linkUpCostText}>{UNLOCK_COST}</Text>
    </View>
  </TouchableOpacity>
));

// ─── Shared: right action rail ───────────────────────────────────
const ActionBtn = ({ icon, count, onPress, active }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.82, friction: 4, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };
  return (
    <TouchableOpacity style={ss.actionBtn} onPress={handlePress} activeOpacity={0.9}>
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
    <Animated.View style={{ transform: [{ scale: scaleRef }] }}>{icon}</Animated.View>
    {count !== null && count !== undefined && (
      <Text style={[ss.actionCount, active && { color: THEME.primary }]}>
        {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
      </Text>
    )}
  </TouchableOpacity>
);

// Small "N views" chip, matching the eye icon already used on the card-feed
// video player (DropCard.jsx) — kept visible here too instead of dropping
// the metric just because the layout changed.
// TikTok never puts view counts next to the username — it treats views as
// just another stat in the same right-side rail as Like/Comment/Save,
// same icon-on-top/count-below shape, not a separate small floating
// badge. This mirrors ActionBtn's exact visual weight but isn't
// touchable — there's no action tied to tapping a view count.
const ViewsStat = React.memo(({ count }) => {
  if (!count) return null;
  const label = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  return (
    <View style={ss.actionBtn}>
      <Eye size={24} color="#fff" />
      <Text style={ss.actionCount}>{label}</Text>
    </View>
  );
});

// Wraps a slide's avatar+name so tapping it opens the same anonymous
// profile sheet DropCard.jsx already uses in the card feed — same
// avatar-or-initial rendering, and Link Up lives there too as one of the
// profile's own details, not just as the pinned button on the slide
// itself. Never opens a profile for admin drops — is_admin_drop's whole
// point is that the account behind it stays untraceable. An admin tapping
// an Anonixx name is taken to the admin dashboard instead; for everyone
// else that tap does nothing.
const AuthorProfileTrigger = ({ post, navigation, children }) => {
  const [visible, setVisible] = useState(false);
  const isAdminViewer = useSelector((state) => !!state.auth.user?.is_admin);
  const opensDashboard = post.is_admin_drop && isAdminViewer;
  return (
    <>
      <TouchableOpacity
        onPress={() => (opensDashboard ? navigation.navigate('AdminDashboard') : setVisible(true))}
        activeOpacity={post.is_admin_drop && !opensDashboard ? 1 : 0.75}
        disabled={post.is_admin_drop && !opensDashboard}
      >
        {children}
      </TouchableOpacity>
      <AnonProfileSheet
        visible={visible}
        anonymousName={post.anonymous_name}
        userId={post.user_id}
        post={post}
        onClose={() => setVisible(false)}
        navigation={navigation}
      />
    </>
  );
};

// Top of the right rail, above Like — same position TikTok's own creator
// avatar sits in. The bottom-left name/timestamp is still its own
// separate tap target too (see authorRow below), matching TikTok's own
// behavior where both the pfp and the @username open the same profile.
const RailAvatar = ({ post, navigation }) => (
  <AuthorProfileTrigger post={post} navigation={navigation}>
    <View style={sw.railAvatarRing}>
      {post.avatar_url ? (
        <Image source={{ uri: post.avatar_url }} style={sw.railAvatarImg} />
      ) : (
        <View style={sw.railAvatarFallback}>
          <Text style={sw.railAvatarInitial}>{post.anonymous_name?.[0]?.toUpperCase() || 'A'}</Text>
        </View>
      )}
    </View>
  </AuthorProfileTrigger>
);

// ─── VIDEO SLIDE (ported from MediaFeedScreen.jsx) ───────────────
const VideoSlide = ({
  post, isActive, onLike, liked, likesCount, onSave, saved, onComment,
  commentCount, isOwnPost, onLinkUp, onMore, navigation, chromeHidden = false,
}) => {
  const lastTap = useRef(null);
  const [showHeart, setShowHeart] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(1)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const [expanded, setExpanded] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playerStatus, setPlayerStatus] = useState('loading');
  const wasEverActive = useRef(false);
  const sourceLoaded = useRef(false);

  // Loads with no source and stays that way until this slide is actually
  // the active one — same lazy pattern DropCard.jsx's feed-card player
  // already uses. Loading post.video_url eagerly on every mount meant
  // every slide within the FlatList's render window (windowSize) started
  // buffering its video the instant it mounted, not just the one on
  // screen — several videos competing for bandwidth/decoders at once is
  // exactly what made scrolling feel janky instead of smooth.
  const player = useVideoPlayer(null, (p) => { p.loop = true; p.muted = false; });

  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying: playing }) => setIsPlaying(playing));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => setPlayerStatus(status));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      const ct = player.currentTime;
      const d = player.duration;
      if (typeof ct === 'number' && !isNaN(ct)) setVideoCurrentTime(ct);
      if (typeof d === 'number' && !isNaN(d) && d > 0) setVideoDuration(d);
    }, 250);
    return () => clearInterval(id);
  }, [isActive, player]);

  useEffect(() => {
    if (isActive) {
      wasEverActive.current = true;
      if (!sourceLoaded.current) {
        sourceLoaded.current = true;
        player.replaceAsync({ uri: post.video_url }).then(() => player.play()).catch(() => {});
      } else {
        player.play();
      }
    } else if (wasEverActive.current) {
      player.pause();
      setVideoCurrentTime(0);
      setVideoDuration(0);
    }
  }, [isActive]);

  // Single tap pauses/resumes directly — no intermediate "reveal a play
  // button, then tap that" step. Double tap (within 280ms) likes instead,
  // same disambiguation delay as before so a like's first tap is never
  // mistaken for a pause.
  const handleTap = () => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < 280) {
      triggerHeart();
      if (!liked) handleLikeWithAnim();
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 260) {
          isPlaying ? player.pause() : player.play();
        }
      }, 290);
    }
    lastTap.current = now;
  };

  const handleLikeWithAnim = () => {
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, friction: 3, useNativeDriver: true }),
      Animated.spring(likeScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    onLike();
  };

  const triggerHeart = () => {
    setShowHeart(true);
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(heartOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start(() => setShowHeart(false));
  };

  const shouldTruncate = (post.content?.length || 0) > 100;
  const displayContent = shouldTruncate && !expanded
    ? post.content.substring(0, 100) + '...' : post.content;

  return (
    <View style={ss.slide}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={false}
        pointerEvents="none"
      />
      {/* A separate top-most sibling, not a wrapper around VideoView —
          expo-video's native surface (ExoPlayer/SurfaceView on Android)
          can swallow touches over the actual video pixels even with
          pointerEvents="none" on the view itself, which is why tapping
          dead-center (where the video, not letterboxing, actually renders)
          silently did nothing while taps near the letterboxed edges still
          worked. Rendering this touch layer after VideoView in the stack
          makes it the one that always receives the tap first, everywhere. */}
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {playerStatus === 'loading' && (
        <View style={ss.videoLoading} pointerEvents="none">
          <ActivityIndicator color="rgba(255,255,255,0.45)" size="large" />
        </View>
      )}

      {showHeart && (
        <Animated.View pointerEvents="none" style={[ss.heartBurst, { transform: [{ scale: heartScale }], opacity: heartOpacity }]}>
          <Heart size={100} color={THEME.primary} fill={THEME.primary} />
        </Animated.View>
      )}

      {/* Two-finger hold declutters down to header + raw video — every
          gradient, the rail, the caption/link-up column, and the progress
          line all drop out together so there's nothing left crowding it. */}
      {!chromeHidden && (
        <>
          <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={ss.gradientTop} pointerEvents="none" />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.82)']} style={ss.gradientBottom} pointerEvents="none" />

          <View style={ss.rail}>
            <RailAvatar post={post} navigation={navigation} />
            <AnimatedActionBtn
              icon={<Heart size={28} color={liked ? THEME.primary : '#fff'} fill={liked ? THEME.primary : 'none'} />}
              count={likesCount} onPress={handleLikeWithAnim} active={liked} scaleRef={likeScale}
            />
            <ActionBtn icon={<MessageCircle size={28} color="#fff" />} count={commentCount} onPress={onComment} />
            <ActionBtn
              icon={<Bookmark size={28} color={saved ? THEME.primary : '#fff'} fill={saved ? THEME.primary : 'none'} />}
              count={null} onPress={onSave} active={saved}
            />
            <ActionBtn
              icon={<Share2 size={28} color="#fff" />} count={null}
              onPress={async () => { try { await Share.share({ message: `"${post.content?.substring(0, 100)}..." — Anonixx` }); } catch {} }}
            />
            {!isOwnPost && !post.is_admin_drop && (
              <ActionBtn icon={<MoreHorizontal size={26} color="#fff" />} count={null} onPress={onMore} />
            )}
            <ViewsStat count={post.views_count} />
          </View>

          <View style={ss.bottomInfo}>
            <View style={ss.authorRow}>
              {/* Avatar lives in the rail now (RailAvatar, above Like) — the
                  same TikTok pattern of showing it once, not duplicated here.
                  @name stays its own tap target, same as TikTok's username. */}
              <AuthorProfileTrigger post={post} navigation={navigation}>
                <View style={ss.authorMeta}>
                  <Text style={ss.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
                  <Text style={ss.timeAgo}>{post.time_ago}</Text>
                </View>
              </AuthorProfileTrigger>
            </View>

            {post.content ? (
              <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.85}>
                <Text style={ss.contentText}>
                  {displayContent}
                  {shouldTruncate && <Text style={ss.moreText}>{expanded ? ' less' : ' more'}</Text>}
                </Text>
              </TouchableOpacity>
            ) : null}

            {!isOwnPost && !post.is_admin_drop && <LinkUpButton onPress={onLinkUp} />}
          </View>

          {videoDuration > 0 && (
            <View style={ss.progressWrap} pointerEvents="none">
              <View style={[ss.progressFill, { width: `${Math.min(100, (videoCurrentTime / videoDuration) * 100)}%` }]} />
            </View>
          )}
        </>
      )}
    </View>
  );
};

// ─── AUDIO SLIDE (ported from MediaFeedScreen.jsx) ───────────────
const AudioSlide = ({
  post, isActive, onLike, liked, likesCount, onSave, saved, onComment,
  commentCount, isOwnPost, onLinkUp, onMore, navigation, chromeHidden = false,
}) => {
  const audioPlayer = useAudioPlayer(null);
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const [expanded, setExpanded] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const position = (audioStatus.currentTime || 0) * 1000;
  const duration = (audioStatus.duration || 0) * 1000;
  const progress = duration > 0 ? position / duration : 0;
  const playing = audioStatus.playing;

  useEffect(() => {
    Animated.timing(progressAnim, { toValue: progress, duration: 100, useNativeDriver: false }).start();
    if (audioStatus.didJustFinish) progressAnim.setValue(0);
  }, [progress, audioStatus.didJustFinish]);

  const audioLoaded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (!isActive) { audioPlayer.pause(); return; }
    (async () => {
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true });
        if (cancelled) return;
        if (!audioLoaded.current && post.audio_url) {
          audioPlayer.replace({ uri: post.audio_url });
          audioLoaded.current = true;
        }
        audioPlayer.play();
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isActive, post.audio_url]);

  const togglePlay = async () => {
    try {
      if (!audioLoaded.current) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true });
        audioPlayer.replace({ uri: post.audio_url });
        audioLoaded.current = true;
        audioPlayer.play();
      } else if (playing) {
        audioPlayer.pause();
      } else {
        audioPlayer.play();
      }
    } catch {}
  };

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const activeBar = Math.floor(progress * 48);
  const bars = Array.from({ length: 48 }, (_, i) => ({
    h: Math.sin(i * 0.55) * 20 + Math.cos(i * 0.3) * 10 + 28,
    played: progress > 0 && i / 48 <= progress,
    current: progress > 0 && i === activeBar,
  }));

  const shouldTruncate = (post.content?.length || 0) > 120;
  const displayContent = shouldTruncate && !expanded
    ? post.content.substring(0, 120) + '...' : post.content;

  return (
    <View style={[ss.slide, { backgroundColor: THEME.background }]}>
      <View style={as.bgAccent} />
      <View style={as.bgAccent2} />

      {!chromeHidden && (
        <View style={ss.rail}>
          <RailAvatar post={post} navigation={navigation} />
          <ActionBtn
            icon={<Heart size={26} color={liked ? THEME.primary : '#fff'} fill={liked ? THEME.primary : 'none'} />}
            count={likesCount} onPress={onLike} active={liked}
          />
          <ActionBtn icon={<MessageCircle size={26} color="#fff" />} count={commentCount} onPress={onComment} />
          <ActionBtn
            icon={<Bookmark size={26} color={saved ? THEME.primary : '#fff'} fill={saved ? THEME.primary : 'none'} />}
            count={null} onPress={onSave} active={saved}
          />
          <ActionBtn
            icon={<Share2 size={26} color="#fff" />} count={null}
            onPress={async () => { try { await Share.share({ message: `"${post.content?.substring(0, 100)}..." — Anonixx` }); } catch {} }}
          />
          {!isOwnPost && !post.is_admin_drop && (
            <ActionBtn icon={<MoreHorizontal size={26} color="#fff" />} count={null} onPress={onMore} />
          )}
          <ViewsStat count={post.views_count} />
        </View>
      )}

      <View style={as.center}>
        <View style={as.authorRow}>
          <AuthorProfileTrigger post={post} navigation={navigation}>
            <View>
              <Text style={as.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
              <Text style={as.timeAgo}>{post.time_ago}</Text>
            </View>
          </AuthorProfileTrigger>
        </View>

        {post.content ? (
          <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.85} style={as.contentWrap}>
            <Text style={as.contentText}>
              {displayContent}
              {shouldTruncate && <Text style={as.moreText}>{expanded ? ' less' : ' more'}</Text>}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={as.waveformWrap}>
          {bars.map((bar, i) => (
            <View key={i} style={[as.bar, { height: bar.h }, bar.played ? as.barPlayed : as.barUnplayed, bar.current && as.barGlow]} />
          ))}
        </View>

        <View style={as.progressTrack}>
          <Animated.View style={[as.progressFill, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </View>

        <View style={as.timeRow}>
          <Text style={as.timeText}>{formatTime(position)}</Text>
          <Text style={as.timeText}>{duration > 0 ? formatTime(duration) : '--:--'}</Text>
        </View>

        <TouchableOpacity style={as.playBtn} onPress={togglePlay} activeOpacity={0.85}>
          {playing ? <Pause size={32} color="#fff" fill="#fff" /> : <Play size={32} color="#fff" fill="#fff" />}
        </TouchableOpacity>

        {!isOwnPost && !post.is_admin_drop && <LinkUpButton onPress={onLinkUp} />}
      </View>
    </View>
  );
};

// ─── IMAGE SLIDE CAROUSEL ───────────────────────────────────────────
// A multi-image post's own horizontal swipe, nested inside the vertical
// feed's swipe — same shape as Instagram/TikTok's photo-carousel posts:
// swiping left/right pages through this post's own photos, swiping up/
// down (the outer FlatList, untouched by this) moves to the next post.
const ImageSlideCarousel = React.memo(({ images }) => {
  const [index, setIndex] = useState(0);
  const onScrollEnd = useCallback((e) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }, []);
  return (
    <View style={StyleSheet.absoluteFill}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        decelerationRate="fast"
      >
        {images.map((url, i) => (
          <Image key={i} source={{ uri: url }} style={{ width, height: '100%' }} resizeMode="contain" />
        ))}
      </ScrollView>
      <View style={sw.imageDotsRow} pointerEvents="none">
        {images.map((_, i) => (
          <View key={i} style={[sw.imageDot, i === index && sw.imageDotActive]} />
        ))}
      </View>
    </View>
  );
});

// ─── TEXT SLIDE (new) ─────────────────────────────────────────────
// Full-bleed, same as VideoSlide — an attached image fills the entire
// slide with the confession as a caption underneath (identical shape to
// a video's own caption). No image: the slide is filled edge-to-edge by
// the confession's own intent/mood gradient, with the confession itself
// as large, centered, auto-sized text — no small graphic card sitting on
// top of a separate black background.
const TextSlide = ({
  post, onLike, liked, likesCount, onSave, saved, onComment, commentCount,
  isOwnPost, onLinkUp, onMore, navigation, headerHeight = 0, chromeHidden = false,
}) => {
  const [showHeart, setShowHeart] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(1)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const lastTap = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [fullTextVisible, setFullTextVisible] = useState(false);

  const t = CARD_INTENTS[post.intent] || DROP_THEMES[post.theme] || DROP_THEMES['desire'];
  const imageList = Array.isArray(post.images) && post.images.length
    ? post.images
    : (post.media_url && post.media_type === 'image' ? [post.media_url] : []);
  const hasImage = imageList.length > 0;

  // Guaranteed-readable fallback for the no-image case's big centered
  // text: adjustsFontSizeToFit below already shrinks to fit most
  // confessions, but for one right at the 500-char compose ceiling it
  // could still hit its numberOfLines cap before minimumFontScale saves
  // it — this link always works regardless.
  const isLong = (post.content?.length || 0) > 200;

  const shouldTruncateCaption = (post.content?.length || 0) > 100;
  const displayCaption = shouldTruncateCaption && !expanded
    ? post.content.substring(0, 100) + '...' : post.content;

  const handleLikeWithAnim = () => {
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, friction: 3, useNativeDriver: true }),
      Animated.spring(likeScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    onLike();
  };

  const triggerHeart = () => {
    setShowHeart(true);
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.sequence([Animated.delay(400), Animated.timing(heartOpacity, { toValue: 0, duration: 500, useNativeDriver: true })]),
    ]).start(() => setShowHeart(false));
  };

  const handleTap = () => {
    const now = Date.now();
    if (lastTap.current && now - lastTap.current < 280) {
      triggerHeart();
      if (!liked) handleLikeWithAnim();
    }
    lastTap.current = now;
  };

  return (
    <View style={[ss.slide, { backgroundColor: t.bgTo }]}>
      {/* No image — the mood/intent color itself is the whole background,
          full-bleed, same as it already was. With an image, it fills the
          entire slide instead, same as VideoSlide's video layer — not a
          small graphic card floating on top of it. */}
      {!hasImage && <LinearGradient colors={[t.bgFrom, t.bgTo]} style={StyleSheet.absoluteFill} />}

      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill}>
          {hasImage ? (
            imageList.length > 1 ? (
              <ImageSlideCarousel images={imageList} />
            ) : (
              // "contain" — same call already made for VideoSlide's video
              // above ("cover" crops whatever doesn't match a full-screen
              // portrait frame; images come from an arbitrary gallery pick,
              // not a fixed vertical shot, so cropping cuts off real content
              // at the edges just like it did for video).
              <Image source={{ uri: imageList[0] }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            )
          ) : (
            // paddingTop clears the opaque header panel (headerHeight),
            // which otherwise sat on top of this box and cut off however
            // many lines happened to land underneath it. paddingBottom is
            // deliberately small — the old rp(140) reserved way more room
            // than bottomInfo/rail actually need, which just biased the
            // centered text upward and left dead space above the tab bar
            // instead of the text sitting near true mid-screen.
            <View style={[sw.bigTextWrap, { paddingTop: headerHeight + rp(12) }]} pointerEvents="none">
              <Text
                style={sw.bigTextConfession}
                numberOfLines={14}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
              >
                {post.content}
              </Text>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {showHeart && (
        <Animated.View pointerEvents="none" style={[ss.heartBurst, { transform: [{ scale: heartScale }], opacity: heartOpacity }]}>
          <Heart size={100} color="#fff" fill="#fff" />
        </Animated.View>
      )}

      {!chromeHidden && (
        <>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.75)']} style={ss.gradientBottom} pointerEvents="none" />

          <View style={ss.rail}>
            <RailAvatar post={post} navigation={navigation} />
            <AnimatedActionBtn
              icon={<Heart size={28} color={liked ? THEME.primary : '#fff'} fill={liked ? THEME.primary : 'none'} />}
              count={likesCount} onPress={handleLikeWithAnim} active={liked} scaleRef={likeScale}
            />
            <ActionBtn icon={<MessageCircle size={28} color="#fff" />} count={commentCount} onPress={onComment} />
            <ActionBtn
              icon={<Bookmark size={28} color={saved ? THEME.primary : '#fff'} fill={saved ? THEME.primary : 'none'} />}
              count={null} onPress={onSave} active={saved}
            />
            <ActionBtn
              icon={<Share2 size={28} color="#fff" />} count={null}
              onPress={async () => { try { await Share.share({ message: `"${post.content?.substring(0, 100)}..." — Anonixx` }); } catch {} }}
            />
            {!isOwnPost && !post.is_admin_drop && (
              <ActionBtn icon={<MoreHorizontal size={26} color="#fff" />} count={null} onPress={onMore} />
            )}
            <ViewsStat count={post.views_count} />
          </View>

          <View style={ss.bottomInfo}>
            <View style={ss.authorRow}>
              <AuthorProfileTrigger post={post} navigation={navigation}>
                <View style={ss.authorMeta}>
                  <Text style={ss.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
                  <Text style={ss.timeAgo}>{post.time_ago}</Text>
                </View>
              </AuthorProfileTrigger>
            </View>

            {/* Image posts show the confession as a caption below it, exactly
                like a video's caption (same inline "... more/less", not a
                modal) — the image is the primary visual, text is secondary.
                No-image posts already show the confession as the big centered
                text itself, so it isn't repeated here — just the escape hatch
                for the rare case that's still too long to read comfortably at
                its shrunk-to-fit size. */}
            {hasImage && post.content ? (
              <TouchableOpacity onPress={() => setExpanded((v) => !v)} activeOpacity={0.85}>
                <Text style={ss.contentText}>
                  {displayCaption}
                  {shouldTruncateCaption && <Text style={ss.moreText}>{expanded ? ' less' : ' more'}</Text>}
                </Text>
              </TouchableOpacity>
            ) : null}
            {!hasImage && isLong && (
              <TouchableOpacity onPress={() => setFullTextVisible(true)} activeOpacity={0.7} style={sw.readMoreBtn} hitSlop={HIT_SLOP}>
                <Text style={sw.readMoreText}>Read full confession</Text>
              </TouchableOpacity>
            )}

            {!isOwnPost && !post.is_admin_drop && <LinkUpButton onPress={onLinkUp} />}
          </View>
        </>
      )}

      <Modal visible={fullTextVisible} transparent animationType="slide" onRequestClose={() => setFullTextVisible(false)}>
        <View style={sw.fullTextBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFullTextVisible(false)} />
          <View style={sw.fullTextSheet}>
            <View style={sw.fullTextHeader}>
              <Text style={sw.fullTextTitle}>{post.anonymous_name || 'Anonymous'}</Text>
              <TouchableOpacity onPress={() => setFullTextVisible(false)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={sw.fullTextScroll}>
              <Text style={sw.fullTextBody}>{post.content}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── POLL SLIDE (new) ─────────────────────────────────────────────
const PollSlide = ({
  post, isAuthenticated, onVote, onLike, liked, likesCount, onSave, saved,
  onComment, commentCount, isOwnPost, onLinkUp, onMore, navigation, chromeHidden = false,
}) => {
  const t = CARD_INTENTS[post.intent] || DROP_THEMES[post.theme] || DROP_THEMES['desire'];

  return (
    <View style={[ss.slide, { backgroundColor: t.bgTo }]}>
      <LinearGradient colors={[t.bgFrom, t.bgTo]} style={StyleSheet.absoluteFill} />

      <View style={sw.pollSlideCenter}>
        <PollCard poll={post.poll} postId={post.id} isAuthenticated={isAuthenticated} onVote={onVote} />
      </View>

      {!chromeHidden && (
        <>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.75)']} style={ss.gradientBottom} pointerEvents="none" />

          <View style={ss.rail}>
            <RailAvatar post={post} navigation={navigation} />
            <ActionBtn
              icon={<Heart size={28} color={liked ? THEME.primary : '#fff'} fill={liked ? THEME.primary : 'none'} />}
              count={likesCount} onPress={onLike} active={liked}
            />
            <ActionBtn icon={<MessageCircle size={28} color="#fff" />} count={commentCount} onPress={onComment} />
            <ActionBtn
              icon={<Bookmark size={28} color={saved ? THEME.primary : '#fff'} fill={saved ? THEME.primary : 'none'} />}
              count={null} onPress={onSave} active={saved}
            />
            {!isOwnPost && !post.is_admin_drop && (
              <ActionBtn icon={<MoreHorizontal size={26} color="#fff" />} count={null} onPress={onMore} />
            )}
            <ViewsStat count={post.views_count} />
          </View>

          <View style={ss.bottomInfo}>
            <View style={ss.authorRow}>
              <AuthorProfileTrigger post={post} navigation={navigation}>
                <View style={ss.authorMeta}>
                  <Text style={ss.authorName}>{post.anonymous_name || 'Anonymous'}</Text>
                  <Text style={ss.timeAgo}>{post.time_ago}</Text>
                </View>
              </AuthorProfileTrigger>
            </View>
            {!isOwnPost && !post.is_admin_drop && <LinkUpButton onPress={onLinkUp} />}
          </View>
        </>
      )}
    </View>
  );
};

// ─── Session-limit slide ─────────────────────────────────────────
// Same guardrail DropsFeedScreen enforces (a capped number of confessions
// per session) — swapped in as the final slide instead of a full-page
// interstitial, so it's a swipe away like everything else, not a modal
// that breaks the rhythm.
const SessionLimitSlide = ({ onClose }) => (
  <View style={[ss.slide, sw.limitSlide]}>
    <Text style={sw.limitEmoji}>🌑</Text>
    <Text style={sw.limitTitle}>You've been deep in it.</Text>
    <Text style={sw.limitSubtitle}>
      Sometimes the truth hits differently when you step away from it.
    </Text>
    <Text style={sw.limitMessage}>Come back when you have more to say.</Text>
    <TouchableOpacity onPress={onClose} style={sw.limitBtn} activeOpacity={0.85}>
      <Text style={sw.limitBtnText}>Close</Text>
    </TouchableOpacity>
  </View>
);

// ─── Market slide ─────────────────────────────────────────────────
// MarketCard itself unchanged — just centered on a full-screen dark
// surface instead of sitting inline between confession cards.
const MarketSlide = ({ item, onPress }) => (
  <View style={[ss.slide, sw.promoSlide]}>
    <View style={sw.promoCenter}>
      <MarketCard item={item} onPress={onPress} />
    </View>
  </View>
);

// ─── Ad slide ───────────────────────────────────────────────────
// FeedAdCard unchanged, plus an explicit pinned CTA underneath — the
// "TikTok shows a button on an ad post" pattern, matching LinkUpButton's
// weight so an ad doesn't feel like an afterthought.
const AdSlide = ({ ad, onPress }) => (
  <View style={[ss.slide, sw.promoSlide]}>
    <View style={sw.promoCenter}>
      <FeedAdCard ad={ad} onPress={() => {}} />
      <TouchableOpacity onPress={() => onPress(ad)} style={sw.adCtaBtn} activeOpacity={0.85} hitSlop={HIT_SLOP}>
        <ExternalLink size={rs(15)} color="#fff" />
        <Text style={sw.adCtaBtnText}>Learn more</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ─── MAIN SCREEN ──────────────────────────────────────────────────
export default function DropsSwipeScreen({ navigation, route }) {
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  // Starting estimate only — height - tabBarHeight doesn't always match
  // what the FlatList actually renders at (status bar insets, Android nav
  // bar, rounding all nudge it slightly). snapToInterval/getItemLayout
  // paging off that estimate instead of the real number is exactly what
  // let the next slide peek in at the edge while the current one plays.
  // onLayout below corrects it to the real measured height once mounted.
  const estimatedSlideHeight = height - tabBarHeight;
  const [listHeight, setListHeight] = useState(estimatedSlideHeight);
  // Real footprint of the opaque header panel below — insets.top + its own
  // paddingTop (rp(8)) + the icon row's height (rs(34)) + paddingBottom
  // (rp(12)). TextSlide's centered confession needs this to know where the
  // header actually stops covering content, instead of centering across
  // the full slide and getting its top lines hidden underneath it.
  const headerHeight = insets.top + rp(8) + rs(34) + rp(12);
  const dispatch = useDispatch();
  const marketFeed = useSelector(selectMarketFeed);

  // ── Two-finger long-press to declutter ─────────────────────────
  // Holding two fingers anywhere on the feed hides every overlay (rail,
  // captions, gradients, the video progress line, the daily-claim banner)
  // except the header, so a video/photo/confession can be looked at
  // without icons and buttons crowding it — same idea as a chat app's
  // "hold to peek". Chrome comes back the instant either finger lifts.
  //
  // Built on react-native-gesture-handler's native recognizer, not RN's
  // legacy PanResponder — a first attempt with PanResponder never fired,
  // because once ANY single-finger touch already claims the legacy
  // responder (the FlatList's own scroll, or a slide's tap handler), RN's
  // responder system doesn't re-run "should I become responder" just
  // because a second finger joined mid-gesture. Gesture-handler recognizes
  // pointer count natively, independent of whatever else is already
  // tracking the first finger, so it actually sees the second finger land.
  // LongPressGesture only exposes numberOfPointers() (an exact count) —
  // not minPointers()/maxPointers(), which don't exist on this gesture
  // and throw "is not a function" if called.
  const [chromeHidden, setChromeHidden] = useState(false);
  const chromeLongPress = useMemo(() => (
    Gesture.LongPress()
      .numberOfPointers(2)
      .minDuration(450)
      .maxDistance(30)
      .onStart(() => { runOnJS(setChromeHidden)(true); })
      .onFinalize(() => { runOnJS(setChromeHidden)(false); })
  ), []);

  const [posts, setPosts] = useState([]);
  const [linkedPost, setLinkedPost] = useState(null);
  const [feedAds, setFeedAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionPosts, setSessionPosts] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [sessionLimitReached, setSessionLimitReached] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [screenFocused, setScreenFocused] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  const [likeMap, setLikeMap] = useState({});
  const [saveMap, setSaveMap] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const [reportPost, setReportPost] = useState(null);
  const [commentSheet, setCommentSheet] = useState({ visible: false, postId: null, isOwner: false });

  const loadingRef = useRef(false);
  const cursorRef = useRef(null);
  const sessionPostsRef = useRef(0);
  const hasMoreRef = useRef(true);
  const hasLoadedRef = useRef(false);
  const viewedRef = useRef(new Set());
  const flatListRef = useRef(null);

  // Market/ad pools — fetched once, injected client-side into the drop
  // stream below (see `data`). Same source DropsFeedScreen used.
  useEffect(() => {
    dispatch(fetchMarketItems({ offset: 0, limit: 20 }));
    fetch(`${API_BASE_URL}/api/v1/ads/active?limit=10`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d) setFeedAds(d.ads || []); })
      .catch(() => { /* offline — feed just skips ad injection this session */ });
  }, [dispatch]);

  const loadFeed = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const currentOffset = reset ? 0 : sessionPostsRef.current;
      const params = `session_posts=${currentOffset}` +
        (!reset && cursorRef.current ? `&cursor=${encodeURIComponent(cursorRef.current)}` : '');

      const res = await fetch(`${API_BASE_URL}/api/v1/drops/feed?${params}`, { headers });
      if (!res.ok) {
        if (res.status === 401) await AsyncStorage.removeItem('token');
        return;
      }
      const data = await res.json();

      if (data.message === 'session_limit') {
        setSessionLimitReached(true);
        setHasMore(data.has_more);
        return;
      }

      const fresh = data.posts || [];
      setPosts((prev) => {
        const merged = reset ? fresh : [...prev, ...fresh];
        const seen = new Set();
        return merged.filter((p) => {
          if (!p.id || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      });
      setLikeMap((prev) => {
        const next = { ...prev };
        fresh.forEach((p) => { next[p.id] = { liked: p.is_liked || false, count: p.likes_count || 0 }; });
        return next;
      });
      setSaveMap((prev) => {
        const next = { ...prev };
        fresh.forEach((p) => { next[p.id] = p.is_saved || false; });
        return next;
      });
      setCommentCounts((prev) => {
        const next = { ...prev };
        fresh.forEach((p) => { next[p.id] = p.thread_count || 0; });
        return next;
      });
      sessionPostsRef.current = data.session_posts;
      cursorRef.current = data.next_cursor || null;
      hasMoreRef.current = !!data.has_more;
      setSessionPosts(data.session_posts);
      setHasMore(data.has_more);
    } catch {
      showToast({ type: 'error', message: 'Could not load the feed. Pull down to try again.' });
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        loadFeed(true);
      } else if (route?.params?.refresh) {
        loadFeed(true);
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
      return () => setScreenFocused(false);
    }, [route?.params?.refresh])
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const item = viewableItems[0];
      setActiveIndex(item.index);
      const it = item.item;
      // Only real drops get view-tracked — market/ad/session-limit slides
      // aren't drops, and POSTing their synthetic id to /drops/{id}/view
      // would just fail (or worse, coincidentally collide with a real id).
      const postId = it && !it.__market && !it.__ad && !it.__sessionLimit ? it.id : null;
      if (postId && !viewedRef.current.has(postId)) {
        viewedRef.current.add(postId);
        trackView(postId);
      }
    }
  }).current;

  const trackView = useCallback(async (postId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const deviceId = await getDeviceId();
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/${postId}/view`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(deviceId ? { 'X-Device-Id': deviceId } : {}),
        },
      });
      const data = await res.json().catch(() => null);
      if (typeof data?.views_count === 'number') {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, views_count: data.views_count } : p)));
      }
    } catch {}
  }, []);

  const handleLike = useCallback(async (postId) => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: "Sign in to like it — they'll never know it was you." });
      navigation.navigate('AuthNav', { screen: 'Login' });
      return;
    }
    const current = likeMap[postId] || { liked: false, count: 0 };
    const newLiked = !current.liked;
    setLikeMap((prev) => ({ ...prev, [postId]: { liked: newLiked, count: newLiked ? current.count + 1 : current.count - 1 } }));
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/drops/${postId}/like`, {
        method: newLiked ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setLikeMap((prev) => ({ ...prev, [postId]: current }));
    }
  }, [isAuthenticated, likeMap, navigation, showToast]);

  const handleSave = useCallback(async (postId) => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: 'Sign in to keep it — only you can see your saves.' });
      navigation.navigate('AuthNav', { screen: 'Login' });
      return;
    }
    const wasSaved = saveMap[postId];
    setSaveMap((prev) => ({ ...prev, [postId]: !wasSaved }));
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/drops/${postId}/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setSaveMap((prev) => ({ ...prev, [postId]: wasSaved }));
    }
  }, [isAuthenticated, saveMap, navigation, showToast]);

  const handleVote = useCallback(async (postId, optionIndex) => {
    if (!isAuthenticated) {
      showToast({ type: 'info', message: 'Sign in to vote — your pick stays anonymous.' });
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/${postId}/vote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_index: optionIndex }),
      });
      const data = await res.json();
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? {
          ...p,
          poll: {
            ...p.poll,
            voted_option: data.voted_option,
            total_votes: data.total_votes,
            options: p.poll.options.map((o, i) => ({ ...o, votes: data.options[i].votes, percent: data.options[i].percent })),
          },
        } : p)));
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not submit vote.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not submit vote.' });
    }
  }, [isAuthenticated, showToast]);

  const handleLinkUp = useCallback((post) => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: 'Sign in to link up.' });
      return;
    }
    navigation.navigate('PostUnlock', { post });
  }, [isAuthenticated, navigation, showToast]);

  const handleMarketOpen = useCallback((id) => {
    navigation.navigate('MarketItem', { itemId: id });
  }, [navigation]);

  const handleAdPress = useCallback((ad) => {
    Linking.openURL(ad.link_url).catch(() => {});
  }, []);

  const handleEndReached = useCallback(() => {
    if (!loadingRef.current && hasMoreRef.current && !sessionLimitReached) loadFeed(false);
  }, [sessionLimitReached, loadFeed]);

  const getItemLayout = useCallback((_, index) => ({ length: listHeight, offset: listHeight * index, index }), [listHeight]);
  const keyExtractor = useCallback((item) => item.id, []);

  // Same interleaving DropsFeedScreen used, just producing full-screen
  // slide items instead of inline cards — every MARKET_FREQUENCY-th drop
  // gets a market slide, every FEED_AD_FREQUENCY-th an ad slide (both can
  // land on the same position, matching the original independent moduli).
  const data = useMemo(() => {
    const base = linkedPost ? [linkedPost, ...posts.filter((p) => p.id !== linkedPost.id)] : posts;
    let out = base;
    if (marketFeed.length > 0 || feedAds.length > 0) {
      out = [];
      let mIdx = 0;
      let aIdx = 0;
      base.forEach((p, i) => {
        out.push(p);
        const n = i + 1;
        if (n % MARKET_FREQUENCY === 0 && mIdx < marketFeed.length) {
          const m = marketFeed[mIdx++];
          out.push({ id: `market-${m.id}`, __market: m });
        }
        if (n % FEED_AD_FREQUENCY === 0 && feedAds.length > 0) {
          const a = feedAds[aIdx % feedAds.length];
          aIdx++;
          out.push({ id: `ad-${a.id}-${n}`, __ad: a });
        }
      });
    }
    return sessionLimitReached ? [...out, { id: '__session_limit__', __sessionLimit: true }] : out;
  }, [posts, linkedPost, marketFeed, feedAds, sessionLimitReached]);

  // Opened from a shared link (anonixx.app/drop/<id>): show that drop first.
  const linkedDropId = route?.params?.dropId;
  useEffect(() => {
    if (!linkedDropId) return;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/v1/drops/single/${encodeURIComponent(linkedDropId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          showToast({ type: 'info', message: 'That post is no longer available.' });
          return;
        }
        const d = await res.json();
        setLinkedPost(d.post);
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch { /* offline — the normal feed still shows */ }
    })();
  }, [linkedDropId, showToast]);

  // TikTok-style prefetch: pull the next page while the viewer is still a few
  // slides from the end, so the list never runs dry mid-swipe, and warm the
  // image cache for the slides just ahead.
  const PREFETCH_AHEAD = 4;
  useEffect(() => {
    if (data.length > 0 && activeIndex >= data.length - PREFETCH_AHEAD) handleEndReached();
    for (let i = activeIndex + 1; i <= activeIndex + 3 && i < data.length; i++) {
      const it = data[i];
      if (!it || it.__market || it.__ad || it.__sessionLimit) continue;
      [it.image_url, it.card_image_url, ...(it.images || []).map((im) => (typeof im === 'string' ? im : im?.url))]
        .filter(Boolean)
        .forEach((u) => Image.prefetch(u).catch(() => {}));
    }
  }, [activeIndex, data, handleEndReached]);

  const renderItem = useCallback(({ item, index }) => {
    if (item.__sessionLimit) {
      return (
        <View style={{ height: listHeight, width }}>
          <SessionLimitSlide onClose={() => navigation.goBack()} />
        </View>
      );
    }
    if (item.__market) {
      return (
        <View style={{ height: listHeight, width }}>
          <MarketSlide item={item.__market} onPress={handleMarketOpen} />
        </View>
      );
    }
    if (item.__ad) {
      return (
        <View style={{ height: listHeight, width }}>
          <AdSlide ad={item.__ad} onPress={handleAdPress} />
        </View>
      );
    }

    const isActive = index === activeIndex && screenFocused;
    const likeState = likeMap[item.id] || { liked: false, count: 0 };
    const commonProps = {
      post: item,
      liked: likeState.liked,
      likesCount: likeState.count,
      saved: saveMap[item.id] || false,
      commentCount: commentCounts[item.id] || 0,
      onLike: () => handleLike(item.id),
      onSave: () => handleSave(item.id),
      onComment: () => setCommentSheet({ visible: true, postId: item.id, isOwner: item.is_own_post }),
      isOwnPost: item.is_own_post || false,
      onLinkUp: () => handleLinkUp(item),
      onMore: () => setReportPost(item),
      navigation,
      headerHeight,
      chromeHidden,
    };

    let slide;
    if (item.video_url) {
      slide = <VideoSlide {...commonProps} isActive={isActive} />;
    } else if (item.audio_url) {
      slide = <AudioSlide {...commonProps} isActive={isActive} />;
    } else if (item.poll) {
      slide = <PollSlide {...commonProps} isAuthenticated={isAuthenticated} onVote={(i) => handleVote(item.id, i)} />;
    } else {
      slide = <TextSlide {...commonProps} />;
    }
    return <View style={{ height: listHeight, width }}>{slide}</View>;
  }, [
    activeIndex, screenFocused, likeMap, saveMap, commentCounts, listHeight,
    handleLike, handleSave, handleLinkUp, handleVote, handleMarketOpen, handleAdPress,
    isAuthenticated, navigation, headerHeight, chromeHidden,
  ]);

  if (loading && posts.length === 0) {
    return (
      <View style={[ss.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ActivityIndicator color={THEME.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureDetector gesture={chromeLongPress}>
    <View style={ss.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <FlatList
        ref={flatListRef}
        data={data}
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
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.6}
        // Tight window — TikTok itself only ever keeps the current slide
        // (plus maybe the very next) actually alive. removeClippedSubviews
        // unmounts native views once they're off-screen instead of just
        // hiding them, which matters most here since it's the mounted
        // instance count (not just what's visibly playing) that determines
        // how many video decoders/buffers are competing at once.
        removeClippedSubviews
        maxToRenderPerBatch={2}
        windowSize={5}
        initialNumToRender={2}
      />

      {/* Header — a solid panel spanning the status bar down through the
          icon row, same opaque-surface treatment as the bottom tab bar,
          instead of icons floating directly over the video/card content. */}
      <View style={[sw.header, { paddingTop: insets.top + rp(8) }]} pointerEvents="box-none">
        <Text style={sw.headerLogo}>anonixx</Text>
        <View style={sw.headerRight}>
          {isAuthenticated && user?.feed_location_scope && user.feed_location_scope !== 'off' && (
            <View style={sw.locationPill}>
              <MapPin size={rs(12)} color="#fff" />
              <Text style={sw.locationPillText}>{LOCATION_SCOPE_LABELS[user.feed_location_scope] || 'Nearby'}</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('Search')} style={sw.headerBtn} hitSlop={HIT_SLOP}>
            <Search size={rs(18)} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={sw.headerBtn} hitSlop={HIT_SLOP}>
            <Menu size={rs(18)} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Daily-claim banner — a persistent overlay below the header rather
          than its own slide (DailyRewardBanner already self-hides via
          canClaimToday when there's nothing to claim, same as it did as
          the old card feed's list header). Sits just below the header
          panel — insets.top + its paddingTop (rp(8)) + the icon row's own
          height (rs(34)) + paddingBottom (rp(12)), now that the header is
          an opaque bar instead of floating icons with no real footprint
          to clear. */}
      {isAuthenticated && !chromeHidden && (
        <View style={[sw.rewardBannerWrap, { top: insets.top + rp(8) + rs(34) + rp(12) }]} pointerEvents="box-none">
          <DailyRewardBanner />
        </View>
      )}

      <CommentBottomSheet
        visible={commentSheet.visible}
        postId={commentSheet.postId}
        isAuthenticated={isAuthenticated}
        navigation={navigation}
        isOwner={commentSheet.isOwner}
        onClose={() => setCommentSheet({ visible: false, postId: null, isOwner: false })}
        onCountChange={(count) => {
          if (commentSheet.postId) {
            setCommentCounts((prev) => ({ ...prev, [commentSheet.postId]: count }));
          }
        }}
      />

      <ReportSheet
        visible={!!reportPost}
        post={reportPost}
        onClose={() => setReportPost(null)}
        onBlocked={(p) => setPosts((prev) => prev.filter((x) => x.user_id !== p.user_id))}
      />

      <HamburgerMenu visible={menuVisible} onClose={() => setMenuVisible(false)} navigation={navigation} />
    </View>
    </GestureDetector>
  );
}

// ─── SLIDE STYLES (ported from MediaFeedScreen.jsx) ───────────────
const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  slide: { width, height: '100%', backgroundColor: '#000' },
  gradientTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 140, zIndex: 1 },
  gradientBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 340, zIndex: 1 },
  // TikTok pins the rail's lowest icon almost flush with the tab bar, not
  // floating well above it — bottom: 110 left a big dead gap under Views
  // (the rail's last/lowest item). 14 sits it just above the bar instead.
  rail: { position: 'absolute', right: 12, bottom: 14, alignItems: 'center', gap: 24, zIndex: 10 },
  actionBtn: { alignItems: 'center', gap: 5 },
  actionCount: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  // Brought down to sit at roughly the same baseline as the rail (bottom:
  // 14) now that it's no longer floating well above the tab bar — same
  // TikTok-style close-to-the-bottom placement, just a touch higher since
  // this column grows upward from author row + caption + Link Up button,
  // where the rail is only ever one icon tall at its lowest point.
  bottomInfo: { position: 'absolute', bottom: 20, left: 16, right: 76, zIndex: 10 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  authorMeta: { flex: 1 },
  authorName: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  timeAgo: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  contentText: { fontSize: 14, color: 'rgba(255,255,255,0.92)', lineHeight: 21, marginBottom: 10, letterSpacing: 0.1 },
  moreText: { color: THEME.primary, fontWeight: '700' },
  // TikTok's own feed progress indicator: a hairline, not a boxed slider
  // with time labels and a draggable thumb (the feed doesn't support
  // scrubbing at all — only the full-screen player does). Thin enough
  // (3px) to sit inside the gap already open below the rail (bottom: 14)
  // and bottomInfo (bottom: 20) without touching either.
  progressWrap: {
    position: 'absolute', bottom: 4, left: 0, right: 0, height: 3,
    backgroundColor: 'rgba(255,255,255,0.18)', zIndex: 10,
  },
  progressFill: { height: '100%', backgroundColor: THEME.primary },
  videoLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', zIndex: 2 },
  heartBurst: { position: 'absolute', top: '50%', left: '50%', marginLeft: -50, marginTop: -50, zIndex: 100 },
});

const as = StyleSheet.create({
  bgAccent: { position: 'absolute', top: -120, left: -100, width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(255,99,74,0.09)' },
  bgAccent2: { position: 'absolute', bottom: -100, right: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(255,99,74,0.06)' },
  center: { flex: 1, paddingHorizontal: 28, paddingTop: 100, paddingBottom: 120, justifyContent: 'center' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  authorName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  timeAgo: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  contentWrap: { marginBottom: 28 },
  contentText: { fontSize: 16, lineHeight: 24, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.2 },
  moreText: { color: THEME.primary, fontWeight: '600' },
  waveformWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 64, marginBottom: 12 },
  bar: { width: 4, borderRadius: 3 },
  barPlayed: { backgroundColor: THEME.primary },
  barUnplayed: { backgroundColor: 'rgba(255,255,255,0.15)' },
  barGlow: { shadowColor: THEME.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6, elevation: 6 },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: THEME.primary, borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  timeText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  playBtn: {
    alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: THEME.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    shadowColor: THEME.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 12,
  },
});

// ─── New-to-this-screen styles ────────────────────────────────────
const sw = StyleSheet.create({
  rewardBannerWrap: { position: 'absolute', left: 0, right: 0, zIndex: 90 },

  // Top of the right rail, above Like — TikTok's own creator-avatar spot.
  railAvatarRing: {
    width: rs(46), height: rs(46), borderRadius: rs(23),
    borderWidth: 2, borderColor: '#fff', overflow: 'hidden',
    backgroundColor: THEME.avatarBg, marginBottom: rp(2),
  },
  railAvatarImg: { width: '100%', height: '100%' },
  railAvatarFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  railAvatarInitial: { fontSize: rf(17), fontWeight: '800', color: THEME.primary },

  readMoreBtn: { alignSelf: 'flex-start', marginTop: rp(6), marginBottom: rp(2) },
  readMoreText: { fontSize: FONT.sm, fontWeight: '700', color: '#fff', textDecorationLine: 'underline' },

  fullTextBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  fullTextSheet: {
    maxHeight: '75%', backgroundColor: THEME.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: rp(20), paddingTop: rp(16), paddingBottom: rp(28),
  },
  fullTextHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: rp(14), marginBottom: rp(4), borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  fullTextTitle: { fontFamily: 'PlayfairDisplay-Bold', fontSize: rf(16), color: THEME.text },
  fullTextScroll: { marginTop: rp(8) },
  fullTextBody: { fontFamily: 'PlayfairDisplay-Italic', fontSize: rf(17), lineHeight: rf(26), color: THEME.text, letterSpacing: 0.2 },

  promoSlide: { alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.background },
  promoCenter: { width: '100%', paddingHorizontal: rp(4) },
  adCtaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(8),
    marginHorizontal: rp(12), marginTop: rp(4), paddingVertical: rp(13), borderRadius: RADIUS.full,
    backgroundColor: THEME.primary,
    shadowColor: THEME.primary, shadowOffset: { width: 0, height: rs(4) }, shadowOpacity: 0.4, shadowRadius: rs(10), elevation: 5,
  },
  adCtaBtnText: { fontSize: FONT.sm, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  linkUpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(8),
    marginTop: rp(6), paddingVertical: rp(12), paddingHorizontal: rp(18), borderRadius: RADIUS.full,
    backgroundColor: THEME.primary, alignSelf: 'flex-start',
    shadowColor: THEME.primary, shadowOffset: { width: 0, height: rs(4) }, shadowOpacity: 0.4, shadowRadius: rs(10), elevation: 5,
  },
  linkUpBtnText: { fontSize: FONT.sm, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  linkUpCostPill: { flexDirection: 'row', alignItems: 'center', gap: rp(3), backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: RADIUS.full, paddingHorizontal: rp(8), paddingVertical: rp(3) },
  linkUpCostText: { fontSize: rf(11), fontWeight: '700', color: '#fff' },


  bigTextWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(28), paddingBottom: rp(24) },
  bigTextConfession: {
    fontFamily: 'PlayfairDisplay-Italic', fontSize: rf(34), lineHeight: rf(44),
    color: '#fff', textAlign: 'center', letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  pollSlideCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(20) },

  // Multi-image carousel dots — sits just under the top safe area, clear
  // of the bottom caption/rail chrome that already owns the lower third.
  imageDotsRow: {
    position: 'absolute', top: rp(10), left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: rp(5),
  },
  imageDot: {
    width: rs(5), height: rs(5), borderRadius: rs(2.5),
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  imageDotActive: { backgroundColor: '#fff', width: rs(14) },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rp(16), paddingBottom: rp(12),
    backgroundColor: THEME.surface,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 24,
  },
  headerLogo: { fontFamily: 'PlayfairDisplay-Italic', fontSize: rf(19), color: THEME.primary, letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: rp(10) },
  headerBtn: {
    width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4), paddingHorizontal: rp(10), paddingVertical: rp(6),
    borderRadius: RADIUS.full, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  locationPillText: { fontSize: rf(11), fontWeight: '600', color: '#fff' },

  limitSlide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: rp(32) },
  limitEmoji: { fontSize: rf(48), marginBottom: rp(16) },
  limitTitle: { fontFamily: 'PlayfairDisplay-Bold', fontSize: rf(22), color: '#fff', textAlign: 'center', marginBottom: rp(12) },
  limitSubtitle: { fontSize: rf(14), color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: rf(21), marginBottom: rp(8) },
  limitMessage: { fontSize: rf(13), color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontStyle: 'italic', marginBottom: rp(28) },
  limitBtn: { paddingHorizontal: rp(28), paddingVertical: rp(12), borderRadius: RADIUS.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  limitBtnText: { fontSize: FONT.sm, fontWeight: '700', color: '#fff' },
});
