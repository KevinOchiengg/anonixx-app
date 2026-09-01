/**
 * VoiceNoteRecorder.jsx
 * WhatsApp-style hold-to-record mic button for comment inputs.
 *
 *   press and hold  → starts recording
 *   slide left      → arms cancel ("release to cancel")
 *   release         → uploads and sends immediately, no preview step
 *   30s             → auto-stops and sends
 *
 * Renders as the mic button itself (drop it straight into an input row);
 * while recording it floats a status pill above the button with a pulsing
 * dot, the elapsed timer, and the slide-to-cancel hint.
 *
 * 30s is short enough that holding a finger down is comfortable, which is
 * why there's no WhatsApp-style "lock" gesture here — by the time locking
 * would be worth it, the recording has already hit the cap.
 *
 * Uploads via /upload/audio (not the direct-Cloudinary /upload/sign path
 * DropsRecordScreen uses) because it returns Cloudinary's reported
 * duration, which the caller sends back for server-side validation.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Animated, Platform, PanResponder,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAudioRecorder, useAudioRecorderState, AudioModule, RecordingPresets,
} from 'expo-audio';
import { Mic, Trash2 } from 'lucide-react-native';
import { rs, rp, FONT, RADIUS } from '../../utils/responsive';
import { useToast } from '../ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

export const MAX_VOICE_NOTE_SECONDS = 30;

// How far left the finger has to travel before release means "throw it away"
const CANCEL_THRESHOLD = 80;

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function VoiceNoteRecorder({ onSend, disabled }) {
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

  useEffect(() => {
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) return;
        await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch {}
    })();
  }, []);

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
      const token = await AsyncStorage.getItem('token');
      const form  = new FormData();
      form.append('file', {
        uri,
        name: `voice-note.${Platform.OS === 'ios' ? 'm4a' : 'mp4'}`,
        type: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4',
      });
      const res = await fetch(`${API_BASE_URL}/api/v1/upload/audio`, {
        method:  'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body:    form,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      onSend({ url: data.url, duration: Math.round(data.duration || elapsed) });
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
    setElapsed(Math.min(MAX_VOICE_NOTE_SECONDS, secs));
    if (secs >= MAX_VOICE_NOTE_SECONDS) finishRef.current?.();
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

  const nearLimit = elapsed >= MAX_VOICE_NOTE_SECONDS - 5;

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
          styles.micBtn,
          recording && styles.micBtnActive,
          willCancel && styles.micBtnCancel,
        ]}
      >
        {uploading
          ? <ActivityIndicator size="small" color={T.primary} />
          : <Mic size={rs(17)} color={recording ? '#fff' : T.textMuted} />}
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
