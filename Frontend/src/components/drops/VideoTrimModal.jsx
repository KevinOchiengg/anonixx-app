/**
 * VideoTrimModal.jsx
 *
 * Pick a start/end window out of a longer clip before it ever leaves the
 * device. The actual cut happens server-side — Cloudinary bakes the trim
 * in as part of the signed upload transformation (see /upload/sign's
 * trim_start/trim_end in Backend/app/api/v1/upload.py) — so what gets
 * posted really is just that window, not the full clip with a hint
 * attached. This modal only decides where those two points land.
 *
 * The preview loops the chosen window (not the whole file) so it's
 * obvious what's about to be posted before committing to it.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent, useEventListener } from 'expo';
import Slider from '@react-native-community/slider';
import { X, Scissors } from 'lucide-react-native';
import T from '../../utils/theme';
import {
  rs, rp, rf, FONT, RADIUS, HIT_SLOP, SPACING,
} from '../../utils/responsive';

const MIN_TRIM_SECONDS = 1;

function fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function VideoTrimModal({
  visible, uri, initialStart = 0, initialEnd = null, onCancel, onConfirm,
}) {
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.muted = false;
    p.loop = false;
  });

  const { duration } = useEvent(player, 'sourceLoad', { duration: 0 });

  const [start, setStart] = useState(initialStart);
  const [end, setEnd]     = useState(initialEnd || 0);
  const [seeded, setSeeded] = useState(false);

  // Seed the trim window once duration is known — either the caller's
  // previous selection (re-opening the trimmer) or the full clip.
  useEffect(() => {
    if (duration > 0 && !seeded) {
      setStart(Math.min(initialStart || 0, Math.max(0, duration - MIN_TRIM_SECONDS)));
      setEnd(initialEnd && initialEnd > 0 ? Math.min(initialEnd, duration) : duration);
      setSeeded(true);
    }
  }, [duration, seeded, initialStart, initialEnd]);

  // Reset seeding when the sheet is closed, so a different clip (or a
  // reopen with new initial values) seeds fresh instead of keeping the
  // previous clip's window.
  useEffect(() => {
    if (!visible) setSeeded(false);
  }, [visible]);

  // Read via refs inside the loop listener instead of depending on
  // start/end directly — avoids re-subscribing the native event listener
  // on every drag tick while still always checking the current bounds.
  const startRef = useRef(start);
  const endRef   = useRef(end);
  startRef.current = start;
  endRef.current   = end;

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime >= endRef.current || currentTime < startRef.current) {
      player.currentTime = startRef.current;
    }
  });

  useEffect(() => {
    if (!visible || !seeded) return;
    player.currentTime = start;
    player.play();
    // Only on becoming visible/seeded — dragging the sliders shouldn't
    // yank playback back to the start on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, seeded, player]);

  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);

  const commitStart = (val) => {
    const next = Math.min(val, end - MIN_TRIM_SECONDS);
    setStart(next);
    player.currentTime = next;
    player.play();
  };
  const commitEnd = (val) => {
    const next = Math.max(val, start + MIN_TRIM_SECONDS);
    setEnd(next);
    player.currentTime = Math.max(start, next - 0.5);
    player.play();
  };

  const sliderMax = Math.max(duration, MIN_TRIM_SECONDS);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Trim clip</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={HIT_SLOP}>
              <X size={rs(20)} color={T.textMute} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={s.videoWrap}>
            {uri && (
              <VideoView
                player={player}
                style={s.video}
                contentFit="contain"
                nativeControls={false}
              />
            )}
          </View>

          <View style={s.rangeRow}>
            <Text style={s.rangeLabel}>{fmt(start)}</Text>
            <Text style={s.rangeDash}>–</Text>
            <Text style={s.rangeLabel}>{fmt(end)}</Text>
            <Text style={s.rangeDuration}>{fmt(end - start)} selected</Text>
          </View>

          <Text style={s.sliderLabel}>Start</Text>
          <Slider
            style={s.slider}
            minimumValue={0}
            maximumValue={sliderMax}
            value={start}
            minimumTrackTintColor={T.border}
            maximumTrackTintColor={T.primary}
            thumbTintColor={T.primary}
            onValueChange={setStart}
            onSlidingComplete={commitStart}
          />

          <Text style={s.sliderLabel}>End</Text>
          <Slider
            style={s.slider}
            minimumValue={0}
            maximumValue={sliderMax}
            value={end}
            minimumTrackTintColor={T.primary}
            maximumTrackTintColor={T.border}
            thumbTintColor={T.primary}
            onValueChange={setEnd}
            onSlidingComplete={commitEnd}
          />

          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.confirmBtn}
              onPress={() => onConfirm(start, end)}
              activeOpacity={0.85}
            >
              <Scissors size={rs(15)} color="#fff" strokeWidth={2} />
              <Text style={s.confirmText}>Use This Clip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md, paddingTop: rp(16), paddingBottom: rp(28),
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: rp(14),
  },
  title: { fontSize: rf(16), fontWeight: '700', color: T.text },
  videoWrap: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: RADIUS.md,
    overflow: 'hidden', backgroundColor: '#000', marginBottom: rp(14),
  },
  video: { width: '100%', height: '100%' },
  rangeRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(6),
  },
  rangeLabel: { fontSize: rf(13), fontWeight: '700', color: T.text },
  rangeDash: { fontSize: rf(13), color: T.textMute },
  rangeDuration: {
    marginLeft: 'auto', fontSize: rf(12), color: T.textMute, fontStyle: 'italic',
  },
  sliderLabel: {
    fontSize: rf(11), fontWeight: '700', color: T.textMute,
    textTransform: 'uppercase', letterSpacing: rp(0.5), marginTop: rp(4),
  },
  slider: { width: '100%', height: rs(32) },
  actions: {
    flexDirection: 'row', gap: rp(10), marginTop: rp(16),
  },
  cancelBtn: {
    flex: 1, paddingVertical: rp(13), borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border,
  },
  cancelText: { fontSize: FONT.sm, fontWeight: '700', color: T.textMute },
  confirmBtn: {
    flex: 2, flexDirection: 'row', gap: rp(8),
    paddingVertical: rp(13), borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.primary,
  },
  confirmText: { fontSize: FONT.sm, fontWeight: '700', color: '#fff' },
});
