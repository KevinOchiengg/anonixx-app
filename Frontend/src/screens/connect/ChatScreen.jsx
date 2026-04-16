/**
 * ChatScreen.jsx — Premium anonymous messaging
 * Cinematic Coral design system. Intensity meter. Locked premium features.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, FlatList, Image, KeyboardAvoidingView,
  Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowLeft, Check, CheckCheck, CornerUpLeft, Image as ImageIcon,
  Lock, Mic, MicOff, Pause, Phone, PhoneOff, Play, Reply, RotateCcw, Square, Trash2, Video, X,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import { rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP, SCREEN } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';
import IntensityBackground from '../../components/chat/IntensityBackground';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  primaryBorder: 'rgba(255,99,74,0.20)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a5068',
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  'rgba(255,255,255,0.10)',
  myBubble:      '#FF634A',
  theirBubble:   '#1e2535',
  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.08)',
  successBorder: 'rgba(76,175,80,0.15)',
  online:        '#4CAF50',
};

const AVATAR_MAP = {
  ghost: '👻', shadow: '🌑', flame: '🔥', void: '🕳️',
  storm: '⛈️', smoke: '💨', eclipse: '🌘', shard: '🔷',
  moth: '🦋', raven: '🐦‍⬛',
};

// Intensity milestones based on message_count
const INTENSITY_MILESTONES = [
  { at: 10,  label: 'Read receipts',  icon: '✓✓',  unlocked: true  },
  { at: 25,  label: 'Voice notes',    icon: '🎙',  unlocked: false },
  { at: 40,  label: 'Images',         icon: '🖼',  unlocked: false },
  { at: 60,  label: 'Videos',         icon: '🎬',  unlocked: false },
  { at: 80,  label: 'Audio calls',    icon: '📞',  unlocked: false },
  { at: 100, label: 'Video calls',    icon: '📹',  unlocked: false },
];

function getIntensityPercent(messageCount) {
  return Math.min(100, Math.round((messageCount / 100) * 100));
}

function getUnlockedFeatures(messageCount) {
  return INTENSITY_MILESTONES.filter(m => messageCount >= m.at);
}

function toLocalDate(isoString) {
  if (!isoString) return null;
  try {
    // Normalize space → T
    let s = isoString.replace(' ', 'T');
    // Only append Z when there is genuinely no timezone indicator.
    // Timezone indicators appear AFTER the time digits, never inside the date.
    // Valid suffixes: Z  |  ±HH:MM  |  ±HHMM  |  ±HH
    // We test only the tail of the string (last 6 chars is enough).
    const tail = s.slice(-6);
    const hasTz = /Z$/i.test(s) || /[+\-]\d{2}(:\d{2})?$/.test(tail);
    if (!hasTz) s += 'Z';
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function formatTime(isoString) {
  const d = toLocalDate(isoString);
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Typing indicator ─────────────────────────────────────────
const TypingIndicator = React.memo(() => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: 1,   duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.delay(600),
      ])
    ).start();
    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);
  }, []);

  return (
    <View style={styles.typingWrap}>
      <View style={styles.typingBubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
});

// ─── Message status ticks ─────────────────────────────────────
const MessageStatus = React.memo(({ isDelivered, isRead }) => {
  if (isRead)      return <CheckCheck size={rs(13)} color="#4FC3F7" strokeWidth={2.5} />;
  if (isDelivered) return <CheckCheck size={rs(13)} color="rgba(255,255,255,0.38)" strokeWidth={2.5} />;
  return <Check size={rs(13)} color="rgba(255,255,255,0.38)" strokeWidth={2.5} />;
});

// ─── Reaction picker ──────────────────────────────────────────
const REACTIONS = ['❤️', '😈', '🔥', '👀', '💀', '✨'];

const ReactionPicker = React.memo(({ onSelect, onClose }) => (
  <View style={styles.reactionPicker}>
    {REACTIONS.map(r => (
      <TouchableOpacity key={r} onPress={() => { onSelect(r); onClose(); }} hitSlop={HIT_SLOP}>
        <Text style={styles.reactionEmoji}>{r}</Text>
      </TouchableOpacity>
    ))}
  </View>
));

// ─── Cloudinary URL helpers ────────────────────────────────────
// Inject f_jpg,q_auto into a Cloudinary URL.
// f_jpg (not f_auto) forces JPEG delivery — f_auto can serve AVIF/WebP which
// some React Native builds (especially older EAS Android builds) cannot decode,
// causing a silent blank image. JPEG is universally supported across all RN versions.
function withCloudinaryOpts(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const after = url.slice(idx + marker.length);
  if (after.startsWith('f_jpg') || after.startsWith('f_auto')) return url;
  return url.slice(0, idx + marker.length) + 'f_jpg,q_auto/' + after;
}

// ─── Image message — auto-sizes to real aspect ratio ──────────
const IMG_MAX_W = SCREEN.width * 0.72;   // 72 % of screen width
const IMG_MAX_H = rs(320);               // tallest portrait we'll show inline
const IMG_MIN_W = rs(160);
const IMG_MIN_H = rs(100);

const ImageMessage = React.memo(({ uri, isOwn, onPress, uploadProgress }) => {
  const [size,    setSize]    = useState({ width: IMG_MAX_W, height: IMG_MAX_W * 0.65 });
  const [loading, setLoading] = useState(true);   // true until onLoad fires
  const [errored, setErrored] = useState(false);  // true if image fails to load
  const shimmer = useRef(new Animated.Value(0.4)).current;

  const uploading   = uploadProgress !== undefined && uploadProgress < 100;
  const displayUri  = uploading ? uri : withCloudinaryOpts(uri); // local URI during upload, CDN-optimised after

  // Pulsing shimmer while loading
  useEffect(() => {
    if (!loading) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [loading]);

  // Resolve real image dimensions from the URI
  useEffect(() => {
    if (!uri) return;
    setLoading(true);
    setErrored(false);
    Image.getSize(
      withCloudinaryOpts(uri) || uri,
      (w, h) => {
        const ratio = w / h;
        let width  = IMG_MAX_W;
        let height = width / ratio;
        if (height > IMG_MAX_H) { height = IMG_MAX_H; width = height * ratio; }
        if (width  < IMG_MIN_W) { width  = IMG_MIN_W; height = width / ratio; }
        if (height < IMG_MIN_H) { height = IMG_MIN_H; }
        setSize({ width: Math.round(width), height: Math.round(height) });
      },
      () => {} // keep default size on failure — Image component still tries to render
    );
  }, [uri]);

  return (
    <TouchableOpacity
      activeOpacity={uploading ? 1 : 0.92}
      onPress={uploading || errored ? undefined : () => onPress?.(displayUri)}
    >
      <View style={{ width: size.width, height: size.height, borderRadius: RADIUS.md, overflow: 'hidden' }}>

        {/* Shimmer skeleton — visible until image loads */}
        {(loading && !uploading) && (
          <Animated.View
            style={[StyleSheet.absoluteFill, imgUploadStyles.shimmer, { opacity: shimmer }]}
          />
        )}

        {/* Actual image */}
        {!errored && (
          <Image
            source={{ uri: displayUri, cache: 'force-cache' }}
            style={{ width: size.width, height: size.height }}
            resizeMode="cover"
            onLoadStart={() => setLoading(true)}
            onLoad={()      => setLoading(false)}
            onError={()     => { setLoading(false); setErrored(true); }}
          />
        )}

        {/* Broken-image fallback */}
        {errored && (
          <View style={imgUploadStyles.errorBox}>
            <Text style={imgUploadStyles.errorIcon}>🖼</Text>
            <Text style={imgUploadStyles.errorText}>Couldn't load image</Text>
          </View>
        )}

        {/* Upload progress overlay */}
        {uploading && (
          <View style={imgUploadStyles.overlay}>
            <View style={imgUploadStyles.ring}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
            <Text style={imgUploadStyles.pct}>{uploadProgress}%</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const imgUploadStyles = StyleSheet.create({
  shimmer: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rp(6),
  },
  ring: {
    width:           rs(44),
    height:          rs(44),
    borderRadius:    rs(22),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     2,
    borderColor:     'rgba(255,255,255,0.4)',
  },
  pct: {
    color:      '#fff',
    fontSize:   FONT.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  errorBox: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rp(6),
  },
  errorText: {
    color:    'rgba(255,255,255,0.45)',
    fontSize: FONT.xs,
  },
  errorIcon: {
    fontSize: rf(28),
    opacity:  0.4,
  },
});

// ─── Full-screen image lightbox ───────────────────────────────
const ImageLightbox = React.memo(({ uri, onClose }) => (
  <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={lightboxStyles.backdrop}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <Image
        source={{ uri: withCloudinaryOpts(uri), cache: 'force-cache' }}
        style={lightboxStyles.image}
        resizeMode="contain"
      />
      <TouchableOpacity style={lightboxStyles.closeBtn} onPress={onClose} hitSlop={HIT_SLOP}>
        <X size={rs(22)} color="#fff" strokeWidth={2} />
      </TouchableOpacity>
    </View>
  </Modal>
));

const lightboxStyles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center', alignItems: 'center' },
  image:     { width: SCREEN.width, height: SCREEN.height * 0.82 },
  closeBtn:  {
    position: 'absolute', top: rs(52), right: rs(18),
    width: rs(36), height: rs(36), borderRadius: rs(18),
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Message Bubble ───────────────────────────────────────────
// ─── Voice note player inside bubble ─────────────────────────

// Seeded LCG to get consistent bar heights from URL
function seededBars(seed, count) {
  let s = seed;
  const bars = [];
  for (let i = 0; i < count; i++) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const norm = ((s >>> 0) / 0xffffffff);
    // blend LCG randomness with a sine envelope for natural waveform shape
    const envelope = 0.45 + 0.55 * Math.abs(Math.sin((i / count) * Math.PI));
    bars.push(0.15 + norm * envelope * 0.85);
  }
  return bars;
}

function urlSeed(url = '') {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

const WAVEFORM_BARS = 40;

const VoiceNoteBubble = React.memo(({ url, isOwn }) => {
  // Start with null — only load when user explicitly taps play (no autoplay)
  const player      = useAudioPlayer(null);
  const status      = useAudioPlayerStatus(player);
  const [isFinished, setIsFinished] = useState(false);
  const pendingPlay = useRef(false);   // set true while waiting for readyToPlay
  const btnScale    = useRef(new Animated.Value(1)).current;

  const bars = useMemo(() => seededBars(urlSeed(url), WAVEFORM_BARS), [url]);

  // Fire play once the source is buffered (after first tap)
  useEffect(() => {
    if (status.status === 'readyToPlay' && pendingPlay.current) {
      pendingPlay.current = false;
      player.play();
    }
  }, [status.status]);

  // After finishing: reset position to 0 and show replay button
  useEffect(() => {
    if (status.didJustFinish) {
      setIsFinished(true);
      player.seekTo(0);
    }
  }, [status.didJustFinish]);

  const animBtn = () => {
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.85, duration: 70, useNativeDriver: true }),
      Animated.spring(btnScale,  { toValue: 1,    friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = useCallback(async () => {
    animBtn();
    try {
      await setAudioModeAsync({ playsInSilentModeIOS: true });
      if (status.status === 'idle') {
        // First tap — load source then play once ready
        pendingPlay.current = true;
        player.replace({ uri: url });
      } else if (isFinished) {
        // Replay — seek back to start and play
        setIsFinished(false);
        player.seekTo(0);
        player.play();
      } else if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch { /* silent */ }
  }, [url, status.status, status.playing, isFinished, player]);

  const seekTo = useCallback((ratio) => {
    if (status.status === 'idle' || isFinished || !status.duration) return;
    player.seekTo(ratio * status.duration);
  }, [status.status, status.duration, isFinished, player]);

  const progress    = isFinished ? 0 : (status.duration > 0 ? (status.currentTime || 0) / status.duration : 0);
  const activeBars  = Math.round(progress * WAVEFORM_BARS);

  const displaySecs = (status.playing || (!isFinished && status.status === 'readyToPlay'))
    ? Math.floor(status.currentTime || 0)
    : Math.floor(status.duration    || 0);
  const timeLabel = `${Math.floor(displaySecs / 60)}:${String(displaySecs % 60).padStart(2, '0')}`;

  const isLoading = status.status === 'loading';
  const PlayIcon  = isFinished ? RotateCcw : status.playing ? Pause : Play;

  // Own bubble (coral bg) → white button + white bars
  // Their bubble (dark bg) → coral button + coral bars
  const btnBg      = isOwn ? 'rgba(255,255,255,0.95)' : T.primary;
  const iconColor  = isOwn ? T.primary               : '#fff';
  const activeBar  = isOwn ? 'rgba(255,255,255,0.95)' : T.primary;
  const inactiveBar = isOwn ? 'rgba(255,255,255,0.25)' : 'rgba(255,99,74,0.20)';
  const timeColor  = isOwn ? 'rgba(255,255,255,0.65)' : T.textSecondary;

  return (
    <View style={vStyles.container}>

      {/* ── Circular play button ─────────────────────────────── */}
      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={1}
          hitSlop={HIT_SLOP}
          style={[
            vStyles.btn,
            { backgroundColor: btnBg },
            !isOwn && vStyles.btnShadow,
          ]}
        >
          {isLoading
            ? <ActivityIndicator size="small" color={iconColor} />
            : <PlayIcon
                size={rs(16)}
                color={iconColor}
                strokeWidth={2.6}
                fill={status.playing ? iconColor : 'none'}
              />
          }
        </TouchableOpacity>
      </Animated.View>

      {/* ── Waveform + time ──────────────────────────────────── */}
      <View style={vStyles.right}>
        {/* Bars — bottom-anchored so they grow upward naturally */}
        <View style={vStyles.waveRow}>
          {bars.map((h, i) => {
            const MAX_H  = rs(24);
            const MIN_H  = rs(3);
            const barH   = MIN_H + h * (MAX_H - MIN_H);
            const active = i < activeBars;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => seekTo(i / WAVEFORM_BARS)}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                style={vStyles.barTouch}
              >
                <View style={[
                  vStyles.bar,
                  {
                    height: barH,
                    backgroundColor: active ? activeBar : inactiveBar,
                  },
                ]} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Thin progress rail + elapsed time inline */}
        <View style={vStyles.footer}>
          <View style={[vStyles.rail, { backgroundColor: inactiveBar }]}>
            <View style={[vStyles.railFill, {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: activeBar,
            }]} />
          </View>
          <Text style={[vStyles.time, { color: timeColor }]}>{timeLabel}</Text>
        </View>
      </View>

    </View>
  );
});

const vStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rp(8),
    paddingHorizontal: rp(4),
    minWidth: rs(200),
    gap: rp(10),
  },
  btn: {
    width: rs(40), height: rs(40), borderRadius: rs(20),
    alignItems: 'center', justifyContent: 'center',
  },
  btnShadow: {
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: rs(3) },
    shadowOpacity: 0.45,
    shadowRadius: rs(8),
    elevation: 6,
  },
  right: {
    flex: 1,
    gap: rp(6),
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',   // bars grow from bottom
    height: rs(28),
    gap: rs(2),
  },
  barTouch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: rs(28),
  },
  bar: {
    width: rs(2.5),
    borderRadius: rs(2),
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
  },
  rail: {
    flex: 1,
    height: rs(2),
    borderRadius: rs(1),
    overflow: 'hidden',
  },
  railFill: {
    height: '100%',
    borderRadius: rs(1),
  },
  time: {
    fontSize: rf(10),
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
    minWidth: rs(28),
    textAlign: 'right',
  },
});

// ─── Video bubble in chat ─────────────────────────────────────
const VideoBubble = React.memo(({ url, isOwn }) => {
  const player    = useVideoPlayer({ uri: url }, p => { p.loop = false; });
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration,  setDuration]  = useState(0);
  const [position,  setPosition]  = useState(0);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer      = useRef(null);

  useEffect(() => {
    const playingSub = player.addListener('playingChange', ({ isPlaying: p }) => {
      setIsPlaying(p);
      if (p) {
        // Fade controls out after 2 s of playing
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
          Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }, 2000);
      } else {
        clearTimeout(hideTimer.current);
        Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }
    });
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setDuration(player.duration || 0);
    });
    // Poll position while playing
    const tick = setInterval(() => {
      if (player.playing) setPosition(player.currentTime || 0);
    }, 500);
    return () => {
      playingSub.remove(); statusSub.remove(); clearInterval(tick); clearTimeout(hideTimer.current);
    };
  }, [player]);

  const handleTap = () => {
    // Always show controls on tap
    Animated.timing(overlayOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
      hideTimer.current = setTimeout(() => {
        Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      }, 2000);
    }
  };

  const progress = duration > 0 ? position / duration : 0;
  const fmtTime  = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const coral    = T.primary;

  return (
    <TouchableOpacity onPress={handleTap} activeOpacity={1} style={vvStyles.wrap}>
      <VideoView player={player} style={vvStyles.video} contentFit="cover" />

      {/* Dark gradient at bottom */}
      <Animated.View style={[vvStyles.overlay, { opacity: overlayOpacity }]}>
        {/* Centre play/pause button */}
        <View style={[vvStyles.playBtn, { backgroundColor: isOwn ? 'rgba(255,255,255,0.92)' : coral }]}>
          {isPlaying
            ? <Pause size={rs(18)} color={isOwn ? coral : '#fff'} fill={isOwn ? coral : '#fff'} strokeWidth={0} />
            : <Play  size={rs(18)} color={isOwn ? coral : '#fff'} fill={isOwn ? coral : '#fff'} strokeWidth={0} />
          }
        </View>

        {/* Bottom bar: time + progress rail */}
        <View style={vvStyles.bottomBar}>
          <Text style={vvStyles.timeText}>{fmtTime(position)}</Text>
          <View style={vvStyles.rail}>
            <View style={[vvStyles.railFill, { width: `${Math.round(progress * 100)}%` }]} />
            {/* Thumb dot */}
            <View style={[vvStyles.thumb, { left: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={vvStyles.timeText}>{fmtTime(duration)}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
});

const vvStyles = StyleSheet.create({
  wrap: {
    width: rs(230), height: rs(170),
    borderRadius: RADIUS.lg, overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  playBtn: {
    width: rs(46), height: rs(46), borderRadius: rs(23),
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: rs(2) },
    shadowOpacity: 0.4, shadowRadius: rs(6), elevation: 6,
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: rp(10), paddingBottom: rp(8), paddingTop: rp(16),
    gap: rp(6),
    // subtle gradient-like darkening
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  timeText: {
    color: '#fff', fontSize: rf(9), fontVariant: ['tabular-nums'],
    letterSpacing: 0.3, minWidth: rs(24), textAlign: 'center',
  },
  rail: {
    flex: 1, height: rs(3), backgroundColor: 'rgba(255,255,255,0.30)',
    borderRadius: rs(2), overflow: 'visible', position: 'relative',
  },
  railFill: {
    height: '100%', backgroundColor: T.primary, borderRadius: rs(2),
  },
  thumb: {
    position: 'absolute', top: -rs(3),
    width: rs(9), height: rs(9), borderRadius: rs(5),
    backgroundColor: '#fff',
    marginLeft: -rs(4.5),
    shadowColor: T.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: rs(4), elevation: 3,
  },
});

const SWIPE_THRESHOLD = 32; // px to trigger reply — lower = easier to activate

const MessageBubble = React.memo(({ message, onLongPress, onSwipeReply, onImagePress, uploadProgress }) => {
  const fadeAnim       = useRef(new Animated.Value(0)).current;
  const slideAnim      = useRef(new Animated.Value(message.is_own ? 16 : -16)).current;
  const swipeX         = useRef(new Animated.Value(0)).current;
  const replyScale     = useRef(new Animated.Value(0)).current;
  const triggered      = useRef(false);
  const msgType        = message.message_type || 'text';
  // Keep both callback and message always-current so the one-time PanResponder
  // closure never operates on stale values.
  const onSwipeReplyRef = useRef(onSwipeReply);
  const messageRef      = useRef(message);
  useEffect(() => { onSwipeReplyRef.current = onSwipeReply; }, [onSwipeReply]);
  useEffect(() => { messageRef.current      = message;      }, [message]);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 10,  useNativeDriver: true }),
    ]).start();
  }, []);

  const snapBack = () => {
    Animated.spring(swipeX,     { toValue: 0, friction: 6, tension: 120, useNativeDriver: true }).start();
    Animated.spring(replyScale, { toValue: 0, friction: 6, tension: 120, useNativeDriver: true }).start();
  };

  // Swipe-to-reply pan responder (right swipe only)
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder:        () => false,
    onStartShouldSetPanResponderCapture: () => false,
    // Claim the gesture when: moving right, horizontal > vertical, with some velocity
    onMoveShouldSetPanResponder: (_, g) =>
      g.dx > 4 && Math.abs(g.dy) < 14 && g.dx > Math.abs(g.dy),
    onPanResponderMove: (_, g) => {
      const clamped = Math.min(g.dx, SWIPE_THRESHOLD + 24);
      if (clamped > 0) {
        swipeX.setValue(clamped);
        replyScale.setValue(Math.min(clamped / SWIPE_THRESHOLD, 1));
        // Fire reply the moment threshold is crossed — immune to FlatList
        // stealing the responder before onPanResponderRelease fires.
        if (clamped >= SWIPE_THRESHOLD && !triggered.current) {
          triggered.current = true;
          onSwipeReplyRef.current?.(messageRef.current);
        }
      }
    },
    onPanResponderRelease: () => {
      triggered.current = false;
      snapBack();
    },
    onPanResponderTerminate: () => {
      triggered.current = false;
      snapBack();
    },
  })).current;

  const bubbleContent = () => {
    return (
      <>
        {/* Reply preview chip */}
        {message.reply_to_id ? (
          <View style={[styles.replyChip, message.is_own && styles.replyChipOwn]}>
            <View style={[styles.replyChipBar, message.is_own && styles.replyChipBarOwn]} />
            <Text style={[styles.replyChipText, message.is_own && styles.replyChipTextOwn]} numberOfLines={1}>
              {message.reply_preview || 'Original message'}
            </Text>
          </View>
        ) : null}

        {msgType === 'image' && message.media_url ? (
          <>
            <ImageMessage
              uri={message.media_url}
              isOwn={message.is_own}
              onPress={onImagePress}
              uploadProgress={uploadProgress}
            />
            {message.content ? (
              <Text style={[styles.bubbleText, message.is_own && styles.bubbleTextOwn, { marginTop: rp(6), paddingHorizontal: rp(4) }]}>
                {message.content}
              </Text>
            ) : null}
          </>
        ) : msgType === 'video' && message.media_url ? (
          <VideoBubble url={message.media_url} isOwn={message.is_own} />
        ) : msgType === 'voice' && message.media_url ? (
          <VoiceNoteBubble url={message.media_url} isOwn={message.is_own} />
        ) : (
          <Text style={[styles.bubbleText, message.is_own && styles.bubbleTextOwn]}>
            {message.content}
          </Text>
        )}
      </>
    );
  };

  return (
    <Animated.View
      style={[
        styles.bubbleRow,
        message.is_own ? styles.bubbleRowOwn : styles.bubbleRowTheir,
        { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
      ]}
      {...pan.panHandlers}
    >
      {/* Reply icon (appears behind bubble on swipe) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.swipeReplyIcon,
          message.is_own ? styles.swipeReplyIconOwn : styles.swipeReplyIconTheir,
          { transform: [{ scale: replyScale }, { translateX: swipeX }] },
        ]}
      >
        <CornerUpLeft size={rs(18)} color={T.primary} strokeWidth={2} />
      </Animated.View>

      {/* Bubble itself slides right on swipe */}
      <Animated.View style={{ transform: [{ translateX: swipeX }] }}>
        <TouchableOpacity
          onLongPress={() => onLongPress?.(message)}
          activeOpacity={0.85}
          delayLongPress={350}
        >
          <View style={[
            styles.bubble,
            message.is_own ? styles.bubbleOwn : styles.bubbleTheir,
            (msgType === 'image' || msgType === 'video') && styles.bubbleImageWrap,
          ]}>
            {bubbleContent()}
            {message.reaction && (
              <View style={[styles.reactionBadge, message.is_own && styles.reactionBadgeOwn]}>
                <Text style={styles.reactionBadgeText}>{message.reaction}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <View style={[styles.bubbleFooter, message.is_own && styles.bubbleFooterOwn]}>
          <Text style={styles.bubbleTime}>{formatTime(message.created_at)}</Text>
          {message.is_own && (
            <MessageStatus isDelivered={message.is_delivered} isRead={message.is_read} />
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
});

// ─── Connection Strip (replaces IntensityMeter + RevealProgressBanner) ───────
// Collapsed: 28 px — a 2 px hairline bar + one text line.
// Expanded: grows inline to show the full milestone list.
// Hides completely once every feature AND reveal are both unlocked.
const REVEAL_THRESHOLD = 30;

const ConnectionStrip = React.memo(({ messageCount, revealUnlocked }) => {
  const [expanded, setExpanded] = useState(false);
  const widthAnim = useRef(new Animated.Value(0)).current;
  const percent   = getIntensityPercent(messageCount);

  useEffect(() => {
    Animated.spring(widthAnim, { toValue: percent, friction: 9, useNativeDriver: false }).start();
  }, [percent]);

  // Hide once every feature + reveal is fully unlocked
  const allFeaturesUnlocked = messageCount >= 100;
  if (allFeaturesUnlocked && revealUnlocked) return null;

  const barWidth       = widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  const nextFeature    = INTENSITY_MILESTONES.find(m => messageCount < m.at);
  const revealLeft     = REVEAL_THRESHOLD - messageCount;
  const showRevealHint = !revealUnlocked && revealLeft <= 10 && revealLeft > 0;

  // One-liner: reveal hint takes priority when close
  const hint = showRevealHint
    ? `👁  ${revealLeft} more to unlock reveal`
    : nextFeature
      ? `${nextFeature.at - messageCount} more → ${nextFeature.label} ${nextFeature.icon}`
      : `all features unlocked · ${percent}%`;

  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
      style={styles.cstrip}
    >
      {/* Hairline progress bar */}
      <View style={styles.cstripTrack}>
        <Animated.View style={[styles.cstripFill, { width: barWidth }]} />
        {INTENSITY_MILESTONES.map(m => (
          <View key={m.at} style={[styles.cstripMarker, { left: `${m.at}%` }]} />
        ))}
      </View>

      {/* Single text row */}
      <View style={styles.cstripRow}>
        <Text style={styles.cstripHint} numberOfLines={1}>{hint}</Text>
        <Text style={styles.cstripPct}>{percent}%</Text>
      </View>

      {/* Inline expandable milestone list */}
      {expanded && (
        <View style={styles.cstripList}>
          {INTENSITY_MILESTONES.map(m => {
            const done = messageCount >= m.at;
            return (
              <View key={m.at} style={styles.cstripListRow}>
                <Text style={[styles.cstripListIcon, !done && { opacity: 0.35 }]}>
                  {done ? m.icon : '🔒'}
                </Text>
                <Text style={[styles.cstripListLabel, !done && { color: T.textMuted }]}>
                  {m.label}
                </Text>
                <Text style={[styles.cstripListAt, done && { color: T.success }]}>
                  {done ? 'unlocked' : `${m.at} msgs`}
                </Text>
              </View>
            );
          })}
          {/* Reveal row */}
          <View style={styles.cstripListRow}>
            <Text style={[styles.cstripListIcon, !revealUnlocked && { opacity: 0.35 }]}>
              {revealUnlocked ? '✨' : '👁'}
            </Text>
            <Text style={[styles.cstripListLabel, !revealUnlocked && { color: T.textMuted }]}>
              Identity reveal
            </Text>
            <Text style={[styles.cstripListAt, revealUnlocked && { color: T.success }]}>
              {revealUnlocked ? 'unlocked' : `${REVEAL_THRESHOLD} msgs`}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─── Locked Feature Button ────────────────────────────────────
const LockedFeatureBtn = React.memo(({ icon: Icon, label, onPress }) => (
  <TouchableOpacity style={styles.lockedFeatureBtn} onPress={onPress} hitSlop={HIT_SLOP} activeOpacity={0.8}>
    <View style={styles.lockedFeatureIcon}>
      <Icon size={rs(18)} color={T.textMuted} strokeWidth={1.5} />
      <Lock size={rs(9)} color={T.primary} style={styles.lockOverlay} />
    </View>
    <Text style={styles.lockedFeatureLabel}>{label}</Text>
  </TouchableOpacity>
));

// ─── Reveal Modal ─────────────────────────────────────────────
const RevealModal = React.memo(({ visible, chat, onAccept, onDecline, onRequest, onClose }) => {
  if (!visible) return null;
  const isPending   = chat?.reveal_status === 'pending';
  const isInitiator = chat?.reveal_initiator;
  const isAccepted  = chat?.reveal_status === 'accepted';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.revealBackdrop}>
        <View style={styles.revealCard}>
          <Text style={styles.revealEmoji}>
            {isAccepted ? '✨' : (isPending && !isInitiator) ? '👁' : '🌑'}
          </Text>
          {isAccepted ? (
            <>
              <Text style={styles.revealTitle}>identities revealed</Text>
              <Text style={styles.revealBody}>you both chose to be seen.</Text>
            </>
          ) : isPending && !isInitiator ? (
            <>
              <Text style={styles.revealTitle}>they want to reveal</Text>
              <Text style={styles.revealBody}>
                they're asking to show you who they really are.{'\n'}you don't have to say yes.
              </Text>
              <TouchableOpacity style={styles.revealPrimaryBtn} onPress={onAccept} hitSlop={HIT_SLOP} activeOpacity={0.85}>
                <Text style={styles.revealPrimaryText}>reveal each other</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.revealSecondaryBtn} onPress={onDecline} hitSlop={HIT_SLOP} activeOpacity={0.85}>
                <Text style={styles.revealSecondaryText}>stay anonymous</Text>
              </TouchableOpacity>
            </>
          ) : isPending && isInitiator ? (
            <>
              <Text style={styles.revealTitle}>waiting…</Text>
              <Text style={styles.revealBody}>your reveal request was sent.{'\n'}waiting for their response.</Text>
            </>
          ) : (
            <>
              <Text style={styles.revealTitle}>reveal identity?</Text>
              <Text style={styles.revealBody}>
                send a request to reveal who you both are.{'\n'}they must agree for anything to show.
              </Text>
              <TouchableOpacity style={styles.revealPrimaryBtn} onPress={onRequest} hitSlop={HIT_SLOP} activeOpacity={0.85}>
                <Text style={styles.revealPrimaryText}>send reveal request</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.revealCloseBtn} onPress={onClose} hitSlop={HIT_SLOP}>
            <Text style={styles.revealCloseText}>close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

// ─── Deep Connection Countdown ────────────────────────────────
function useCountdown(expiresAt) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt) - new Date();
      if (diff <= 0) { setTimeLeft(null); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft({ d, h, m, diff });
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return timeLeft;
}

const DeepConnectionCountdown = React.memo(({ expiresAt, revealUnlocked, onReveal }) => {
  const tl = useCountdown(expiresAt);
  if (!tl) return null;

  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  const ONE_DAY    = 24 * 60 * 60 * 1000;
  if (tl.diff > THREE_DAYS) return null;   // only show in the last 3 days

  const urgent = tl.diff < ONE_DAY;
  const label  = tl.d > 0 ? `${tl.d}d ${tl.h}h left` : `${tl.h}h ${tl.m}m left`;

  return (
    <View style={[styles.countdownBanner, urgent && styles.countdownBannerUrgent]}>
      <Text style={[styles.countdownText, urgent && styles.countdownTextUrgent]}>
        ⏳ this connection closes in {label}
      </Text>
      {revealUnlocked && (
        <TouchableOpacity onPress={onReveal} hitSlop={HIT_SLOP} style={styles.countdownRevealBtn}>
          <Text style={styles.countdownRevealText}>reveal & continue →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────
export default function ChatScreen({ route, navigation }) {
  const { chatId, otherName, otherAvatar, otherAvatarColor, otherUserId } = route.params || {};
  const { showToast }     = useToast();
  const { socketService } = useSocket();

  const [messages,      setMessages]      = useState([]);
  const [chatInfo,      setChatInfo]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [inputText,     setInputText]     = useState('');
  const [sending,       setSending]       = useState(false);
  const [showReveal,    setShowReveal]    = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [isOnline,      setIsOnline]      = useState(false);
  const [isTyping,      setIsTyping]      = useState(false);
  const [selectedMsg,   setSelectedMsg]   = useState(null);
  const [showReactions, setShowReactions] = useState(false);
  const [intensity,     setIntensity]     = useState(0);
  const [chatEvent,     setChatEvent]     = useState(null);
  const [isRecording,    setIsRecording]    = useState(false);
  const [mediaUploading,   setMediaUploading]   = useState(false);
  // { [tempId]: 0-100 } — tracks upload % per in-flight image bubble
  const [uploadProgresses, setUploadProgresses] = useState({});
  const [incomingCall,   setIncomingCall]   = useState(null); // {callType, callerName, callerAvatar, callerColor}
  const [replyTo,        setReplyTo]        = useState(null); // message being replied to
  const chatEventTimer = useRef(null);
  const recordingRef   = useRef(null);

  const flatListRef    = useRef(null);
  const pollRef        = useRef(null);
  const typingTimer    = useRef(null);
  const isTypingRef    = useRef(false);
  const loadSeqRef     = useRef(0);           // stale-response guard
  const isAtBottomRef  = useRef(true);        // whether user is near the bottom
  const initialScrollDone = useRef(false);   // scroll to bottom exactly once on first load
  const avatarColor    = otherAvatarColor || T.primary;

  // ── Load messages ────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    const seq = ++loadSeqRef.current;          // stamp this particular call
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/messages?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      // If a newer call has already completed, throw away this stale result.
      if (seq !== loadSeqRef.current) return;

      if (res.ok) {
        const serverMsgs = data.messages || [];
        setMessages(prev => {
          const serverIds = new Set(serverMsgs.map(m => m.id));

          // 1. Keep in-flight temp bubbles not yet confirmed by the server.
          const pendingTemps = prev.filter(
            m => String(m.id).startsWith('temp_') && !serverIds.has(m.id)
          );

          // 2. Keep ANY local message (own or incoming via socket) that has a real
          //    ID but hasn't appeared in the server snapshot yet — POST confirmed
          //    but DB read hasn't caught up, or a socket message arrived after the
          //    fetch started. No is_own restriction, no time check.
          const localOnly = prev.filter(
            m => !String(m.id).startsWith('temp_') && !serverIds.has(m.id)
          );

          const extras = [...pendingTemps, ...localOnly];
          if (extras.length === 0) return serverMsgs;
          return [...serverMsgs, ...extras];
        });
        setChatInfo(data.chat);
        if (data.chat?.intensity_score != null) {
          setIntensity(data.chat.intensity_score);
        }
        socketService?.markRead?.(chatId);
        // Scroll to bottom once after the very first load
        if (!initialScrollDone.current) {
          initialScrollDone.current = true;
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150);
        }
      }
    } catch { /* silent */ }
    finally {
      // Only clear the initial loader on the FIRST response that lands.
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [chatId, socketService]);

  useFocusEffect(useCallback(() => {
    initialScrollDone.current = false;
    isAtBottomRef.current     = true;
    loadMessages();
    pollRef.current = setInterval(loadMessages, 10000);
    return () => clearInterval(pollRef.current);
  }, [loadMessages]));

  // Always scroll — used when the user sends a message or on first load.
  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // Only scroll if the user is already near the bottom — used for incoming messages.
  const scrollToBottomIfNear = useCallback(() => {
    if (isAtBottomRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, []);

  // Track scroll position so we know whether to auto-scroll on new messages.
  const handleScroll = useCallback(({ nativeEvent }) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isAtBottomRef.current = distanceFromBottom < 80;
  }, []);

  // ── Socket events ────────────────────────────────────────
  useEffect(() => {
    if (!socketService || !chatId) return;

    socketService.joinChat?.(chatId);

    const triggerChatEvent = (type) => {
      setChatEvent(type);
      clearTimeout(chatEventTimer.current);
      chatEventTimer.current = setTimeout(() => setChatEvent(null), 600);
    };

    const handleIntensityUpdate = ({ chatId: cid, score }) => {
      if (cid !== chatId) return;
      setIntensity(score);
    };

    const handleNewMessage = (msg) => {
      if (msg.chat_id !== chatId) return;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, { ...msg, is_own: false }];
      });
      setIsTyping(false);
      triggerChatEvent('message');
      scrollToBottomIfNear();
      socketService.markRead?.(chatId);
    };

    const handleDelivered = ({ chatId: cid, messageIds }) => {
      if (cid !== chatId) return;
      const ids = new Set(messageIds);
      setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, is_delivered: true } : m));
    };

    const handleRead = ({ chatId: cid, messageIds }) => {
      if (cid !== chatId) return;
      const ids = new Set(messageIds);
      setMessages(prev => prev.map(m => ids.has(m.id) ? { ...m, is_delivered: true, is_read: true } : m));
    };

    // Backend emits 'user_typing' with { userId, chatId } — no isTyping flag.
    // Receiving the event means they ARE typing; auto-clear after 3 s of silence.
    const handleTyping = ({ chatId: cid, userId }) => {
      if (cid !== chatId || userId !== otherUserId) return;  // must be FROM the other user
      setIsTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setIsTyping(false), 3000);
      triggerChatEvent('typing');
    };

    const handleOnline  = ({ userId }) => { if (userId === otherUserId) setIsOnline(true); };
    const handleOffline = ({ userId }) => { if (userId === otherUserId) setIsOnline(false); };

    // Incoming call offer
    const handleCallOffer = ({ chat_id, call_type, caller_name, caller_avatar, caller_color }) => {
      if (chat_id !== chatId) return;
      setIncomingCall({ callType: call_type, callerName: caller_name, callerAvatar: caller_avatar, callerColor: caller_color });
    };
    const handleCallEnded = ({ chat_id }) => {
      if (chat_id !== chatId) return;
      setIncomingCall(null);
    };

    // Message deleted by the other party
    const handleMessageDeleted = ({ message_id }) => {
      setMessages(prev => prev.filter(m => m.id !== message_id));
    };

    socketService.onNewMessage?.(handleNewMessage);
    socketService.onMessagesDelivered?.(handleDelivered);
    socketService.onMessagesRead?.(handleRead);
    socketService.on?.('user_typing',      handleTyping);
    socketService.on?.('user_online',      handleOnline);
    socketService.on?.('user_offline',     handleOffline);
    socketService.on?.('intensity_update', handleIntensityUpdate);
    socketService.onCallOffer?.(handleCallOffer);
    socketService.onCallEnded?.(handleCallEnded);
    socketService.on?.('message_deleted',  handleMessageDeleted);

    return () => {
      socketService.offNewMessage?.(handleNewMessage);
      socketService.offMessagesDelivered?.(handleDelivered);
      socketService.offMessagesRead?.(handleRead);
      socketService.off?.('user_typing',      handleTyping);
      socketService.off?.('user_online',      handleOnline);
      socketService.off?.('user_offline',     handleOffline);
      socketService.off?.('intensity_update', handleIntensityUpdate);
      socketService.offCallOffer?.(handleCallOffer);
      socketService.offCallEnded?.(handleCallEnded);
      socketService.off?.('message_deleted',  handleMessageDeleted);
      socketService.leaveChat?.(chatId);
    };
  }, [socketService, chatId, otherUserId, scrollToBottomIfNear]);

  // ── Typing emit ──────────────────────────────────────────
  const handleInputChange = useCallback((text) => {
    setInputText(text);
    // Throttle: only emit once per 1.5 s burst
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      // sendTyping emits 'user_typing' { chatId, recipientId } — the only form the backend understands
      socketService?.sendTyping?.(chatId, otherUserId);
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      isTypingRef.current = false;
      // No "stop typing" emit needed — the recipient auto-clears after 3 s of silence
    }, 1500);
  }, [socketService, chatId, otherUserId]);

  // ── Send message ─────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content || sending) return;

    setSending(true);
    const tempId = `temp_${Date.now()}`;
    const snapReplyTo = replyTo; // capture before clearing

    setMessages(prev => [...prev, {
      id: tempId, content, is_own: true,
      is_delivered: false, is_read: false,
      created_at: new Date().toISOString(),
      reply_to_id: snapReplyTo?.id || '',
      reply_preview: snapReplyTo
        ? (snapReplyTo.content || (snapReplyTo.message_type === 'voice' ? '🎙 Voice note' : snapReplyTo.message_type === 'image' ? '🖼 Image' : '')).substring(0, 80)
        : '',
    }]);
    setInputText('');
    setReplyTo(null);
    scrollToBottom();

    // Clear local typing throttle — recipient auto-clears via their 3 s timeout
    isTypingRef.current = false;

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        showToast({ type: 'error', message: 'Session expired. Please log in again.' });
        return;
      }
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          chat_id:      chatId,
          content,
          message_type: 'text',
          reply_to_id:  snapReplyTo?.id   || '',
          reply_preview: snapReplyTo
            ? (snapReplyTo.content || (snapReplyTo.message_type === 'voice' ? '🎙 Voice note' : snapReplyTo.message_type === 'image' ? '🖼 Image' : '')).substring(0, 80)
            : '',
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setMessages(prev => prev.filter(m => m.id !== tempId));
        showToast({ type: 'error', message: errBody?.detail || `Failed to send (${res.status})` });
      } else {
        // Swap temp id → real id in-place. No full reload = no blink, no lost reply chip.
        const data = await res.json();
        if (!data.message_id) {
          // Defensive: server returned 200 but no id — keep bubble as-is
          return;
        }
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, id: data.message_id } : m
        ));
      }
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      showToast({ type: 'error', message: e?.message || 'Message could not be sent.' });
    } finally {
      setSending(false);
    }
  }, [inputText, sending, chatId, replyTo, scrollToBottom, showToast]);

  // ── Upload media to Cloudinary via signed upload ──────────
  // ── fetch-based image upload with simulated progress ─────────
  // fetch is far more reliable than XHR in React Native for FormData file uploads.
  // Real upload progress isn't available via fetch, so we advance a timer-driven
  // counter to 90 % while the request is in-flight, then snap to 100 % on success.
  const uploadImageWithProgress = useCallback(async (uri, mimeType, onProgress) => {
    const token  = await AsyncStorage.getItem('token');
    const rawExt = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    const ext    = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(rawExt) ? rawExt : 'jpg';
    const mime   = mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg');

    const form = new FormData();
    form.append('file', { uri, name: `img_${Date.now()}.${ext}`, type: mime });

    // Animate progress 5 % → 90 % every 400 ms while upload is in flight
    let pct = 5;
    onProgress?.(pct);
    const ticker = setInterval(() => {
      pct = Math.min(pct + 12, 90);
      onProgress?.(pct);
    }, 400);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/upload/image`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      });
      clearInterval(ticker);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Upload failed (${res.status})`);
      }
      onProgress?.(100);
      const data = await res.json();
      return data.url;
    } catch (e) {
      clearInterval(ticker);
      throw e;
    }
  }, []);

  // ── Upload voice note directly to Cloudinary (signed) — .m4a is always a known format
  const uploadVoice = useCallback(async (uri) => {
    const token = await AsyncStorage.getItem('token');
    // Step 1: get signed params from backend
    const sigRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ resource_type: 'video' }), // Cloudinary uses "video" for audio
    });
    if (!sigRes.ok) {
      const err = await sigRes.json().catch(() => ({}));
      throw new Error(err?.detail || `Signature failed (${sigRes.status})`);
    }
    const { signature, timestamp, api_key, cloud_name, folder } = await sigRes.json();

    // Step 2: upload directly to Cloudinary
    const form = new FormData();
    form.append('file',      { uri, name: `voice_${Date.now()}.m4a`, type: 'audio/m4a' });
    form.append('signature', signature);
    form.append('timestamp', String(timestamp));
    form.append('api_key',   api_key);
    form.append('folder',    folder);

    const uploadRes  = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
      { method: 'POST', body: form }
    );
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData?.error?.message || `Cloudinary error (${uploadRes.status})`);
    return uploadData.secure_url;
  }, []);

  // ── Send a message with optional media ───────────────────
  const sendMediaMessage = useCallback(async ({ content = '', messageType, mediaUrl }) => {
    if (sending || mediaUploading) return;
    setSending(true);
    const tempId = `temp_${Date.now()}`;
    const snapReplyTo = replyTo;
    setMessages(prev => [...prev, {
      id: tempId, content, message_type: messageType, media_url: mediaUrl,
      is_own: true, is_delivered: false, is_read: false,
      created_at: new Date().toISOString(),
      reply_to_id:   snapReplyTo?.id || '',
      reply_preview: snapReplyTo
        ? (snapReplyTo.content || (snapReplyTo.message_type === 'voice' ? '🎙 Voice note' : snapReplyTo.message_type === 'image' ? '🖼 Image' : '')).substring(0, 80)
        : '',
    }]);
    setReplyTo(null);
    scrollToBottom();
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          chat_id: chatId, content, message_type: messageType, media_url: mediaUrl,
          reply_to_id:   snapReplyTo?.id || '',
          reply_preview: snapReplyTo
            ? (snapReplyTo.content || (snapReplyTo.message_type === 'voice' ? '🎙 Voice note' : snapReplyTo.message_type === 'image' ? '🖼 Image' : '')).substring(0, 80)
            : '',
        }),
      });
      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        showToast({ type: 'error', message: 'Could not send message.' });
      } else {
        // Swap temp id → real id in-place, preserving reply fields with zero blink.
        const data = await res.json();
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, id: data.message_id } : m
        ));
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      showToast({ type: 'error', message: 'Could not send message.' });
    } finally {
      setSending(false);
    }
  }, [sending, mediaUploading, chatId, replyTo, scrollToBottom, showToast]);

  // ── Upload video to Cloudinary via backend ───────────────────
  const uploadVideoWithProgress = useCallback(async (uri, mimeType, onProgress) => {
    const token = await AsyncStorage.getItem('token');
    const ext   = uri.split('?')[0].split('.').pop()?.toLowerCase() || 'mp4';
    const mime  = mimeType || 'video/mp4';

    const form = new FormData();
    form.append('file', { uri, name: `vid_${Date.now()}.${ext}`, type: mime });

    let pct = 5;
    onProgress?.(pct);
    const ticker = setInterval(() => {
      pct = Math.min(pct + 8, 90);
      onProgress?.(pct);
    }, 600);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/upload/video`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      });
      clearInterval(ticker);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Upload failed (${res.status})`);
      }
      onProgress?.(100);
      const data = await res.json();
      return data.url;
    } catch (e) {
      clearInterval(ticker);
      throw e;
    }
  }, []);

  // ── Send a single video asset ─────────────────────────────────
  const sendOneVideo = useCallback(async (asset, snapReplyTo) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    setMessages(prev => [...prev, {
      id: tempId, content: '', message_type: 'video',
      media_url: asset.uri, is_own: true,
      is_delivered: false, is_read: false,
      created_at: new Date().toISOString(),
      reply_to_id:   snapReplyTo?.id || '',
      reply_preview: snapReplyTo
        ? (snapReplyTo.content || '📹 Video').substring(0, 80)
        : '',
    }]);
    setUploadProgresses(prev => ({ ...prev, [tempId]: 0 }));

    let cloudUrl;
    try {
      cloudUrl = await uploadVideoWithProgress(
        asset.uri,
        asset.mimeType ?? null,
        (pct) => setUploadProgresses(prev => ({ ...prev, [tempId]: pct })),
      );
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setUploadProgresses(prev => { const s = { ...prev }; delete s[tempId]; return s; });
      showToast({ type: 'error', message: e?.message || 'Could not upload video.' });
      return;
    }

    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, media_url: cloudUrl } : m));
    setUploadProgresses(prev => { const s = { ...prev }; delete s[tempId]; return s; });

    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chat_id: chatId, content: '', message_type: 'video', media_url: cloudUrl,
          reply_to_id:   snapReplyTo?.id || '',
          reply_preview: snapReplyTo ? (snapReplyTo.content || '📹 Video').substring(0, 80) : '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, id: data.message_id, is_delivered: true } : m
        ));
      } else {
        const errBody = await res.json().catch(() => ({}));
        showToast({ type: 'error', message: errBody?.detail || `Send failed (${res.status})` });
      }
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not send video.' });
    }
  }, [chatId, showToast, uploadVideoWithProgress]);

  // ── Send a single image asset (upload + optimistic bubble + backend POST) ──
  const sendOneImage = useCallback(async (asset, snapReplyTo) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // 1 ── Optimistic preview bubble with local URI
    setMessages(prev => [...prev, {
      id:           tempId,
      content:      '',
      message_type: 'image',
      media_url:    asset.uri,
      is_own:       true,
      is_delivered: false,
      is_read:      false,
      created_at:   new Date().toISOString(),
      reply_to_id:   snapReplyTo?.id || '',
      reply_preview: snapReplyTo
        ? (snapReplyTo.content || '🖼 Image').substring(0, 80)
        : '',
    }]);

    // 2 ── Upload with live % feedback
    setUploadProgresses(prev => ({ ...prev, [tempId]: 0 }));
    let cloudUrl;
    try {
      cloudUrl = await uploadImageWithProgress(
        asset.uri,
        asset.mimeType ?? null,
        (pct) => setUploadProgresses(prev => ({ ...prev, [tempId]: pct })),
      );
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setUploadProgresses(prev => { const s = { ...prev }; delete s[tempId]; return s; });
      showToast({ type: 'error', message: e?.message || 'Could not upload image.' });
      return;
    }

    if (!cloudUrl) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setUploadProgresses(prev => { const s = { ...prev }; delete s[tempId]; return s; });
      showToast({ type: 'error', message: 'Upload returned no URL. Please try again.' });
      return;
    }

    // 3 ── Swap local URI → CDN URL, clear progress overlay
    setMessages(prev => prev.map(m =>
      m.id === tempId ? { ...m, media_url: cloudUrl } : m
    ));
    setUploadProgresses(prev => { const s = { ...prev }; delete s[tempId]; return s; });

    // 4 ── Persist to backend
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          chat_id:      chatId,
          content:      '',
          message_type: 'image',
          media_url:    cloudUrl,
          reply_to_id:   snapReplyTo?.id || '',
          reply_preview: snapReplyTo
            ? (snapReplyTo.content || '🖼 Image').substring(0, 80)
            : '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, id: data.message_id, is_delivered: true } : m
        ));
      } else {
        const errBody = await res.json().catch(() => ({}));
        showToast({ type: 'error', message: errBody?.detail || `Send failed (${res.status})` });
      }
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not send image.' });
    }
  }, [chatId, showToast, uploadImageWithProgress]);

  // ── Image picker — supports multiple selection ───────────────
  const handleImagePress = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Gallery permission is needed.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:              ['images', 'videos'],
        quality:                 0.8,
        allowsEditing:           false,
        allowsMultipleSelection: true,
        selectionLimit:          3,
        videoMaxDuration:        60,
      });
      if (result.canceled || !result.assets?.length) return;

      const snapReplyTo = replyTo;
      setReplyTo(null);
      scrollToBottom();
      await Promise.all(result.assets.map(asset =>
        asset.type === 'video'
          ? sendOneVideo(asset, snapReplyTo)
          : sendOneImage(asset, snapReplyTo)
      ));
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not send image.' });
    }
  }, [replyTo, scrollToBottom, showToast, sendOneImage, sendOneVideo]);

  // ── Voice note record / stop ─────────────────────────────
  const handleVoicePress = useCallback(async () => {
    if (isRecording) {
      // Stop and send — getURI() MUST come before stopAndUnloadAsync(),
      // after unloading the recording object is released and getURI() returns null.
      try {
        const uri = recordingRef.current?.getURI();
        await recordingRef.current?.stopAndUnloadAsync();
        setIsRecording(false);
        recordingRef.current = null;
        if (!uri) {
          showToast({ type: 'error', message: 'Recording failed — no audio captured.' });
          return;
        }
        setMediaUploading(true);
        const url = await uploadVoice(uri);
        setMediaUploading(false);
        if (url) await sendMediaMessage({ messageType: 'voice', mediaUrl: url });
      } catch (e) {
        setIsRecording(false);
        setMediaUploading(false);
        showToast({ type: 'error', message: e?.message || 'Could not send voice note.' });
      }
    } else {
      // Start recording
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          showToast({ type: 'warning', message: 'Microphone permission is needed.' });
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecording(true);
      } catch {
        showToast({ type: 'error', message: 'Could not start recording.' });
      }
    }
  }, [isRecording, uploadVoice, sendMediaMessage, showToast]);

  // ── Unlock ───────────────────────────────────────────────
  const handleUnlock = useCallback(() => {
    navigation.navigate('UnlockPremium', { chatId, otherName });
  }, [navigation, chatId, otherName]);

  // ── Locked feature toast ──────────────────────────────────
  const handleLockedFeature = useCallback((feature, needed) => {
    const left = needed - (chatInfo?.message_count || 0);
    showToast({ type: 'info', title: `${feature} locked`, message: `${left} more messages to unlock.` });
  }, [showToast, chatInfo]);

  // ── Start a call ─────────────────────────────────────────
  const handleStartCall = useCallback((callType) => {
    navigation.navigate('Call', {
      chatId,
      callType,
      isInitiator:    true,
      otherName,
      otherAvatar,
      otherAvatarColor,
    });
  }, [navigation, chatId, otherName, otherAvatar, otherAvatarColor]);

  // ── Accept incoming call ──────────────────────────────────
  const handleAcceptCall = useCallback(() => {
    if (!incomingCall) return;
    const { callType, callerName, callerAvatar, callerColor } = incomingCall;
    setIncomingCall(null);
    navigation.navigate('Call', {
      chatId,
      callType,
      isInitiator:    false,
      otherName:      callerName,
      otherAvatar:    callerAvatar,
      otherAvatarColor: callerColor,
    });
  }, [incomingCall, navigation, chatId]);

  // ── Reject incoming call ──────────────────────────────────
  const handleRejectCall = useCallback(async () => {
    setIncomingCall(null);
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/call/reject`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* silent */ }
  }, [chatId]);

  // ── Reactions ─────────────────────────────────────────────
  const handleLongPress = useCallback((message) => {
    setSelectedMsg(message);
    setShowReactions(true);
  }, []);

  const handleReaction = useCallback((emoji) => {
    if (!selectedMsg) return;
    setMessages(prev => prev.map(m =>
      m.id === selectedMsg.id ? { ...m, reaction: emoji } : m
    ));
    setSelectedMsg(null);
    setShowReactions(false);
  }, [selectedMsg]);

  // ── Swipe to reply ────────────────────────────────────────
  const handleSwipeReply = useCallback((message) => {
    setReplyTo(message);
  }, []);

  // ── Delete message ────────────────────────────────────────
  const handleDelete = useCallback(async (messageId, scope) => {
    setShowReactions(false);
    setSelectedMsg(null);
    // Optimistic removal
    setMessages(prev => prev.filter(m => m.id !== messageId));
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(
        `${API_BASE_URL}/api/v1/connect/chats/${chatId}/messages/${messageId}?scope=${scope}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('delete failed');
    } catch {
      // Reload to restore on failure
      loadMessages();
      showToast({ type: 'error', message: 'Could not delete message.' });
    }
  }, [chatId, loadMessages, showToast]);

  // ── Reveal ────────────────────────────────────────────────
  const handleRevealRequest = useCallback(async () => {
    setRevealLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/reveal/request`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setChatInfo(prev => ({ ...prev, reveal_status: 'pending', reveal_initiator: true }));
        showToast({ type: 'info', message: 'Reveal request sent.' });
      } else {
        showToast({ type: 'error', message: 'Could not send reveal request.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not send reveal request.' });
    } finally {
      setRevealLoading(false);
    }
  }, [chatId, showToast]);

  const handleRevealRespond = useCallback(async (accept) => {
    setRevealLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats/${chatId}/reveal/respond`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ reveal_id: chatId, accept }),
      });
      const data = await res.json();
      if (res.ok) {
        if (accept && data.other_user) {
          setChatInfo(prev => ({ ...prev, reveal_status: 'accepted', revealed_other: data.other_user }));
          showToast({ type: 'success', message: 'Identities revealed. ✨' });
        } else {
          setChatInfo(prev => ({ ...prev, reveal_status: 'declined' }));
          setShowReveal(false);
        }
      } else {
        showToast({ type: 'error', message: 'Could not respond to reveal.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not respond to reveal.' });
    } finally {
      setRevealLoading(false);
    }
  }, [chatId, showToast]);

  const [fullscreenImageUrl, setFullscreenImageUrl] = useState(null);
  const handleOpenLightbox = useCallback((uri) => setFullscreenImageUrl(uri), []);

  // ── Build flat list data with date separators injected ───────
  const listData = useMemo(() => {
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const toDateKey = (iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    const toLabel = (iso) => {
      const d   = new Date(iso);
      const key = toDateKey(iso);
      if (key === toDateKey(today.toISOString()))     return 'Today';
      if (key === toDateKey(yesterday.toISOString())) return 'Yesterday';
      return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const result = [];
    let lastKey  = null;
    for (const msg of messages) {
      if (!msg.created_at) { result.push(msg); continue; }
      const key = toDateKey(msg.created_at);
      if (key !== lastKey) {
        result.push({ __type: 'date_sep', id: `sep_${key}`, label: toLabel(msg.created_at) });
        lastKey = key;
      }
      result.push(msg);
    }
    return result;
  }, [messages]);

  const renderMessage = useCallback(({ item }) => {
    if (item.__type === 'date_sep') {
      return (
        <View style={styles.dateSepRow}>
          <View style={styles.dateSepLine} />
          <Text style={styles.dateSepLabel}>{item.label}</Text>
          <View style={styles.dateSepLine} />
        </View>
      );
    }
    return (
      <MessageBubble
        message={item}
        onLongPress={handleLongPress}
        onSwipeReply={handleSwipeReply}
        onImagePress={handleOpenLightbox}
        uploadProgress={uploadProgresses[item.id]}
      />
    );
  }, [handleLongPress, handleSwipeReply, handleOpenLightbox, uploadProgresses]);

  const keyExtractor = useCallback((item) => item.id, []);

  const messageCount    = chatInfo?.message_count || 0;
  const revealUnlocked  = chatInfo?.reveal_unlocked || messageCount >= 30;
  const unlockedFeatures = getUnlockedFeatures(messageCount);
  const hasVoiceNote = unlockedFeatures.some(f => f.label === 'Voice notes');
  const hasMedia     = unlockedFeatures.some(f => f.label === 'Images');
  const hasAudioCall = unlockedFeatures.some(f => f.label === 'Audio calls');
  const hasVideoCall = unlockedFeatures.some(f => f.label === 'Video calls');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <IntensityBackground event={chatEvent} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
            <ArrowLeft size={rs(20)} color={T.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={[
              styles.headerAvatar,
              { backgroundColor: avatarColor + '22', borderColor: avatarColor + '55' },
              isOnline && { borderColor: T.online + '99' },
            ]}>
              <Text style={styles.headerAvatarEmoji}>{AVATAR_MAP[otherAvatar] || '👤'}</Text>
              {isOnline && <View style={styles.headerOnlineDot} />}
            </View>
            <View>
              <Text style={styles.headerName}>{otherName || 'Anonymous'}</Text>
              <Text style={[styles.headerSub, isOnline && styles.headerSubOnline]}>
                {isTyping ? 'typing…' : isOnline ? 'online now' : 'anonymous connection'}
              </Text>
            </View>
          </View>

          {/* Right actions */}
          <View style={styles.headerActions}>
            {/* Audio call */}
            <TouchableOpacity
              style={[styles.headerActionBtn, hasAudioCall && styles.headerActionBtnActive]}
              onPress={() => hasAudioCall ? handleStartCall('audio') : handleLockedFeature('Audio calls', 80)}
              hitSlop={HIT_SLOP}
            >
              <Phone size={rs(16)} color={hasAudioCall ? T.primary : T.textMuted} strokeWidth={1.8} />
              {!hasAudioCall && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
            </TouchableOpacity>
            {/* Video call */}
            <TouchableOpacity
              style={[styles.headerActionBtn, hasVideoCall && styles.headerActionBtnActive]}
              onPress={() => hasVideoCall ? handleStartCall('video') : handleLockedFeature('Video calls', 100)}
              hitSlop={HIT_SLOP}
            >
              <Video size={rs(16)} color={hasVideoCall ? T.primary : T.textMuted} strokeWidth={1.8} />
              {!hasVideoCall && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
            </TouchableOpacity>
            {/* Reveal */}
            {revealUnlocked && (
              <TouchableOpacity
                style={[styles.headerActionBtn, chatInfo?.reveal_status === 'pending' && styles.headerActionBtnPending]}
                onPress={() => setShowReveal(true)}
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.revealBtnText}>
                  {chatInfo?.reveal_status === 'accepted' ? '✨' : '👁'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Connection strip (intensity + reveal, collapsed to 28 px) ── */}
        <ConnectionStrip messageCount={messageCount} revealUnlocked={revealUnlocked} />

        {/* ── Deep connection countdown ── */}
        <DeepConnectionCountdown
          expiresAt={chatInfo?.chat_expires_at}
          revealUnlocked={revealUnlocked}
          onReveal={() => setShowReveal(true)}
        />

        {/* ── Drop nudge — they have a confession ── */}
        {chatInfo?.has_active_drop && chatInfo?.drop_id && (
          <TouchableOpacity
            style={styles.dropNudgeBanner}
            onPress={() => navigation.navigate('DropLanding', { dropId: chatInfo.drop_id })}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            <Text style={styles.dropNudgeText}>
              🌑 they have a confession on the board · <Text style={styles.dropNudgeLink}>read it</Text>
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Messages ── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={T.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listData}
            keyExtractor={keyExtractor}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={true}
            onLayout={() => {
              if (!initialScrollDone.current) return;
              // Re-anchor after keyboard / layout shifts if user is at bottom
              if (isAtBottomRef.current) flatListRef.current?.scrollToEnd({ animated: false });
            }}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatEmoji}>🌑</Text>
                <Text style={styles.emptyChatText}>you're connected.{'\n'}say something real.</Text>
              </View>
            }
            ListFooterComponent={isTyping ? <TypingIndicator /> : null}
          />
        )}

        {/* ── Revealed identity banner ── */}
        {chatInfo?.revealed_other && (
          <View style={styles.revealedBanner}>
            <Text style={styles.revealedBannerText}>✨ {chatInfo.revealed_other.username}</Text>
          </View>
        )}

        {/* ── Action sheet (long-press menu) ── */}
        {showReactions && selectedMsg && (
          <Modal visible transparent animationType="fade" onRequestClose={() => { setShowReactions(false); setSelectedMsg(null); }}>
            <TouchableOpacity
              style={styles.reactionBackdrop}
              activeOpacity={1}
              onPress={() => { setShowReactions(false); setSelectedMsg(null); }}
            >
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={styles.actionSheet}>
                  {/* Reaction row */}
                  <View style={styles.reactionPicker}>
                    {REACTIONS.map(r => (
                      <TouchableOpacity key={r} onPress={() => handleReaction(r)} hitSlop={HIT_SLOP}>
                        <Text style={styles.reactionEmoji}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.actionSheetDivider} />

                  {/* Reply */}
                  <TouchableOpacity
                    style={styles.actionSheetRow}
                    onPress={() => { setReplyTo(selectedMsg); setShowReactions(false); setSelectedMsg(null); }}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.7}
                  >
                    <Reply size={rs(18)} color={T.text} strokeWidth={1.8} />
                    <Text style={styles.actionSheetRowText}>Reply</Text>
                  </TouchableOpacity>

                  {/* Delete for me */}
                  <TouchableOpacity
                    style={styles.actionSheetRow}
                    onPress={() => handleDelete(selectedMsg.id, 'me')}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={rs(18)} color={T.textSecondary} strokeWidth={1.8} />
                    <Text style={styles.actionSheetRowText}>Delete for me</Text>
                  </TouchableOpacity>

                  {/* Delete for everyone — only if own message */}
                  {selectedMsg.is_own && (
                    <TouchableOpacity
                      style={[styles.actionSheetRow, styles.actionSheetRowDanger]}
                      onPress={() => handleDelete(selectedMsg.id, 'everyone')}
                      hitSlop={HIT_SLOP}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={rs(18)} color="#ef4444" strokeWidth={1.8} />
                      <Text style={styles.actionSheetRowTextDanger}>Delete for everyone</Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.actionSheetDivider} />

                  {/* Cancel */}
                  <TouchableOpacity
                    style={styles.actionSheetCancelRow}
                    onPress={() => { setShowReactions(false); setSelectedMsg(null); }}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionSheetCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}

        {/* ── Reply preview bar ── */}
        {replyTo && (
          <View style={styles.replyBar}>
            <CornerUpLeft size={rs(14)} color={T.primary} strokeWidth={2} />
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarLabel}>replying to</Text>
              <Text style={styles.replyBarPreview} numberOfLines={1}>
                {replyTo.content
                  || (replyTo.message_type === 'voice' ? '🎙 Voice note'
                    : replyTo.message_type === 'image' ? '🖼 Image'
                    : '')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={HIT_SLOP}>
              <X size={rs(16)} color={T.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Input bar ── */}
        <View style={styles.inputBar}>
          {/* Image button — never disabled; uploads happen in the background */}
          <TouchableOpacity
            style={styles.inputActionBtn}
            onPress={hasMedia ? handleImagePress : () => handleLockedFeature('Images')}
            hitSlop={HIT_SLOP}
          >
            <ImageIcon size={rs(18)} color={hasMedia ? T.primary : T.textMuted} strokeWidth={1.5} />
            {!hasMedia && !mediaUploading && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={handleInputChange}
            placeholder="say something…"
            placeholderTextColor={T.textMuted}
            multiline
            maxLength={500}
            returnKeyType="default"
            selectionColor={T.primary}
          />

          {/* Voice note button */}
          <TouchableOpacity
            style={[styles.inputActionBtn, isRecording && styles.inputActionBtnRecording]}
            onPress={hasVoiceNote ? handleVoicePress : () => handleLockedFeature('Voice notes')}
            hitSlop={HIT_SLOP}
          >
            {isRecording
              ? <MicOff size={rs(18)} color="#fff" strokeWidth={2} />
              : <Mic    size={rs(18)} color={hasVoiceNote ? T.primary : T.textMuted} strokeWidth={1.5} />
            }
            {!hasVoiceNote && !isRecording && <Lock size={rs(8)} color={T.primary} style={styles.lockOverlay} />}
          </TouchableOpacity>

          {/* Send */}
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
            hitSlop={HIT_SLOP}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <RevealModal
        visible={showReveal}
        chat={chatInfo}
        onAccept={() => handleRevealRespond(true)}
        onDecline={() => handleRevealRespond(false)}
        onRequest={handleRevealRequest}
        onClose={() => setShowReveal(false)}
      />

      {/* ── Incoming call modal ── */}
      {incomingCall && (
        <Modal visible transparent animationType="slide" onRequestClose={handleRejectCall}>
          <View style={styles.incomingBackdrop}>
            <View style={styles.incomingCard}>
              <View style={[styles.incomingAvatar, { backgroundColor: (incomingCall.callerColor || T.primary) + '22', borderColor: (incomingCall.callerColor || T.primary) + '55' }]}>
                <Text style={styles.incomingAvatarEmoji}>
                  {/* Avatar emoji map reuse */}
                  {({'ghost':'👻','shadow':'🌑','flame':'🔥','void':'🕳️','storm':'⛈️','smoke':'💨','eclipse':'🌘','shard':'🔷','moth':'🦋','raven':'🐦‍⬛'})[incomingCall.callerAvatar] || '👤'}
                </Text>
              </View>
              <Text style={styles.incomingName}>{incomingCall.callerName || 'Anonymous'}</Text>
              <Text style={styles.incomingType}>
                {incomingCall.callType === 'video' ? '📹 incoming video call' : '📞 incoming audio call'}
              </Text>
              <View style={styles.incomingBtns}>
                <TouchableOpacity style={styles.incomingReject} onPress={handleRejectCall} activeOpacity={0.85}>
                  <PhoneOff size={rs(22)} color="#fff" strokeWidth={2} />
                  <Text style={styles.incomingBtnLabel}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.incomingAccept} onPress={handleAcceptCall} activeOpacity={0.85}>
                  <Phone size={rs(22)} color="#fff" strokeWidth={2} />
                  <Text style={styles.incomingBtnLabel}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Full-screen image lightbox */}
      <ImageLightbox
        uri={fullscreenImageUrl}
        onClose={() => setFullscreenImageUrl(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border,
    gap: SPACING.sm,
  },
  backBtn: { width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerAvatar: {
    width: rs(38), height: rs(38), borderRadius: rs(19),
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
    position: 'relative',
  },
  headerAvatarEmoji: { fontSize: rf(18) },
  headerOnlineDot: {
    position: 'absolute', bottom: rp(0), right: rp(0),
    width: rs(10), height: rs(10), borderRadius: rs(5),
    backgroundColor: T.online, borderWidth: 1.5, borderColor: T.surface,
  },
  headerName:  { fontSize: FONT.md, fontWeight: '700', color: T.text },
  headerSub:   { fontSize: FONT.xs, color: T.textSecondary, fontStyle: 'italic' },
  headerSubOnline: { color: T.online, fontStyle: 'normal', fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  headerActionBtn: {
    width: rs(32), height: rs(32), borderRadius: rs(16),
    backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border, position: 'relative',
  },
  headerActionBtnActive:  { borderColor: T.primaryBorder, backgroundColor: T.primaryDim },
  headerActionBtnPending: { borderColor: T.primary, backgroundColor: T.primaryDim },
  revealBtnText: { fontSize: rf(14) },

  // Lock overlay for buttons
  lockOverlay: { position: 'absolute', bottom: rp(3), right: rp(3) },

  // ── Connection strip ─────────────────────────────────────────
  cstrip: {
    borderBottomWidth: 1, borderBottomColor: T.border,
    backgroundColor: T.surface,
    paddingHorizontal: SPACING.md,
    paddingBottom: rp(6),
  },
  cstripTrack: {
    height: rp(2), backgroundColor: 'rgba(255,255,255,0.06)',
    position: 'relative', overflow: 'visible', marginTop: rp(0),
  },
  cstripFill: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    backgroundColor: T.primary, borderRadius: rp(1),
  },
  cstripMarker: {
    position: 'absolute', top: -rp(1), width: rp(1), height: rp(4),
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  cstripRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: rp(4),
  },
  cstripHint: { flex: 1, fontSize: rf(10), color: T.textMuted, fontStyle: 'italic' },
  cstripPct:  { fontSize: rf(10), color: T.primary, fontWeight: '700', marginLeft: rp(8) },
  cstripList: { marginTop: rp(8), gap: rp(5), paddingBottom: rp(2) },
  cstripListRow: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  cstripListIcon:  { fontSize: rf(12), width: rs(18) },
  cstripListLabel: { flex: 1, fontSize: rf(11), color: T.text },
  cstripListAt:    { fontSize: rf(10), color: T.textMuted, fontWeight: '600' },

  // Deep connection countdown
  countdownBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(7),
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(251,191,36,0.18)',
    gap: SPACING.sm,
  },
  countdownBannerUrgent: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderBottomColor: 'rgba(239,68,68,0.2)',
  },
  countdownText:        { color: T.textSecondary, fontSize: FONT.xs, flex: 1 },
  countdownTextUrgent:  { color: '#EF4444' },
  countdownRevealBtn:   { paddingHorizontal: rp(10), paddingVertical: rp(4), backgroundColor: T.primary, borderRadius: RADIUS.sm },
  countdownRevealText:  { color: '#fff', fontSize: FONT.xs, fontWeight: '700' },

  // Drop nudge banner
  dropNudgeBanner: {
    paddingHorizontal: SPACING.md, paddingVertical: rp(7),
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
  },
  dropNudgeText: { color: T.textSecondary, fontSize: FONT.xs },
  dropNudgeLink: { color: '#8B5CF6', fontWeight: '700' },


  // Messages
  messagesList: {
    paddingHorizontal: rp(20), paddingVertical: SPACING.md,
    gap: rp(6), paddingBottom: SPACING.md,
  },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyChat:      { alignItems: 'center', justifyContent: 'center', paddingTop: rs(80), gap: SPACING.sm },
  emptyChatEmoji: { fontSize: rf(40) },
  emptyChatText:  { color: T.textSecondary, fontSize: FONT.sm, fontStyle: 'italic', textAlign: 'center', lineHeight: rf(22) },

  // Date separator
  dateSepRow:   { flexDirection: 'row', alignItems: 'center', marginVertical: rp(10), paddingHorizontal: SPACING.md },
  dateSepLine:  { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  dateSepLabel: { color: T.textMuted, fontSize: FONT.xs, fontStyle: 'italic', marginHorizontal: SPACING.sm },

  // Typing indicator
  typingWrap:   { paddingHorizontal: SPACING.md, marginBottom: rp(4) },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: rp(4),
    backgroundColor: T.theirBubble, alignSelf: 'flex-start',
    paddingHorizontal: rp(14), paddingVertical: rp(12),
    borderRadius: RADIUS.lg, borderBottomLeftRadius: rp(4),
    borderWidth: 1, borderColor: T.border,
  },
  typingDot: { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.textSecondary },

  // Bubbles
  bubbleRow:      { marginVertical: rp(2), maxWidth: '82%' },
  bubbleRowOwn:   { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowTheir: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: rp(14), paddingVertical: rp(10), borderRadius: RADIUS.lg },
  bubbleOwn:    { backgroundColor: T.myBubble, borderBottomRightRadius: rp(4) },
  bubbleTheir:  { backgroundColor: T.theirBubble, borderBottomLeftRadius: rp(4), borderWidth: 1, borderColor: T.border },
  bubbleText:    { fontSize: FONT.md, color: T.textSecondary, lineHeight: rf(22) },
  bubbleTextOwn: { color: '#fff' },
  bubbleFooter:    { flexDirection: 'row', alignItems: 'center', gap: rp(4), marginTop: rp(3), marginLeft: rp(4) },
  bubbleFooterOwn: { justifyContent: 'flex-end', marginLeft: 0, marginRight: rp(4) },
  bubbleTime: { fontSize: FONT.xs, color: T.textSecondary, opacity: 0.7 },

  // Reactions
  reactionBadge: {
    position: 'absolute', bottom: -rp(8), left: rp(8),
    backgroundColor: T.surface, borderRadius: RADIUS.full,
    paddingHorizontal: rp(6), paddingVertical: rp(2),
    borderWidth: 1, borderColor: T.border,
  },
  reactionBadgeOwn:  { left: 'auto', right: rp(8) },
  reactionBadgeText: { fontSize: rf(13) },
  reactionBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  reactionPicker: {
    flexDirection: 'row', gap: rp(12),
    backgroundColor: T.surface, padding: rp(16),
    borderRadius: RADIUS.xl, borderWidth: 1, borderColor: T.border,
  },
  reactionEmoji: { fontSize: rf(28) },

  // Revealed banner
  revealedBanner: {
    backgroundColor: T.successDim, borderTopWidth: 1, borderTopColor: T.successBorder,
    paddingVertical: rp(8), alignItems: 'center',
  },
  revealedBannerText: { color: T.success, fontSize: FONT.sm, fontWeight: '600' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? rp(28) : SPACING.sm,
    gap: SPACING.xs, backgroundColor: T.surface,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  inputActionBtn: {
    width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  input: {
    flex: 1, backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingTop: rp(10), paddingBottom: rp(10),
    color: T.text, fontSize: FONT.md, maxHeight: rs(100),
    borderWidth: 1, borderColor: T.border,
  },
  sendBtn: {
    width: rs(40), height: rs(40), borderRadius: rs(20),
    backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.4, shadowRadius: rs(8), elevation: 6,
  },
  sendBtnDisabled: { backgroundColor: '#1e2330', shadowOpacity: 0 },
  sendBtnText: { color: '#fff', fontSize: rf(18), fontWeight: '800' },
  inputActionBtnBusy:      { opacity: 0.6 },
  inputActionBtnRecording: {
    backgroundColor: T.primary, borderRadius: rs(18),
    shadowColor: T.primary, shadowOpacity: 0.5, shadowRadius: rs(6), elevation: 4,
  },

  // Video bubble
  bubbleVideoWrap: {
    width: rs(220), height: rs(160), borderRadius: RADIUS.md,
    overflow: 'hidden', backgroundColor: '#000',
  },
  bubbleVideo: { width: '100%', height: '100%' },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  videoPlayBtn: {
    width: rs(44), height: rs(44), borderRadius: rs(22),
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Image bubble — zero inner padding so the image fills the bubble edge-to-edge
  bubbleImageWrap: {
    padding:           0,
    paddingHorizontal: 0,
    paddingVertical:   0,
    overflow:          'hidden',
    backgroundColor:   'transparent',
    borderWidth:       0,
  },

  // Reveal modal
  // Incoming call modal
  incomingBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: rs(60),
  },
  incomingCard: {
    backgroundColor: T.surface, borderRadius: RADIUS.xl,
    padding: rp(28), width: '90%', alignItems: 'center',
    gap: SPACING.sm, borderWidth: 1, borderColor: T.border,
  },
  incomingAvatar: {
    width: rs(72), height: rs(72), borderRadius: rs(36),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, marginBottom: rp(4),
  },
  incomingAvatarEmoji: { fontSize: rf(32) },
  incomingName: { fontSize: rf(18), fontWeight: '700', color: T.text },
  incomingType: { fontSize: rf(13), color: T.textSecondary, marginBottom: rp(8) },
  incomingBtns: {
    flexDirection: 'row', gap: SPACING.lg, marginTop: rp(8),
  },
  incomingReject: {
    width: rs(64), height: rs(64), borderRadius: rs(32),
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
    gap: rp(4),
  },
  incomingAccept: {
    width: rs(64), height: rs(64), borderRadius: rs(32),
    backgroundColor: T.online, alignItems: 'center', justifyContent: 'center',
    gap: rp(4),
  },
  incomingBtnLabel: { fontSize: rf(10), fontWeight: '700', color: '#fff' },

  revealBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: SPACING.lg,
  },
  revealCard: {
    backgroundColor: T.surface, borderRadius: RADIUS.xl,
    padding: SPACING.lg, width: '100%', alignItems: 'center',
    gap: SPACING.sm, borderWidth: 1, borderColor: T.border,
  },
  revealEmoji:        { fontSize: rf(48), marginBottom: rp(4) },
  revealTitle:        { fontSize: FONT.xl, fontWeight: '800', color: T.text, textAlign: 'center' },
  revealBody:         { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(22), marginBottom: rp(8) },
  revealPrimaryBtn:   { width: '100%', backgroundColor: T.primary, paddingVertical: rp(14), borderRadius: RADIUS.md, alignItems: 'center' },
  revealPrimaryText:  { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
  revealSecondaryBtn: { width: '100%', paddingVertical: rp(12), borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: T.border },
  revealSecondaryText:{ color: T.textSecondary, fontSize: FONT.sm },
  revealCloseBtn:     { paddingVertical: rp(8), marginTop: rp(4) },
  revealCloseText:    { color: T.textMuted, fontSize: FONT.sm },

  // ── Swipe reply icon ─────────────────────────────────────────
  swipeReplyIcon: {
    position: 'absolute', top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    width: rs(32),
  },
  swipeReplyIconTheir: { left: -rs(36) },
  swipeReplyIconOwn:   { right: -rs(36) },

  // ── Reply chip inside bubble ─────────────────────────────────
  replyChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: RADIUS.sm,
    marginBottom: rp(6), overflow: 'hidden',
  },
  replyChipOwn: { backgroundColor: 'rgba(0,0,0,0.25)' },
  replyChipBar: {
    width: rp(3), alignSelf: 'stretch',
    backgroundColor: T.textSecondary,
    marginRight: rp(8),
  },
  replyChipBarOwn: { backgroundColor: 'rgba(255,255,255,0.7)' },
  replyChipText: {
    flex: 1, fontSize: rf(11), color: T.textSecondary,
    paddingVertical: rp(5), paddingRight: rp(8),
    fontStyle: 'italic',
  },
  replyChipTextOwn: { color: 'rgba(255,255,255,0.75)' },

  // ── Reply bar above input ────────────────────────────────────
  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: rp(8),
    backgroundColor: T.surfaceAlt,
    borderTopWidth: 1, borderTopColor: T.primaryBorder,
  },
  replyBarContent: { flex: 1 },
  replyBarLabel:   { fontSize: rf(10), color: T.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  replyBarPreview: { fontSize: FONT.sm, color: T.textSecondary, marginTop: rp(2) },

  // ── Action sheet ─────────────────────────────────────────────
  actionSheet: {
    backgroundColor: T.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: T.border,
    width: '88%', alignSelf: 'center',
    overflow: 'hidden',
    marginBottom: rs(24),
  },
  actionSheetDivider: { height: 1, backgroundColor: T.border },
  actionSheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: rp(15),
  },
  actionSheetRowDanger: {
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  actionSheetRowText: { fontSize: FONT.md, color: T.text, fontWeight: '500' },
  actionSheetRowTextDanger: { fontSize: FONT.md, color: '#ef4444', fontWeight: '500' },
  actionSheetCancelRow: {
    alignItems: 'center', paddingVertical: rp(15),
  },
  actionSheetCancelText: { fontSize: FONT.md, color: T.textSecondary, fontWeight: '600' },
});
