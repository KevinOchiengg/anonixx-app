import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { CheckCircle, Circle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { API_BASE_URL } from '../../config/api';

const { height, width } = Dimensions.get('window');

// NEW Cinematic Coral Theme
const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
};

// Starry Background Component
const StarryBackground = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      top: Math.random() * height,
      left: Math.random() * width,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
    }));
  }, []);

  return (
    <>
      {stars.map((star) => (
        <View
          key={star.id}
          style={{
            position: 'absolute',
            backgroundColor: THEME.primary,
            borderRadius: 50,
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </>
  );
};

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

const MAX_INTERESTS = 5;

export default function InterestSelectionScreen({ navigation }) {
  const { theme } = useTheme();
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [loading, setLoading] = useState(false);

  const toggleInterest = (interestId) => {
    if (selectedInterests.includes(interestId)) {
      setSelectedInterests(selectedInterests.filter((id) => id !== interestId));
    } else {
      if (selectedInterests.length >= MAX_INTERESTS) {
        Alert.alert(
          'Maximum Reached',
          ` Pick what you actually deal with. Up to ${MAX_INTERESTS} `
        );
        return;
      }
      setSelectedInterests([...selectedInterests, interestId]);
    }
  };

  const handleContinue = async () => {
    if (selectedInterests.length === 0) {
      Alert.alert(
        'Select Interests',
        'Pick at least one. We need somewhere to start.'
      );
      return;
    }

    setLoading(true);
    try {
      console.log('🔵 Saving interests:', selectedInterests);

      const token = await AsyncStorage.getItem('token');

      console.log('🔍 Token exists:', !!token);
      console.log('🔍 Token type:', typeof token);
      console.log('🔍 Token value:', token);

      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/interests`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          interests: selectedInterests,
        }),
      });

      console.log('🔍 Response status:', response.status);

      const data = await response.json();
      console.log('🔍 Response data:', data);

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to save interests');
      }

      console.log('✅ Interests saved:', data.interests);

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (error) {
      console.error('❌ Save interests error:', error);
      Alert.alert('Error', error.message || 'Failed to save interests');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    Alert.alert(
      'Skip Interest Selection?',
      "You'll see everything. You can narrow it down later, in settings",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => {
            console.log('⏭️ User skipped interest selection');
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>What brings you here?</Text>
        <Text style={styles.subtitle}>
          Select up to {MAX_INTERESTS} topics to personalize your feed
        </Text>
      </View>

      {/* Interests Grid */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.grid}>
          {INTERESTS.map((interest) => {
            const isSelected = selectedInterests.includes(interest.id);
            const isMaxReached =
              selectedInterests.length >= MAX_INTERESTS && !isSelected;

            return (
              <View key={interest.id} style={styles.interestCardWrapper}>
                <View
                  style={[
                    styles.interestAccentBar,
                    !isSelected && styles.interestAccentBarInactive,
                  ]}
                />
                <TouchableOpacity
                  onPress={() => toggleInterest(interest.id)}
                  disabled={isMaxReached}
                  style={[
                    styles.interestCard,
                    isSelected && styles.interestCardSelected,
                    isMaxReached && styles.interestCardDisabled,
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={styles.checkIcon}>
                    {isSelected ? (
                      <CheckCircle
                        size={20}
                        color={THEME.primary}
                        fill={THEME.primary}
                      />
                    ) : (
                      <Circle
                        size={20}
                        color={THEME.textSecondary}
                        opacity={0.4}
                      />
                    )}
                  </View>
                  <Text style={styles.emoji}>{interest.emoji}</Text>
                  <Text
                    style={[
                      styles.interestName,
                      isSelected && styles.interestNameSelected,
                    ]}
                  >
                    {interest.name}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.selectedCount}>
          {selectedInterests.length} / {MAX_INTERESTS} selected
        </Text>

        <View style={styles.continueButtonWrapper}>
          <View
            style={[
              styles.continueAccentBar,
              selectedInterests.length === 0 &&
                styles.continueAccentBarDisabled,
            ]}
          />
          <TouchableOpacity
            onPress={handleContinue}
            disabled={loading || selectedInterests.length === 0}
            style={[
              styles.continueButton,
              selectedInterests.length === 0 && styles.continueButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.continueButtonText}>
                {selectedInterests.length > 0
                  ? 'Continue'
                  : 'Select at least one'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
    color: THEME.primary,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: THEME.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
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
  interestAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.8,
    zIndex: 1,
  },
  interestAccentBarInactive: {
    opacity: 0.3,
  },
  interestCard: {
    padding: 20,
    paddingLeft: 24,
    borderRadius: 16,
    backgroundColor: THEME.surface,
    alignItems: 'center',
    position: 'relative',
    minHeight: 120,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  interestCardSelected: {
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.4)',
  },
  interestCardDisabled: {
    opacity: 0.4,
  },
  emoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  interestName: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    color: THEME.text,
  },
  interestNameSelected: {
    color: THEME.primary,
    fontWeight: '700',
  },
  checkIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  footer: {
    padding: 24,
    paddingBottom: 32,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  selectedCount: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  continueButtonWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  continueAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    opacity: 0.8,
  },
  continueAccentBarDisabled: {
    opacity: 0.3,
  },
  continueButton: {
    height: 56,
    borderRadius: 28,
    paddingLeft: 4,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  continueButtonDisabled: {
    backgroundColor: THEME.textSecondary,
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  skipButton: {
    padding: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
});
