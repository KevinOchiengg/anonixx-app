import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  { id: 'male',              label: 'Male',              symbol: '♂' },
  { id: 'female',            label: 'Female',            symbol: '♀' },
  { id: 'nonbinary',         label: 'Non-binary',        symbol: '⚧' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say', symbol: '—' },
];

const INTERESTS = [
  { id: 'relationships',  emoji: '💔', name: 'Relationships'  },
  { id: 'anxiety',        emoji: '🌀', name: 'Anxiety'        },
  { id: 'depression',     emoji: '🌧️', name: 'Depression'     },
  { id: 'self_growth',    emoji: '🌱', name: 'Self-Growth'    },
  { id: 'school_career',  emoji: '🎓', name: 'School/Career'  },
  { id: 'family',         emoji: '🏠', name: 'Family'         },
  { id: 'lgbtq',          emoji: '🌈', name: 'LGBTQ+'         },
  { id: 'addiction',      emoji: '🔗', name: 'Addiction'      },
  { id: 'sleep',          emoji: '🌙', name: 'Sleep'          },
  { id: 'identity',       emoji: '🪞', name: 'Identity'       },
  { id: 'wins',           emoji: '✨', name: 'Wins'           },
  { id: 'friendship',     emoji: '🤝', name: 'Friendship'     },
  { id: 'financial',      emoji: '💸', name: 'Financial'      },
  { id: 'health',         emoji: '🫀', name: 'Health'         },
  { id: 'general',        emoji: '💬', name: 'General'        },
];

const VIBE_TAGS = [
  { id: 'carries a lot',    emoji: '🪨' },
  { id: 'dark humor',       emoji: '🖤' },
  { id: 'night owl',        emoji: '🌙' },
  { id: 'been through it',  emoji: '🔥' },
  { id: 'overthinker',      emoji: '🌀' },
  { id: 'healing slowly',   emoji: '🩹' },
  { id: 'blunt',            emoji: '🗡️' },
  { id: 'soft inside',      emoji: '🧸' },
  { id: 'loud silence',     emoji: '🔇' },
  { id: 'complicated',      emoji: '🧩' },
  { id: 'lost',             emoji: '🌫️' },
  { id: 'still standing',   emoji: '🏔️' },
  { id: 'open book',        emoji: '📖' },
  { id: 'hard to reach',    emoji: '🚪' },
  { id: 'always listening', emoji: '👂' },
];

const MAX_INTERESTS  = 5;
const MAX_VIBES      = 3;
const TOTAL_STEPS    = 3; // 0=gender 1=interests 2=vibes

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
  const scale      = useRef(new Animated.Value(1)).current;
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
        style={[styles.genderCard, isSelected && styles.genderCardSelected]}
      >
        <Text style={[styles.genderSymbol, isSelected && styles.genderSymbolSelected]}>
          {option.symbol}
        </Text>
        <Text style={[styles.genderLabel, isSelected && styles.genderLabelSelected]}>
          {option.label}
        </Text>
        {isSelected && <View style={styles.genderDot} />}
      </TouchableOpacity>
    </Animated.View>
  );
});

const InterestCard = React.memo(({ interest, selected, onPress }) => {
  const scale      = useRef(new Animated.Value(1)).current;
  const isSelected = selected.includes(interest.id);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.93, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 220, friction: 7, useNativeDriver: true }),
    ]).start();
    onPress(interest.id);
  }, [interest.id, onPress, scale]);

  return (
    <Animated.View style={[styles.interestCardWrapper, { transform: [{ scale }] }]}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={[styles.interestCard, isSelected && styles.interestCardSelected]}
      >
        <Text style={styles.cardEmoji}>{interest.emoji}</Text>
        <Text style={[styles.cardName, isSelected && styles.cardNameSelected]}>
          {interest.name}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

const VibeChip = React.memo(({ vibe, selected, onPress }) => {
  const scale      = useRef(new Animated.Value(1)).current;
  const isSelected = selected.includes(vibe.id);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 220, friction: 7, useNativeDriver: true }),
    ]).start();
    onPress(vibe.id);
  }, [vibe.id, onPress, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={1}
        style={[styles.vibeChip, isSelected && styles.vibeChipSelected]}
      >
        <Text style={styles.vibeEmoji}>{vibe.emoji}</Text>
        <Text style={[styles.vibeName, isSelected && styles.vibeNameSelected]}>
          {vibe.id}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── SCREEN ──────────────────────────────────────────────────────────────────
export default function InterestSelectionScreen({ navigation }) {
  const insets        = useSafeAreaInsets();
  const { showToast } = useToast();

  const [step,              setStep]              = useState(0);
  const [selectedGender,    setSelectedGender]    = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [selectedVibes,     setSelectedVibes]     = useState([]);
  const [loading,           setLoading]           = useState(false);

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

  const toggleInterest = useCallback((id) => {
    setSelectedInterests((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= MAX_INTERESTS) {
        showToast({ type: 'warning', message: `Pick what you actually carry. Up to ${MAX_INTERESTS}.` });
        return prev;
      }
      return [...prev, id];
    });
  }, [showToast]);

  const toggleVibe = useCallback((id) => {
    setSelectedVibes((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_VIBES) {
        showToast({ type: 'warning', message: `Up to ${MAX_VIBES}. Pick what feels true.` });
        return prev;
      }
      return [...prev, id];
    });
  }, [showToast]);

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

      if (selectedInterests.length > 0) {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/interests`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ interests: selectedInterests }),
        });
        if (!res.ok) {
          showToast({ type: 'warning', message: "Couldn't save everything. Try again in settings." });
        }
      }

      if (selectedVibes.length > 0) {
        fetch(`${API_BASE_URL}/api/v1/connect/vibes`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ vibe_tags: selectedVibes }),
        }).catch(() => {});
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
  }, [loading, selectedGender, selectedInterests, selectedVibes, showToast, navigation]);

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
    { title: 'Who are you?',            subtitle: 'Optional. Only visible on your anonymous profile.' },
    { title: 'What brings you here?',   subtitle: `Select up to ${MAX_INTERESTS} topics that hit close.` },
    { title: 'How would you describe yourself?', subtitle: `Up to ${MAX_VIBES}. Pick what feels honest.` },
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

          {/* ── STEP 1: INTERESTS ── */}
          {step === 1 && (
            <>
              {selectedInterests.length > 0 && (
                <View style={styles.badge}>
                  <View style={styles.badgeDot} />
                  <Text style={styles.badgeText}>
                    {selectedInterests.length} / {MAX_INTERESTS} selected
                  </Text>
                </View>
              )}
              <View style={styles.interestGrid}>
                {INTERESTS.map((interest) => (
                  <InterestCard
                    key={interest.id}
                    interest={interest}
                    selected={selectedInterests}
                    onPress={toggleInterest}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── STEP 2: VIBES ── */}
          {step === 2 && (
            <>
              {selectedVibes.length > 0 && (
                <View style={styles.badge}>
                  <View style={styles.badgeDot} />
                  <Text style={styles.badgeText}>
                    {selectedVibes.length} / {MAX_VIBES} chosen
                  </Text>
                </View>
              )}
              <View style={styles.vibeGrid}>
                {VIBE_TAGS.map((vibe) => (
                  <VibeChip
                    key={vibe.id}
                    vibe={vibe}
                    selected={selectedVibes}
                    onPress={toggleVibe}
                  />
                ))}
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  These show on your anonymous profile when someone taps your name on a confession.
                  They help others connect — without revealing who you are.
                </Text>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, rh(24)) }]}>
        {step === 1 && selectedInterests.length > 0 && (
          <Text style={styles.countLabel}>
            {selectedInterests.length} / {MAX_INTERESTS} selected
          </Text>
        )}
        {step === 2 && (
          <Text style={styles.countLabel}>
            {selectedVibes.length} / {MAX_VIBES} chosen
          </Text>
        )}

        <TouchableOpacity
          onPress={isLastStep ? handleFinish : () => {
            if (step === 1 && selectedInterests.length === 0) {
              showToast({ type: 'warning', message: 'Pick at least one. We need somewhere to start.' });
              return;
            }
            goTo(step + 1);
          }}
          disabled={loading}
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {isLastStep ? 'Save changes' : 'Continue →'}
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
            <Text style={styles.skipBtnText}>
              {isLastStep ? 'Skip & finish' : 'Skip for now'}
            </Text>
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
    gap:               rp(16),
    paddingHorizontal: rp(20),
    paddingVertical:   rp(18),
    borderRadius:      RADIUS.xl,
    backgroundColor:   T.surface,
    borderWidth:       1.5,
    borderColor:       T.border,
  },
  genderCardSelected:   { backgroundColor: T.primaryDim, borderColor: 'rgba(255,99,74,0.4)' },
  genderSymbol:         { fontSize: rf(20), color: T.textSecondary, width: rs(28), textAlign: 'center' },
  genderSymbolSelected: { color: T.primary },
  genderLabel:          { flex: 1, fontSize: FONT.md, fontWeight: '600', color: T.text },
  genderLabelSelected:  { color: T.primary },
  genderDot: {
    width:           rs(8),
    height:          rs(8),
    borderRadius:    rs(4),
    backgroundColor: T.primary,
  },

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

  // Interest grid (2 columns)
  interestGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           rp(10),
  },
  interestCardWrapper: {
    width: '47%',
  },
  interestCard: {
    padding:         rp(16),
    paddingLeft:     rp(20),
    borderRadius:    RADIUS.md,
    backgroundColor: T.surface,
    alignItems:      'center',
    justifyContent:  'center',
    minHeight:       rh(100),
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rh(4) },
    shadowOpacity:   0.18,
    shadowRadius:    rs(10),
    elevation:       4,
  },
  interestCardSelected: {
    backgroundColor: 'rgba(255,99,74,0.12)',
    borderWidth:     1,
    borderColor:     'rgba(255,99,74,0.35)',
  },
  cardEmoji:        { fontSize: rf(32), marginBottom: rp(8) },
  cardName:         { fontSize: FONT.sm, fontWeight: '600', textAlign: 'center', color: T.text },
  cardNameSelected: { color: T.primary, fontWeight: '700' },

  // Vibe chips
  vibeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(10) },
  vibeChip: {
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
  vibeChipSelected: { backgroundColor: T.primary, borderColor: T.primary },
  vibeEmoji:        { fontSize: rf(15) },
  vibeName:         { fontSize: FONT.sm, color: T.textSecondary, fontWeight: '500' },
  vibeNameSelected: { color: '#fff', fontWeight: '700' },

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
});
