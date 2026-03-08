import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Animated,
} from 'react-native';
import { CheckCircle, Circle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config/api';

const { height, width } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
};

// ─── STARRY BACKGROUND ────────────────────────────────────────
const StarryBackground = () => {
  const stars = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    id: i,
    top: Math.random() * height,
    left: Math.random() * width,
    size: Math.random() * 3 + 1,
    opacity: Math.random() * 0.6 + 0.2,
  })), []);

  return (
    <>
      {stars.map((star) => (
        <View key={star.id} style={{
          position: 'absolute',
          backgroundColor: THEME.primary,
          borderRadius: 50,
          top: star.top,
          left: star.left,
          width: star.size,
          height: star.size,
          opacity: star.opacity,
        }} />
      ))}
    </>
  );
};

// ─── DATA ─────────────────────────────────────────────────────
const INTERESTS = [
  { id: 'relationships', emoji: '💔', name: 'Relationships' },
  { id: 'anxiety', emoji: '😰', name: 'Anxiety' },
  { id: 'depression', emoji: '😢', name: 'Depression' },
  { id: 'self_growth', emoji: '💪', name: 'Self-Growth' },
  { id: 'school_career', emoji: '🎓', name: 'School/Career' },
  { id: 'family', emoji: '👨‍👩‍👧‍👦', name: 'Family' },
  { id: 'lgbtq', emoji: '🏳️‍🌈', name: 'LGBTQ+' },
  { id: 'addiction', emoji: '💊', name: 'Addiction' },
  { id: 'sleep', emoji: '😴', name: 'Sleep' },
  { id: 'identity', emoji: '🎭', name: 'Identity' },
  { id: 'wins', emoji: '🎉', name: 'Wins' },
  { id: 'friendship', emoji: '🤝', name: 'Friendship' },
  { id: 'financial', emoji: '💰', name: 'Financial' },
  { id: 'health', emoji: '🏥', name: 'Health' },
  { id: 'general', emoji: '🌟', name: 'General' },
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

const MAX_INTERESTS = 5;
const MAX_VIBES = 3;

export default function InterestSelectionScreen({ navigation }) {
  const [step, setStep] = useState(1); // 1 = interests, 2 = vibes
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [selectedVibes, setSelectedVibes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Slide animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  const goToStep2 = () => {
    Animated.timing(slideAnim, {
      toValue: -width,
      duration: 320,
      useNativeDriver: true,
    }).start(() => setStep(2));
  };

  const goToStep1 = () => {
    setStep(1);
    slideAnim.setValue(0);
  };

  // Step 2 slides in from the right
  const step2Translate = slideAnim.interpolate({
    inputRange: [-width, 0],
    outputRange: [0, width],
  });

  const toggleInterest = (id) => {
    if (selectedInterests.includes(id)) {
      setSelectedInterests(selectedInterests.filter((i) => i !== id));
    } else {
      if (selectedInterests.length >= MAX_INTERESTS) {
        Alert.alert('Maximum Reached', `Pick what you actually deal with. Up to ${MAX_INTERESTS}`);
        return;
      }
      setSelectedInterests([...selectedInterests, id]);
    }
  };

  const toggleVibe = (id) => {
    if (selectedVibes.includes(id)) {
      setSelectedVibes(selectedVibes.filter((v) => v !== id));
    } else {
      if (selectedVibes.length >= MAX_VIBES) {
        Alert.alert('Maximum Reached', `Pick up to ${MAX_VIBES} that feel true.`);
        return;
      }
      setSelectedVibes([...selectedVibes, id]);
    }
  };

  const handleContinueStep1 = () => {
    if (selectedInterests.length === 0) {
      Alert.alert('Select Interests', 'Pick at least one. We need somewhere to start.');
      return;
    }
    goToStep2();
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('No authentication token. Please log in again.');

      // Save interests
      const interestsRes = await fetch(`${API_BASE_URL}/api/v1/auth/interests`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ interests: selectedInterests }),
      });
      if (!interestsRes.ok) {
        const d = await interestsRes.json();
        throw new Error(d.detail || 'Failed to save interests');
      }

      // Save vibe tags (only if any selected — not required)
      if (selectedVibes.length > 0) {
        await fetch(`${API_BASE_URL}/api/v1/connect/vibes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ vibe_tags: selectedVibes }),
        });
        // Non-critical — don't throw if this fails
      }

      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (error) {
      Alert.alert('Error', error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (step === 1) {
      Alert.alert(
        'Skip Interest Selection?',
        "You'll see everything. You can narrow it down later in settings.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Skip', onPress: () => goToStep2() },
        ]
      );
    } else {
      // Skip vibe tags entirely — go straight to app
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step === 1 && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step === 2 && styles.stepDotActive]} />
      </View>

      {/* ── STEP 1: INTERESTS ── */}
      {step === 1 && (
        <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.header}>
            <Text style={styles.title}>What brings you here?</Text>
            <Text style={styles.subtitle}>
              Select up to {MAX_INTERESTS} topics to personalize your feed
            </Text>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.grid}>
              {INTERESTS.map((interest) => {
                const isSelected = selectedInterests.includes(interest.id);
                const isMaxReached = selectedInterests.length >= MAX_INTERESTS && !isSelected;
                return (
                  <View key={interest.id} style={styles.interestCardWrapper}>
                    <View style={[styles.cardAccentBar, !isSelected && styles.cardAccentBarInactive]} />
                    <TouchableOpacity
                      onPress={() => toggleInterest(interest.id)}
                      disabled={isMaxReached}
                      style={[
                        styles.interestCard,
                        isSelected && styles.interestCardSelected,
                        isMaxReached && styles.cardDisabled,
                      ]}
                      activeOpacity={0.8}
                    >
                      <View style={styles.checkIcon}>
                        {isSelected
                          ? <CheckCircle size={20} color={THEME.primary} fill={THEME.primary} />
                          : <Circle size={20} color={THEME.textSecondary} opacity={0.4} />}
                      </View>
                      <Text style={styles.cardEmoji}>{interest.emoji}</Text>
                      <Text style={[styles.cardName, isSelected && styles.cardNameSelected]}>
                        {interest.name}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.selectedCount}>
              {selectedInterests.length} / {MAX_INTERESTS} selected
            </Text>
            <TouchableOpacity
              onPress={handleContinueStep1}
              disabled={selectedInterests.length === 0}
              style={[styles.primaryBtn, selectedInterests.length === 0 && styles.primaryBtnDisabled]}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {selectedInterests.length > 0 ? 'Continue' : 'Select at least one'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── STEP 2: VIBE TAGS ── */}
      {step === 2 && (
        <Animated.View style={[styles.stepContainer, { transform: [{ translateX: step2Translate }] }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={goToStep1} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>What describes you?</Text>
            <Text style={styles.subtitle}>
              Pick up to {MAX_VIBES} that feel honest. These show on your anonymous profile.
            </Text>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.vibeGrid}>
              {VIBE_TAGS.map((vibe) => {
                const isSelected = selectedVibes.includes(vibe.id);
                const isMaxReached = selectedVibes.length >= MAX_VIBES && !isSelected;
                return (
                  <TouchableOpacity
                    key={vibe.id}
                    onPress={() => toggleVibe(vibe.id)}
                    disabled={isMaxReached}
                    style={[
                      styles.vibeCard,
                      isSelected && styles.vibeCardSelected,
                      isMaxReached && styles.cardDisabled,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.vibeEmoji}>{vibe.emoji}</Text>
                    <Text style={[styles.vibeName, isSelected && styles.vibeNameSelected]}>
                      {vibe.id}
                    </Text>
                    {isSelected && (
                      <View style={styles.vibeCheck}>
                        <CheckCircle size={16} color={THEME.primary} fill={THEME.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* What this means */}
            <View style={styles.vibeInfoBox}>
              <Text style={styles.vibeInfoText}>
                These tags appear on your anonymous profile when someone taps your name on a confession.
                They help others decide whether to connect — without revealing who you are.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.selectedCount}>
              {selectedVibes.length} / {MAX_VIBES} selected
            </Text>
            <TouchableOpacity
              onPress={handleFinish}
              disabled={loading}
              style={styles.primaryBtn}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>
                    {selectedVibes.length > 0 ? "Let's go" : 'Skip vibes & continue'}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    gap: 8,
    zIndex: 10,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,99,74,0.25)',
  },
  stepDotActive: {
    backgroundColor: THEME.primary,
    width: 24,
    borderRadius: 4,
  },
  stepLine: {
    width: 32,
    height: 1,
    backgroundColor: 'rgba(255,99,74,0.2)',
  },

  stepContainer: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    zIndex: 10,
  },
  backBtn: {
    marginBottom: 12,
  },
  backBtnText: {
    color: THEME.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
    color: THEME.primary,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: THEME.textSecondary,
  },

  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // Interests grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  interestCardWrapper: {
    width: '47%',
    position: 'relative',
  },
  cardAccentBar: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.8,
    zIndex: 1,
  },
  cardAccentBarInactive: { opacity: 0.25 },
  interestCard: {
    padding: 20,
    paddingLeft: 24,
    borderRadius: 16,
    backgroundColor: THEME.surface,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  interestCardSelected: {
    backgroundColor: 'rgba(255,99,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.35)',
  },
  cardDisabled: { opacity: 0.35 },
  cardEmoji: { fontSize: 38, marginBottom: 10 },
  cardName: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: THEME.text },
  cardNameSelected: { color: THEME.primary, fontWeight: '700' },
  checkIcon: { position: 'absolute', top: 12, right: 12 },

  // Vibe tags grid
  vibeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 10,
  },
  vibeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    position: 'relative',
  },
  vibeCardSelected: {
    backgroundColor: 'rgba(255,99,74,0.1)',
    borderColor: 'rgba(255,99,74,0.4)',
  },
  vibeEmoji: { fontSize: 18 },
  vibeName: {
    fontSize: 14,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
  vibeNameSelected: {
    color: THEME.primary,
    fontWeight: '700',
  },
  vibeCheck: { marginLeft: 4 },

  // Info box
  vibeInfoBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    backgroundColor: THEME.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  vibeInfoText: {
    fontSize: 13,
    color: THEME.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // Footer
  footer: {
    padding: 24,
    paddingBottom: 32,
    zIndex: 10,
  },
  selectedCount: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryBtnDisabled: {
    backgroundColor: THEME.textSecondary,
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  skipBtn: {
    padding: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    fontSize: 15,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
});
