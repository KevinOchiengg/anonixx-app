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
import { useDispatch, useSelector } from 'react-redux';
import { fetchBalance } from '../../store/slices/coinsSlice';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS, SCREEN,
  BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import T from '../../utils/theme';

// ─── Module-level static data (Rule 5) ───────────────────────
const GENDER_OPTIONS = [
  { id: 'male',              label: 'Male',              symbol: '♂' },
  { id: 'female',            label: 'Female',            symbol: '♀' },
  { id: 'nonbinary',         label: 'Non-binary',        symbol: '⚧' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say', symbol: '—' },
];

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
  const dispatch                    = useDispatch();
  const coinBalance                 = useSelector(state => state.coins?.balance ?? 0);

  const [username,        setUsername]        = useState(user?.username || '');
  const [email,           setEmail]           = useState(user?.email || '');
  const [anonymousName,   setAnonymousName]   = useState(user?.anonymous_name || '');
  const [gender,          setGender]          = useState(user?.gender || null);
  const [avatarUri,       setAvatarUri]       = useState(user?.avatar_url || null);
  const [loading,         setLoading]         = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPhotoDisclaimer, setShowPhotoDisclaimer] = useState(false);

  // Name availability check
  const [nameStatus,  setNameStatus]  = useState('idle'); // idle|checking|available|taken|invalid
  const [nameMessage, setNameMessage] = useState('');
  const nameTimer = useRef(null);

  // Entrance animation (Rule 14)
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rh(20))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay: 80, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, delay: 80, useNativeDriver: true }),
    ]).start();
    dispatch(fetchBalance());
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

  // ── Anonymous name live check ──────────────────────────────────
  const handleNameChange = useCallback((text) => {
    setAnonymousName(text);
    clearTimeout(nameTimer.current);
    if (!text.trim() || text.trim() === user?.anonymous_name) {
      setNameStatus('idle'); setNameMessage(''); return;
    }
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(text.trim())) {
      setNameStatus('invalid');
      setNameMessage('3–30 chars · letters, numbers, . - _ only');
      return;
    }
    setNameStatus('checking');
    nameTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const token = await AsyncStorage.getItem('token');
        const res   = await fetch(
          `${API_BASE_URL}/api/v1/auth/check-name?name=${encodeURIComponent(text.trim())}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          setNameStatus(data.available ? 'available' : 'taken');
          setNameMessage(data.available ? '' : (data.message || 'Name already taken'));
        } else {
          setNameStatus('idle');
        }
      } catch { clearTimeout(timeout); setNameStatus('idle'); }
    }, 400);
  }, [user?.anonymous_name]);

  // ── Pick avatar (Rule 7, Rule 2, Rule 3, Rule 10) ─────────────
  const pickAvatar = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Allow photo access to change your avatar.' });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    'images',
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
    if (nameStatus === 'taken' || nameStatus === 'invalid') {
      showToast({ type: 'warning', message: nameMessage || 'Fix your anonymous name first.' });
      return;
    }
    if (nameStatus === 'checking') {
      showToast({ type: 'info', message: 'Still checking name availability…' });
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const body  = { username: username.trim(), email: email.trim() };
      if (avatarUri && avatarUri !== user?.avatar_url) body.avatar_url = avatarUri;
      if (anonymousName.trim() && anonymousName.trim() !== user?.anonymous_name) {
        body.anonymous_name = anonymousName.trim();
      }

      const res  = await fetch(`${API_BASE_URL}/api/v1/auth/update-profile`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        const errMsg = data?.detail || 'Could not save your profile. Try again.';
        showToast({ type: 'error', message: errMsg });
        return;
      }

      // Save gender separately (optional, non-blocking)
      if (gender && gender !== user?.gender) {
        await fetch(`${API_BASE_URL}/api/v1/auth/gender`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ gender }),
        });
      }

      updateUserProfile?.({
        username:       data.username,
        email:          data.email,
        avatar_url:     data.avatar_url,
        anonymous_name: data.anonymous_name,
        gender,
      });
      showToast({ type: 'success', message: 'Profile updated.' });
      navigation.goBack();
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Check your connection.' });
    } finally {
      setLoading(false);
    }
  }, [username, email, anonymousName, avatarUri, user, updateUserProfile, showToast, navigation]);

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
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
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
              onPress={() => avatarUri ? pickAvatar() : setShowPhotoDisclaimer(d => !d)}
              disabled={uploadingAvatar}
              hitSlop={HIT_SLOP}
              activeOpacity={0.85}
            >
              <Camera size={rs(16)} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.avatarHint}>
            {uploadingAvatar ? 'uploading…' : 'tap to set a photo'}
          </Text>

          {/* Photo disclaimer — shown inline before first upload */}
          {showPhotoDisclaimer && !avatarUri && (
            <View style={styles.photoDisclaimer}>
              <Text style={styles.photoDisclaimerTitle}>⚠️  Before you upload</Text>
              <Text style={styles.photoDisclaimerBody}>
                A real photo makes you identifiable to anyone who sees your profile.
                Anonixx is built for anonymous expression — we recommend keeping this blank.
                If you proceed, this is visible to other users.
              </Text>
              <View style={styles.photoDisclaimerActions}>
                <TouchableOpacity
                  style={styles.photoDisclaimerConfirm}
                  onPress={() => { setShowPhotoDisclaimer(false); pickAvatar(); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.photoDisclaimerConfirmText}>I understand, pick a photo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowPhotoDisclaimer(false)} hitSlop={HIT_SLOP}>
                  <Text style={styles.photoDisclaimerCancel}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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

          <FieldCard
            label="Anonymous Name"
            hint={
              nameStatus === 'available' ? '✓ Available' :
              nameStatus === 'taken'     ? '✗ ' + nameMessage :
              nameStatus === 'invalid'   ? '✗ ' + nameMessage :
              nameStatus === 'checking'  ? 'Checking…' :
              'how the void knows you — changeable every 30 days'
            }
          >
            <View style={[
              styles.inputRow,
              nameStatus === 'available' && { borderColor: '#10B981' },
              (nameStatus === 'taken' || nameStatus === 'invalid') && { borderColor: '#EF4444' },
            ]}>
              <User size={rs(16)} color={T.textSecondary} strokeWidth={1.8} />
              <TextInput
                value={anonymousName}
                onChangeText={handleNameChange}
                placeholder="your alias in the dark"
                placeholderTextColor={T.textMuted}
                autoCapitalize="none"
                maxLength={30}
                style={styles.inputText}
              />
              {nameStatus === 'checking'  && <ActivityIndicator size="small" color={T.primary} />}
              {nameStatus === 'available' && <Text style={{ color: '#10B981', fontWeight: '800', fontSize: rf(16) }}>✓</Text>}
              {(nameStatus === 'taken' || nameStatus === 'invalid') && <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: rf(16) }}>✗</Text>}
            </View>
          </FieldCard>

          <FieldCard label="Gender" hint="only visible on your anonymous connect profile">
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((opt) => {
                const isSelected = gender === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => setGender(isSelected ? null : opt.id)}
                    style={[styles.genderChip, isSelected && styles.genderChipSelected]}
                    activeOpacity={0.8}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={[styles.genderChipText, isSelected && styles.genderChipTextSelected]}>
                      {opt.symbol}{'  '}{opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FieldCard>

          {/* Coins */}
          <View style={styles.coinsCard}>
            <View style={styles.coinsInner}>
              <View style={styles.coinsIconWrap}>
                <Text style={styles.coinsEmoji}>💰</Text>
              </View>
              <View>
                <Text style={styles.coinsLabel}>Your Coins</Text>
                <Text style={styles.coinsValue}>{coinBalance}</Text>
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
            💡  Anonymous name can be changed once every 30 days.{'\n'}Choose something that feels like you — you're stuck with it for a while.
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

  // Gender selector
  genderRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rp(8),
  },
  genderChip: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    backgroundColor:   T.inputBg,
    borderWidth:       1,
    borderColor:       T.border,
  },
  genderChipSelected: {
    backgroundColor: 'rgba(255,99,74,0.12)',
    borderColor:     'rgba(255,99,74,0.45)',
  },
  genderChipText: {
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    fontWeight: '500',
  },
  genderChipTextSelected: {
    color:      T.primary,
    fontWeight: '700',
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

  // Photo disclaimer
  photoDisclaimer: {
    marginHorizontal: SPACING.md,
    marginTop:        SPACING.sm,
    padding:          SPACING.md,
    backgroundColor:  'rgba(251,191,36,0.07)',
    borderRadius:     RADIUS.lg,
    borderWidth:      1,
    borderColor:      'rgba(251,191,36,0.25)',
    gap:              rp(8),
  },
  photoDisclaimerTitle: { fontSize: FONT.sm, fontWeight: '700', color: T.text },
  photoDisclaimerBody:  { fontSize: rf(12), color: T.textSecondary, lineHeight: rf(18) },
  photoDisclaimerActions: { gap: rp(8), marginTop: rp(4) },
  photoDisclaimerConfirm: {
    backgroundColor: T.primary, borderRadius: RADIUS.md,
    paddingVertical: rp(11), alignItems: 'center',
  },
  photoDisclaimerConfirmText: { color: '#fff', fontWeight: '700', fontSize: FONT.sm },
  photoDisclaimerCancel: {
    color: T.textSecondary, fontSize: FONT.sm, textAlign: 'center', paddingVertical: rp(6),
  },
});
