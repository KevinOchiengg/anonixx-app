/**
 * ShareCardScreen — drop a confession.
 * Three modes: text · image · video
 *
 * Behaviour:
 *   - Drop ALWAYS goes to marketplace.
 *   - User can optionally tag a specific person within Anonixx; they receive
 *     it directly (anonymously) while it still appears in the marketplace.
 *   - Text drops can opt-in to AI refinement via POST /api/v1/drops/refine.
 *     A before/after preview lets the user choose which version to post.
 *   - No external sharing (WhatsApp / share sheet removed).
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Keyboard, Dimensions, Animated,
  KeyboardAvoidingView, ScrollView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useDispatch } from 'react-redux';
import { FileImage, Film, Sparkles, Type, X } from 'lucide-react-native';
import TagUserSection from '../../components/drops/TagUserSection';
import { LinearGradient } from 'expo-linear-gradient';

import { T, ENTRANCE } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL, BACKENDS } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { Chip, ChipRow } from '../../components/drops/ChipRow';

const SCREEN_W  = Dimensions.get('window').width;
const MAX_CHARS = 200;
const CARD_W    = SCREEN_W - SPACING.md * 2;

// ─── Static data (module-level per dev rules) ─────────────────
const CATEGORIES = [
  { id: 'love',                    label: 'Love',                  emoji: '❤️'  },
  { id: 'fun',                     label: 'Fun',                   emoji: '✨'  },
  { id: 'friendship',              label: 'Friendship',            emoji: '🤝' },
  { id: 'adventure',               label: 'Adventure',             emoji: '🌍' },
  { id: 'spicy',                   label: 'Spicy',                 emoji: '🌶️' },
  { id: 'carrying this alone',     label: 'Carrying this alone',   emoji: '🌑' },
  { id: 'starting over',           label: 'Starting over',         emoji: '🌱' },
  { id: 'need stability',          label: 'Need stability',        emoji: '⚓' },
  { id: 'open to connection',      label: 'Open to connection',    emoji: '🤲' },
  { id: 'just need to be heard',   label: 'Just need to be heard', emoji: '🌙' },
];

const MODES = [
  { id: 'text',  label: 'Text',  Icon: Type      },
  { id: 'image', label: 'Image', Icon: FileImage },
  { id: 'video', label: 'Video', Icon: Film      },
];

const INTENTS = [
  { id: 'open to connection',         label: 'Open to connection',         emoji: '🤲' },
  { id: 'just need to be heard',      label: 'Just need to be heard',      emoji: '🌙' },
  { id: 'looking for something real', label: 'Looking for something real', emoji: '❤️' },
  { id: 'late night thoughts',        label: 'Late night thoughts',        emoji: '🌃' },
];

// ─── Text Confession Card ─────────────────────────────────────
const TextCard = React.memo(({ text, setText, inputRef, readOnly }) => {
  const remaining = MAX_CHARS - text.length;
  const warnColor = remaining <= 30
    ? (remaining <= 10 ? T.danger : T.warn)
    : T.textMute;

  return (
    <LinearGradient
      colors={['#12151f', '#0c0f18', '#111420']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[card.wrap, { width: CARD_W }]}
    >
      <Text style={card.ghostQuote}>"</Text>
      <Text style={card.secretTag}>someone said this</Text>
      <View style={card.accentLine} />

      <TextInput
        ref={inputRef}
        style={card.input}
        value={text}
        onChangeText={readOnly ? undefined : setText}
        placeholder={"say what you've been\nholding in…"}
        placeholderTextColor="rgba(234,234,240,0.22)"
        multiline
        maxLength={MAX_CHARS}
        textAlignVertical="top"
        autoCorrect
        autoCapitalize="sentences"
        scrollEnabled={false}
        editable={!readOnly}
      />

      <View style={card.tensionLine} />

      <View style={card.footerRow}>
        <Text style={card.anonTag}>— someone</Text>
        {!readOnly && (
          <Text style={[card.remaining, { color: warnColor }]}>{remaining}</Text>
        )}
      </View>

      <Text style={card.brandSig}>anonixx</Text>
    </LinearGradient>
  );
});

// ─── Media Pick Area ──────────────────────────────────────────
const MediaPicker = React.memo(({ mode, mediaUri, thumbUri, onPick, onClear }) => {
  if (!mediaUri) {
    return (
      <TouchableOpacity style={pick.wrap} onPress={onPick} activeOpacity={0.8}>
        {mode === 'image'
          ? <FileImage size={rs(36)} color={T.primary} />
          : <Film      size={rs(36)} color={T.primary} />
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
                <Film size={rs(40)} color={T.textMute} />
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
  const inputRef      = useRef(null);

  const [mode,     setMode]     = useState('text');
  const [text,     setText]     = useState('');
  const [caption,  setCaption]  = useState('');
  const [mediaUri, setMediaUri] = useState(null);
  const [thumbUri, setThumbUri] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [dropId,   setDropId]   = useState(null);

  // Category + intent
  const [category, setCategory] = useState('love');
  const [intent,   setIntent]   = useState(null);

  // Tag a specific user (drop still hits marketplace)
  const [taggedUser, setTaggedUser] = useState(null);

  // AI text refinement (text mode only)
  const [refineEnabled,     setRefineEnabled]     = useState(false);
  const [refinedText,       setRefinedText]       = useState('');
  const [showRefinePreview, setShowRefinePreview] = useState(false);
  const [refining,          setRefining]          = useState(false);

  // Entrance fade
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: ENTRANCE.fadeDuration,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const handleModeChange = useCallback((m) => {
    setMode(m);
    setDropId(null);
    setMediaUri(null);
    setThumbUri(null);
    setCaption('');
    setRefineEnabled(false);
    setRefinedText('');
    setShowRefinePreview(false);
  }, []);

  // ── AI refinement ─────────────────────────────────────────────
  const handleRefineText = useCallback(async () => {
    if (!text.trim()) return;
    setRefining(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/refine`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) throw new Error('Refinement unavailable right now.');
      const data = await res.json();
      if (!data?.refined_text) throw new Error('No refined text returned.');
      setRefinedText(data.refined_text);
      setShowRefinePreview(true);
    } catch (err) {
      showToast({ type: 'warning', message: err.message || 'Could not refine. Try again.' });
      setRefineEnabled(false);
    } finally {
      setRefining(false);
    }
  }, [text, showToast]);

  // ── Media ─────────────────────────────────────────────────────
  const handlePickMedia = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Gallery access is needed to pick media.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    mode === 'image' ? 'images' : 'videos',
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

  // ── Upload (Cloudinary signed) ────────────────────────────────
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

    const signRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ resource_type: resourceType }),
    });
    if (!signRes.ok) {
      const errData = await signRes.json().catch(() => ({}));
      throw new Error(errData?.detail || `Upload sign failed (${signRes.status})`);
    }
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

  // ── Create drop ───────────────────────────────────────────────
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

      // Use refined text if user accepted the AI suggestion, else raw.
      const confessionText = (mode === 'text' && refineEnabled && refinedText)
        ? refinedText
        : text.trim();

      const body = {
        category,
        ...(mode === 'text'
          ? { confession: confessionText }
          : {
              media_url:  mediaUrl,
              media_type: mediaType,
              ...(caption.trim() ? { confession: caption.trim() } : {}),
            }
        ),
        // Always marketplace; optionally also tag a specific user.
        ...(taggedUser ? { target_user_id: taggedUser.id } : {}),
        ...(intent     ? { intent }                        : {}),
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

      showToast({
        type:    'success',
        title:   taggedUser ? 'Dropped + tagged 👀' : 'Dropped!',
        message: taggedUser
          ? `In the marketplace + sent to @${taggedUser.username} anonymously.`
          : 'Your confession is live in the marketplace.',
      });
      dispatch(awardMilestone('first_drop'));

    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('dismiss')) return;
      showToast({ type: 'error', message: err.message || 'Could not create your drop. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [
    mode, text, caption, mediaUri, category, intent,
    taggedUser, refineEnabled, refinedText,
    uploadMedia, showToast, dispatch,
  ]);

  const dropped  = !!dropId;
  const canDrop  = mode === 'text' ? !!text.trim() : !!mediaUri;
  const dropLink = dropped ? `${BACKENDS.production}/api/v1/drops/${dropId}/open` : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <DropScreenHeader
          title="Drop"
          navigation={navigation}
          rightLabel="My Drops"
          onRightPress={() => navigation.navigate('DropsInbox')}
        />

        <Animated.View style={{ flex: 1, opacity: fade }}>
          {/* Mode tabs */}
          {!dropped && (
            <View style={styles.modeRow}>
              <ChipRow scroll={false} gap="sm">
                {MODES.map(({ id, label, Icon }) => (
                  <Chip
                    key={id}
                    variant="pill"
                    label={label}
                    Icon={Icon}
                    active={mode === id}
                    onPress={() => handleModeChange(id)}
                  />
                ))}
              </ChipRow>
            </View>
          )}

          {/* Category picker */}
          {!dropped && (
            <View style={styles.sectionWrap}>
              <Text style={styles.eyebrow}>CATEGORY</Text>
              <ChipRow scroll gap="sm">
                {CATEGORIES.map(({ id, label, emoji }) => (
                  <Chip
                    key={id}
                    variant="pill"
                    label={`${emoji}  ${label}`}
                    active={category === id}
                    onPress={() => setCategory(id)}
                  />
                ))}
              </ChipRow>
            </View>
          )}

          {/* Intent picker (always visible, not audience-gated) */}
          {!dropped && (
            <View style={styles.sectionWrap}>
              <Text style={styles.eyebrow}>OPEN TO · <Text style={styles.eyebrowMute}>optional</Text></Text>
              <ChipRow scroll gap="sm">
                {INTENTS.map(({ id, label, emoji }) => (
                  <Chip
                    key={id}
                    variant="pill"
                    label={`${emoji}  ${label}`}
                    active={intent === id}
                    onPress={() => setIntent(prev => prev === id ? null : id)}
                  />
                ))}
              </ChipRow>
            </View>
          )}

          {/* Tag someone — always goes to marketplace too */}
          {!dropped && (
            <View style={[styles.sectionWrap, { zIndex: 50 }]}>
              <TagUserSection
                taggedUser={taggedUser}
                onTag={setTaggedUser}
                onClear={() => setTaggedUser(null)}
              />
            </View>
          )}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {/* Text mode card */}
            {mode === 'text' && (
              <TextCard
                text={text}
                setText={setText}
                inputRef={inputRef}
                readOnly={dropped}
              />
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
                      placeholderTextColor={T.textMute}
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

            {/* Image / Video — post-drop */}
            {mode !== 'text' && dropped && (
              <View style={styles.droppedMediaWrap}>
                {mode === 'image'
                  ? <Image source={{ uri: mediaUri }} style={styles.droppedImage} resizeMode="cover" />
                  : <View style={styles.droppedVideo}>
                      {thumbUri
                        ? <Image source={{ uri: thumbUri }} style={styles.droppedImage} resizeMode="cover" />
                        : <Film size={rs(48)} color={T.textMute} />
                      }
                    </View>
                }
                {caption ? <Text style={styles.droppedCaption}>"{caption}"</Text> : null}
              </View>
            )}

            {/* AI text refinement — text mode, pre-drop only */}
            {mode === 'text' && !dropped && !!text.trim() && (
              <View style={styles.refineBox}>
                <TouchableOpacity
                  style={styles.refineToggleRow}
                  onPress={() => {
                    const next = !refineEnabled;
                    setRefineEnabled(next);
                    if (!next) { setRefinedText(''); setShowRefinePreview(false); }
                  }}
                  activeOpacity={0.8}
                  hitSlop={HIT_SLOP}
                >
                  <Sparkles size={rs(14)} color={refineEnabled ? T.primary : T.textMute} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.refineToggleLabel, refineEnabled && { color: T.primary }]}>
                      Polish my words
                    </Text>
                    <Text style={styles.refineToggleSub}>
                      Let Anonixx refine the wording — your meaning stays intact
                    </Text>
                  </View>
                  <View style={[styles.refineToggleDot, refineEnabled && styles.refineToggleDotOn]} />
                </TouchableOpacity>

                {refineEnabled && !showRefinePreview && (
                  <TouchableOpacity
                    style={styles.refinePreviewBtn}
                    onPress={handleRefineText}
                    disabled={refining}
                    activeOpacity={0.85}
                  >
                    {refining
                      ? <ActivityIndicator size="small" color={T.primary} />
                      : <Text style={styles.refinePreviewBtnText}>Preview refined version</Text>
                    }
                  </TouchableOpacity>
                )}

                {showRefinePreview && !!refinedText && (
                  <View style={styles.refinePreviewWrap}>
                    <Text style={styles.refinePreviewLabel}>REFINED VERSION</Text>
                    <Text style={styles.refinePreviewText}>"{refinedText}"</Text>
                    <View style={styles.refinePreviewActions}>
                      <TouchableOpacity
                        style={[styles.refineChoiceBtn, styles.refineChoicePrimary]}
                        onPress={() => setShowRefinePreview(false)}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={styles.refineChoicePrimaryText}>Use this ✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.refineChoiceBtn}
                        onPress={() => {
                          setRefinedText('');
                          setShowRefinePreview(false);
                          setRefineEnabled(false);
                        }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={styles.refineChoiceGhostText}>Keep mine</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            <Text style={styles.hint}>
              {dropped
                ? 'your drop is live in the marketplace'
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
                    : <Text style={styles.dropBtnText}>DROP IT  ↗</Text>
                  }
                </TouchableOpacity>
              ) : (
                <View style={styles.successWrap}>
                  <Text style={styles.successTitle}>Dropped.</Text>
                  <Text style={styles.successSub}>
                    Your confession is live in the marketplace.
                    {taggedUser ? `\n@${taggedUser.username} received it anonymously too.` : ''}
                  </Text>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={async () => {
                      if (!dropLink) return;
                      await Clipboard.setStringAsync(dropLink);
                      showToast({ type: 'success', title: 'Link copied!', message: 'Share it however you like.' });
                    }}
                    activeOpacity={0.75}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={styles.copyBtnText}>Copy drop link</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.viewDropBtn}
                    onPress={() => navigation.navigate('DropLanding', { dropId })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.viewDropBtnText}>VIEW MY DROP</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Card Styles ──────────────────────────────────────────────
const card = StyleSheet.create({
  wrap: {
    borderRadius:  rp(4),
    paddingTop:    rp(28),
    paddingBottom: rp(28),
    paddingLeft:   rp(24),
    paddingRight:  rp(24),
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: rs(20) },
    shadowOpacity: 0.85,
    shadowRadius:  rs(40),
    elevation:     18,
    overflow:      'hidden',
    borderWidth:   1,
    borderColor:   'rgba(255,255,255,0.04)',
  },
  ghostQuote: {
    position:   'absolute',
    top:        rp(-18),
    left:       rp(10),
    fontSize:   rf(180),
    fontFamily: 'PlayfairDisplay-Italic',
    color:      'rgba(255,255,255,0.03)',
    lineHeight: rf(180),
  },
  secretTag: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         'rgba(255,99,74,0.60)',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom:  rp(14),
  },
  accentLine: {
    width:           rp(36),
    height:          1.5,
    backgroundColor: T.primary,
    opacity:         0.7,
    marginBottom:    rp(22),
  },
  input: {
    fontSize:          rf(24),
    fontFamily:        'PlayfairDisplay-Italic',
    color:             '#E8E8EE',
    lineHeight:        rf(38),
    letterSpacing:     0.3,
    minHeight:         rs(120),
    paddingVertical:   0,
    paddingHorizontal: 0,
    marginBottom:      rp(24),
  },
  tensionLine: {
    width:           '62%',
    height:          1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf:       'flex-end',
    marginBottom:    rp(18),
  },
  footerRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   rp(22),
  },
  anonTag: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(11),
    color:         'rgba(255,255,255,0.38)',
    letterSpacing: 0.5,
  },
  remaining: {
    fontFamily: 'DMSans-Bold',
    fontSize:   rf(11),
  },
  brandSig: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(10),
    color:         'rgba(255,255,255,0.20)',
    letterSpacing: 5,
    textAlign:     'right',
    marginRight:   rp(4),
  },
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
    backgroundColor: T.primaryDim,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SPACING.sm,
  },
  label: {
    fontFamily: 'DMSans-Bold',
    fontSize:   FONT.md,
    color:      T.text,
  },
  sub: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textMute,
  },
  previewWrap:      { width: CARD_W, height: rs(240), borderRadius: RADIUS.lg, overflow: 'hidden', position: 'relative' },
  preview:          { width: '100%', height: '100%' },
  videoWrap:        { width: '100%', height: '100%' },
  videoPlaceholder: { backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  videoOverlay: {
    position:        'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rp(6),
    padding:         rp(10),
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  videoLabel: { fontFamily: 'DMSans-Bold', fontSize: FONT.sm, color: '#fff' },
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

  modeRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(10),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },

  sectionWrap: {
    paddingHorizontal: SPACING.md,
    paddingTop:        rp(12),
    paddingBottom:     rp(10),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    gap:               rp(8),
  },

  eyebrow: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10),
    color:         T.textSec,
    letterSpacing: 2.2,
  },
  eyebrowMute: {
    fontFamily:    'DMSans-Italic',
    color:         T.textMute,
    letterSpacing: 1.4,
  },

  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.xl,
    paddingBottom:     SPACING.lg,
    gap:               SPACING.md,
  },

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
  captionInput: {
    fontFamily: 'DMSans-Regular',
    fontSize:   FONT.md,
    color:      T.text,
    lineHeight: rf(22),
  },
  captionCount: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(11),
    color:      T.textMute,
    textAlign:  'right',
    marginTop:  rp(4),
  },

  droppedMediaWrap: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  droppedImage:     { width: CARD_W, height: rs(240) },
  droppedVideo: {
    width: CARD_W, height: rs(240),
    backgroundColor: T.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  droppedCaption: {
    fontFamily: 'PlayfairDisplay-Italic',
    fontSize:   FONT.md,
    color:      T.textSec,
    marginTop:  SPACING.sm,
    textAlign:  'center',
  },

  // AI refine
  refineBox: {
    backgroundColor:   'rgba(255,255,255,0.02)',
    borderColor:       T.border,
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    gap:               rp(12),
  },
  refineToggleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(10),
  },
  refineToggleLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.3,
  },
  refineToggleSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.3,
    marginTop:     rp(2),
  },
  refineToggleDot: {
    width:           rs(18),
    height:          rs(10),
    borderRadius:    rs(5),
    backgroundColor: T.border,
  },
  refineToggleDotOn: { backgroundColor: T.primary },
  refinePreviewBtn: {
    alignItems:      'center',
    paddingVertical: rp(8),
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    borderColor:     T.primaryBorder,
    backgroundColor: T.primaryDim,
  },
  refinePreviewBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.primary,
    letterSpacing: 0.5,
  },
  refinePreviewWrap:    { gap: rp(8) },
  refinePreviewLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.primary,
    letterSpacing: 2.5,
  },
  refinePreviewText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(15),
    color:         T.text,
    lineHeight:    rf(23),
    letterSpacing: 0.3,
  },
  refinePreviewActions: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginTop:     rp(4),
  },
  refineChoiceBtn: {
    paddingHorizontal: rp(16),
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
  },
  refineChoicePrimary: {
    borderColor:     T.primary,
    backgroundColor: T.primaryTint,
  },
  refineChoicePrimaryText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.primary,
    letterSpacing: 0.5,
  },
  refineChoiceGhostText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.3,
  },

  hint: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.xs,
    color:         T.textMute,
    textAlign:     'center',
    letterSpacing: 0.5,
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
  dropBtnDisabled: { opacity: 0.38 },
  dropBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 1.2,
  },

  // Success state (post-drop)
  successWrap: {
    alignItems: 'center',
    gap:        SPACING.sm,
    paddingTop: SPACING.sm,
  },
  successTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(32),
    color:         T.text,
    letterSpacing: 0.5,
  },
  successSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textSec,
    textAlign:     'center',
    lineHeight:    rf(20),
    letterSpacing: 0.3,
  },
  copyBtn: {
    marginTop:         SPACING.sm,
    paddingVertical:   rp(10),
    paddingHorizontal: rp(20),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
  },
  copyBtnText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textMute,
    letterSpacing: 0.5,
  },
  viewDropBtn: {
    backgroundColor: T.primary,
    borderRadius:    RADIUS.md,
    height:          BUTTON_HEIGHT,
    paddingHorizontal: rs(40),
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.4,
    shadowRadius:    rs(14),
    elevation:       6,
  },
  viewDropBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 1.2,
  },
});
