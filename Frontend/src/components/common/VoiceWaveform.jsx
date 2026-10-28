/** The one voice-note player (cards, chat, comments). Resets the audio session out of
 * recording mode and waits until ready before playing. Bar heights are seeded from the URL,
 * not real audio. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Play, Pause } from 'lucide-react-native';
import T from '../../utils/theme';
import { rs, rf, rp } from '../../utils/responsive';
import { useToast } from '../ui/Toast';

const BAR_COUNT = 28;

// Shared across all players, so starting one clip pauses the other.
let activePlayer = null;

// Coral shades, cycled by bar index.
const CORAL_SHADES = [T.primary, '#E14F3A', '#FF9376', '#F0A868', '#C93F2B'];

function barHeightsFor(seed) {
  const str = seed || 'x';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const heights = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const t = ((h >>> 8) % 1000) / 1000;
    heights.push(0.28 + t * 0.72); // 28%–100% of the track height
  }
  return heights;
}

function fmt(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** uri: audio URL. durationSeconds: shown until the player knows it. compact: smaller version. */
export default function VoiceWaveform({ uri, durationSeconds = 0, compact = false }) {
  const { showToast } = useToast();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  // expo-audio's status has no `status` field, so track loading ourselves.
  const loaded = useRef(false);
  const [isFinished, setIsFinished] = useState(false);

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
        return;
      }
      if (status.playing) player.pause();
      else player.play();
    } catch (e) {
      // Show the error instead of failing silently.
      console.error('[VoiceWaveform] playback failed:', e);
      showToast({ type: 'error', message: e?.message || 'Could not play this voice note.' });
    }
  }, [uri, status.playing, isFinished, player, showToast]);

  const duration   = status.duration || durationSeconds || 0;
  const playing    = !!status.playing && !isFinished;
  const progress   = isFinished ? 0 : (duration > 0 ? (status.currentTime || 0) / duration : 0);
  const activeBar  = Math.round(progress * (BAR_COUNT - 1));
  const showingElapsed = playing || (status.currentTime || 0) > 0;

  const dimColor = 'rgba(255,255,255,0.14)';

  const barBoxHeight = compact ? rs(18) : rs(26);
  const btnSize = compact ? rs(26) : rs(32);
  // Thin fixed-width bars spaced out, not thick flex blocks.
  const barWidth = compact ? rs(1.5) : rs(2);

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
          const isHead = isLit && i === activeBar;
          const litColor = CORAL_SHADES[i % CORAL_SHADES.length];
          return (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  width: barWidth,
                  height: `${h * 100}%`,
                  backgroundColor: isLit ? litColor : dimColor,
                },
                isHead && {
                  shadowColor: litColor,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: 4,
                  elevation: 4,
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={styles.time}>
        {fmt(showingElapsed ? status.currentTime : duration)}
      </Text>
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
  time: {
    fontSize: rf(10.5), fontWeight: '700', minWidth: rs(30), textAlign: 'right',
    color: T.textMuted,
  },
});
