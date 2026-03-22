import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft, AtSign, Camera, Mail, Save, User,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS, SCREEN,
  BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:  '#0b0f18',
  surface:     '#151924',
  surfaceAlt:  '#1a1f2e',
  primary:     '#FF634A',
  primaryDim:  'rgba(255,99,74,0.12)',
  primaryBorder: 'rgba(255,99,74,0.25)',
  text:        '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:   '#4a5068',
  border:      'rgba(255,255,255,0.06)',
  inputBg:     'rgba(255,255,255,0.04)',
};

// ─── Module-level star data (Rule 5) ──────────────────────────
const STARS = Array.from({ length: 30 }, (_, i) => ({
  id:      i,
  top:     Math.random() * SCREEN.height,
  left:    Math.random() * SCREEN.width,
  size:    Math.random() * rs(2.5) + rs(0.5),
  opacity: Math.random() * 0.35 + 0.08,
}));

// ─── Cloudinary config (module-level, Rule 5) ─────────────────
const CLOUDINARY_CLOUD_NAME   = 'dojbdm2e1';
const CLOUDINARY_UPLOAD_PRESET = 'anonix';

// ─── StarryBackground (Rule 6 — React.memo) ───────────────────
const StarryBackground = React.memo(() => (
  <>
    {STARS.map(s => (
      <View key={s.id} style={{
        position:        'absolute',
        backgroundColor: T.primary,
        borderRadius:    s.size,
        top:             s.top,
        left:            s.left,
        width:           s.size,
        height:          s.size,
        opacity:         s.opacity,
      }} />
    ))}
  </>
));

// ─── Field card (Rule 6) ──────────────────────────────────────
const FieldCard = React.memo(({ label, hint, children }) => (
  <View style={styles.fieldCard}>
    <View style={styles.fieldAccent} />
    <View style={styles.fieldInner}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  </View>
));

// ─── Screen ───────────────────────────────────────────────────
export default function EditProfileScreen({ navigation }) {
  const { user, updateUserProfile } = useAuth();
  const { showToast }               = useToast();

  const [username,        setUsername]        = useState(user?.username || '');
  const [email,           setEmail]           = useState(user?.email || '');
  const [avatarUri,       setAvatarUri]       = useState(user?.avatar_url || null);
  const [loading,         setLoading]         = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Entrance animation (Rule 14)
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rh(20))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay: 80, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, delay: 80, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Cloudinary upload (Rule 7 — useCallback, Rule 11 — try/catch) ──
  const uploadToCloudinary = useCallback(async (uri) => {
    const uriParts = uri.split('.');
    const fileType = uriParts[uriParts.length - 1];

    const formData = new FormData();
    formData.append('file', { uri, type: `image/${fileType}`, name: `avatar.${fileType}` });
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'avatars');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    const data = await response.json();
    if (!response.ok) throw new Error('upload_failed');
    return data.secure_url;
  }, []);

  // ── Pick avatar (Rule 7, Rule 2, Rule 3, Rule 10) ─────────────
  const pickAvatar = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Allow photo access to change your avatar.' });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect:        [1, 1],
        quality:       0.8,
      });

      if (result.canceled) return;

      setUploadingAvatar(true);
      try {
        const cloudUrl = await uploadToCloudinary(result.assets[0].uri);
        setAvatarUri(cloudUrl);
        showToast({ type: 'success', message: 'Avatar ready. Hit save to lock it in.' });
      } catch {
        // Fall back to local URI so the user still sees a preview
        setAvatarUri(result.assets[0].uri);
        showToast({ type: 'warning', message: 'Could not upload photo. Save to keep it local.' });
      } finally {
        setUploadingAvatar(false);
      }
    } catch {
      setUploadingAvatar(false);
      showToast({ type: 'error', message: 'Something went wrong. Try again.' });
    }
  }, [uploadToCloudinary, showToast]);

  // ── Save profile (Rule 7, Rule 2, Rule 3, Rule 10, Rule 11) ───
  const handleSave = useCallback(async () => {
    if (!username.trim()) {
      showToast({ type: 'warning', message: 'Your name cannot be empty.' });
      return;
    }
    if (!email.trim()) {
      showToast({ type: 'warning', message: 'An email is required.' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast({ type: 'warning', message: 'That email doesn\'t look right.' });
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const body  = { username: username.trim(), email: email.trim() };
      if (avatarUri && avatarUri !== user?.avatar_url) body.avatar_url = avatarUri;

      const res  = await fetch(`${API_BASE_URL}/api/v1/auth/update-profile`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast({ type: 'error', message: 'Could not save your profile. Try again.' });
        return;
      }

      updateUserProfile?.({ username: data.username, email: data.email, avatar_url: data.avatar_url });
      showToast({ type: 'success', message: 'Profile updated.' });
      navigation.goBack();
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Check your connection.' });
    } finally {
      setLoading(false);
    }
  }, [username, email, avatarUri, user, updateUserProfile, showToast, navigation]);

  const isBusy = loading || uploadingAvatar;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={T.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={HIT_SLOP}
        >
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
      >
        {/* ── Avatar ── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={rs(44)} color={T.textMuted} strokeWidth={1.5} />
              </View>
            )}

            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="large" color={T.primary} />
              </View>
            )}

            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={pickAvatar}
              disabled={uploadingAvatar}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              <Camera size={rs(16)} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <Text style={styles.avatarHint}>
            {uploadingAvatar ? 'uploading…' : 'tap to change your face'}
          </Text>
        </View>

        {/* ── Form ── */}
        <View style={styles.form}>
          <FieldCard label="Username" hint="how others see you in the dark">
            <View style={styles.inputRow}>
              <AtSign size={rs(16)} color={T.textSecondary} strokeWidth={1.8} />
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="your name here"
                placeholderTextColor={T.textMuted}
                autoCapitalize="none"
                style={styles.inputText}
              />
            </View>
          </FieldCard>

          <FieldCard label="Email" hint="kept private, always">
            <View style={styles.inputRow}>
              <Mail size={rs(16)} color={T.textSecondary} strokeWidth={1.8} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={T.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.inputText}
              />
            </View>
          </FieldCard>

          <FieldCard label="Anonymous Name" hint="generated by the void — unchangeable">
            <View style={[styles.inputRow, styles.inputRowDisabled]}>
              <User size={rs(16)} color={T.textMuted} strokeWidth={1.8} />
              <Text style={styles.disabledText}>{user?.anonymous_name || 'not set'}</Text>
            </View>
          </FieldCard>

          {/* Coins */}
          <View style={styles.coinsCard}>
            <View style={styles.coinsAccent} />
            <View style={styles.coinsInner}>
              <View style={styles.coinsIconWrap}>
                <Text style={styles.coinsEmoji}>💰</Text>
              </View>
              <View>
                <Text style={styles.coinsLabel}>Your Coins</Text>
                <Text style={styles.coinsValue}>{user?.coin_balance ?? 0}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Save ── */}
        <TouchableOpacity
          style={[styles.saveBtn, isBusy && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isBusy}
          activeOpacity={0.85}
          hitSlop={HIT_SLOP}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : (
              <>
                <Save size={rs(18)} color="#fff" strokeWidth={2.5} />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )
          }
        </TouchableOpacity>

        {/* ── Info note ── */}
        <View style={styles.infoNote}>
          <Text style={styles.infoText}>
            💡  Username and email can change anytime.{'\n'}Your anonymous name is forever — generated by the void.
          </Text>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    zIndex:            10,
  },
  backBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    rs(18),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerTitle: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      T.text,
  },

  content: {
    paddingBottom: rh(48),
  },

  // Avatar
  avatarSection: {
    alignItems:    'center',
    paddingTop:    rh(28),
    paddingBottom: rh(20),
  },
  avatarWrap: {
    position:    'relative',
    width:       rs(110),
    height:      rs(110),
    marginBottom: rp(12),
  },
  avatarImage: {
    width:        '100%',
    height:       '100%',
    borderRadius: rs(55),
    borderWidth:  rs(2),
    borderColor:  T.primaryBorder,
  },
  avatarPlaceholder: {
    width:           '100%',
    height:          '100%',
    borderRadius:    rs(55),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     rs(2),
    borderColor:     T.primaryBorder,
  },
  avatarOverlay: {
    position:        'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius:    rs(55),
    alignItems:      'center',
    justifyContent:  'center',
  },
  cameraBtn: {
    position:        'absolute',
    bottom:          0,
    right:           0,
    width:           rs(34),
    height:          rs(34),
    borderRadius:    rs(17),
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     rs(2),
    borderColor:     T.background,
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.45,
    shadowRadius:    rs(8),
    elevation:       8,
  },
  avatarHint: {
    fontSize:  FONT.xs,
    color:     T.textMuted,
    fontStyle: 'italic',
  },

  // Form
  form: {
    paddingHorizontal: SPACING.md,
    gap:               SPACING.sm,
  },
  fieldCard: {
    flexDirection:   'row',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
  },
  fieldAccent: {
    width:           rs(2),
    alignSelf:       'stretch',
    backgroundColor: T.primary,
    opacity:         0.7,
  },
  fieldInner: {
    flex:    1,
    padding: SPACING.md,
    gap:     rp(6),
  },
  fieldLabel: {
    fontSize:      rs(10),
    fontWeight:    '700',
    color:         T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: rp(0.8),
  },
  fieldHint: {
    fontSize:  rs(11),
    color:     T.textMuted,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.sm,
    backgroundColor: T.inputBg,
    borderRadius:    RADIUS.md,
    paddingHorizontal: rp(12),
    paddingVertical: rp(10),
    borderWidth:     1,
    borderColor:     T.border,
  },
  inputRowDisabled: {
    opacity: 0.5,
  },
  inputText: {
    flex:      1,
    fontSize:  FONT.md,
    color:     T.text,
    paddingVertical: 0,
  },
  disabledText: {
    flex:      1,
    fontSize:  FONT.md,
    color:     T.textSecondary,
    fontStyle: 'italic',
  },

  // Coins card
  coinsCard: {
    flexDirection:   'row',
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.primaryBorder,
    overflow:        'hidden',
  },
  coinsAccent: {
    width:           rs(2),
    alignSelf:       'stretch',
    backgroundColor: T.primary,
  },
  coinsInner: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.md,
    padding:       SPACING.md,
  },
  coinsIconWrap: {
    width:           rs(46),
    height:          rs(46),
    borderRadius:    rs(23),
    backgroundColor: T.primaryDim,
    alignItems:      'center',
    justifyContent:  'center',
  },
  coinsEmoji:  { fontSize: rf(24) },
  coinsLabel: {
    fontSize:   FONT.xs,
    fontWeight: '600',
    color:      T.primary,
    marginBottom: rp(2),
  },
  coinsValue: {
    fontSize:   FONT.xl,
    fontWeight: '800',
    color:      T.text,
  },

  // Save button
  saveBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               SPACING.sm,
    marginHorizontal:  SPACING.md,
    marginTop:         SPACING.lg,
    height:            BUTTON_HEIGHT,
    borderRadius:      RADIUS.lg,
    backgroundColor:   T.primary,
    shadowColor:       T.primary,
    shadowOffset:      { width: 0, height: rs(6) },
    shadowOpacity:     0.40,
    shadowRadius:      rs(14),
    elevation:         8,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      '#fff',
  },

  // Info note
  infoNote: {
    marginHorizontal: SPACING.md,
    marginTop:        SPACING.lg,
    padding:          SPACING.md,
    backgroundColor:  T.surface,
    borderRadius:     RADIUS.lg,
    borderWidth:      1,
    borderColor:      T.border,
  },
  infoText: {
    fontSize:   FONT.xs,
    color:      T.textSecondary,
    lineHeight: rf(20),
  },
});
