import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { Mic, X, Send } from 'lucide-react-native';
import { useAudioRecorder, AudioQuality, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';

const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  error: '#ef4444',
};

export default function VoiceRecorder({ onSend, onCancel }) {
  const recorder = useAudioRecorder({ quality: AudioQuality.HIGH });
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const pulseAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      const interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        alert('Permission to access microphone is required!');
        return;
      }
      await setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch (err) { /* silent */ }
  };

  const stopRecording = async (shouldSend = false) => {
    setIsRecording(false);
    await recorder.stop();
    const uri = recorder.uri;
    if (shouldSend && uri) onSend(uri, duration);
    setDuration(0);
    onCancel();
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    startRecording();
    return () => {
      if (recorder.isRecording) recorder.stop();
    };
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.accentBar} />
      <View style={styles.container}>
        {/* Cancel Button */}
        <TouchableOpacity
          onPress={() => stopRecording(false)}
          style={styles.cancelButton}
          activeOpacity={0.7}
        >
          <X size={24} color={THEME.error} />
        </TouchableOpacity>

        {/* Recording Indicator */}
        <View style={styles.recordingContainer}>
          <Animated.View
            style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}
          >
            <Mic size={24} color="#ffffff" />
          </Animated.View>
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
          <Text style={styles.recordingLabel}>Recording...</Text>
        </View>

        {/* Send Button */}
        <TouchableOpacity
          onPress={() => stopRecording(true)}
          style={styles.sendButton}
          activeOpacity={0.7}
        >
          <Send size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    opacity: 0.6,
  },
  container: {
    backgroundColor: THEME.surfaceDark,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingLeft: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cancelButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 28,
    padding: 12,
    borderWidth: 2,
    borderColor: THEME.error,
  },
  recordingContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  pulseCircle: {
    backgroundColor: THEME.error,
    borderRadius: 28,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: THEME.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  durationText: {
    color: THEME.text,
    fontWeight: '700',
    fontSize: 20,
    marginBottom: 4,
  },
  recordingLabel: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  sendButton: {
    backgroundColor: THEME.primary,
    borderRadius: 28,
    padding: 12,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
});
