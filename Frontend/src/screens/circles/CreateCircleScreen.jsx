/**
 * CreateCircleScreen.jsx
 * The moment a creator steps into their own darkness and names it.
 *
 * Design: Intimate. Like filling out a confession card in the dark.
 * The aura color the creator picks bleeds through the entire screen.
 * Every choice feels intentional. Every word feels permanent.
 */
import React, {
  useState, useCallback, useRef, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, Check, ImageIcon } from 'lucide-react-native';
import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Cloudinary ───────────────────────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME    = 'dojbdm2e1';
const CLOUDINARY_UPLOAD_PRESET = 'anonix';

const uploadToCloudinary = async (uri) => {
  const ext      = uri.split('.').pop();
  const formData = new FormData();
  formData.append('file', { uri, type: `image/${ext}`, name: `circle_avatar.${ext}` });
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res  = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData, headers: { 'Content-Type': 'multipart/form-data' } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.12)',
  primaryBorder: 'rgba(255,99,74,0.25)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#5a5f70',
  border:        'rgba(255,255,255,0.06)',
  inputBg:       'rgba(255,255,255,0.04)',
};

// ─── Static data ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'confession', label: 'Confess',    emoji: '🕯️' },
  { id: 'love',       label: 'Love',       emoji: '💔' },
  { id: 'support',    label: 'Healing',    emoji: '🤍' },
  { id: 'debate',     label: 'Debate',     emoji: '🔥' },
  { id: 'fun',        label: 'Fun',        emoji: '😈' },
  { id: 'midnight',   label: 'Midnight',   emoji: '🌙' },
  { id: 'music',      label: 'Music',      emoji: '🎵' },
  { id: 'spicy',      label: 'Spicy',      emoji: '🌶️' },
];

const AURA_COLORS = [
  '#FF634A', '#FF4B8B', '#A855F7', '#3B82F6', '#10B981',
  '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6',
];

const AVATAR_EMOJIS = [
  '🎭', '🌙', '🔥', '💔', '🕯️', '🌊',
  '🌑', '⚡', '🖤', '💀', '🌹', '🎪',
  '🌫️', '🗝️', '🪞', '🔮', '🌌', '🎵',
];

const BIO_PLACEHOLDER = [
  'A place for the thoughts you\'ve never said out loud.',
  'Where the night owls gather.',
  'Speak truth. No names. No shame.',
  'For those who feel too much.',
][Math.floor(Math.random() * 4)];

// ─── Section Label ────────────────────────────────────────────────────────────
const SectionLabel = React.memo(({ label, required }) => (
  <Text style={styles.sectionLabel}>
    {label}
    {required && <Text style={{ color: T.primary }}> *</Text>}
  </Text>
));

// ─── Aura Preview ─────────────────────────────────────────────────────────────
const AuraPreview = React.memo(({ name, bio, emoji, color, avatarUri }) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.previewCard}>
      <View style={[styles.previewAccent, { backgroundColor: color }]} />
      <View style={styles.previewInner}>
        <Animated.View style={[
          styles.previewAvatar,
          { backgroundColor: color + '22', borderColor: color + '33', transform: [{ scale: pulse }] },
        ]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.previewAvatarImg} />
          ) : (
            <Text style={styles.previewEmoji}>{emoji}</Text>
          )}
        </Animated.View>
        <View style={styles.previewText}>
          <Text style={styles.previewName} numberOfLines={1}>
            {name || 'Your circle name'}
          </Text>
          <Text style={styles.previewBio} numberOfLines={2}>
            {bio || 'Your circle description'}
          </Text>
        </View>
      </View>
    </View>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CreateCircleScreen({ navigation }) {
  const { showToast } = useToast();

  const [name,      setName]      = useState('');
  const [bio,       setBio]       = useState('');
  const [category,  setCategory]  = useState('');
  const [color,     setColor]     = useState(AURA_COLORS[0]);
  const [emoji,     setEmoji]     = useState('🎭');
  const [avatarUri, setAvatarUri] = useState(null);   // local URI
  const [loading,   setLoading]   = useState(false);

  // Entrance animations
  const headerOp = useRef(new Animated.Value(0)).current;
  const formY    = useRef(new Animated.Value(24)).current;
  const formOp   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(headerOp, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(formOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(formY,  { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const canSubmit = name.trim() && bio.trim() && category;

  // ── Photo Picker ──────────────────────────────────────────────────────────
  const pickFromGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Photo access is needed to set an avatar.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  }, [showToast]);

  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Camera access is needed to take a photo.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  }, [showToast]);

  const clearPhoto = useCallback(() => setAvatarUri(null), []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleColorSelect    = useCallback((c) => setColor(c), []);
  const handleEmojiSelect    = useCallback((e) => { setEmoji(e); setAvatarUri(null); }, []);
  const handleCategorySelect = useCallback((id) => setCategory(id), []);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      showToast({ type: 'error', message: 'Your circle needs a name.' });
      return;
    }
    if (!bio.trim()) {
      showToast({ type: 'error', message: 'Tell people what your circle is about.' });
      return;
    }
    if (!category) {
      showToast({ type: 'error', message: 'Choose a category.' });
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');

      let avatarUrl = null;
      if (avatarUri) {
        showToast({ type: 'info', message: 'Uploading avatar…' });
        avatarUrl = await uploadToCloudinary(avatarUri);
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/circles/create`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name:         name.trim(),
          bio:          bio.trim(),
          category,
          aura_color:   color,
          avatar_emoji: avatarUrl ? null : emoji,
          avatar_url:   avatarUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast({ type: 'success', message: 'Your circle is alive.' });
        navigation.replace('CircleProfile', { circleId: data.id });
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not create circle. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not create circle. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [name, bio, category, color, emoji, avatarUri, navigation, showToast]);

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>

      {/* Dynamic aura glow from selected color */}
      <View style={[styles.auraGlow, { backgroundColor: color }]} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOp }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP}
          style={styles.backBtn}
        >
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Open a Circle</Text>
          <Text style={styles.headerSub}>name your darkness</Text>
        </View>
        <View style={{ width: rs(38) }} />
      </Animated.View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Animated.View style={[
            styles.formWrap,
            { transform: [{ translateY: formY }], opacity: formOp }
          ]}>

            {/* Live preview */}
            <AuraPreview
              name={name}
              bio={bio}
              emoji={emoji}
              color={color}
              avatarUri={avatarUri}
            />

            {/* ── Name ── */}
            <View style={styles.field}>
              <SectionLabel label="Circle Name" required />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Midnight Overthinkers"
                placeholderTextColor={T.textMuted}
                style={styles.input}
                maxLength={50}
                returnKeyType="next"
              />
              <Text style={styles.charCount}>{name.length}/50</Text>
            </View>

            {/* ── Bio ── */}
            <View style={styles.field}>
              <SectionLabel label="What happens here" required />
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder={BIO_PLACEHOLDER}
                placeholderTextColor={T.textMuted}
                style={styles.textArea}
                multiline
                maxLength={120}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{bio.length}/120</Text>
            </View>

            {/* ── Category ── */}
            <View style={styles.field}>
              <SectionLabel label="Category" required />
              <View style={styles.chipGrid}>
                {CATEGORIES.map(cat => {
                  const active = category === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => handleCategorySelect(cat.id)}
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.categoryChip,
                        active && {
                          backgroundColor: color + '18',
                          borderColor:     color + '40',
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                      <Text style={[
                        styles.categoryLabel,
                        active && { color: color, fontWeight: '700' },
                      ]}>
                        {cat.label}
                      </Text>
                      {active && (
                        <Check size={rs(12)} color={color} strokeWidth={3} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Aura Color ── */}
            <View style={styles.field}>
              <SectionLabel label="Aura Color" />
              <Text style={styles.fieldHint}>
                This color defines your circle's energy.
              </Text>
              <View style={styles.colorRow}>
                {AURA_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => handleColorSelect(c)}
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      color === c && styles.colorSwatchActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    {color === c && (
                      <Check size={rs(12)} color="#fff" strokeWidth={3} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Avatar ── */}
            <View style={styles.field}>
              <SectionLabel label="Avatar" />
              <Text style={styles.fieldHint}>
                The face of your circle. Choose a photo or pick an emoji.
              </Text>

              {/* Photo picker — big central avatar button */}
              <View style={styles.avatarPickerRow}>
                {/* Current avatar preview */}
                <TouchableOpacity
                  onPress={pickFromGallery}
                  activeOpacity={0.85}
                  style={[styles.avatarPickerCircle, { borderColor: color + '60' }]}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarPickerImg} />
                  ) : (
                    <Text style={styles.avatarPickerEmoji}>{emoji}</Text>
                  )}
                  {/* Camera badge overlay */}
                  <View style={[styles.cameraBadge, { backgroundColor: color }]}>
                    <Camera size={rs(12)} color="#fff" strokeWidth={2.5} />
                  </View>
                </TouchableOpacity>

                {/* Action buttons */}
                <View style={styles.avatarActions}>
                  <TouchableOpacity
                    onPress={pickFromGallery}
                    activeOpacity={0.8}
                    hitSlop={HIT_SLOP}
                    style={[styles.avatarActionBtn, { borderColor: color + '40' }]}
                  >
                    <ImageIcon size={rs(15)} color={color} strokeWidth={2} />
                    <Text style={[styles.avatarActionText, { color }]}>Gallery</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={pickFromCamera}
                    activeOpacity={0.8}
                    hitSlop={HIT_SLOP}
                    style={[styles.avatarActionBtn, { borderColor: color + '40' }]}
                  >
                    <Camera size={rs(15)} color={color} strokeWidth={2} />
                    <Text style={[styles.avatarActionText, { color }]}>Camera</Text>
                  </TouchableOpacity>

                  {avatarUri && (
                    <TouchableOpacity
                      onPress={clearPhoto}
                      activeOpacity={0.8}
                      hitSlop={HIT_SLOP}
                      style={styles.avatarClearBtn}
                    >
                      <Text style={styles.avatarClearText}>Use emoji instead</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Emoji fallback grid */}
              {!avatarUri && (
                <>
                  <Text style={styles.orDivider}>— or pick an emoji —</Text>
                  <View style={styles.emojiGrid}>
                    {AVATAR_EMOJIS.map(e => (
                      <TouchableOpacity
                        key={e}
                        onPress={() => handleEmojiSelect(e)}
                        hitSlop={HIT_SLOP}
                        style={[
                          styles.emojiBtn,
                          emoji === e && {
                            backgroundColor: color + '20',
                            borderColor:     color + '50',
                          },
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.emojiText}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* ── Create button ── */}
            <View style={styles.createWrap}>
              <View style={[styles.btnGlow, { backgroundColor: color }]} />
              <TouchableOpacity
                onPress={handleCreate}
                disabled={loading || !canSubmit}
                style={[
                  styles.createBtn,
                  { backgroundColor: color },
                  (!canSubmit || loading) && styles.createBtnDisabled,
                ]}
                hitSlop={HIT_SLOP}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.createBtnText}>Open the circle</Text>
                }
              </TouchableOpacity>
            </View>

            <Text style={styles.finePrint}>
              Your identity stays hidden. Your circle lives on.
            </Text>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  auraGlow: {
    position:     'absolute',
    top:          -rs(100),
    alignSelf:    'center',
    width:        SCREEN_WIDTH * 1.2,
    height:       rs(260),
    opacity:      0.07,
    borderRadius: rs(130),
  },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn:      { padding: rp(4) },
  headerCenter: { alignItems: 'center' },
  headerTitle:  {
    fontSize:   FONT.lg,
    fontWeight: '700',
    color:      T.text,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  headerSub: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    fontStyle: 'italic',
    marginTop: rp(2),
  },

  content: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.md,
    paddingBottom:     rs(60),
  },
  formWrap: { gap: SPACING.lg },

  // Live preview
  previewCard: {
    flexDirection:   'row',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
    marginBottom:    SPACING.xs,
  },
  previewAccent:     { width: rp(3), opacity: 0.8 },
  previewInner: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    padding:       SPACING.md,
    gap:           SPACING.sm,
  },
  previewAvatar: {
    width:          rs(52),
    height:         rs(52),
    borderRadius:   rs(26),
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    overflow:       'hidden',
  },
  previewAvatarImg: { width: '100%', height: '100%', borderRadius: rs(26) },
  previewEmoji:     { fontSize: rf(24) },
  previewText:      { flex: 1 },
  previewName: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      T.text,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  previewBio: {
    fontSize:  FONT.xs,
    color:     T.textSecondary,
    marginTop: rp(3),
    fontStyle: 'italic',
  },

  field:        { gap: rp(8) },
  sectionLabel: {
    fontSize:      FONT.xs,
    fontWeight:    '700',
    color:         T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fieldHint: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    marginTop: -rp(4),
    fontStyle: 'italic',
  },

  input: {
    backgroundColor:   T.inputBg,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(13),
    fontSize:          FONT.md,
    color:             T.text,
    borderWidth:       1,
    borderColor:       T.border,
    fontFamily:        'PlayfairDisplay-Regular',
  },
  textArea: {
    backgroundColor:   T.inputBg,
    borderRadius:      RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(13),
    fontSize:          FONT.md,
    color:             T.text,
    borderWidth:       1,
    borderColor:       T.border,
    minHeight:         rs(90),
    fontStyle:         'italic',
  },
  charCount: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    textAlign: 'right',
  },

  chipGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.xs,
  },
  categoryChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(5),
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(9),
    borderRadius:      RADIUS.sm,
    backgroundColor:   T.surfaceAlt,
    borderWidth:       1,
    borderColor:       T.border,
  },
  categoryEmoji: { fontSize: rf(14) },
  categoryLabel: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontWeight: '500',
  },

  colorRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.sm,
  },
  colorSwatch: {
    width:          rs(36),
    height:         rs(36),
    borderRadius:   rs(18),
    alignItems:     'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    transform:    [{ scale: 1.18 }],
    shadowOffset: { width: 0, height: rp(3) },
    shadowOpacity: 0.5,
    shadowRadius:  rp(6),
    elevation:     6,
  },

  // Avatar picker
  avatarPickerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.md,
    marginBottom:  rp(4),
  },
  avatarPickerCircle: {
    width:        rs(88),
    height:       rs(88),
    borderRadius: rs(44),
    backgroundColor: T.surfaceAlt,
    borderWidth:  2,
    borderStyle:  'dashed',
    alignItems:   'center',
    justifyContent: 'center',
    overflow:     'visible',
  },
  avatarPickerImg: {
    width:        rs(88),
    height:       rs(88),
    borderRadius: rs(44),
  },
  avatarPickerEmoji: { fontSize: rf(36) },
  cameraBadge: {
    position:       'absolute',
    bottom:         0,
    right:          0,
    width:          rs(26),
    height:         rs(26),
    borderRadius:   rs(13),
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    2,
    borderColor:    T.background,
  },

  avatarActions: {
    flex:      1,
    gap:       rp(8),
  },
  avatarActionBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(8),
    paddingHorizontal: SPACING.sm,
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.sm,
    backgroundColor:   T.surfaceAlt,
    borderWidth:       1,
  },
  avatarActionText: {
    fontSize:   FONT.sm,
    fontWeight: '600',
  },
  avatarClearBtn: {
    paddingVertical: rp(4),
  },
  avatarClearText: {
    fontSize:          FONT.xs,
    color:             T.textMuted,
    textDecorationLine: 'underline',
  },

  orDivider: {
    textAlign:  'center',
    color:      T.textMuted,
    fontSize:   FONT.xs,
    fontStyle:  'italic',
    marginVertical: rp(4),
  },

  emojiGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.xs,
  },
  emojiBtn: {
    width:           rs(46),
    height:          rs(46),
    borderRadius:    RADIUS.sm,
    backgroundColor: T.surfaceAlt,
    borderWidth:     1,
    borderColor:     T.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  emojiText: { fontSize: rf(22) },

  createWrap: {
    position:   'relative',
    alignItems: 'center',
    marginTop:  SPACING.xs,
  },
  btnGlow: {
    position:     'absolute',
    width:        SCREEN_WIDTH * 0.6,
    height:       rs(60),
    borderRadius: rs(30),
    opacity:      0.25,
    top:          rs(10),
  },
  createBtn: {
    width:          '100%',
    height:         BUTTON_HEIGHT,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
    shadowOffset:   { width: 0, height: rs(6) },
    shadowOpacity:  0.4,
    shadowRadius:   rs(14),
    elevation:      8,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: {
    fontSize:      FONT.lg,
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: 0.3,
    fontFamily:    'PlayfairDisplay-Bold',
  },

  finePrint: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: -SPACING.xs,
  },
});
