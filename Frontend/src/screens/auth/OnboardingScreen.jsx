import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
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

// ─── THEME ──────────────────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.06)',
};

// ─── STATIC DATA ─────────────────────────────────────────────────────────────
const STARS = Array.from({ length: 36 }, (_, i) => ({
  id:      i,
  top:     Math.random() * SCREEN.height,
  left:    Math.random() * SCREEN.width,
  size:    Math.random() * rs(2.5) + rs(0.5),
  opacity: Math.random() * 0.35 + 0.08,
}));

const GENDER_OPTIONS = [
  { id: 'male',              label: 'Male',              symbol: '♂' },
  { id: 'female',            label: 'Female',            symbol: '♀' },
  { id: 'nonbinary',         label: 'Non-binary',        symbol: '⚧' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say', symbol: '—' },
];

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

const STEP_META = [
  {
    title:    'Who are you?',
    subtitle: 'Optional. Only shows on your anonymous profile during Connect.',
    skip:     true,
  },
  {
    title:    'What weighs on you?',
    subtitle: 'Pick up to 5 topics. We\'ll show you what matters.',
    skip:     true,
  },
];

const MAX_INTERESTS = 5;
const TOTAL_STEPS   = 2;

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
  const scale = useRef(new Animated.Value(1)).current;
  const isSelected = selected === option.id;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 220, friction: 7, useNativeDriver: true }),
    ]).start();
    onPress(option.id);
  }, [option.id, onPress, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={[styles.genderCard, isSelected && styles.genderCardActive]}
      >
        <Text style={[styles.genderSymbol, isSelected && styles.genderSymbolActive]}>
          {option.symbol}
        </Text>
        <Text style={[styles.genderLabel, isSelected && styles.genderLabelActive]}>
          {option.label}
        </Text>
        {isSelected && <View style={styles.genderDot} />}
      </TouchableOpacity>
    </Animated.View>
  );
});

const InterestTag = React.memo(({ item, active, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 220, friction: 7, useNativeDriver: true }),
    ]).start();
    onPress(item.label);
  }, [item.label, onPress, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={[styles.tag, active && styles.tagActive]}
      >
        <Text style={styles.tagEmoji}>{item.emoji}</Text>
        <Text style={[styles.tagText, active && styles.tagTextActive]}>{item.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── SCREEN ──────────────────────────────────────────────────────────────────
export default function OnboardingScreen({ navigation }) {
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();

  const [step,      setStep]      = useState(0);
  const [gender,    setGender]    = useState(null);
  const [interests, setInterests] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rh(18))).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(rh(18));
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [step]);

  const goTo = useCallback((next) => setStep(next), []);

  const handleGenderPress = useCallback((id) => {
    setGender((prev) => (prev === id ? null : id));
  }, []);

  const toggleInterest = useCallback((label) => {
    setInterests((prev) => {
      if (prev.includes(label)) return prev.filter((i) => i !== label);
      if (prev.length >= MAX_INTERESTS) {
        showToast({ type: 'warning', message: `Pick what you actually carry. Up to ${MAX_INTERESTS}.` });
        return prev;
      }
      return [...prev, label];
    });
  }, [showToast]);

  const handleFinish = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        showToast({ type: 'error', message: 'Session expired. Sign in again.' });
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      if (gender) {
        fetch(`${API_BASE_URL}/api/v1/auth/gender`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ gender }),
        }).catch(() => {});
      }

      if (interests.length > 0) {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/interests`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ interests }),
        });
        if (!res.ok) {
          showToast({ type: 'warning', message: "Couldn't save your topics. Update in settings anytime." });
        }
      }

      showToast({ type: 'success', message: "You're in. Welcome to Anonixx." });
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }, 500);

    } catch {
      showToast({ type: 'warning', message: "Couldn't save preferences. You can update them later." });
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }, 600);
    } finally {
      setLoading(false);
    }
  }, [loading, gender, interests, navigation, showToast]);

  const handleNext = useCallback(() => {
    if (step === TOTAL_STEPS - 1) {
      handleFinish();
    } else {
      goTo(step + 1);
    }
  }, [step, handleFinish, goTo]);

  const meta       = STEP_META[step];
  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.background} />
      <StarryBackground />
      <View style={styles.glowOrb} />

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
                  selected={gender}
                  onPress={handleGenderPress}
                />
              ))}
            </View>
          )}

          {/* ── STEP 1: INTERESTS ── */}
          {step === 1 && (
            <>
              {interests.length > 0 && (
                <View style={styles.badge}>
                  <View style={styles.badgeDot} />
                  <Text style={styles.badgeText}>{interests.length} selected</Text>
                </View>
              )}
              <View style={styles.tagWrap}>
                {INTERESTS.map((item) => (
                  <InterestTag
                    key={item.label}
                    item={item}
                    active={interests.includes(item.label)}
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
        <TouchableOpacity
          onPress={handleNext}
          disabled={loading}
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {isLastStep ? 'Enter Anonixx' : 'Continue →'}
            </Text>
          )}
        </TouchableOpacity>

        {meta.skip && !loading && (
          <TouchableOpacity
            onPress={handleNext}
            style={styles.skipBtn}
            hitSlop={HIT_SLOP}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>
              {isLastStep ? 'Skip & enter' : 'Skip for now'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },

  glowOrb: {
    position:        'absolute',
    bottom:          rh(-80),
    alignSelf:       'center',
    width:           rs(340),
    height:          rs(340),
    borderRadius:    rs(170),
    backgroundColor: T.primary,
    opacity:         0.04,
  },

  // Progress
  progressWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom:     rh(10),
    gap:               rp(12),
  },
  progressTrack: {
    flex:           1,
    height:         rh(3),
    backgroundColor: T.border,
    borderRadius:   rh(2),
    overflow:       'hidden',
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
    fontSize:    isSmallDevice ? FONT.xxl : FONT.display,
    fontWeight:  '800',
    color:       T.primary,
    marginBottom: SPACING.sm,
    letterSpacing: rs(-0.5),
    lineHeight:  (isSmallDevice ? FONT.xxl : FONT.display) * 1.2,
    fontFamily:  'PlayfairDisplay-Bold',
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
    gap:               rp(16),
    paddingHorizontal: rp(20),
    paddingVertical:   rp(18),
    borderRadius:      RADIUS.xl,
    backgroundColor:   T.surface,
    borderWidth:       1.5,
    borderColor:       T.border,
  },
  genderCardActive:   { backgroundColor: T.primaryDim, borderColor: 'rgba(255,99,74,0.4)' },
  genderSymbol:       { fontSize: rf(20), color: T.textSecondary, width: rs(28), textAlign: 'center' },
  genderSymbolActive: { color: T.primary },
  genderLabel:        { flex: 1, fontSize: FONT.md, fontWeight: '600', color: T.text },
  genderLabelActive:  { color: T.primary },
  genderDot: {
    width:           rs(8),
    height:          rs(8),
    borderRadius:    rs(4),
    backgroundColor: T.primary,
  },

  // Badge (selected count)
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

  // Tags
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(10) },
  tag: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.full,
    backgroundColor:   T.surface,
    borderWidth:       1.5,
    borderColor:       T.border,
  },
  tagActive:     { backgroundColor: T.primary, borderColor: T.primary },
  tagEmoji:      { fontSize: rf(14) },
  tagText:       { fontSize: FONT.sm, fontWeight: '600', color: T.textSecondary },
  tagTextActive: { color: '#fff' },

  // Footer
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.sm,
    gap:               SPACING.xs,
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
  primaryBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  primaryBtnText: {
    color:         '#fff',
    fontSize:      FONT.lg,
    fontWeight:    '700',
    letterSpacing: rs(0.3),
  },
  skipBtn:     { alignItems: 'center', paddingVertical: rp(8) },
  skipBtnText: { fontSize: FONT.md, color: T.textSecondary, fontWeight: '500' },
});
