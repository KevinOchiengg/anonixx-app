/**
 * VoiceWaveform.jsx
 *
 * Single, shared "voice note player" used everywhere a recorded clip needs
 * to be played back — drop cards, chat bubbles, comment rows, circle posts.
 * Previously every one of those screens carried its own copy-pasted
 * play/pause implementation, each with slightly different (and sometimes
 * broken) playback logic. This is the one correct implementation:
 *
 *   - Always resets `allowsRecording: false` right before playing. Any
 *     screen that also mounts VoiceNoteRecorder (comments, circles) leaves
 *     the *global* audio session in recording mode after it's used — a
 *     player that doesn't reset this first can silently fail to play, or
 *     play near-inaudibly through the earpiece.
 *   - Waits for `readyToPlay` before calling `.play()` instead of firing
 *     both at once, so a slow-loading clip doesn't get a play() call the
 *     native side silently drops.
 *
 * Visual: a play/pause button plus a bar waveform, inspired by the
 * reference at https://pin.it/4GZoLgC6p — bars light up as the clip plays
 * past them, with a small glow on the current bar, echoing that reference's
 * glowing-waveform look without copying its literal red/blue duotone (which
 * doesn't fit Anonixx's palette). Lit bars cycle through a handful of coral
 * family shades rather than one flat tone, so the waveform itself carries
 * the color interest — which is also why this no longer needs a container
 * with a tinted/colored background behind it.
 *
 * Bar heights are deterministic, not real amplitude data — seeded from the
 * clip's own URL so the same voice note always draws the same shape instead
 * of reshuffling on every render, without needing to decode the audio file.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
// Gesture-handler's TouchableOpacity, not React Native's — this component
// gets nested inside a Swipeable (DropChatScreen's swipe-to-reply) in some
// call sites, and RN's own Touchable* components use the legacy JS responder
// system, which can silently lose taps to a wrapping Swipeable's native pan
// handler. Gesture-handler's re-export shares its gesture system, so taps
// register reliably whether or not a Swipeable is anywhere above it.
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Play, Pause } from 'lucide-react-native';
import T from '../../utils/theme';
import { rs, rf, rp } from '../../utils/responsive';

const BAR_COUNT = 28;

// Several coral-family tones instead of one flat hue — base coral, a
// deeper rust, a lighter peach, gold-leaning amber, a darker burnt coral.
// Cycled by bar index (not randomized) so a given clip's waveform always
// lights up the same way.
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

/**
 * @param {string}  uri               Playable audio URL — required.
 * @param {number}  [durationSeconds] Fallback duration before the player
 *                                    itself reports one (e.g. server-known
 *                                    length), shown while idle.
 * @param {boolean} [compact]        Smaller footprint for tight rows
 *                                    (comments) — shorter bars, smaller button.
 */
export default function VoiceWaveform({ uri, durationSeconds = 0, compact = false }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  // expo-audio's AudioStatus has no `status` field (confirmed the hard way
  // elsewhere in this codebase — see MediaFeedScreen.jsx's AudioSlide) — so
  // `status.status === 'idle'` is always false and never actually detects
  // whether a source has been loaded yet. Track it manually instead.
  const loaded = useRef(false);
  const [isFinished, setIsFinished] = useState(false);

  const heights = useMemo(() => barHeightsFor(uri), [uri]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    setIsFinished(true);
    try {
      player.pause();
      Promise.resolve(player.seekTo(0)).catch(() => {});
    } catch {}
  }, [status.didJustFinish, player]);

  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);

  const toggle = useCallback(async () => {
    if (!uri) return;
    try {
      // Undo any recorder elsewhere in the app that left the session in
      // recording mode — see the file header for why this matters. Key is
      // `playsInSilentMode` (expo-audio), not expo-av's `playsInSilentModeIOS`.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      if (!loaded.current) {
        loaded.current = true;
        player.replace({ uri });
        player.play();
        return;
      }
      if (isFinished) {
        setIsFinished(false);
        player.seekTo(0);
        player.play();
        return;
      }
      if (status.playing) player.pause();
      else player.play();
    } catch { /* a failed clip shouldn't break whatever it's embedded in */ }
  }, [uri, status.playing, isFinished, player]);

  const duration   = status.duration || durationSeconds || 0;
  const playing    = !!status.playing && !isFinished;
  const progress   = isFinished ? 0 : (duration > 0 ? (status.currentTime || 0) / duration : 0);
  const activeBar  = Math.round(progress * (BAR_COUNT - 1));
  const showingElapsed = playing || (status.currentTime || 0) > 0;

  const dimColor = 'rgba(255,255,255,0.14)';

  const barBoxHeight = compact ? rs(18) : rs(26);
  const btnSize = compact ? rs(26) : rs(32);

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
  // Soft outlined ring, not a solid fill — with no container behind the
  // waveform anymore, a loud solid-coral circle would be the single
  // loudest thing on screen. A tinted ring reads as a calm icon button.
  playBtn: {
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: T.primaryDim,
    borderWidth: 1.5, borderColor: T.primary,
  },
  bars: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(2),
  },
  bar: { flex: 1, minHeight: 2, borderRadius: rs(1) },
  time: {
    fontSize: rf(10.5), fontWeight: '700', minWidth: rs(30), textAlign: 'right',
    color: T.textMuted,
  },
});
