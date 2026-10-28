/** Hold-to-record mic for comments: hold to record, slide left to cancel, release to send
 * (auto-sends at 30s). */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Animated, Platform, PanResponder,
} from 'react-native';
import {
  useAudioRecorder, useAudioRecorderState, AudioModule, RecordingPresets,
} from 'expo-audio';
import { Mic, Trash2 } from 'lucide-react-native';
import { rs, rp, FONT, RADIUS } from '../../utils/responsive';
import { useToast } from '../ui/Toast';
import { uploadViaBackend } from '../../utils/upload';
import T from '../../utils/theme';

export const MAX_VOICE_NOTE_SECONDS = 30;

// How far left the finger has to travel before release means "throw it away"
const CANCEL_THRESHOLD = 80;

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// maxSeconds: recording stops and sends itself here (a Knock's voice note is 15s).
export default function VoiceNoteRecorder({ onSend, disabled, compact, filled, maxSeconds = MAX_VOICE_NOTE_SECONDS }) {
  const { showToast } = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 100);

  const [recording,  setRecording]  = useState(false);
  const [willCancel, setWillCancel] = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [elapsed,    setElapsed]    = useState(0);

  const pulse  = useRef(new Animated.Value(0)).current;
  // PanResponder is created once, so everything it touches goes through refs
  // rather than captured state — otherwise it fires against a stale closure.
  const cancelRef    = useRef(false);
  const recordingRef = useRef(false);
  const startRef     = useRef(null);
  const finishRef    = useRef(null);

  // No permission request or audio-mode change on mount: that would prompt before the user
  // taps and break playback elsewhere. start() sets recording mode when needed.

  useEffect(() => {
    if (recording) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(0);
    }
  }, [recording, pulse]);

  const start = useCallback(async () => {
    if (disabled || recordingRef.current) return;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        showToast({ type: 'warning', message: 'Microphone access is needed to record.' });
        return;
      }
      cancelRef.current = false;
      setWillCancel(false);
      setElapsed(0);
      recordingRef.current = true;
      setRecording(true);
      // Playback (e.g. this same sheet's comment AudioPlayer) flips this back
      // to false before playing, so re-arm it before every recording.
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      recordingRef.current = false;
      setRecording(false);
      showToast({ type: 'error', message: 'Could not start recording.' });
    }
  }, [disabled, recorder, showToast]);

  const finish = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);

    let uri = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {}

    const cancelled = cancelRef.current;
    cancelRef.current = false;
    setWillCancel(false);

    // Too short to be intentional — treat a stray tap as a cancel rather
    // than firing off a half-second of silence.
    const tooShort = elapsed < 1;
    if (cancelled || tooShort || !uri) {
      if (tooShort && !cancelled) {
        showToast({ type: 'info', message: 'Hold to record.' });
      }
      setElapsed(0);
      return;
    }

    setUploading(true);
    try {
      const mimeType = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4';
      const url = await uploadViaBackend(uri, 'audio', mimeType);
      // No server-reported duration once uploads go through R2 (dumb
      // storage, no processing) — the recorder already tracked it live.
      onSend({ url, duration: Math.round(elapsed) });
    } catch {
      showToast({ type: 'error', message: 'Could not send voice note. Try again.' });
    } finally {
      setUploading(false);
      setElapsed(0);
    }
  }, [recorder, elapsed, onSend, showToast]);

  // Keep the refs pointing at the latest closures for the PanResponder.
  startRef.current  = start;
  finishRef.current = finish;

  useEffect(() => {
    if (!recording) return;
    const secs = (recState.durationMillis || 0) / 1000;
    setElapsed(Math.min(maxSeconds, secs));
    if (secs >= maxSeconds) finishRef.current?.();
  }, [recState.durationMillis, recording]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant:   () => { startRef.current?.(); },
      onPanResponderMove:    (_, g) => {
        const shouldCancel = g.dx < -CANCEL_THRESHOLD;
        if (shouldCancel !== cancelRef.current) {
          cancelRef.current = shouldCancel;
          setWillCancel(shouldCancel);
        }
      },
      onPanResponderRelease:   () => { finishRef.current?.(); },
      onPanResponderTerminate: () => { finishRef.current?.(); },
    }),
  ).current;

  const nearLimit = elapsed >= maxSeconds - 5;

  return (
    <View style={styles.wrap}>
      {recording && (
        <View style={[styles.pill, willCancel && styles.pillCancel]} pointerEvents="none">
          {willCancel ? (
            <>
              <Trash2 size={rs(13)} color={T.danger} />
              <Text style={[styles.pillText, { color: T.danger }]}>release to cancel</Text>
            </>
          ) : (
            <>
              <Animated.View style={[styles.recDot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />
              <Text style={[styles.pillTime, nearLimit && { color: T.danger }]}>
                {formatTime(elapsed)}
              </Text>
              <Text style={styles.pillHint}>‹ slide to cancel</Text>
            </>
          )}
        </View>
      )}

      <View
        {...pan.panHandlers}
        style={[
          filled ? styles.micBtnFilled : (compact ? styles.micBtnCompact : styles.micBtn),
          !filled && recording && (compact ? styles.micBtnCompactActive : styles.micBtnActive),
          willCancel && styles.micBtnCancel,
        ]}
      >
        {uploading
          ? <ActivityIndicator size="small" color={filled ? '#fff' : T.primary} />
          : (
            <Mic
              size={rs(filled ? 22 : (compact ? 20 : 17))}
              color={filled || recording ? '#fff' : (compact ? T.primary : T.textMuted)}
              strokeWidth={filled ? 2 : undefined}
            />
          )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  micBtn: {
    width: rs(36), height: rs(36), borderRadius: rs(18),
    backgroundColor: T.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.borderStrong,
  },
  micBtnActive: { backgroundColor: T.primary, borderColor: T.primary },
  micBtnCancel: { backgroundColor: T.danger, borderColor: T.danger },
  // Solid coral circle, matching the chat send button.
  micBtnFilled: {
    width: rs(44), height: rs(44), borderRadius: rs(22),
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: T.primary, shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  // Icon-only variant for use inside a text input.
  micBtnCompact: {
    width: rs(38), height: rs(38), borderRadius: rs(19),
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnCompactActive: { backgroundColor: T.primary },

  // Floats above the mic button while recording.
  pill: {
    position: 'absolute',
    bottom: rs(46),
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(8),
    paddingHorizontal: rp(12),
    paddingVertical: rp(8),
    borderRadius: RADIUS.full,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    minWidth: rs(190),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.4,
    shadowRadius: rs(10),
    elevation: 8,
  },
  pillCancel: { borderColor: T.danger, justifyContent: 'center' },
  recDot: {
    width: rs(8), height: rs(8), borderRadius: rs(4),
    backgroundColor: T.danger,
  },
  pillTime: { fontSize: FONT.sm, color: T.text, fontFamily: 'DMSans-Bold' },
  pillHint: { flex: 1, textAlign: 'right', fontSize: FONT.xs, color: T.textMuted, fontFamily: 'DMSans-Regular' },
  pillText: { fontSize: FONT.xs, fontFamily: 'DMSans-SemiBold' },
});
