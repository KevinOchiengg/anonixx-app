/**
 * ShareCardScreen — drop a confession.
 * Three modes: text · image · video
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Keyboard, Dimensions,
  KeyboardAvoidingView, ScrollView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useDispatch } from 'react-redux';
import { FileImage, Film, Type, X } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL, BACKENDS } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a4f62',
  border:        'rgba(255,255,255,0.06)',
};

const SCREEN_W  = Dimensions.get('window').width;
const MAX_CHARS = 200;
const CARD_W    = SCREEN_W - SPACING.md * 2;


// ─── Mode tabs ────────────────────────────────────────────────
const MODES = [
  { id: 'text',  label: 'Text',  Icon: Type      },
  { id: 'image', label: 'Image', Icon: FileImage  },
  { id: 'video', label: 'Video', Icon: Film       },
];

// ─── Text Confession Card ─────────────────────────────────────
const TextCard = React.memo(({ text, setText, captureRef, inputRef, readOnly, shareUrl }) => {
  const remaining = MAX_CHARS - text.length;
  const warnColor = remaining <= 30
    ? (remaining <= 10 ? '#ef4444' : '#FB923C')
    : T.textMuted;

  return (
    <ViewShot ref={captureRef} options={{ format: 'png', quality: 1.0 }}>
      <View style={[card.wrap, { width: CARD_W }]}>
        <View style={card.brandRow}>
          <Text style={card.brandName}>anonixx</Text>
          <View style={card.brandSepDot} />
          <Text style={card.brandTag}>drop</Text>
        </View>
        <View style={card.divider} />
        <TextInput
          ref={inputRef}
          style={card.input}
          value={text}
          onChangeText={readOnly ? undefined : setText}
          placeholder="say what you've been holding in…"
          placeholderTextColor="rgba(154,154,163,0.3)"
          multiline
          maxLength={MAX_CHARS}
          textAlignVertical="top"
          autoCorrect
          autoCapitalize="sentences"
          scrollEnabled={false}
          editable={!readOnly}
        />
        <View style={card.divider} />
        <View style={card.footerRow}>
          <Text style={card.anonTag}>— Anonymous</Text>
          {!readOnly && (
            <Text style={[card.remaining, { color: warnColor }]}>{remaining}</Text>
          )}
        </View>
        {shareUrl
          ? <Text style={card.shareUrl}>{shareUrl}</Text>
          : <Text style={card.watermark}>anonixx.app</Text>
        }
      </View>
    </ViewShot>
  );
});

// ─── Media Pick Area ──────────────────────────────────────────
const MediaPicker = React.memo(({ mode, mediaUri, thumbUri, onPick, onClear }) => {
  if (!mediaUri) {
    return (
      <TouchableOpacity style={pick.wrap} onPress={onPick} activeOpacity={0.8}>
        {mode === 'image'
          ? <FileImage size={rs(36)} color={T.primary} />
          : <Film size={rs(36)} color={T.primary} />
        }
        <Text style={pick.label}>
          {mode === 'image' ? 'Tap to pick an image' : 'Tap to pick a video'}
        </Text>
        <Text style={pick.sub}>from your gallery</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={pick.previewWrap}>
      {mode === 'image' ? (
        <Image source={{ uri: mediaUri }} style={pick.preview} resizeMode="cover" />
      ) : (
        <View style={pick.videoWrap}>
          {thumbUri
            ? <Image source={{ uri: thumbUri }} style={pick.preview} resizeMode="cover" />
            : <View style={[pick.preview, pick.videoPlaceholder]}>
                <Film size={rs(40)} color={T.textMuted} />
              </View>
          }
          <View style={pick.videoOverlay}>
            <Film size={rs(22)} color="#fff" />
            <Text style={pick.videoLabel}>Video selected</Text>
          </View>
        </View>
      )}
      <TouchableOpacity style={pick.clearBtn} onPress={onClear} hitSlop={HIT_SLOP}>
        <X size={rs(14)} color="#fff" />
      </TouchableOpacity>
    </View>
  );
});

// ─── Screen ───────────────────────────────────────────────────
export default function ShareCardScreen({ navigation }) {
  const { showToast } = useToast();
  const dispatch      = useDispatch();
  const captureRef    = useRef(null);
  const inputRef      = useRef(null);

  const [mode,     setMode]     = useState('text');
  const [text,     setText]     = useState('');
  const [caption,  setCaption]  = useState('');
  const [mediaUri, setMediaUri] = useState(null);
  const [thumbUri, setThumbUri] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [dropId,   setDropId]   = useState(null);

  const handleModeChange = useCallback((m) => {
    setMode(m);
    setDropId(null);
    setMediaUri(null);
    setThumbUri(null);
    setCaption('');
  }, []);

  const handlePickMedia = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Gallery access is needed to pick media.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    mode === 'image'
          ? 'images'
          : 'videos',
        quality:       0.85,
        allowsEditing: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setMediaUri(asset.uri);

      if (mode === 'video') {
        try {
          const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
          setThumbUri(thumb);
        } catch {
          setThumbUri(null);
        }
      }
    } catch {
      showToast({ type: 'error', message: 'Could not open gallery.' });
    }
  }, [mode, showToast]);

  const handleClearMedia = useCallback(() => {
    setMediaUri(null);
    setThumbUri(null);
  }, []);

  const shareLink = useCallback(async (id, preview) => {
    const shareUrl = `${BACKENDS.production}/api/v1/drops/${id}/open`;
    const body = `🎭 *anonixx.drop*\n\n_"${preview}"_\n\n*someone just dropped this. anonymously.*\n*find out here →* ${shareUrl}`;
    try {
      const { Share } = require('react-native');
      await Share.share(
        Platform.OS === 'ios' ? { message: body, url: shareUrl } : { message: body },
        { dialogTitle: 'Share your drop' },
      );
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
      showToast({ type: 'error', message: 'Could not share.' });
    }
  }, [showToast]);

  const shareCardImage = useCallback(async () => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) return;
      await new Promise(r => setTimeout(r, 80));
      const uri = await captureRef.current.capture();
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share card image',
      });
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
      showToast({ type: 'error', message: 'Could not share image.' });
    }
  }, [showToast]);

  const uploadMedia = useCallback(async (token) => {
    const resourceType = mode === 'image' ? 'image' : 'video';
    const ext          = mediaUri?.split('?')[0].split('.').pop()?.toLowerCase() || '';
    const mimeMap      = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif',  webp: 'image/webp',
      mp4: 'video/mp4',  mov: 'video/quicktime', avi: 'video/x-msvideo',
      mkv: 'video/x-matroska', '3gp': 'video/3gpp', webm: 'video/webm',
    };
    const mimeType = mimeMap[ext] || (mode === 'image' ? 'image/jpeg' : 'video/mp4');

    // Get short-lived signed params from our backend (JWT-gated)
    const signRes = await fetch(
      `${API_BASE_URL}/api/v1/upload/sign?folder=anonixx/drops`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!signRes.ok) throw new Error('Could not get upload signature.');
    const { signature, timestamp, api_key, cloud_name, folder } = await signRes.json();

    const form = new FormData();
    form.append('file',      { uri: mediaUri, name: `drop.${ext || resourceType}`, type: mimeType });
    form.append('api_key',   api_key);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder',    folder);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`,
      { method: 'POST', body: form },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Upload failed (${res.status})`);
    return data.secure_url;
  }, [mode, mediaUri]);

  const handleDrop = useCallback(async () => {
    if (mode === 'text' && !text.trim()) {
      showToast({ type: 'warning', message: 'Write your confession first.' });
      return;
    }
    if (mode !== 'text' && !mediaUri) {
      showToast({ type: 'warning', message: `Pick ${mode === 'image' ? 'an image' : 'a video'} first.` });
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');

      let mediaUrl  = null;
      let mediaType = null;

      if (mode !== 'text') {
        mediaUrl  = await uploadMedia(token);
        mediaType = mode;
      }

      const body = {
        category: 'love',
        ...(mode === 'text'
          ? { confession: text.trim() }
          : {
              media_url:  mediaUrl,
              media_type: mediaType,
              ...(caption.trim() ? { confession: caption.trim() } : {}),
            }
        ),
      };

      const res = await fetch(`${API_BASE_URL}/api/v1/drops`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = Array.isArray(err?.detail)
          ? err.detail.map(e => e.msg || String(e)).join('. ')
          : err?.detail;
        throw new Error(detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      const id   = data?.id;
      if (!id) throw new Error('No drop ID returned.');

      Keyboard.dismiss();
      setDropId(id);

      const preview = mode === 'text'
        ? text.trim()
        : (caption.trim() || (mode === 'image' ? '📷 image drop' : '🎥 video drop'));

      await shareLink(id, preview);

      showToast({ type: 'success', title: 'Dropped!', message: 'Your card is live. Share it anywhere.' });
      dispatch(awardMilestone('first_drop'));

    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
      showToast({ type: 'error', message: err.message || 'Could not create your drop. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [mode, text, caption, mediaUri, uploadMedia, shareLink, showToast, dispatch]);

  const handleShareAgain = useCallback(() => {
    if (!dropId) return;
    const preview = mode === 'text'
      ? text.trim()
      : (caption.trim() || (mode === 'image' ? '📷 image drop' : '🎥 video drop'));
    shareLink(dropId, preview);
  }, [dropId, mode, text, caption, shareLink]);

  const dropped = !!dropId;
  const canDrop = mode === 'text' ? !!text.trim() : !!mediaUri;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Drop</Text>
          <TouchableOpacity onPress={() => navigation.navigate('DropsInbox')} hitSlop={HIT_SLOP}>
            <Text style={styles.headerAction}>My Drops</Text>
          </TouchableOpacity>
        </View>

        {/* Mode tabs */}
        {!dropped && (
          <View style={styles.modeTabs}>
            {MODES.map(({ id, label, Icon }) => {
              const active = mode === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.modeTab, active && styles.modeTabActive]}
                  onPress={() => handleModeChange(id)}
                  hitSlop={HIT_SLOP}
                >
                  <Icon size={rs(14)} color={active ? T.primary : T.textMuted} />
                  <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Text mode */}
          {mode === 'text' && (
            <TouchableOpacity
              activeOpacity={dropped ? 0.85 : 1}
              onPress={dropped ? handleShareAgain : undefined}
              style={styles.cardWrap}
            >
              <TextCard
                text={text}
                setText={setText}
                captureRef={captureRef}
                inputRef={inputRef}
                readOnly={dropped}
                shareUrl={dropped ? `${BACKENDS.production}/api/v1/drops/${dropId}/open` : null}
              />
              {dropped && (
                <View style={styles.tapOverlay}>
                  <Text style={styles.tapLabel}>tap to share again  ↗</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Image / Video mode — pre-drop */}
          {mode !== 'text' && !dropped && (
            <View style={styles.mediaSection}>
              <MediaPicker
                mode={mode}
                mediaUri={mediaUri}
                thumbUri={thumbUri}
                onPick={handlePickMedia}
                onClear={handleClearMedia}
              />
              {mediaUri && (
                <View style={styles.captionWrap}>
                  <TextInput
                    style={styles.captionInput}
                    value={caption}
                    onChangeText={(v) => setCaption(v.slice(0, MAX_CHARS))}
                    placeholder="add a caption (optional)…"
                    placeholderTextColor={T.textMuted}
                    multiline
                    maxLength={MAX_CHARS}
                    autoCapitalize="sentences"
                    autoCorrect
                  />
                  <Text style={styles.captionCount}>{MAX_CHARS - caption.length}</Text>
                </View>
              )}
            </View>
          )}

          {/* Image / Video mode — after drop */}
          {mode !== 'text' && dropped && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleShareAgain}
              style={styles.droppedMediaWrap}
            >
              {mode === 'image'
                ? <Image source={{ uri: mediaUri }} style={styles.droppedImage} resizeMode="cover" />
                : <View style={styles.droppedVideo}>
                    {thumbUri
                      ? <Image source={{ uri: thumbUri }} style={styles.droppedImage} resizeMode="cover" />
                      : <Film size={rs(48)} color={T.textMuted} />
                    }
                  </View>
              }
              {caption ? <Text style={styles.droppedCaption}>"{caption}"</Text> : null}
              <View style={styles.tapOverlay}>
                <Text style={styles.tapLabel}>tap to share again  ↗</Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={styles.hint}>
            {dropped
              ? 'Your drop is live · share it anywhere'
              : mode === 'text'
                ? 'tap the card to write · what you say here, only you know'
                : `${mode === 'image' ? 'image' : 'video'} drop · your identity stays hidden`
            }
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            {!dropped ? (
              <TouchableOpacity
                style={[styles.dropBtn, (!canDrop || loading) && styles.dropBtnDisabled]}
                onPress={handleDrop}
                disabled={!canDrop || loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.dropBtnText}>Drop It  ↗</Text>
                }
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.dropBtn}
                  onPress={handleShareAgain}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dropBtnText}>Share Again  ↗</Text>
                </TouchableOpacity>
                {mode === 'text' && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={shareCardImage}
                    activeOpacity={0.75}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={styles.secondaryBtnText}>Share Card Image</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={async () => {
                    await Clipboard.setStringAsync(`${BACKENDS.production}/api/v1/drops/${dropId}/open`);
                    showToast({ type: 'success', message: 'Link copied.' });
                  }}
                  activeOpacity={0.75}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.copyBtnText}>Copy Link</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Card Styles ──────────────────────────────────────────────
const card = StyleSheet.create({
  wrap: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
    borderLeftWidth: 1,
    borderLeftColor: T.primary,
    paddingVertical:   rp(20),
    paddingHorizontal: rp(20),
    paddingLeft:       rp(22),
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rs(8) },
    shadowOpacity:   0.4,
    shadowRadius:    rs(24),
    elevation:       8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(12) },
  brandName: { fontSize: FONT.xs, fontWeight: '700', color: T.primary, letterSpacing: 1.2 },
  brandSepDot: { width: rs(3), height: rs(3), borderRadius: rs(2), backgroundColor: T.textMuted },
  brandTag: { fontSize: FONT.xs, color: T.textSecondary, letterSpacing: 0.4 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: rp(12) },
  input: {
    fontSize: rf(16), fontWeight: '400', color: T.text,
    lineHeight: rf(26), letterSpacing: 0.15,
    minHeight: rs(120), paddingVertical: 0, paddingHorizontal: 0, marginBottom: rp(12),
  },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: rp(8) },
  anonTag: { fontSize: FONT.sm, color: T.textSecondary, fontStyle: 'italic' },
  remaining: { fontSize: rf(11), fontWeight: '600' },
  watermark: { fontSize: rf(9), color: T.textSecondary, letterSpacing: 0.3, marginTop: rp(6), opacity: 0.5, textAlign: 'right' },
  shareUrl: { fontSize: rf(9), color: T.primary, marginTop: rp(8), letterSpacing: 0.2, textAlign: 'center', opacity: 0.85 },
});

// ─── Media Picker Styles ──────────────────────────────────────
const pick = StyleSheet.create({
  wrap: {
    width:           CARD_W,
    height:          rs(220),
    borderRadius:    RADIUS.lg,
    borderWidth:     1.5,
    borderColor:     'rgba(255,99,74,0.25)',
    borderStyle:     'dashed',
    backgroundColor: 'rgba(255,99,74,0.04)',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SPACING.sm,
  },
  label: { fontSize: FONT.md, color: T.text, fontWeight: '600' },
  sub:   { fontSize: FONT.sm, color: T.textMuted },

  previewWrap:     { width: CARD_W, height: rs(240), borderRadius: RADIUS.lg, overflow: 'hidden', position: 'relative' },
  preview:         { width: '100%', height: '100%' },
  videoWrap:       { width: '100%', height: '100%' },
  videoPlaceholder:{ backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  videoOverlay: {
    position:        'absolute',
    bottom:          0, left: 0, right: 0,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(6),
    padding:         rp(10),
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  videoLabel: { fontSize: FONT.sm, color: '#fff', fontWeight: '600' },
  clearBtn: {
    position:        'absolute',
    top:             rp(10),
    right:           rp(10),
    width:           rs(28),
    height:          rs(28),
    borderRadius:    rs(14),
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
  },
});

// ─── Screen Styles ────────────────────────────────────────────
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
  backIcon:     { fontSize: rf(28), color: T.text, lineHeight: rf(30) },
  headerTitle:  { fontSize: FONT.md, fontWeight: '600', color: T.text, letterSpacing: 0.3 },
  headerAction: { fontSize: FONT.sm, color: T.primary, fontWeight: '500' },

  modeTabs: {
    flexDirection:     'row',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
    gap:               SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  modeTab: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(5),
    paddingVertical:   rp(6),
    paddingHorizontal: rp(14),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
  },
  modeTabActive:     { borderColor: T.primary, backgroundColor: 'rgba(255,99,74,0.10)' },
  modeTabText:       { fontSize: FONT.sm, color: T.textMuted, fontWeight: '500' },
  modeTabTextActive: { color: T.primary, fontWeight: '700' },

  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.xl,
    paddingBottom:     SPACING.lg,
  },

  cardWrap:   { position: 'relative' },
  tapOverlay: {
    position:          'absolute',
    bottom:            rp(12),
    right:             rp(16),
    backgroundColor:   'rgba(11,15,24,0.72)',
    borderRadius:      RADIUS.sm,
    paddingVertical:   rp(4),
    paddingHorizontal: rp(10),
  },
  tapLabel: { fontSize: FONT.xs, color: T.primary, fontWeight: '600' },

  mediaSection: { gap: SPACING.md },
  captionWrap: {
    backgroundColor:   T.surface,
    borderRadius:      RADIUS.lg,
    borderWidth:       1,
    borderColor:       T.border,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(10),
    minHeight:         rs(72),
  },
  captionInput:  { fontSize: FONT.md, color: T.text, lineHeight: rf(22) },
  captionCount:  { fontSize: rf(11), color: T.textMuted, textAlign: 'right', marginTop: rp(4) },

  droppedMediaWrap: { position: 'relative', borderRadius: RADIUS.lg, overflow: 'hidden' },
  droppedImage:     { width: CARD_W, height: rs(240) },
  droppedVideo: {
    width: CARD_W, height: rs(240),
    backgroundColor: T.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  droppedCaption: {
    fontSize: FONT.md, color: T.textSecondary, fontStyle: 'italic',
    marginTop: SPACING.sm, textAlign: 'center',
  },

  hint: {
    fontSize:      FONT.xs,
    color:         T.textMuted,
    textAlign:     'center',
    marginTop:     SPACING.sm,
    marginBottom:  SPACING.md,
    letterSpacing: 0.3,
  },

  actions: {},

  dropBtn: {
    backgroundColor: T.primary,
    borderRadius:    RADIUS.md,
    height:          BUTTON_HEIGHT,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.4,
    shadowRadius:    rs(14),
    elevation:       6,
  },
  dropBtnDisabled:  { opacity: 0.38 },
  dropBtnText:      { fontSize: FONT.md, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  secondaryBtn: {
    marginTop:         SPACING.sm,
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.10)',
    alignItems:        'center',
  },
  secondaryBtnText: { fontSize: FONT.sm, color: T.textSecondary, fontWeight: '500' },

  copyBtn:     { marginTop: SPACING.sm, alignItems: 'center', paddingVertical: rp(10) },
  copyBtnText: { fontSize: FONT.sm, color: T.textMuted, fontWeight: '500' },
});
