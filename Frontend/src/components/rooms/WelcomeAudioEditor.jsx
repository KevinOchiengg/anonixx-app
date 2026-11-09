/** Welcome audio for a Room: record (tap to start, tap to stop, up to MAX_SECONDS) or pick an
 * audio file, listen back, then save; or replace / remove the saved one. Uploads to R2 and
 * saves with PUT /chat-profile/me { welcome_audio_url, welcome_audio_seconds }. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { FileAudio, Mic, Square, Trash2 } from 'lucide-react-native';
import { rs, rf, rp, RADIUS, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import VoiceWaveform from '../common/VoiceWaveform';
import { uploadToR2 } from '../../utils/upload';
import { useToast } from '../ui/Toast';

export const MAX_SECONDS = 60;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** saved: { url, seconds } | null. onSave(url, seconds) / onRemove() persist it and resolve. */
export default function WelcomeAudioEditor({ saved, onSave, onRemove }) {
  const { showToast } = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [draft, setDraft] = useState(null);   // { uri, seconds, type } not saved yet
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const secsRef = useRef(0);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => {
    if (!recording) { pulse.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [recording, pulse]);

  const stop = useCallback(async () => {
    clearInterval(timer.current);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      setRecording(false);
      const s = secsRef.current;
      if (s < 2) showToast({ type: 'info', message: 'A little longer: at least 2 seconds.' });
      else if (recorder.uri) setDraft({ uri: recorder.uri, seconds: s, type: 'audio/m4a' });
    } catch {
      setRecording(false);
      showToast({ type: 'error', message: 'Recording stopped unexpectedly. Try again.' });
    }
  }, [recorder, showToast]);

  const start = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        showToast({ type: 'warning', message: 'Allow the microphone for Anonixx in Settings to record a welcome.' });
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setDraft(null);
      setSecs(0);
      secsRef.current = 0;
      setRecording(true);
      timer.current = setInterval(() => {
        secsRef.current += 1;
        setSecs(secsRef.current);
        if (secsRef.current >= MAX_SECONDS) stop();
      }, 1000);
    } catch {
      showToast({ type: 'error', message: 'Could not start recording.' });
    }
  }, [recorder, stop, showToast]);

  const pick = useCallback(async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 8 * 1024 * 1024) {
      showToast({ type: 'warning', message: 'That file is too big. Keep it under 8 MB and a minute long.' });
      return;
    }
    // The player reports the real length; we save without one if it's unknown.
    setDraft({ uri: a.uri, seconds: null, type: a.mimeType || 'audio/mpeg' });
  }, [showToast]);

  const save = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const url = await uploadToR2(draft.uri, 'audio', draft.type);
      await onSave(url, draft.seconds);
      setDraft(null);
      showToast({ type: 'success', message: 'Welcome audio saved.' });
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not save the audio.' });
    } finally {
      setBusy(false);
    }
  }, [draft, onSave, showToast]);

  const remove = useCallback(async () => {
    setBusy(true);
    try { await onRemove(); } catch (e) { showToast({ type: 'error', message: e?.message || 'Could not remove it.' }); } finally { setBusy(false); }
  }, [onRemove, showToast]);

  if (recording) {
    return (
      <View style={[s.box, s.boxRec]}>
        <Animated.View style={[s.dot, { opacity: pulse }]} />
        <Text style={s.timer}>{fmt(secs)}</Text>
        <Text style={s.hint}>of {fmt(MAX_SECONDS)}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={s.stop} onPress={stop} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Stop recording">
          <Square size={rs(16)} color="#fff" fill="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  const current = draft ? { uri: draft.uri, seconds: draft.seconds } : saved?.url ? { uri: saved.url, seconds: saved.seconds } : null;
  return (
    <View style={s.box}>
      {current ? (
        <>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <VoiceWaveform key={current.uri} uri={current.uri} durationSeconds={current.seconds || 0} compact />
            </View>
            {!draft ? (
              <TouchableOpacity onPress={remove} disabled={busy} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Remove welcome audio">
                <Trash2 size={rs(18)} color={T.textMute} />
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={s.hint}>{draft ? 'Listen back. Save it, or record again.' : 'Your welcome audio. Visitors can replay it any time.'}</Text>
          <View style={s.row}>
            <TouchableOpacity style={s.ghost} onPress={start} disabled={busy}><Mic size={rs(14)} color={T.text} /><Text style={s.ghostText}>{draft ? 'Record again' : 'Replace'}</Text></TouchableOpacity>
            {draft ? (
              <>
                <TouchableOpacity style={s.ghost} onPress={() => setDraft(null)} disabled={busy}><Text style={s.ghostText}>Discard</Text></TouchableOpacity>
                <TouchableOpacity style={s.primary} onPress={save} disabled={busy}>
                  {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.primaryText}>Save</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={s.ghost} onPress={pick} disabled={busy}><FileAudio size={rs(14)} color={T.text} /><Text style={s.ghostText}>Upload a file</Text></TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <>
          <Text style={s.hint}>Say hello in your own voice, up to a minute. It's the first thing they hear.</Text>
          <View style={s.row}>
            <TouchableOpacity style={s.primary} onPress={start} accessibilityRole="button">
              <Mic size={rs(15)} color="#fff" /><Text style={s.primaryText}>Record</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghost} onPress={pick}><FileAudio size={rs(14)} color={T.text} /><Text style={s.ghostText}>Upload a file</Text></TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: rp(10), padding: rp(14), borderRadius: RADIUS.lg, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  boxRec: { flexDirection: 'row', alignItems: 'center', borderColor: T.primaryBorder, backgroundColor: T.primaryTint },
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(10) },
  dot: { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: T.primary },
  timer: { fontFamily: 'DMSans-Bold', fontSize: rf(18), color: T.text, fontVariant: ['tabular-nums'] },
  hint: { fontFamily: 'DMSans-Regular', fontSize: rf(12.5), color: T.textSecondary, lineHeight: rf(17) },
  stop: { width: rs(44), height: rs(44), borderRadius: rs(22), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  primary: { flexDirection: 'row', gap: rp(6), height: rs(40), paddingHorizontal: rp(16), borderRadius: 999, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: '#fff' },
  ghost: { flexDirection: 'row', gap: rp(6), height: rs(40), paddingHorizontal: rp(14), borderRadius: 999, borderWidth: 1, borderColor: T.borderStrong, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(13.5), color: T.text },
});
