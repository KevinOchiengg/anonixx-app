import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Alert,
  Dimensions,
} from 'react-native';

import { ArrowLeft, Heart, MessageCircle, BookOpen } from 'lucide-react-native';
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
  input: 'rgba(30, 35, 45, 0.7)',
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

export default function SundayReflectionScreen({ navigation }) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [weekSummary, setWeekSummary] = useState(null);
  const [alreadyReflected, setAlreadyReflected] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [selectedMood, setSelectedMood] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [pastReflections, setPastReflections] = useState([]);

  const moods = [
    { id: 'good', emoji: '😊', label: 'Good' },
    { id: 'mixed', emoji: '😐', label: 'Mixed' },
    { id: 'struggling', emoji: '😔', label: 'Struggling' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      // Load Sunday prompt
      const promptRes = await fetch(
        `${API_BASE_URL}/api/v1/rituals/sunday-prompt`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const promptData = await promptRes.json();
      if (promptRes.ok) {
        setWeekSummary(promptData.week_summary);
        setAlreadyReflected(promptData.already_reflected);
      }

      // Load past reflections
      const pastRes = await fetch(
        `${API_BASE_URL}/api/v1/rituals/past-reflections`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const pastData = await pastRes.json();
      if (pastRes.ok) {
        setPastReflections(pastData.reflections);
      }
    } catch (error) {
      console.error('❌ Load reflection data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!reflectionText.trim()) {
      Alert.alert('Error', 'Please write your reflection');
      return;
    }

    if (!selectedMood) {
      Alert.alert('Error', 'Please select how you felt this week');
      return;
    }

    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/v1/rituals/reflect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: reflectionText.trim(),
          mood: selectedMood,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Saved', data.message, [
          {
            text: 'OK',
            onPress: () => {
              setReflectionText('');
              setSelectedMood(null);
              loadData();
            },
          },
        ]);
      } else {
        Alert.alert('Error', data.detail || 'Failed to save reflection');
      }
    } catch (error) {
      console.error('❌ Submit reflection error:', error);
      Alert.alert('Error', 'Failed to save reflection');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={THEME.background}
        />
        <StarryBackground />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.primary} />
          <Text style={styles.loadingText}>Loading your week...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sunday Reflection</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Week Summary */}
        <View style={styles.summaryCardWrapper}>
          <View style={styles.summaryAccentBar} />
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Your week in review</Text>

            <View style={styles.divider} />

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <View style={styles.statIcon}>
                  <Heart size={20} color="#7A9D7E" />
                </View>
                <Text style={styles.statValue}>
                  {weekSummary?.people_supported || 0}
                </Text>
                <Text style={styles.statLabel}>supported</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.stat}>
                <View style={styles.statIcon}>
                  <MessageCircle size={20} color="#4A6FA5" />
                </View>
                <Text style={styles.statValue}>
                  {weekSummary?.posts_shared || 0}
                </Text>
                <Text style={styles.statLabel}>shared</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Reflection Form */}
        {!alreadyReflected ? (
          <View style={styles.section}>
            <Text style={styles.prompt}>What moved you this week?</Text>

            <View style={styles.textInputWrapper}>
              <View style={styles.textInputAccentBar} />
              <TextInput
                value={reflectionText}
                onChangeText={setReflectionText}
                placeholder="Share your thoughts..."
                placeholderTextColor={THEME.textSecondary}
                multiline
                style={styles.textInput}
                maxLength={1000}
              />
            </View>

            <Text style={styles.moodLabel}>How did you feel this week?</Text>

            <View style={styles.moodButtons}>
              {moods.map((mood) => (
                <View key={mood.id} style={styles.moodButtonWrapper}>
                  <View
                    style={[
                      styles.moodAccentBar,
                      selectedMood !== mood.id && styles.moodAccentBarInactive,
                    ]}
                  />
                  <TouchableOpacity
                    onPress={() => setSelectedMood(mood.id)}
                    style={[
                      styles.moodButton,
                      selectedMood === mood.id && styles.moodButtonSelected,
                    ]}
                  >
                    <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                    <Text
                      style={[
                        styles.moodText,
                        selectedMood === mood.id && styles.moodTextSelected,
                      ]}
                    >
                      {mood.label}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.submitButtonWrapper}>
              <View style={styles.submitAccentBar} />
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                style={[
                  styles.submitButton,
                  submitting && styles.submitButtonDisabled,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitButtonText}>Save Reflection</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.alreadyReflectedWrapper}>
            <View style={styles.alreadyAccentBar} />
            <View style={styles.alreadyReflected}>
              <View style={styles.alreadyIconContainer}>
                <BookOpen size={48} color={THEME.primary} />
              </View>
              <Text style={styles.alreadyText}>You've reflected this week</Text>
              <Text style={styles.alreadySubtext}>
                Come back next Sunday for your weekly check-in
              </Text>
            </View>
          </View>
        )}

        {/* Past Reflections */}
        {pastReflections.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Past Reflections</Text>

            {pastReflections.map((reflection) => (
              <View key={reflection.id} style={styles.pastReflectionWrapper}>
                <View style={styles.pastAccentBar} />
                <View style={styles.pastReflection}>
                  <View style={styles.reflectionHeader}>
                    <Text style={styles.reflectionMood}>
                      {moods.find((m) => m.id === reflection.mood)?.emoji}{' '}
                      {moods.find((m) => m.id === reflection.mood)?.label}
                    </Text>
                    <Text style={styles.reflectionDate}>
                      {reflection.weeks_ago === 0
                        ? 'This week'
                        : `${reflection.weeks_ago} weeks ago`}
                    </Text>
                  </View>
                  <View style={styles.reflectionDivider} />
                  <Text style={styles.reflectionContent}>
                    {reflection.content}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: THEME.textSecondary,
    marginTop: 16,
    fontStyle: 'italic',
  },
  scrollView: {
    flex: 1,
  },
  // Summary Card
  summaryCardWrapper: {
    position: 'relative',
    margin: 16,
    marginBottom: 8,
  },
  summaryAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    opacity: 0.6,
  },
  summaryCard: {
    backgroundColor: THEME.surface,
    padding: 24,
    paddingLeft: 28,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.text,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 36,
    fontWeight: '800',
    color: THEME.primary,
  },
  statLabel: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 60,
    backgroundColor: THEME.border,
  },
  section: {
    padding: 16,
  },
  prompt: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
    color: THEME.primary,
    letterSpacing: -0.5,
  },
  // Text Input
  textInputWrapper: {
    position: 'relative',
    marginBottom: 24,
  },
  textInputAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
  },
  textInput: {
    minHeight: 150,
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 20,
    paddingLeft: 24,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top',
    color: THEME.text,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  moodLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 12,
  },
  moodButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  moodButtonWrapper: {
    flex: 1,
    position: 'relative',
  },
  moodAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.8,
    zIndex: 1,
  },
  moodAccentBarInactive: {
    opacity: 0.3,
  },
  moodButton: {
    padding: 16,
    paddingLeft: 20,
    borderRadius: 12,
    backgroundColor: THEME.surface,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  moodButtonSelected: {
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.4)',
  },
  moodEmoji: {
    fontSize: 36,
  },
  moodText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.text,
  },
  moodTextSelected: {
    color: THEME.primary,
    fontWeight: '700',
  },
  // Submit Button
  submitButtonWrapper: {
    position: 'relative',
  },
  submitAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.8,
  },
  submitButton: {
    backgroundColor: THEME.primary,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Already Reflected
  alreadyReflectedWrapper: {
    position: 'relative',
    margin: 16,
  },
  alreadyAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    opacity: 0.4,
  },
  alreadyReflected: {
    backgroundColor: THEME.surface,
    padding: 40,
    paddingLeft: 44,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  alreadyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  alreadyText: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: THEME.text,
    marginBottom: 8,
  },
  alreadySubtext: {
    fontSize: 15,
    textAlign: 'center',
    color: THEME.textSecondary,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 16,
  },
  // Past Reflections
  pastReflectionWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  pastAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  pastReflection: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  reflectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reflectionMood: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.text,
  },
  reflectionDate: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: '500',
  },
  reflectionDivider: {
    height: 1,
    backgroundColor: THEME.border,
    marginBottom: 12,
  },
  reflectionContent: {
    fontSize: 15,
    lineHeight: 22,
    color: THEME.textSecondary,
  },
});
