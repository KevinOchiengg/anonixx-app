import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../../components/ui/Toast';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS,
  BUTTON_HEIGHT, SCREEN, HIT_SLOP, isSmallDevice,
} from '../../utils/responsive';

const THEME = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceHigh:   '#1e2330',
  primary:       '#FF634A',
  primaryDim:    'rgba(255, 99, 74, 0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.06)',
  inputBg:       'rgba(255,255,255,0.04)',
};

const MAX_BIO_LENGTH = 150;

const INTERESTS = [
  { label: 'Relationships', emoji: '💞' },
  { label: 'Anxiety',       emoji: '🌀' },
  { label: 'Depression',    emoji: '🌧️' },
  { label: 'Self-Growth',   emoji: '🌱' },
  { label: 'School/Career', emoji: '🎓' },
  { label: 'Family',        emoji: '🏠' },
  { label: 'LGBTQ+',        emoji: '🌈' },
  { label: 'Addiction',     emoji: '🔗' },
  { label: 'Sleep',         emoji: '🌙' },
  { label: 'Identity',      emoji: '🪞' },
  { label: 'Wins',          emoji: '✨' },
  { label: 'Friendship',    emoji: '🤝' },
  { label: 'Financial',     emoji: '💸' },
  { label: 'Health',        emoji: '🫀' },
  { label: 'General',       emoji: '💬' },
];

const STARS = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  top:     Math.random() * SCREEN.height,
  left:    Math.random() * SCREEN.width,
  size:    Math.random() * rs(2.5) + rs(0.5),
  opacity: Math.random() * 0.4 + 0.1,
}));

const StarryBackground = React.memo(() => (
  <>
    {STARS.map((s) => (
      <View key={s.id} style={{
        position: 'absolute', backgroundColor: THEME.primary,
        borderRadius: s.size, top: s.top, left: s.left,
        width: s.size, height: s.size, opacity: s.opacity,
      }} />
    ))}
  </>
));

// Animated progress step dot
const StepDot = React.memo(({ active, done }) => {
  const scaleAnim = useRef(new Animated.Value(active ? 1 : 0.7)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: active || done ? 1 : 0.7,
      tension: 80, friction: 8, useNativeDriver: true,
    }).start();
  }, [active, done]);

  return (
    <Animated.View style={[
      styles.stepDot,
      active && styles.stepDotActive,
      done   && styles.stepDotDone,
      { transform: [{ scale: scaleAnim }] },
    ]} />
  );
});

// Interest tag with press animation
const InterestTag = React.memo(({ item, active, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
    onPress(item.label);
  }, [item.label, onPress]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        style={[styles.tag, active && styles.tagActive]}
        activeOpacity={1}
      >
        <Text style={styles.tagEmoji}>{item.emoji}</Text>
        <Text style={[styles.tagText, active && styles.tagTextActive]}>
          {item.label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function OnboardingScreen({ navigation }) {
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();

  const [step, setStep]         = useState(1);
  const [bio, setBio]           = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [bioFocused, setBioFocused] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rh(20))).current;

  // Animate on mount and on step change
  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(rh(20));
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 11, useNativeDriver: true }),
    ]).start();
  }, [step]);

  const toggleInterest = useCallback((label) => {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  }, []);

  const canContinue = useMemo(() => {
    if (step === 1) return bio.trim().length >= 10;
    return selected.length >= 3;
  }, [step, bio, selected]);

  const handleBioChange = useCallback((val) => {
    setBio(val.slice(0, MAX_BIO_LENGTH));
  }, []);

  const handleComplete = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', message: 'Session expired. Please sign in again.' });
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/users/onboarding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bio: bio.trim(), interests: selected }),
      });

      if (!response.ok && response.status !== 404) {
        // Non-blocking — navigate even if onboarding save fails
        showToast({ type: 'warning', message: "Couldn't save preferences. You can update them later." });
      } else {
        showToast({ type: 'success', message: "You're all set. Welcome to Anonixx 🌑" });
      }

      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }, 600);

    } catch (err) {
      // Network error — still let them in
      showToast({ type: 'warning', message: "Couldn't save preferences. You can update them later." });
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }, 800);
    } finally {
      setLoading(false);
    }
  }, [bio, selected, loading, navigation, showToast]);

  const handleContinue = useCallback(() => {
    if (step === 1 && bio.trim().length < 10) {
      showToast({ type: 'error', message: 'Write at least 10 characters about yourself.' });
      return;
    }
    setStep(2);
  }, [step, bio, showToast]);

  const bioCharLeft = MAX_BIO_LENGTH - bio.length;
  const bioColor    = bioCharLeft <= 20 ? '#f59e0b' : bioCharLeft <= 10 ? '#ef4444' : THEME.textSecondary;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Glow orb */}
      <View style={styles.glowOrb} />

      {/* Progress bar */}
      <View style={[styles.progressRow, { paddingTop: Math.max(insets.top, rh(16)) }]}>
        {/* Step dots */}
        <View style={styles.stepDots}>
          <StepDot active={step === 1} done={step > 1} />
          <View style={[styles.stepConnector, step > 1 && styles.stepConnectorActive]} />
          <StepDot active={step === 2} done={false} />
        </View>
        {/* Step label */}
        <Text style={styles.stepLabel}>Step {step} of 2</Text>
      </View>

      {/* Progress track */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: step === 1 ? '50%' : '100%' }]} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {step === 1 ? (
            <>
              <Text style={styles.title}>Tell us about you</Text>
              <Text style={styles.subtitle}>
                A few words. Nobody knows who you are anyway.
              </Text>

              <View style={[styles.card, bioFocused && styles.cardFocused]}>
                <Text style={styles.label}>Your Bio</Text>
                <TextInput
                  value={bio}
                  onChangeText={handleBioChange}
                  onFocus={() => setBioFocused(true)}
                  onBlur={() => setBioFocused(false)}
                  placeholder="What's on your mind? What brought you here?"
                  placeholderTextColor={THEME.textSecondary}
                  multiline
                  maxLength={MAX_BIO_LENGTH}
                  textAlignVertical="top"
                  style={styles.textArea}
                />
                <View style={styles.bioFooter}>
                  <Text style={styles.bioHint}>
                    {bio.trim().length < 10 ? `${10 - bio.trim().length} more characters needed` : '✓ Looks good'}
                  </Text>
                  <Text style={[styles.charCount, { color: bioColor }]}>
                    {bio.length}/{MAX_BIO_LENGTH}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>What weighs on you?</Text>
              <Text style={styles.subtitle}>
                Pick at least 3. We'll show you what matters.
              </Text>

              {/* Selected count badge */}
              {selected.length > 0 && (
                <View style={styles.selectedBadge}>
                  <View style={styles.selectedDot} />
                  <Text style={styles.selectedBadgeText}>
                    {selected.length} selected{selected.length < 3 ? ` — pick ${3 - selected.length} more` : ' — you\'re good to go'}
                  </Text>
                </View>
              )}

              <View style={styles.tagsContainer}>
                {INTERESTS.map((item) => (
                  <InterestTag
                    key={item.label}
                    item={item}
                    active={selected.includes(item.label)}
                    onPress={toggleInterest}
                  />
                ))}
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, rh(24)) }]}>
        {step > 1 && (
          <TouchableOpacity
            onPress={() => setStep(1)}
            style={styles.backBtn}
            hitSlop={HIT_SLOP}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={step === 1 ? handleContinue : handleComplete}
          disabled={!canContinue || loading}
          style={[styles.primaryBtn, (!canContinue || loading) && styles.primaryBtnDisabled]}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {step === 1 ? 'Continue →' : 'Get Started'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },

  glowOrb: {
    position:        'absolute',
    width:           rs(360),
    height:          rs(360),
    borderRadius:    rs(180),
    backgroundColor: THEME.primary,
    opacity:         0.05,
    bottom:          rh(-100),
    alignSelf:       'center',
  },

  // Progress
  progressRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom:     rh(12),
  },
  stepDots:        { flexDirection: 'row', alignItems: 'center' },
  stepDot:         { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: THEME.border, borderWidth: 1.5, borderColor: THEME.border },
  stepDotActive:   { backgroundColor: THEME.primary, borderColor: THEME.primary, shadowColor: THEME.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: rs(6), elevation: 4 },
  stepDotDone:     { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  stepConnector:   { width: rs(32), height: rs(2), backgroundColor: THEME.border, marginHorizontal: rp(6) },
  stepConnectorActive: { backgroundColor: '#22c55e' },
  stepLabel:       { fontSize: rf(12), color: THEME.textSecondary, fontWeight: '600' },

  progressTrack: { height: rh(3), backgroundColor: THEME.border, marginHorizontal: SPACING.lg, borderRadius: rh(2), marginBottom: rh(4) },
  progressFill:  { height: '100%', backgroundColor: THEME.primary, borderRadius: rh(2) },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl },

  title:    { fontSize: isSmallDevice ? FONT.xxl : FONT.display, fontWeight: '800', color: THEME.primary, marginBottom: SPACING.sm, letterSpacing: rs(-0.5), lineHeight: (isSmallDevice ? FONT.xxl : FONT.display) * 1.2 },
  subtitle: { fontSize: FONT.md, color: THEME.textSecondary, marginBottom: SPACING.xl, lineHeight: FONT.md * 1.6 },

  // Bio card
  card: {
    backgroundColor: THEME.surface,
    borderRadius:    RADIUS.xl,
    padding:         rp(18),
    borderWidth:     1.5,
    borderColor:     THEME.border,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rh(6) },
    shadowOpacity:   0.25,
    shadowRadius:    rs(16),
    elevation:       6,
  },
  cardFocused: { borderColor: THEME.primary },
  label:       { fontSize: rf(11), fontWeight: '700', color: THEME.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: rs(1) },
  textArea: {
    backgroundColor: THEME.inputBg,
    color:           THEME.text,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    borderRadius:    RADIUS.md,
    fontSize:        FONT.md,
    minHeight:       rh(120),
    textAlignVertical: 'top',
    lineHeight:      FONT.md * 1.6,
  },
  bioFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.sm },
  bioHint:    { fontSize: rf(11), color: THEME.textSecondary, flex: 1 },
  charCount:  { fontSize: rf(11), fontWeight: '600' },

  // Tags
  selectedBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: THEME.primaryDim,
    borderRadius:    RADIUS.full,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(8),
    alignSelf:       'flex-start',
    marginBottom:    SPACING.md,
    gap:             rp(6),
    borderWidth:     1,
    borderColor:     'rgba(255,99,74,0.3)',
  },
  selectedDot:       { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: THEME.primary },
  selectedBadgeText: { fontSize: rf(12), color: THEME.primary, fontWeight: '600' },

  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(10) },
  tag: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.full,
    borderWidth:       1.5,
    borderColor:       THEME.border,
    backgroundColor:   THEME.surface,
  },
  tagActive:      { backgroundColor: THEME.primary, borderColor: THEME.primary },
  tagEmoji:       { fontSize: rf(14) },
  tagText:        { color: THEME.textSecondary, fontWeight: '600', fontSize: FONT.sm },
  tagTextActive:  { color: '#fff' },

  // Footer
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.md,
    gap:               SPACING.sm,
  },
  primaryBtn: {
    height:          BUTTON_HEIGHT,
    borderRadius:    RADIUS.lg,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: THEME.primary,
    shadowColor:     THEME.primary,
    shadowOffset:    { width: 0, height: rh(8) },
    shadowOpacity:   0.45,
    shadowRadius:    rs(20),
    elevation:       10,
  },
  primaryBtnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  primaryBtnText:     { color: '#fff', fontSize: FONT.lg, fontWeight: '700', letterSpacing: rs(0.3) },
  backBtn:            { alignItems: 'center', paddingVertical: rp(6) },
  backBtnText:        { color: THEME.textSecondary, fontSize: FONT.md, fontWeight: '600' },
});
