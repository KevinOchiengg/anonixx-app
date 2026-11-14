/** Hold-to-record voice notes: hold the mic to record, release to listen back, then send or bin.
 * send(uri, durationSeconds) uploads and sends it; it should throw if that fails. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import {
  useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';

export default function useVoiceNote({ send, showToast }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [preview, setPreview] = useState(null); // { uri, duration } waiting to be sent
  const [uploading, setUploading] = useState(false);
  const timer = useRef(null);
  const startedAt = useRef(0);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isRecording) { pulse.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  useEffect(() => () => clearInterval(timer.current), []);

  const stopTimer = () => { clearInterval(timer.current); timer.current = null; };

  const pressIn = useCallback(async () => {
    if (isRecording) return;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) { showToast({ type: 'warning', message: 'Allow the microphone to record.' }); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setIsRecording(true);
      setDuration(0);
      timer.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (e) {
      stopTimer();
      setIsRecording(false);
      showToast({ type: 'error', message: e?.message || 'Could not start recording.' });
    }
  }, [isRecording, recorder, showToast]);

  const pressOut = useCallback(async () => {
    if (!isRecording) return;
    stopTimer();
    const heldMs = Date.now() - startedAt.current;
    const seconds = duration;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (heldMs < 500) { showToast({ type: 'info', message: 'Hold the mic to record.' }); return; }
      if (!uri) { showToast({ type: 'error', message: 'Nothing was recorded.' }); return; }
      setPreview({ uri, duration: Math.max(1, seconds) });
    } catch {
      showToast({ type: 'error', message: 'Could not record that.' });
    } finally {
      setIsRecording(false);
      setDuration(0);
    }
  }, [isRecording, duration, recorder, showToast]);

  const sendPreview = useCallback(async () => {
    if (!preview || uploading) return;
    setUploading(true);
    try {
      await send(preview.uri, preview.duration);
      setPreview(null);
    } catch {
      showToast({ type: 'error', message: 'Could not send the voice note. Try again.' });
    } finally {
      setUploading(false);
    }
  }, [preview, uploading, send, showToast]);

  const discard = useCallback(() => setPreview(null), []);

  return { isRecording, duration, preview, uploading, pulse, pressIn, pressOut, sendPreview, discard };
}
