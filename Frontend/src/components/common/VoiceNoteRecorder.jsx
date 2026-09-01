/**
 * VoiceNoteRecorder.jsx
 * Compact record → preview → send widget for voice-note attachments,
 * capped at 3 minutes. Reuses the expo-audio recorder pattern from
 * DropsRecordScreen.jsx but drops the waveform/speed-picker chrome —
 * this is a small inline attachment, not a full compose flow.
 *
 * Uploads via /upload/audio (not the direct-Cloudinary /upload/sign path
 * DropsRecordScreen uses) because it returns Cloudinary's reported
 * duration, which the caller needs for server-side duration validation.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAudioRecorder, useAudioRecorderState,
  useAudioPlayer, useAudioPlayerStatus,
  AudioModule, RecordingPresets,
} from 'expo-audio';
import { Mic, Square, Play, Pause, X, Send, RotateCcw } from 'lucide-react-native';
import { rs, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

export const MAX_VOICE_NOTE_SECONDS = 180;   // 3 minutes

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function VoiceNoteRecorder({ onSend, onCancel }) {
  const { showToast } = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 100);

  const [recordedUri, setRecordedUri] = useState(null);
  const [elapsed,     setElapsed]     = useState(0);
  const [uploading,   setUploading]   = useState(false);

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          showToast({ type: 'warning', message: 'Microphone access is needed to record.' });
          return;
        }
        await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch {}
    })();
  }, [showToast]);

  useEffect(() => {
    if (recState.isRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(0);
    }
  }, [recState.isRecording, pulse]);

  const handleStop = useCallback(async () => {
    try {
      await recorder.stop();
      if (recorder.uri) setRecordedUri(recorder.uri);
    } catch {
      showToast({ type: 'error', message: 'Recording stopped unexpectedly.' });
    }
  }, [recorder, showToast]);

  useEffect(() => {
    if (!recState.isRecording) return;
    setElapsed(Math.min(MAX_VOICE_NOTE_SECONDS, (recState.durationMillis || 0) / 1000));
    if ((recState.durationMillis || 0) >= MAX_VOICE_NOTE_SECONDS * 1000) handleStop();
  }, [recState.durationMillis, recState.isRecording, handleStop]);

  const handleStart = useCallback(async () => {
    try {
      setElapsed(0);
      setRecordedUri(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      showToast({ type: 'error', message: 'Could not start recording.' });
    }
  }, [recorder, showToast]);

  const handleRedo = useCallback(() => {
    setRecordedUri(null);
    setElapsed(0);
  }, []);

  const player       = useAudioPlayer(recordedUri ? { uri: recordedUri } : null);
  const playerStatus = useAudioPlayerStatus(player);

  const togglePlay = useCallback(() => {
    if (!recordedUri) return;
    if (playerStatus.playing) {
      player.pause();
    } else {
      if (playerStatus.currentTime >= (playerStatus.duration || 0) - 0.1) player.seekTo(0);
      player.play();
    }
  }, [recordedUri, player, playerStatus.playing, playerStatus.currentTime, playerStatus.duration]);

  const handleSend = useCallback(async () => {
    if (!recordedUri) return;
    setUploading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const form  = new FormData();
      form.append('file', {
        uri:  recordedUri,
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
      showToast({ type: 'error', message: 'Could not upload voice note. Try again.' });
    } finally {
      setUploading(false);
    }
  }, [recordedUri, elapsed, onSend, showToast]);

  const nearLimit = elapsed >= MAX_VOICE_NOTE_SECONDS - 20;

  return (
    <View style={styles.wrap}>
      {!recordedUri ? (
        <>
          <View style={styles.timerRow}>
            <Animated.View style={[
              styles.dot,
              recState.isRecording && {
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
              },
            ]} />
            <Text style={[styles.timerText, nearLimit && { color: T.primary }]}>
              {formatTime(elapsed)} / {formatTime(MAX_VOICE_NOTE_SECONDS)}
            </Text>
          </View>
          <View style={styles.controlsRow}>
            <TouchableOpacity onPress={onCancel} hitSlop={HIT_SLOP} style={styles.iconBtn}>
              <X size={rs(18)} color={T.textMuted} />
            </TouchableOpacity>
            {recState.isRecording ? (
              <TouchableOpacity onPress={handleStop} hitSlop={HIT_SLOP} style={[styles.recordBtn, styles.recordBtnActive]}>
                <Square size={rs(20)} color="#fff" fill="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleStart} hitSlop={HIT_SLOP} style={styles.recordBtn}>
                <Mic size={rs(22)} color="#fff" />
              </TouchableOpacity>
            )}
            <View style={styles.iconBtnGhost} />
          </View>
        </>
      ) : (
        <View style={styles.previewRow}>
          <TouchableOpacity onPress={togglePlay} hitSlop={HIT_SLOP} style={styles.playBtn}>
            {playerStatus.playing
              ? <Pause size={rs(16)} color="#fff" />
              : <Play size={rs(16)} color="#fff" />}
          </TouchableOpacity>
          <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={handleRedo} hitSlop={HIT_SLOP} style={styles.iconBtn}>
            <RotateCcw size={rs(16)} color={T.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSend} disabled={uploading} hitSlop={HIT_SLOP} style={styles.sendBtn}>
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Send size={rs(16)} color="#fff" />}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    padding:         SPACING.sm,
    gap:             rp(8),
  },
  timerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'center',
    gap:           rp(6),
  },
  dot: {
    width: rs(8), height: rs(8), borderRadius: rs(4),
    backgroundColor: T.primary,
  },
  timerText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize:   FONT.sm,
    color:      T.textSecondary,
  },
  controlsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: rs(34), height: rs(34), borderRadius: rs(17),
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnGhost: { width: rs(34), height: rs(34) },
  recordBtn: {
    width: rs(52), height: rs(52), borderRadius: rs(26),
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  recordBtnActive: { backgroundColor: '#c0392b' },
  previewRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(10),
  },
  playBtn: {
    width: rs(34), height: rs(34), borderRadius: rs(17),
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtn: {
    width: rs(34), height: rs(34), borderRadius: rs(17),
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
