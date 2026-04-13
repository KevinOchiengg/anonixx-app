import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, Image,
  TouchableOpacity, StyleSheet, ActivityIndicator,
  StatusBar, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS,
  BUTTON_HEIGHT, SCREEN, HIT_SLOP,
} from '../../utils/responsive';

// ─── THEME ───────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.06)',
};

// ─── STATIC DATA ─────────────────────────────────────────────────────────────
const STARS = Array.from({ length: 30 }, (_, i) => ({
  id:      i,
  top:     Math.random() * SCREEN.height,
  left:    Math.random() * SCREEN.width,
  size:    Math.random() * rs(2.5) + rs(0.5),
  opacity: Math.random() * 0.35 + 0.1,
}));

const GENDER_OPTIONS = [
  {
    id:    'male',
    label: 'Man',
    symbol: '♂',
    color: '#5B9CF6',
    desc:  'identifying as male',
  },
  {
    id:    'female',
    label: 'Woman',
    symbol: '♀',
    color: '#F472B6',
    desc:  'identifying as female',
  },
  {
    id:    'nonbinary',
    label: 'Non-binary',
    symbol: '⚧',
    color: '#A78BFA',
    desc:  'beyond the binary',
  },
  {
    id:    'prefer_not_to_say',
    label: 'Prefer not to say',
    symbol: '—',
    color: '#9CA3AF',
    desc:  'keep it private',
  },
];

// Life tags — grouped by what people are actually carrying.
// Think: single mum at 2am who needs someone steady, not a dating app swipe.
// Groups: situation (where you are), need (what you're looking for), voice (how you show up)
const VIBE_TAGS = [
  // Where you are
  { id: 'raising kids alone',      emoji: '🧒', label: 'Raising kids alone',       group: 'situation' },
  { id: 'starting over',           emoji: '🌱', label: 'Starting over',            group: 'situation' },
  { id: 'been through a lot',      emoji: '🔥', label: 'Been through a lot',       group: 'situation' },
  { id: 'healing in progress',     emoji: '🩹', label: 'Healing in progress',      group: 'situation' },
  { id: 'carrying a lot',          emoji: '🪨', label: 'Carrying a lot',           group: 'situation' },
  { id: 'still standing',          emoji: '🏔️', label: 'Still standing',           group: 'situation' },
  { id: 'lost right now',          emoji: '🌫️', label: 'Lost right now',           group: 'situation' },
  { id: 'rebuilding myself',       emoji: '🔨', label: 'Rebuilding myself',        group: 'situation' },
  // What you need
  { id: 'need someone steady',     emoji: '⚓', label: 'Need someone steady',      group: 'need' },
  { id: 'looking for something real', emoji: '❤️', label: 'Looking for something real', group: 'need' },
  { id: 'just need to be heard',   emoji: '🌙', label: 'Just need to be heard',   group: 'need' },
  { id: 'open to connection',      emoji: '🤲', label: 'Open to connection',       group: 'need' },
  { id: 'not looking for games',   emoji: '🚫', label: 'Not looking for games',   group: 'need' },
  { id: 'no rush',                 emoji: '🕊️', label: 'No rush',                 group: 'need' },
  // How you show up
  { id: 'emotionally available',   emoji: '💬', label: 'Emotionally available',   group: 'voice' },
  { id: 'blunt but caring',        emoji: '🗡️', label: 'Blunt but caring',        group: 'voice' },
  { id: 'soft but strong',         emoji: '🧸', label: 'Soft but strong',         group: 'voice' },
  { id: 'overthinks everything',   emoji: '🌀', label: 'Overthinks everything',   group: 'voice' },
  { id: 'here for the long run',   emoji: '🌿', label: 'Here for the long run',   group: 'voice' },
  { id: 'ready to try again',      emoji: '🌅', label: 'Ready to try again',      group: 'voice' },
];

const VIBE_GROUPS = [
  { id: 'situation', label: 'Where you are'       },
  { id: 'need',      label: 'What you need'        },
  { id: 'voice',     label: 'How you show up'      },
];

const MAX_VIBES   = 5;
const TOTAL_STEPS = 3; // 0=gender  1=vibes  2=identity

const PRESET_AVATARS = [
  { id: 'ghost',   emoji: '👻', color: '#FF634A' },
  { id: 'owl',     emoji: '🦉', color: '#8B5CF6' },
  { id: 'moon',    emoji: '🌙', color: '#3B82F6' },
  { id: 'star',    emoji: '⭐', color: '#F59E0B' },
  { id: 'wolf',    emoji: '🐺', color: '#10B981' },
  { id: 'fox',     emoji: '🦊', color: '#EC4899' },
  { id: 'mask',    emoji: '🎭', color: '#6366F1' },
  { id: 'cat',     emoji: '🐱', color: '#14B8A6' },
];

const CLOUDINARY_CLOUD_NAME    = 'dojbdm2e1';
const CLOUDINARY_UPLOAD_PRESET = 'anonix';

const ANON_NAME_SUGGESTIONS = [
  'midnight.echo', 'quiet.storm', 'lost.signal', 'still.water',
  'neon.ghost', 'soft.thunder', 'broken.orbit', 'pale.flame',
  'hollow.voice', 'deep.current', 'grey.matter', 'open.wound',
];

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
const StarryBackground = React.memo(() => (
  <>
    {STARS.map((s) => (
      <View
        key={s.id}
        style={{
          position:        'absolute',
          backgroundColor: T.primary,
          borderRadius:    s.size,
          top:             s.top,
          left:            s.left,
          width:           s.size,
          height:          s.size,
          opacity:         s.opacity,
        }}
      />
    ))}
  </>
));

const GenderCard = React.memo(({ option, selected, onPress }) => {
  const scale     = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const isSelected = selected === option.id;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.94, duration: 80,  useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1,    tension: 240, friction: 7, useNativeDriver: true }),
    ]).start();
    onPress(option.id);
  }, [option.id, onPress, scale]);

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: isSelected ? 1 : 0, duration: 200, useNativeDriver: false,
    }).start();
  }, [isSelected]);

  const borderColor = glowAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(255,255,255,0.06)', option.color],
  });
  const bgColor = glowAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(255,255,255,0.02)', option.color + '18'],
  });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.85} hitSlop={HIT_SLOP}>
        <Animated.View style={[styles.genderCard, { borderColor, backgroundColor: bgColor }]}>
          {/* Symbol circle */}
          <Animated.View style={[
            styles.genderSymbolWrap,
            { borderColor, backgroundColor: isSelected ? option.color + '22' : 'rgba(255,255,255,0.04)' },
          ]}>
            <Text style={[styles.genderSymbol, { color: isSelected ? option.color : T.textSecondary }]}>
              {option.symbol}
            </Text>
          </Animated.View>

          {/* Labels */}
          <View style={styles.genderTextWrap}>
            <Text style={[styles.genderLabel, isSelected && { color: option.color }]}>
              {option.label}
            </Text>
            <Text style={styles.genderDesc}>{option.desc}</Text>
          </View>

          {/* Check mark */}
          <View style={[
            styles.genderCheck,
            { backgroundColor: isSelected ? option.color : 'rgba(255,255,255,0.06)' },
          ]}>
            <Text style={[styles.genderCheckMark, { opacity: isSelected ? 1 : 0 }]}>✓</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const VibeChip = React.memo(({ vibe, selected, onPress, disabled }) => {
  const scale      = useRef(new Animated.Value(1)).current;
  const isSelected = selected.includes(vibe.id);

  const handlePress = useCallback(() => {
    if (disabled && !isSelected) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 65, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 240, friction: 7, useNativeDriver: true }),
    ]).start();
    onPress(vibe.id);
  }, [vibe.id, onPress, scale, disabled, isSelected]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={[
          styles.vibeChip,
          isSelected && styles.vibeChipSelected,
          disabled && !isSelected && styles.vibeChipDisabled,
        ]}
      >
        <Text style={[styles.vibeEmoji, disabled && !isSelected && { opacity: 0.35 }]}>
          {vibe.emoji}
        </Text>
        <Text style={[
          styles.vibeName,
          isSelected && styles.vibeNameSelected,
          disabled && !isSelected && styles.vibeNameDisabled,
        ]}>
          {vibe.label}
        </Text>
        {isSelected && <Text style={styles.vibeCheck}>✓</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── SCREEN ──────────────────────────────────────────────────────────────────
export default function InterestSelectionScreen({ navigation }) {
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();

  const [step,           setStep]           = useState(0);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedVibes,  setSelectedVibes]  = useState([]);
  const [activeGroup,    setActiveGroup]    = useState('situation');
  const [loading,        setLoading]        = useState(false);

  // Identity step state
  const [anonymousName,     setAnonymousName]     = useState('');
  const [nameStatus,        setNameStatus]        = useState('idle'); // idle|checking|available|taken|invalid
  const [nameMessage,       setNameMessage]       = useState('');
  const [selectedAvatar,    setSelectedAvatar]    = useState('ghost');
  const [photoUri,          setPhotoUri]          = useState(null);
  const [showDisclaimer,    setShowDisclaimer]    = useState(false);
  const [uploadingPhoto,    setUploadingPhoto]    = useState(false);
  const nameCheckTimer = useRef(null);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rh(18))).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(rh(18));
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [step]);

  const goTo = useCallback((next) => setStep(next), []);

  const handleGenderPress = useCallback((id) => {
    setSelectedGender((prev) => (prev === id ? null : id));
  }, []);

  const toggleVibe = useCallback((id) => {
    setSelectedVibes((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_VIBES) {
        showToast({ type: 'info', message: `${MAX_VIBES} max — deselect one first.` });
        return prev;
      }
      return [...prev, id];
    });
  }, [showToast]);

  // ── Identity step handlers ───────────────────────────────
  const handleNameChange = useCallback((text) => {
    setAnonymousName(text);
    clearTimeout(nameCheckTimer.current);
    if (!text.trim()) { setNameStatus('idle'); setNameMessage(''); return; }
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(text.trim())) {
      setNameStatus('invalid');
      setNameMessage('3–30 chars · letters, numbers, . - _ only');
      return;
    }
    setNameStatus('checking');
    nameCheckTimer.current = setTimeout(async () => {
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
          setNameMessage(data.message || (data.available ? '' : 'Name already taken'));
        } else {
          setNameStatus('idle');
        }
      } catch { clearTimeout(timeout); setNameStatus('idle'); }
    }, 400);
  }, []);

  const suggestName = useCallback(() => {
    const pick = ANON_NAME_SUGGESTIONS[Math.floor(Math.random() * ANON_NAME_SUGGESTIONS.length)];
    handleNameChange(pick);
  }, [handleNameChange]);

  const uploadToCloudinary = useCallback(async (uri) => {
    const ext  = uri.split('.').pop();
    const form = new FormData();
    form.append('file',           { uri, type: `image/${ext}`, name: `avatar.${ext}` });
    form.append('upload_preset',  CLOUDINARY_UPLOAD_PRESET);
    form.append('folder',         'avatars');
    const res  = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: form }
    );
    const data = await res.json();
    if (!res.ok) throw new Error('upload_failed');
    return data.secure_url;
  }, []);

  const handlePickPhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Allow photo access to set a picture.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      if (result.canceled) return;
      setUploadingPhoto(true);
      try {
        const url = await uploadToCloudinary(result.assets[0].uri);
        setPhotoUri(url);
        setSelectedAvatar(null);
      } catch {
        setPhotoUri(result.assets[0].uri);
        setSelectedAvatar(null);
      } finally { setUploadingPhoto(false); }
    } catch { setUploadingPhoto(false); }
  }, [uploadToCloudinary, showToast]);

  const handleFinish = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', message: 'Session expired. Sign in again.' });
        return;
      }

      if (selectedGender) {
        fetch(`${API_BASE_URL}/api/v1/auth/gender`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ gender: selectedGender }),
        }).catch(() => {});
      }

      if (selectedVibes.length > 0) {
        fetch(`${API_BASE_URL}/api/v1/connect/vibes`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ vibe_tags: selectedVibes }),
        }).catch(() => {});
      }

      // Save identity (name + avatar) — fire-and-forget, non-blocking
      const identityBody = {};
      if (anonymousName.trim() && nameStatus === 'available') {
        identityBody.anonymous_name = anonymousName.trim();
      }
      if (photoUri) {
        identityBody.avatar_url = photoUri;
      } else if (selectedAvatar) {
        const av = PRESET_AVATARS.find(a => a.id === selectedAvatar);
        if (av) { identityBody.avatar = av.id; identityBody.avatar_color = av.color; }
      }
      if (Object.keys(identityBody).length > 0) {
        fetch(`${API_BASE_URL}/api/v1/auth/update-profile`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify(identityBody),
        }).catch(() => {});
      }

      const pendingReferral = await AsyncStorage.getItem('pendingReferralComplete');
      if (pendingReferral) {
        try {
          await fetch(`${API_BASE_URL}/api/v1/referrals/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
        } catch { /* fire-and-forget */ }
        await AsyncStorage.removeItem('pendingReferralComplete');
      }

      showToast({ type: 'success', message: 'Saved. Your feed will feel different now.' });
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [loading, selectedGender, selectedVibes, anonymousName, nameStatus, photoUri, selectedAvatar, showToast, navigation]);

  const handleSkip = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      goTo(step + 1);
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }
  }, [step, goTo, navigation]);

  const STEP_META = [
    { title: 'How do you identify?',  subtitle: 'This stays private. It only helps us personalise your experience.' },
    { title: 'What are you carrying?', subtitle: `Pick up to ${MAX_VIBES} that feel true. People with similar tags find each other.` },
    { title: 'Create your alter ego.', subtitle: 'This is who you are on Anonixx. You can always change it later.' },
  ];
  const meta       = STEP_META[step];
  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.background} />
      <StarryBackground />

      {/* Progress */}
      <View style={[styles.progressWrap, { paddingTop: Math.max(insets.top, rh(12)) }]}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{step + 1} / {TOTAL_STEPS}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {step > 0 && (
            <TouchableOpacity
              onPress={() => goTo(step - 1)}
              style={styles.backBtn}
              hitSlop={HIT_SLOP}
              activeOpacity={0.7}
            >
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.subtitle}>{meta.subtitle}</Text>

          {/* ── STEP 0: GENDER ── */}
          {step === 0 && (
            <View style={styles.genderList}>
              {GENDER_OPTIONS.map((opt) => (
                <GenderCard
                  key={opt.id}
                  option={opt}
                  selected={selectedGender}
                  onPress={handleGenderPress}
                />
              ))}
            </View>
          )}

          {/* ── STEP 1: LIFE TAGS ── */}
          {step === 1 && (
            <>
              {/* Counter badge */}
              <View style={styles.vibeCountRow}>
                <Text style={styles.vibeCountText}>
                  {selectedVibes.length} / {MAX_VIBES} selected
                </Text>
                {selectedVibes.length > 0 && (
                  <TouchableOpacity onPress={() => setSelectedVibes([])} hitSlop={HIT_SLOP}>
                    <Text style={styles.vibeClearText}>clear all</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Group tabs */}
              <View style={styles.groupTabs}>
                {VIBE_GROUPS.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.groupTab, activeGroup === g.id && styles.groupTabActive]}
                    onPress={() => setActiveGroup(g.id)}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.groupTabText, activeGroup === g.id && styles.groupTabTextActive]}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tags for active group */}
              <View style={styles.vibeGrid}>
                {VIBE_TAGS.filter(v => v.group === activeGroup).map((vibe) => (
                  <VibeChip
                    key={vibe.id}
                    vibe={vibe}
                    selected={selectedVibes}
                    onPress={toggleVibe}
                    disabled={selectedVibes.length >= MAX_VIBES}
                  />
                ))}
              </View>

              {/* Selected pills summary */}
              {selectedVibes.length > 0 && (
                <View style={styles.vibeSelectedWrap}>
                  <Text style={styles.vibeSelectedLabel}>Your picks:</Text>
                  <View style={styles.vibeSelectedPills}>
                    {selectedVibes.map(id => {
                      const tag = VIBE_TAGS.find(v => v.id === id);
                      return tag ? (
                        <View key={id} style={styles.vibeSelectedPill}>
                          <Text style={styles.vibeSelectedPillText}>{tag.emoji} {tag.label}</Text>
                        </View>
                      ) : null;
                    })}
                  </View>
                </View>
              )}
            </>
          )}

          {/* ── STEP 2: IDENTITY ── */}
          {step === 2 && (
            <>
              {/* Avatar row */}
              <Text style={styles.identityLabel}>Choose your avatar</Text>
              <View style={styles.avatarRow}>
                {PRESET_AVATARS.map((av) => {
                  const isActive = selectedAvatar === av.id && !photoUri;
                  return (
                    <TouchableOpacity
                      key={av.id}
                      style={[
                        styles.avatarOption,
                        { borderColor: isActive ? av.color : 'transparent', backgroundColor: av.color + '22' },
                      ]}
                      onPress={() => { setSelectedAvatar(av.id); setPhotoUri(null); }}
                      hitSlop={HIT_SLOP}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.avatarOptionEmoji}>{av.emoji}</Text>
                      {isActive && <View style={[styles.avatarOptionDot, { backgroundColor: av.color }]} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Photo option */}
              {!showDisclaimer && !photoUri && (
                <TouchableOpacity
                  style={styles.photoLink}
                  onPress={() => setShowDisclaimer(true)}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.photoLinkText}>Use a real photo instead →</Text>
                </TouchableOpacity>
              )}

              {/* Disclaimer — shown inline when they tap "use a photo" */}
              {showDisclaimer && !photoUri && (
                <View style={styles.disclaimerCard}>
                  <Text style={styles.disclaimerIcon}>⚠️</Text>
                  <Text style={styles.disclaimerTitle}>Heads up about anonymity</Text>
                  <Text style={styles.disclaimerBody}>
                    Using a real photo means anyone who sees your profile can identify you.
                    Anonixx is built for safe, anonymous expression — we recommend an avatar.{'\n\n'}
                    If you still want to use a photo, that's your choice. You can change it any time.
                  </Text>
                  <View style={styles.disclaimerActions}>
                    <TouchableOpacity
                      style={styles.disclaimerBtnPrimary}
                      onPress={handlePickPhoto}
                      disabled={uploadingPhoto}
                      activeOpacity={0.85}
                    >
                      {uploadingPhoto
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.disclaimerBtnPrimaryText}>I understand, pick a photo</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.disclaimerBtnSecondary}
                      onPress={() => setShowDisclaimer(false)}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={styles.disclaimerBtnSecondaryText}>Keep the avatar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Photo preview + remove */}
              {photoUri && (
                <View style={styles.photoPreviewRow}>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.photoPreviewLabel}>Photo set ✓</Text>
                    <TouchableOpacity onPress={() => { setPhotoUri(null); setSelectedAvatar('ghost'); }} hitSlop={HIT_SLOP}>
                      <Text style={styles.photoRemoveText}>Remove photo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Name input */}
              <Text style={[styles.identityLabel, { marginTop: SPACING.lg }]}>Your anonymous name</Text>
              <View style={[
                styles.nameInputWrap,
                nameStatus === 'available' && styles.nameInputAvailable,
                nameStatus === 'taken'     && styles.nameInputTaken,
                nameStatus === 'invalid'   && styles.nameInputTaken,
              ]}>
                <TextInput
                  style={styles.nameInput}
                  value={anonymousName}
                  onChangeText={handleNameChange}
                  placeholder="e.g. midnight.echo"
                  placeholderTextColor={T.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
                {nameStatus === 'checking' && <ActivityIndicator size="small" color={T.primary} />}
                {nameStatus === 'available' && <Text style={styles.nameStatusAvail}>✓</Text>}
                {(nameStatus === 'taken' || nameStatus === 'invalid') && <Text style={styles.nameStatusTaken}>✗</Text>}
              </View>

              {nameMessage ? (
                <Text style={[styles.nameHint, (nameStatus === 'taken' || nameStatus === 'invalid') && styles.nameHintError]}>
                  {nameMessage}
                </Text>
              ) : (
                <Text style={styles.nameHint}>3–30 chars · letters, numbers, . - _</Text>
              )}

              <TouchableOpacity style={styles.suggestBtn} onPress={suggestName} hitSlop={HIT_SLOP} activeOpacity={0.8}>
                <Text style={styles.suggestBtnText}>✦ Suggest one for me</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, rh(24)) }]}>
        <TouchableOpacity
          onPress={isLastStep ? handleFinish : () => goTo(step + 1)}
          disabled={loading}
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {isLastStep ? "Let's go →" : 'Continue →'}
            </Text>
          )}
        </TouchableOpacity>

        {!loading && (
          <TouchableOpacity
            onPress={handleSkip}
            style={styles.skipBtn}
            hitSlop={HIT_SLOP}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },

  // Progress
  progressWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom:     rh(10),
    gap:               rp(12),
  },
  progressTrack: {
    flex:            1,
    height:          rh(3),
    backgroundColor: T.border,
    borderRadius:    rh(2),
    overflow:        'hidden',
  },
  progressFill: {
    height:          '100%',
    backgroundColor: T.primary,
    borderRadius:    rh(2),
  },
  progressLabel: {
    fontSize:   rf(12),
    color:      T.textSecondary,
    fontWeight: '600',
    minWidth:   rs(28),
    textAlign:  'right',
  },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.md,
    paddingBottom:     SPACING.xl,
  },

  // Back
  backBtn:     { marginBottom: SPACING.sm },
  backBtnText: { fontSize: FONT.md, color: T.textSecondary, fontWeight: '600' },

  // Heading
  title: {
    fontSize:      FONT.display,
    fontWeight:    '800',
    color:         T.primary,
    marginBottom:  SPACING.sm,
    letterSpacing: rs(-0.5),
    lineHeight:    FONT.display * 1.2,
    fontFamily:    'PlayfairDisplay-Bold',
  },
  subtitle: {
    fontSize:     FONT.md,
    color:        T.textSecondary,
    marginBottom: SPACING.xl,
    lineHeight:   FONT.md * 1.6,
  },

  // Gender
  genderList: { gap: rp(10) },
  genderCard: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(14),
    paddingHorizontal: rp(18),
    paddingVertical:   rp(16),
    borderRadius:      RADIUS.xl,
    borderWidth:       1.5,
  },
  genderSymbolWrap: {
    width:          rs(48),
    height:         rs(48),
    borderRadius:   rs(24),
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  genderSymbol: {
    fontSize:   rf(22),
    fontWeight: '600',
    lineHeight: rf(26),
  },
  genderTextWrap: { flex: 1, gap: rp(2) },
  genderLabel: {
    fontSize:   FONT.md,
    fontWeight: '700',
    color:      T.text,
    fontFamily: 'PlayfairDisplay-Bold',
  },
  genderDesc: {
    fontSize:  rf(12),
    color:     T.textSecondary,
    fontStyle: 'italic',
  },
  genderCheck: {
    width:          rs(24),
    height:         rs(24),
    borderRadius:   rs(12),
    alignItems:     'center',
    justifyContent: 'center',
  },
  genderCheckMark: { color: '#fff', fontSize: rf(12), fontWeight: '800' },

  // Badge
  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    backgroundColor:   T.primaryDim,
    borderRadius:      RADIUS.full,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(7),
    marginBottom:      SPACING.md,
    gap:               rp(6),
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.3)',
  },
  badgeDot:  { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: T.primary },
  badgeText: { fontSize: rf(12), color: T.primary, fontWeight: '600' },

  // Group tabs
  groupTabs: {
    flexDirection:  'row',
    gap:            rp(8),
    marginBottom:   SPACING.md,
  },
  groupTab: {
    flex:              1,
    alignItems:        'center',
    paddingVertical:   rp(9),
    borderRadius:      RADIUS.md,
    backgroundColor:   T.surface,
    borderWidth:       1,
    borderColor:       T.border,
  },
  groupTabActive: {
    backgroundColor: T.primaryDim,
    borderColor:     'rgba(255,99,74,0.4)',
  },
  groupTabText:       { fontSize: rf(11), color: T.textSecondary, fontWeight: '600', textAlign: 'center' },
  groupTabTextActive: { color: T.primary, fontWeight: '700' },

  // Vibe chips — full-width readable tags
  vibeGrid: { gap: rp(8), marginBottom: SPACING.md },
  vibeChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(10),
    paddingHorizontal: rp(16),
    paddingVertical:   rp(14),
    borderRadius:      RADIUS.lg,
    backgroundColor:   T.surface,
    borderWidth:       1.5,
    borderColor:       T.border,
  },
  vibeChipSelected: {
    backgroundColor: 'rgba(255,99,74,0.1)',
    borderColor:     T.primary,
  },
  vibeChipDisabled: { opacity: 0.45 },
  vibeEmoji:         { fontSize: rf(20), width: rs(28) },
  vibeName: {
    flex:       1,
    fontSize:   FONT.md,
    color:      T.textSecondary,
    fontWeight: '500',
  },
  vibeNameSelected: { color: T.text, fontWeight: '700' },
  vibeNameDisabled: { color: T.textMuted },
  vibeCheck:        { fontSize: rf(14), color: T.primary, fontWeight: '800' },

  // Count row
  vibeCountRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   SPACING.sm,
  },
  vibeCountText:  { fontSize: rf(12), color: T.textSecondary, fontWeight: '600' },
  vibeClearText:  { fontSize: rf(12), color: T.primary, fontWeight: '600' },

  // Selected summary pills
  vibeSelectedWrap: {
    marginTop:    SPACING.md,
    gap:          rp(8),
  },
  vibeSelectedLabel: { fontSize: rf(11), color: T.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: rs(0.6) },
  vibeSelectedPills: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6) },
  vibeSelectedPill: {
    backgroundColor:   T.primaryDim,
    borderRadius:      RADIUS.full,
    paddingHorizontal: rp(12),
    paddingVertical:   rp(6),
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.25)',
  },
  vibeSelectedPillText: { fontSize: rf(12), color: T.primary, fontWeight: '600' },

  // Info box
  infoBox: {
    marginTop:       SPACING.lg,
    padding:         rp(16),
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
  },
  infoText: {
    fontSize:   rf(13),
    color:      T.textSecondary,
    lineHeight: rf(13) * 1.6,
    fontStyle:  'italic',
  },

  // Footer
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.sm,
    gap:               SPACING.xs,
  },
  countLabel: {
    fontSize:    rf(13),
    textAlign:   'center',
    marginBottom: rp(4),
    fontWeight:  '600',
    color:       T.textSecondary,
  },
  primaryBtn: {
    height:          BUTTON_HEIGHT,
    borderRadius:    RADIUS.lg,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: T.primary,
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rh(8) },
    shadowOpacity:   0.45,
    shadowRadius:    rs(20),
    elevation:       10,
  },
  primaryBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  primaryBtnText: {
    color:         '#fff',
    fontSize:      FONT.lg,
    fontWeight:    '700',
    letterSpacing: rs(0.3),
  },
  skipBtn:     { alignItems: 'center', paddingVertical: rp(8) },
  skipBtnText: { fontSize: FONT.md, color: T.textSecondary, fontWeight: '500' },

  // ── Identity step ──────────────────────────────────────────
  identityLabel: {
    fontSize: FONT.sm, fontWeight: '700', color: T.textSecondary,
    marginBottom: rp(12), textTransform: 'uppercase', letterSpacing: rs(0.8),
  },

  // Avatar grid
  avatarRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: rp(10),
    marginBottom: SPACING.sm,
  },
  avatarOption: {
    width: rs(64), height: rs(64), borderRadius: rs(32),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, position: 'relative',
  },
  avatarOptionEmoji: { fontSize: rf(28) },
  avatarOptionDot: {
    position: 'absolute', bottom: rp(2), right: rp(2),
    width: rs(10), height: rs(10), borderRadius: rs(5),
    borderWidth: 1.5, borderColor: T.background,
  },

  // Photo option
  photoLink: { marginBottom: SPACING.md, alignSelf: 'flex-start' },
  photoLinkText: { fontSize: FONT.sm, color: T.textSecondary, textDecorationLine: 'underline' },

  // Disclaimer card
  disclaimerCard: {
    backgroundColor: 'rgba(251,191,36,0.07)',
    borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    padding: SPACING.md, marginBottom: SPACING.md,
    gap: rp(8),
  },
  disclaimerIcon:  { fontSize: rf(20) },
  disclaimerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text },
  disclaimerBody:  { fontSize: rf(13), color: T.textSecondary, lineHeight: rf(13) * 1.6 },
  disclaimerActions: { gap: rp(8), marginTop: rp(4) },
  disclaimerBtnPrimary: {
    backgroundColor: T.primary, borderRadius: RADIUS.md,
    paddingVertical: rp(12), alignItems: 'center',
  },
  disclaimerBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: FONT.sm },
  disclaimerBtnSecondary:   { alignItems: 'center', paddingVertical: rp(8) },
  disclaimerBtnSecondaryText: { color: T.textSecondary, fontSize: FONT.sm },

  // Photo preview
  photoPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  photoPreview: {
    width: rs(56), height: rs(56), borderRadius: rs(28),
    borderWidth: 2, borderColor: T.primary,
  },
  photoPreviewLabel: { fontSize: FONT.sm, fontWeight: '700', color: T.text, marginBottom: rp(4) },
  photoRemoveText:   { fontSize: rf(12), color: T.textSecondary, textDecorationLine: 'underline' },

  // Name input
  nameInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: T.border,
    paddingHorizontal: rp(14), paddingVertical: rp(2),
    marginBottom: rp(8),
  },
  nameInputAvailable: { borderColor: '#10B981' },
  nameInputTaken:     { borderColor: '#EF4444' },
  nameInput: {
    flex: 1, fontSize: FONT.lg, color: T.text,
    paddingVertical: rp(12), fontWeight: '600',
  },
  nameStatusAvail: { fontSize: rf(18), color: '#10B981', fontWeight: '800' },
  nameStatusTaken: { fontSize: rf(18), color: '#EF4444', fontWeight: '800' },
  nameHint:        { fontSize: rf(12), color: T.textMuted, marginBottom: SPACING.md },
  nameHintError:   { color: '#EF4444' },

  // Suggest button
  suggestBtn: {
    alignSelf: 'flex-start',
    backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full,
    paddingHorizontal: rp(16), paddingVertical: rp(9),
    borderWidth: 1, borderColor: T.border,
  },
  suggestBtnText: { fontSize: FONT.sm, color: T.primary, fontWeight: '600' },
});
