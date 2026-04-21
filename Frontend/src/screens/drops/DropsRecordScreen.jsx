/**
 * DropsRecordScreen.jsx
 *
 * Voice drop recorder — spec section 2 exact.
 *
 *   Recording view:
 *     • Red pulsing dot + timer "● 0:47 / 3:00"
 *     • Live waveform (coral) updates in real time
 *     • [■ Stop] [✕ Cancel] controls
 *     • Timer turns coral at 30 seconds remaining
 *     • Subtle pulse at 10 seconds remaining
 *     • Auto-stops at 3:00
 *     • Quiet prompt at bottom: "say it like nobody is listening."
 *
 *   Preview view (post-record):
 *     • Playback with final waveform
 *     • Scrub to seek
 *     • Speed picker: 0.75x · 1x · 1.5x
 *     • Three options: [Send] [Re-record] [Add text]
 *
 * Uses expo-audio hooks. Audio is uploaded via /upload/sign + Cloudinary video
 * endpoint (Cloudinary treats audio as the video resource type).
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, Animated, Platform,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAudioRecorder, useAudioRecorderState,
  useAudioPlayer,   useAudioPlayerStatus,
  AudioModule, RecordingPresets,
} from 'expo-audio';
import { useDispatch } from 'react-redux';
import {
  ChevronLeft, Globe, Lock, Mic, Pause, Play, RotateCcw, Send, Square,
  Type as TypeIcon,
} from 'lucide-react-native';

import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';
import { DROP_THEMES } from '../../components/drops/DropCardRenderer';

// ─── Theme tokens ──────────────────────────────────────────────
const T = {
  background: '#0b0f18',
  surface:    '#151924',
  primary:    '#FF634A',
  text:       '#EAEAF0',
  textSec:    '#9A9AA3',
  textMute:   '#4a4f62',
  border:     'rgba(255,255,255,0.06)',
  danger:     '#ef4444',
};

const SCREEN_W      = Dimensions.get('window').width;
const MAX_DURATION  = 180;      // seconds — spec: 3 minutes
const BAR_COUNT     = 120;      // spec section 1: 120 amplitude bars
const SPEEDS        = [0.75, 1, 1.5];

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ─── Waveform bar ──────────────────────────────────────────────
const WaveBar = React.memo(function WaveBar({ value, accent, played }) {
  const h = 4 + value * 44;
  return (
    <View
      style={{
        width:            rs(2),
        height:           rs(h),
        marginHorizontal: rs(0.5),
        borderRadius:     rs(1),
        backgroundColor:  played ? accent : accent,
        opacity:          played ? 1 : 0.25,
      }}
    />
  );
});

// ─── Recording dot (pulses while recording) ────────────────────
const RecordingDot = React.memo(function RecordingDot({ visible, pulse }) {
  if (!visible) return null;
  return (
    <Animated.View
      style={[
        styles.redDot,
        {
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
          opacity:    pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
        },
      ]}
    />
  );
});

// ─── Screen ────────────────────────────────────────────────────
export default function DropsRecordScreen({ navigation, route }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();

  const theme     = route?.params?.theme   || 'cinematic-coral';
  const moodTag   = route?.params?.moodTag || 'longing';
  const themeObj  = DROP_THEMES[theme] || DROP_THEMES['cinematic-coral'];
  const accent    = themeObj.accent;

  // ── Recorder ──────────────────────────────────────────────────
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, 100);
  const recState = useAudioRecorderState(recorder);

  // ── State ─────────────────────────────────────────────────────
  const [recordedUri, setRecordedUri]     = useState(null);
  const [elapsed,     setElapsed]         = useState(0);
  const [uploading,   setUploading]       = useState(false);
  const [levels,      setLevels]          = useState(() => new Array(BAR_COUNT).fill(0));
  const [capturedLevels, setCapturedLevels] = useState(null);  // frozen snapshot post-record
  const [caption,     setCaption]         = useState(route?.params?.text || '');
  const [showCaption, setShowCaption]     = useState(!!route?.params?.text);
  const [speed,       setSpeed]           = useState(1);

  // Anonixx Publisher opt-in (section 16). Voice drops route through
  // DropsPublishScreen for the extra "they'll hear your voice" consent.
  // Tier-2 themes are refused upstream.
  const [publisherOptIn, setPublisherOptIn] = useState(false);
  const isTier2 = themeObj.tier === 2;

  // ── Animations ────────────────────────────────────────────────
  const redPulse    = useRef(new Animated.Value(0)).current;
  const urgentPulse = useRef(new Animated.Value(0)).current;
  const heartbeat   = useRef(new Animated.Value(1)).current;

  // Red dot pulses during recording
  useEffect(() => {
    if (recState.isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(redPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(redPulse, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      redPulse.stopAnimation();
      redPulse.setValue(0);
    }
  }, [recState.isRecording, redPulse]);

  // Heartbeat pulse on play button when paused (spec: "faint heartbeat pulse")
  useEffect(() => {
    if (recordedUri) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(heartbeat, { toValue: 1.04, duration: 900, useNativeDriver: true }),
          Animated.timing(heartbeat, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      heartbeat.stopAnimation();
      heartbeat.setValue(1);
    }
  }, [recordedUri, heartbeat]);

  // ── Permissions + audio mode on mount ─────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          showToast({ type: 'warning', message: 'Microphone access is needed to record.' });
          return;
        }
        await AudioModule.setAudioModeAsync({
          allowsRecording:   true,
          playsInSilentMode: true,
        });
      } catch {
        /* permission flow cancelled */
      }
    })();
  }, [showToast]);

  // ── Elapsed + live waveform samples while recording ───────────
  useEffect(() => {
    if (!recState.isRecording) return;
    const sec = Math.min(MAX_DURATION, (recState.durationMillis || 0) / 1000);
    setElapsed(sec);

    if (typeof recState.metering === 'number') {
      const normalized = Math.max(0, Math.min(1, (recState.metering + 60) / 60));
      setLevels((prev) => {
        const next = prev.slice(1);
        next.push(normalized);
        return next;
      });
    }

    // Auto-stop at MAX
    if ((recState.durationMillis || 0) >= MAX_DURATION * 1000) {
      handleStop();
    }
  }, [recState.durationMillis, recState.metering, recState.isRecording]); // eslint-disable-line

  // ── Start / stop / cancel ─────────────────────────────────────
  const handleStart = useCallback(async () => {
    try {
      setLevels(new Array(BAR_COUNT).fill(0));
      setCapturedLevels(null);
      setElapsed(0);
      setRecordedUri(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      showToast({ type: 'error', message: 'Could not start recording.' });
    }
  }, [recorder, showToast]);

  const handleStop = useCallback(async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setCapturedLevels(levels.slice());    // freeze for playback render
      if (uri) setRecordedUri(uri);
    } catch {
      showToast({ type: 'error', message: 'Recording stopped unexpectedly.' });
    }
  }, [recorder, levels, showToast]);

  const handleCancel = useCallback(async () => {
    try { await recorder.stop(); } catch {}
    navigation.goBack();
  }, [recorder, navigation]);

  const handleRedo = useCallback(() => {
    setRecordedUri(null);
    setCapturedLevels(null);
    setLevels(new Array(BAR_COUNT).fill(0));
    setElapsed(0);
    setPublisherOptIn(false); // a re-record invalidates any previous consent
  }, []);

  // Publisher opt-in — voice always goes through the double-consent screen
  // because the acknowledgement copy is different ("people will hear your voice").
  const handlePublisherAsk = useCallback(() => {
    if (isTier2) return; // UI already hidden for tier-2; belt-and-suspenders
    navigation.navigate?.('DropsPublish', {
      format:  'voice',
      theme,
      preview: caption?.trim() || '',
      onConfirmed: (ok) => setPublisherOptIn(!!ok),
    });
  }, [isTier2, navigation, theme, caption]);

  const handlePublisherNo = useCallback(() => {
    setPublisherOptIn(false);
  }, []);

  // ── Playback ──────────────────────────────────────────────────
  const player       = useAudioPlayer(recordedUri ? { uri: recordedUri } : null);
  const playerStatus = useAudioPlayerStatus(player);

  // Apply speed when user picks
  useEffect(() => {
    if (!player || !recordedUri) return;
    try { player.setPlaybackRate?.(speed); } catch {}
  }, [player, speed, recordedUri]);

  const togglePlay = useCallback(() => {
    if (!recordedUri) return;
    if (playerStatus.playing) {
      player.pause();
    } else {
      if (playerStatus.currentTime >= (playerStatus.duration || 0) - 0.1) {
        player.seekTo(0);
      }
      player.play();
    }
  }, [recordedUri, player, playerStatus.playing, playerStatus.currentTime, playerStatus.duration]);

  // ── Upload + create drop ──────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!recordedUri) return;
    setUploading(true);

    try {
      const token = await AsyncStorage.getItem('token');

      // 1. Sign
      const signRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ resource_type: 'video' }),
      });
      if (!signRes.ok) {
        const err = await signRes.json().catch(() => ({}));
        throw new Error(err?.detail || `Upload sign failed (${signRes.status})`);
      }
      const { signature, timestamp, api_key, cloud_name, folder } = await signRes.json();

      // 2. Upload
      const form = new FormData();
      form.append('file', {
        uri:  recordedUri,
        name: `voice-drop.${Platform.OS === 'ios' ? 'm4a' : 'mp4'}`,
        type: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4',
      });
      form.append('api_key',   api_key);
      form.append('timestamp', String(timestamp));
      form.append('signature', signature);
      form.append('folder',    folder);

      const upRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
        { method: 'POST', body: form },
      );
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData?.error?.message || `Upload failed (${upRes.status})`);

      // 3. Create drop
      const body = {
        category:   'love',
        media_url:  upData.secure_url,
        media_type: 'voice',
        theme,
        mood_tag:   moodTag,
        duration_seconds: Math.round(playerStatus.duration || elapsed),
        waveform_data:    (capturedLevels || levels).slice(),
        confession:       caption?.trim() || undefined,
        // Publisher opt-in is forced off for Tier 2 (After Dark never leaves).
        publisher_opt_in: isTier2 ? false : !!publisherOptIn,
      };

      const dropRes = await fetch(`${API_BASE_URL}/api/v1/drops`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (dropRes.status === 429) {
        // Server-enforced daily cap — surface copy, keep the recording so
        // they can come back tomorrow and send it without re-recording.
        const err = await dropRes.json().catch(() => ({}));
        showToast({
          type:    'warning',
          title:   'Daily limit reached',
          message: err?.detail || 'Come back tomorrow. The quiet helps.',
        });
        return;
      }
      if (!dropRes.ok) {
        const err = await dropRes.json().catch(() => ({}));
        throw new Error(err?.detail || `Server error ${dropRes.status}`);
      }
      const dropData = await dropRes.json();
      const newDropId = dropData?.id;

      // Voice publishing: follow up with the dedicated publish endpoint to
      // insert into publisher_queue. Non-fatal — the drop is saved either way.
      if (newDropId && !isTier2 && publisherOptIn) {
        try {
          const pubRes = await fetch(`${API_BASE_URL}/api/v1/drops/${newDropId}/publish`, {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ confirmed: true }),
          });
          if (!pubRes.ok) {
            showToast({
              type:    'info',
              message: "Saved — but we couldn't queue it for social yet.",
            });
          }
        } catch {
          /* non-fatal */
        }
      }

      showToast({
        type:    'success',
        title:   'Your voice is on its way.',
        message: 'They\'ll hear it — unnamed.',
      });
      dispatch(awardMilestone('first_drop'));

      navigation.navigate?.('DropLanding', { dropId: newDropId });
    } catch (err) {
      showToast({
        type:    'error',
        message: err?.message || 'Could not send your voice drop.',
      });
    } finally {
      setUploading(false);
    }
  }, [
    recordedUri, theme, moodTag, caption, elapsed,
    capturedLevels, levels, playerStatus.duration,
    publisherOptIn, isTier2,
    dispatch, navigation, showToast,
  ]);

  // ── Derived ───────────────────────────────────────────────────
  const isRecording  = recState.isRecording;
  const hasRecording = !!recordedUri;
  const playing      = playerStatus.playing;
  const playheadSec  = playerStatus.currentTime || 0;
  const playerDur    = playerStatus.duration || elapsed || MAX_DURATION;
  const remainingSec = Math.max(0, MAX_DURATION - elapsed);
  const isUrgent     = remainingSec <= 30 && remainingSec > 0;
  const isCritical   = remainingSec <= 10 && remainingSec > 0;

  // Display levels — live while recording, frozen snapshot during playback
  const displayLevels = hasRecording ? (capturedLevels || levels) : levels;
  const progressRatio = hasRecording ? Math.min(1, playheadSec / (playerDur || 1)) : 0;

  // ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} hitSlop={HIT_SLOP}>
            <ChevronLeft size={rs(24)} color={T.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Voice Drop</Text>
          <View style={{ width: rs(24) }} />
        </View>

        {/* Context strip */}
        <View style={styles.contextStrip}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={styles.contextText}>
            {themeObj.label.toLowerCase()} · {moodTag}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Timer row */}
          <View style={styles.timerRow}>
            <RecordingDot visible={isRecording} pulse={redPulse} />
            <Text style={[
              styles.timer,
              isUrgent && { color: accent },
              isCritical && styles.timerCritical,
            ]}>
              {formatTime(hasRecording ? (playing ? playheadSec : elapsed) : elapsed)}
              <Text style={styles.timerMax}>  /  {formatTime(MAX_DURATION)}</Text>
            </Text>
          </View>

          {/* Waveform — scrubbable during playback */}
          <TouchableOpacity
            activeOpacity={hasRecording ? 0.7 : 1}
            disabled={!hasRecording}
            onPress={(e) => {
              if (!hasRecording) return;
              const x = e.nativeEvent.locationX;
              const w = SCREEN_W - SPACING.md * 2;
              const ratio = Math.max(0, Math.min(1, x / w));
              player.seekTo(ratio * (playerDur || 0));
            }}
            style={styles.waveformWrap}
          >
            {displayLevels.map((v, i) => {
              const barRatio = i / BAR_COUNT;
              const played   = hasRecording && barRatio <= progressRatio;
              return <WaveBar key={i} value={v} accent={accent} played={played} />;
            })}
          </TouchableOpacity>

          {/* Optional caption */}
          {showCaption ? (
            <View style={styles.captionWrap}>
              <TextInput
                style={styles.captionInput}
                value={caption}
                onChangeText={setCaption}
                placeholder="Add one line. It makes the silence before they tap more powerful."
                placeholderTextColor={T.textMute}
                multiline
                maxLength={200}
                autoCapitalize="sentences"
                autoCorrect
              />
            </View>
          ) : null}

          {/* Controls */}
          <View style={styles.controls}>
            {!hasRecording ? (
              // Recording controls
              <View style={styles.recordRow}>
                <TouchableOpacity
                  style={styles.ghostBtn}
                  onPress={handleCancel}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.recordBtn,
                    { backgroundColor: isRecording ? T.danger : accent },
                  ]}
                  onPress={isRecording ? handleStop : handleStart}
                  activeOpacity={0.85}
                >
                  {isRecording
                    ? <Square size={rs(22)} color="#fff" fill="#fff" />
                    : <Mic size={rs(28)} color="#fff" />
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.ghostBtn}
                  onPress={() => setShowCaption(v => !v)}
                  hitSlop={HIT_SLOP}
                >
                  <TypeIcon size={rs(14)} color={showCaption ? accent : T.textSec} />
                  <Text style={[
                    styles.ghostBtnText,
                    showCaption && { color: accent },
                  ]}>
                    {showCaption ? 'Text on' : 'Add text'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Preview controls
              <View style={styles.reviewRow}>
                <TouchableOpacity
                  style={styles.sideBtn}
                  onPress={handleRedo}
                  hitSlop={HIT_SLOP}
                >
                  <RotateCcw size={rs(18)} color={T.textSec} />
                  <Text style={styles.sideBtnText}>Re-record</Text>
                </TouchableOpacity>

                <Animated.View style={{ transform: [{ scale: heartbeat }] }}>
                  <TouchableOpacity
                    style={[styles.playBtn, { backgroundColor: accent }]}
                    onPress={togglePlay}
                    activeOpacity={0.85}
                  >
                    {playing
                      ? <Pause size={rs(22)} color="#fff" fill="#fff" />
                      : <Play  size={rs(22)} color="#fff" fill="#fff" />
                    }
                  </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity
                  style={styles.sideBtn}
                  onPress={() => setShowCaption(v => !v)}
                  hitSlop={HIT_SLOP}
                >
                  <TypeIcon size={rs(18)} color={showCaption ? accent : T.textSec} />
                  <Text style={[
                    styles.sideBtnText,
                    showCaption && { color: accent },
                  ]}>
                    {showCaption ? 'Text on' : 'Add text'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Playback speed picker */}
          {hasRecording && (
            <View style={styles.speedRow}>
              {SPEEDS.map((sp) => {
                const active = speed === sp;
                return (
                  <TouchableOpacity
                    key={sp}
                    style={[styles.speedChip, active && { borderColor: accent }]}
                    onPress={() => setSpeed(sp)}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={[
                      styles.speedChipText,
                      active && { color: accent, fontFamily: 'DMSans-Bold' },
                    ]}>
                      {sp}x
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Hint copy */}
          <Text style={styles.hint}>
            {isRecording
              ? 'say it like nobody is listening.'
              : hasRecording
                ? 'Listen. If it\'s honest, send it.'
                : 'Tap to start. Up to 3:00.'}
          </Text>

          {/* Anonixx Publisher opt-in (section 16) — voice only, after preview */}
          {hasRecording && !isTier2 && (
            <View style={styles.publisherBox}>
              <Text style={styles.publisherQ}>
                Allow Anonixx to share this voice anonymously on our social pages?
              </Text>
              <View style={styles.publisherRow}>
                <TouchableOpacity
                  style={[
                    styles.publisherBtn,
                    publisherOptIn && { borderColor: accent, backgroundColor: 'rgba(255,99,74,0.12)' },
                  ]}
                  onPress={handlePublisherAsk}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Globe size={rs(13)} color={publisherOptIn ? accent : T.textMute} />
                  <Text style={[
                    styles.publisherBtnText,
                    publisherOptIn && { color: accent, fontFamily: 'DMSans-Bold' },
                  ]}>
                    {publisherOptIn ? 'Yes — confirmed' : 'Yes'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.publisherBtn,
                    !publisherOptIn && { borderColor: 'rgba(255,255,255,0.25)' },
                  ]}
                  onPress={handlePublisherNo}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Lock size={rs(13)} color={T.textSec} />
                  <Text style={styles.publisherBtnText}>No — keep private</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.publisherNote}>
                Your identity never leaves Anonixx. Your voice will.
              </Text>
            </View>
          )}
          {hasRecording && isTier2 && (
            <View style={styles.publisherBox}>
              <Text style={styles.publisherLocked}>
                After Dark voice drops stay inside Anonixx. Never published, never shared.
              </Text>
            </View>
          )}

          {/* Send */}
          {hasRecording && (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: accent }, uploading && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Send size={rs(16)} color="#fff" />
                    <Text style={styles.sendBtnText}>Send</Text>
                  </>
                )
              }
            </TouchableOpacity>
          )}

          <Text style={styles.footer}>
            Your voice, un-named. Anonixx scrubs everything but the sound.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.5,
  },

  contextStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(8),
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(8),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  dot: { width: rs(6), height: rs(6), borderRadius: rs(3) },
  contextText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 2,
  },

  body: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.lg,
    paddingBottom:     SPACING.xl,
    alignItems:        'center',
  },

  // Timer
  timerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(10),
    marginBottom:  SPACING.md,
  },
  redDot: {
    width:           rs(10),
    height:          rs(10),
    borderRadius:    rs(5),
    backgroundColor: T.danger,
  },
  timer: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(42),
    color:         T.text,
    letterSpacing: 1,
  },
  timerMax: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(14),
    color:      T.textMute,
    letterSpacing: 1,
  },
  timerCritical: {
    // The spec calls for a "subtle pulse" at <=10s; we signal it visually
    // by a brighter accent color swap (already applied via isUrgent)
    // plus a slight textShadow glow here.
    textShadowColor:  'rgba(255,99,74,0.45)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },

  // Waveform
  waveformWrap: {
    height:         rs(64),
    width:          SCREEN_W - SPACING.md * 2,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.md,
  },

  // Caption
  captionWrap: {
    width:             SCREEN_W - SPACING.md * 2,
    backgroundColor:   T.surface,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(10),
    marginBottom:      SPACING.md,
  },
  captionInput: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(15),
    color:         T.text,
    lineHeight:    rf(22),
    minHeight:     rs(44),
    letterSpacing: 0.3,
    paddingVertical: 0,
  },

  // Recording controls
  controls: {
    marginTop:    SPACING.sm,
    marginBottom: SPACING.md,
  },
  recordRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            SPACING.md,
    width:          rs(280),
  },
  recordBtn: {
    width:          rs(92),
    height:         rs(92),
    borderRadius:   rs(46),
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: rs(6) },
    shadowOpacity:  0.45,
    shadowRadius:   rs(14),
    elevation:      8,
  },
  ghostBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(5),
    paddingHorizontal: rp(10),
    paddingVertical:   rp(8),
  },
  ghostBtnText: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(12),
    color:      T.textSec,
    letterSpacing: 0.5,
  },

  // Preview controls
  reviewRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            SPACING.md,
    width:          rs(280),
  },
  playBtn: {
    width:          rs(80),
    height:         rs(80),
    borderRadius:   rs(40),
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: rs(4) },
    shadowOpacity:  0.35,
    shadowRadius:   rs(12),
    elevation:      6,
  },
  sideBtn: {
    width:      rs(80),
    alignItems: 'center',
    gap:        rp(4),
  },
  sideBtnText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.5,
  },

  // Speed
  speedRow: {
    flexDirection: 'row',
    gap:           rp(10),
    marginTop:     SPACING.sm,
    marginBottom:  SPACING.md,
  },
  speedChip: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(6),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
  },
  speedChipText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(12),
    color:         T.textSec,
    letterSpacing: 0.5,
  },

  // Hint
  hint: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(12),
    color:         T.textMute,
    textAlign:     'center',
    marginTop:     SPACING.sm,
    letterSpacing: 0.3,
  },

  // Publisher opt-in (section 16)
  publisherBox: {
    width:             SCREEN_W - SPACING.md * 2,
    backgroundColor:   'rgba(255,255,255,0.02)',
    borderColor:       T.border,
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    marginTop:         SPACING.md,
  },
  publisherQ: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(12),
    color:         T.text,
    letterSpacing: 0.3,
    lineHeight:    rf(18),
    marginBottom:  rp(10),
  },
  publisherRow: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    flexWrap:      'wrap',
  },
  publisherBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'transparent',
  },
  publisherBtnText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.5,
  },
  publisherNote: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.3,
    marginTop:     rp(8),
  },
  publisherLocked: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.3,
    lineHeight:    rf(18),
  },

  // Send
  sendBtn: {
    marginTop:         SPACING.xl,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               rp(8),
    height:            BUTTON_HEIGHT,
    paddingHorizontal: rs(40),
    borderRadius:      RADIUS.full,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: rs(4) },
    shadowOpacity:     0.45,
    shadowRadius:      rs(14),
    elevation:         6,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.5,
  },

  footer: {
    fontFamily:     'DMSans-Italic',
    fontSize:       rf(10),
    color:          T.textMute,
    textAlign:      'center',
    marginTop:      SPACING.lg,
    paddingHorizontal: SPACING.md,
    letterSpacing:  0.5,
  },
});
