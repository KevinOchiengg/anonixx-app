/** Audio drop: pick an audio file, preview it with seek and speed, then send, swap it or add text. */
import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, Animated,
  KeyboardAvoidingView, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus, AudioModule } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useDispatch } from 'react-redux';
import {
  Globe, Images, Lock, Pause, Play, RotateCcw, Send, Upload,
  Type as TypeIcon, X,
} from 'lucide-react-native';

import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';
import { uploadToR2 } from '../../utils/upload';
import { DROP_THEMES, CARD_INTENTS } from '../../components/drops/DropCardRenderer';
import { T } from '../../utils/colorTokens';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useAuth } from '../../context/AuthContext';

const SCREEN_W      = Dimensions.get('window').width;
const MAX_MB        = 10;
const BAR_COUNT     = 120;
const SPEEDS        = [0.75, 1, 1.5];

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Decorative bars, steady for a given file.
const barsFor = (seed) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    const wave = 0.35 + 0.3 * Math.sin(i / 6) * Math.sin(i / 17);
    return Math.max(0.08, Math.min(1, wave + ((h % 1000) / 1000 - 0.5) * 0.5));
  });
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

// ─── Screen ────────────────────────────────────────────────────
export default function DropsRecordScreen({ navigation, route }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const { isAuthenticated } = useAuth();

  // Reachable directly via anonixx://drops/voice — guards guests who land
  // here via deep link, bypassing DropsComposeScreen's own guard.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        navigation.navigate('AuthNav', { screen: 'Login' });
      }
    }, [isAuthenticated, navigation])
  );

  const theme        = route?.params?.theme    || 'desire';
  const cardIntent   = route?.params?.cardIntent || 'skeleton-in-the-closet';
  const moodTag      = route?.params?.moodTag  || 'longing';
  const targetUserId = route?.params?.target_user_id || undefined;
  // Confession type owns the palette (same as the compose preview and the
  // rendered card) — theme is the legacy fallback and is always 'desire' now.
  const themeObj  = CARD_INTENTS[cardIntent] || DROP_THEMES[theme] || DROP_THEMES['desire'];
  const accent    = themeObj.accent;

  // ── State ─────────────────────────────────────────────────────
  const [recordedUri, setRecordedUri]     = useState(null);
  const [audioFile,   setAudioFile]       = useState(null);   // { name, mime }
  const [uploading,   setUploading]       = useState(false);
  const [levels,      setLevels]          = useState(() => new Array(BAR_COUNT).fill(0.08));
  const [caption,     setCaption]         = useState(route?.params?.text || '');
  const [showCaption, setShowCaption]     = useState(!!route?.params?.text);
  const [speed,       setSpeed]           = useState(1);

  // Anonixx Publisher opt-in (section 16). Voice drops route through
  // DropsPublishScreen for the extra "they'll hear your voice" consent.
  const [publisherOptIn, setPublisherOptIn] = useState(false);

  // Supporting photo — optional, supplements the voice note the same way
  // DropsComposeScreen's attach button supplements the confession text.
  const [imageUri, setImageUri] = useState(null);

  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Gallery access is needed.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        legacy: true,   // Android: pick straight from Gallery / Files, not the Google Photos picker
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (result.canceled) return;
      setImageUri(result.assets[0].uri);
    } catch {
      showToast({ type: 'error', message: 'Could not open gallery.' });
    }
  }, [showToast]);

  const handleClearImage = useCallback(() => setImageUri(null), []);

  // ── Animations ────────────────────────────────────────────────
  const heartbeat   = useRef(new Animated.Value(1)).current;

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

  // ── Pick / cancel / swap ──────────────────────────────────────
  const handlePick = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (a.size && a.size > MAX_MB * 1024 * 1024) {
        showToast({ type: 'warning', message: `That file is over ${MAX_MB} MB.` });
        return;
      }
      const mime = a.mimeType && a.mimeType.startsWith('audio/') ? a.mimeType : 'audio/mpeg';
      setAudioFile({ name: a.name || 'Audio', mime });
      setLevels(barsFor(a.name || a.uri));
      setRecordedUri(a.uri);
      setPublisherOptIn(false);
    } catch {
      showToast({ type: 'error', message: 'Could not open your files.' });
    }
  }, [showToast]);

  const handleCancel = useCallback(() => navigation.goBack(), [navigation]);

  const handleRedo = useCallback(() => {
    setRecordedUri(null);
    setAudioFile(null);
    setLevels(new Array(BAR_COUNT).fill(0.08));
    setPublisherOptIn(false);
  }, []);

  // Publisher opt-in — voice always goes through the double-consent screen
  // because the acknowledgement copy is different ("people will hear your voice").
  const handlePublisherAsk = useCallback(() => {
    navigation.navigate?.('DropsPublish', {
      format:  'voice',
      theme,
      preview: caption?.trim() || '',
      onConfirmed: (ok) => setPublisherOptIn(!!ok),
    });
  }, [navigation, theme, caption]);

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

  const togglePlay = useCallback(async () => {
    if (!recordedUri) return;
    if (playerStatus.playing) {
      player.pause();
      return;
    }
    try {
      // Leave recording mode before playback, or audio goes to the earpiece / fails.
      await AudioModule.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {}
    if (playerStatus.currentTime >= (playerStatus.duration || 0) - 0.1) {
      player.seekTo(0);
    }
    player.play();
  }, [recordedUri, player, playerStatus.playing, playerStatus.currentTime, playerStatus.duration]);

  // ── Upload + create drop ──────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!recordedUri) return;
    setUploading(true);

    try {
      const token = await AsyncStorage.getItem('token');

      // 1. Upload the audio file to R2
      const voiceUrl = await uploadToR2(recordedUri, 'audio', audioFile?.mime || 'audio/mpeg');

      // 2. Optional supporting photo — separate upload since media_url
      // above is already taken by the voice recording itself.
      let uploadedImageUrl = null;
      if (imageUri) {
        uploadedImageUrl = await uploadToR2(imageUri, 'image', 'image/jpeg');
      }

      // 3. Create drop
      const body = {
        media_url:  voiceUrl,
        media_type: 'voice',
        ...(uploadedImageUrl ? { image_url: uploadedImageUrl } : {}),
        theme,
        intent:     cardIntent,   // drives the card's palette/pattern
        mood_tag:   moodTag,
        duration_seconds: Math.round(playerStatus.duration || 0) || undefined,
        confession:       caption?.trim() || undefined,
        publisher_opt_in: !!publisherOptIn,
        // Tag a specific user — carried over from the compose screen when
        // the user tagged someone before switching to Voice format.
        ...(targetUserId ? { target_user_id: targetUserId } : {}),
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
      if (newDropId && publisherOptIn) {
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
        title:   'Your audio is on its way.',
        message: 'They\'ll hear it, unnamed.',
      });
      dispatch(awardMilestone('first_drop'));

      // Land back in the main feed — the voice drop shows up there as a
      // genuine post now (see create_drop's post-mirroring on the backend).
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err) {
      showToast({
        type:    'error',
        message: err?.message || 'Could not send your audio drop.',
      });
    } finally {
      setUploading(false);
    }
  }, [
    recordedUri, audioFile, theme, moodTag, caption, playerStatus.duration,
    publisherOptIn, imageUri,
    dispatch, navigation, showToast,
  ]);

  // ── Derived ───────────────────────────────────────────────────
  const hasRecording = !!recordedUri;
  const playing      = playerStatus.playing;
  const playheadSec  = playerStatus.currentTime || 0;
  const playerDur    = playerStatus.duration || 0;
  const displayLevels = levels;
  const progressRatio = hasRecording ? Math.min(1, playheadSec / (playerDur || 1)) : 0;

  // ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        {/* Header */}
        <DropScreenHeader
          title="Audio Drop"
          navigation={navigation}
          onBack={handleCancel}
        />

        {/* Context strip */}
        <View style={styles.contextStrip}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={styles.contextText}>
            {/* Labels keep their own casing. */}
            {themeObj.label} · {moodTag}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Timer row */}
          <View style={styles.timerRow}>
            <Text style={styles.timer}>
              {formatTime(playheadSec)}
              <Text style={styles.timerMax}>  /  {formatTime(playerDur)}</Text>
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
                placeholder="One line before they tap."
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
                  style={[styles.recordBtn, { backgroundColor: accent }]}
                  onPress={handlePick}
                  activeOpacity={0.85}
                  accessibilityLabel="Upload audio"
                >
                  <Upload size={rs(26)} color="#fff" />
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
                  <Text style={styles.sideBtnText}>Change</Text>
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
            {hasRecording
              ? audioFile?.name
              : `Tap to upload audio. mp3, m4a or wav, up to ${MAX_MB} MB.`}
          </Text>

          {/* Optional photo. */}
          {hasRecording && (
            !imageUri ? (
              <TouchableOpacity style={styles.attachRow} onPress={handlePickImage} activeOpacity={0.85}>
                <Images size={rs(14)} color={T.textMute} />
                <Text style={styles.attachRowText}>Add a photo (optional)</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.attachedRow}>
                <Image source={{ uri: imageUri }} style={styles.attachedThumb} />
                <Text style={styles.attachedLabel}>Photo attached</Text>
                <TouchableOpacity onPress={handleClearImage} hitSlop={HIT_SLOP} style={styles.attachedRemove}>
                  <X size={rs(14)} color={T.textMute} />
                </TouchableOpacity>
              </View>
            )
          )}

          {/* Anonixx Publisher opt-in (section 16) — voice only, after preview */}
          {hasRecording && (
            <View style={styles.publisherBox}>
              <Text style={styles.publisherQ}>
                Allow Anonixx to share this audio anonymously on our social pages?
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
                Your identity never leaves Anonixx. The audio will.
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
            Unnamed. Only the sound leaves your phone.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },

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

  // Optional photo.
  attachRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(8),
    width:             SCREEN_W - SPACING.md * 2,
    paddingVertical:   rp(10),
    paddingHorizontal: rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderStyle:       'dashed',
    borderColor:       T.border,
    marginTop:         SPACING.md,
  },
  attachRowText: { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.textMute },
  attachedRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(10),
    width:             SCREEN_W - SPACING.md * 2,
    paddingVertical:   rp(8),
    paddingHorizontal: rp(10),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    marginTop:         SPACING.md,
  },
  attachedThumb:  { width: rs(40), height: rs(40), borderRadius: RADIUS.sm },
  attachedLabel:  { flex: 1, fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.text },
  attachedRemove: { padding: rp(4) },

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
