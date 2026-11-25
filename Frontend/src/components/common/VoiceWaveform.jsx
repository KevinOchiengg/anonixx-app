/** The one voice-note player (cards, chat, comments). Resets the audio session out of
 * recording mode and waits until ready before playing. Bar heights are seeded from the URL,
 * not real audio. While it plays, the bars around the playhead ripple like a live wave.
 * `speed` adds a 1x / 1.5x / 2x control (chat voice notes). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Play, Pause } from 'lucide-react-native';
import T from '../../utils/theme';
import { rs, rf, rp } from '../../utils/responsive';
import { useToast } from '../ui/Toast';

const BAR_COUNT = 46;
const SPEEDS = [1, 1.5, 2];

// Shared across all players, so starting one clip pauses the other.
let activePlayer = null;

// The colour flows along the wave: pink → coral → amber → gold → coral → pink (web twin: ChatBubble.tsx).
const STOPS = ['#e8456e', '#ff634a', '#ff9376', '#f0a868', '#ffc93c', '#ff634a', '#e8456e'];
export function barColor(i, count = BAR_COUNT) {
  const x = (i / (count - 1)) * (STOPS.length - 1);
  const k = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - k;
  const mix = (o) => Math.round(parseInt(STOPS[k].slice(o, o + 2), 16) * (1 - f) + parseInt(STOPS[k + 1].slice(o, o + 2), 16) * f);
  return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`;
}
const BAR_COLORS = Array.from({ length: BAR_COUNT }, (_, i) => barColor(i));

// Shaped like a real recording: a few loud bursts that fade out, quiet chatter in between.
function barHeightsFor(seed) {
  const str = seed || 'x';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return ((h >>> 8) % 1000) / 1000; };
  const bursts = Array.from({ length: 3 + Math.floor(rnd() * 2) }, () => ({ at: Math.floor(rnd() * BAR_COUNT), amp: 0.55 + rnd() * 0.45 }));
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const peak = Math.max(...bursts.map((b) => (i >= b.at ? b.amp * Math.exp(-(i - b.at) / 3.2) : b.amp * Math.exp(-(b.at - i) / 0.9))));
    return Math.min(1, Math.max(0.1, 0.12 + rnd() * 0.16 + peak * (0.7 + rnd() * 0.3)));
  });
}

function fmt(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** uri: audio URL. durationSeconds: shown until the player knows it. compact: smaller version. */
export default function VoiceWaveform({ uri, durationSeconds = 0, compact = false, speed = false }) {
  const { showToast } = useToast();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  // expo-audio's status has no `status` field, so track loading ourselves.
  const loaded = useRef(false);
  const [isFinished, setIsFinished] = useState(false);
  const [rate, setRate] = useState(1);

  const cycleRate = useCallback(() => {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    setRate(next);
    try { player.setPlaybackRate(next); } catch {}
  }, [rate, player]);

  const heights = useMemo(() => barHeightsFor(uri), [uri]);

  // Preload when shown, so play starts instantly. Nothing plays until tapped.
  useEffect(() => {
    if (!uri || loaded.current) return;
    loaded.current = true;
    try { player.replace({ uri }); } catch {}
  }, [uri, player]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    setIsFinished(true);
    try {
      player.pause();
      Promise.resolve(player.seekTo(0)).catch(() => {});
    } catch {}
  }, [status.didJustFinish, player]);

  useEffect(() => () => {
    try { player.pause(); } catch {}
    if (activePlayer === player) activePlayer = null;
  }, [player]);

  // When this one starts playing, pause whichever was playing before.
  useEffect(() => {
    if (status.playing) {
      if (activePlayer && activePlayer !== player) {
        try { activePlayer.pause(); } catch {}
      }
      activePlayer = player;
    } else if (activePlayer === player) {
      activePlayer = null;
    }
  }, [status.playing, player]);

  // Load/playback errors only arrive here. Show them and reset `loaded` so the next tap retries.
  useEffect(() => {
    if (!status.error) return;
    console.error('[VoiceWaveform] native playback error:', status.error, 'uri:', uri);
    loaded.current = false;
    showToast({ type: 'error', message: 'Could not play this voice note.' });
  }, [status.error, uri, showToast]);

  const toggle = useCallback(async () => {
    if (!uri) return;
    try {
      // Usually loaded already; fallback if the tap came first.
      if (!loaded.current) {
        loaded.current = true;
        player.replace({ uri });
      }
      // Leave recording mode first (expo-audio's key is `playsInSilentMode`).
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      if (isFinished) {
        setIsFinished(false);
        player.seekTo(0);
        player.play();
        if (rate !== 1) player.setPlaybackRate(rate);
        return;
      }
      if (status.playing) player.pause();
      else {
        player.play();
        if (rate !== 1) player.setPlaybackRate(rate);
      }
    } catch (e) {
      // Show the error instead of failing silently.
      console.error('[VoiceWaveform] playback failed:', e);
      showToast({ type: 'error', message: e?.message || 'Could not play this voice note.' });
    }
  }, [uri, status.playing, isFinished, player, rate, showToast]);

  const duration   = status.duration || durationSeconds || 0;
  const playing    = !!status.playing && !isFinished;
  const progress   = isFinished ? 0 : (duration > 0 ? (status.currentTime || 0) / duration : 0);
  const activeBar  = Math.round(progress * (BAR_COUNT - 1));
  const showingElapsed = playing || (status.currentTime || 0) > 0;


  // One looping clock drives the ripple; each bar near the playhead reads it at its own phase.
  const wave = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!playing) { wave.stopAnimation(); wave.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(wave, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [playing, wave]);
  const RIPPLE = 4;   // bars either side of the playhead that move

  const barBoxHeight = compact ? rs(20) : rs(32);
  const btnSize = compact ? rs(26) : rs(32);
  // Thin fixed-width bars spaced out, not thick flex blocks.
  const barWidth = compact ? rs(1.2) : rs(1.8);

  return (
    <TouchableOpacity
      style={[styles.wrap, compact && styles.wrapCompact]}
      onPress={toggle}
      activeOpacity={0.85}
    >
      <View style={[styles.playBtn, { width: btnSize, height: btnSize, borderRadius: btnSize / 2 }]}>
        {playing ? (
          <Pause size={rs(compact ? 11 : 13)} color={T.primary} fill={T.primary} />
        ) : (
          <Play size={rs(compact ? 11 : 13)} color={T.primary} fill={T.primary} />
        )}
      </View>

      <View style={[styles.bars, { height: barBoxHeight }]}>
        {heights.map((h, i) => {
          const isLit = (playing || progress > 0) && i <= activeBar;
          const litColor = BAR_COLORS[i];
          const near = playing && Math.abs(i - activeBar) <= RIPPLE;
          const phase = (i % 4) / 4;
          const lift = 1 - Math.abs(i - activeBar) / (RIPPLE + 1);   // strongest at the playhead
          const scale = near ? wave.interpolate({
            inputRange: [0, 0.25, 0.5, 0.75, 1].map((x) => x),
            outputRange: [0, 1, 0, 1, 0].map((_, k) => {
              const v = Math.sin(((k / 4) + phase) * Math.PI * 2);
              return 1 + lift * 0.55 * v;
            }),
          }) : 1;
          return (
            <Animated.View
              key={i}
              style={[{ transform: [{ scaleY: scale }] },
                styles.bar,
                {
                  width: barWidth,
                  height: `${h * 100}%`,
                  backgroundColor: litColor,
                  opacity: isLit ? 1 : 0.32,
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={styles.time}>
        {fmt(showingElapsed ? status.currentTime : duration)}
      </Text>
      {speed ? (
        <TouchableOpacity
          onPress={cycleRate} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }} style={styles.rate}
          accessibilityRole="button" accessibilityLabel={`Playback speed ${rate} times`}
        >
          <Text style={styles.rateText}>{rate}×</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    minWidth: rs(170),
  },
  wrapCompact: { minWidth: rs(130), gap: rp(8) },
  // Outlined ring, not a solid fill, so it stays calm.
  playBtn: {
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: T.primaryDim,
    borderWidth: 1.5, borderColor: T.primary,
  },
  bars: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  bar: { minHeight: 2, borderRadius: rs(1) },
  rate: {
    minWidth: rs(30), height: rs(20), borderRadius: 999, paddingHorizontal: rp(6),
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rateText: { fontSize: rf(10.5), fontWeight: '800', color: T.text },
  time: {
    fontSize: rf(10.5), fontWeight: '700', minWidth: rs(30), textAlign: 'right',
    color: T.textMuted,
  },
});
