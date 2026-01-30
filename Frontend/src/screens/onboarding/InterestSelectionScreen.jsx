import React, { useState } from 'react'
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
} from 'react-native'
import { CheckCircle, Circle } from 'lucide-react-native'
import { API_BASE_URL } from '../../config/api'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'

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
]

const MAX_INTERESTS = 5

export default function InterestSelectionScreen({ navigation }) {
  const { theme } = useTheme()
  const [selectedInterests, setSelectedInterests] = useState([])
  const [loading, setLoading] = useState(false)

  const toggleInterest = (interestId) => {
    if (selectedInterests.includes(interestId)) {
      // Remove interest
      setSelectedInterests(selectedInterests.filter((id) => id !== interestId))
    } else {
      // Add interest (with max limit)
      if (selectedInterests.length >= MAX_INTERESTS) {
        Alert.alert(
          'Maximum Reached',
          `You can select up to ${MAX_INTERESTS} interests. Deselect one to choose another.`,
        )
        return
      }
      setSelectedInterests([...selectedInterests, interestId])
    }
  }

const handleContinue = async () => {
  if (selectedInterests.length === 0) {
    Alert.alert(
      'Select Interests',
      'Please select at least one interest to personalize your feed',
    )
    return
  }

  setLoading(true)
  try {
    console.log('🔵 Saving interests:', selectedInterests)

    const token = await AsyncStorage.getItem('token')

    // ✅ DEBUG: Check token
    console.log('🔍 Token exists:', !!token)
    console.log('🔍 Token type:', typeof token)
    console.log('🔍 Token value:', token)

    if (!token) {
      throw new Error('No authentication token found. Please log in again.')
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
    })

    console.log('🔍 Response status:', response.status)

    const data = await response.json()
    console.log('🔍 Response data:', data)

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to save interests')
    }

    console.log('✅ Interests saved:', data.interests)

    // Navigate to main feed
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    })
  } catch (error) {
    console.error('❌ Save interests error:', error)
    Alert.alert('Error', error.message || 'Failed to save interests')
  } finally {
    setLoading(false)
  }
}

  const handleSkip = async () => {
    Alert.alert(
      'Skip Interest Selection?',
      "You'll see a general feed. You can customize your interests anytime in Settings.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => {
            console.log('⏭️ User skipped interest selection')
            // Navigate to main feed without saving interests
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            })
          },
        },
      ],
    )
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>
          What brings you here?
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
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
            const isSelected = selectedInterests.includes(interest.id)
            const isMaxReached =
              selectedInterests.length >= MAX_INTERESTS && !isSelected

            return (
              <TouchableOpacity
                key={interest.id}
                onPress={() => toggleInterest(interest.id)}
                disabled={isMaxReached}
                style={[
                  styles.interestCard,
                  {
                    backgroundColor: isSelected
                      ? theme.primary + '15'
                      : theme.card,
                    borderColor: isSelected ? theme.primary : theme.border,
                    opacity: isMaxReached ? 0.5 : 1,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={styles.emoji}>{interest.emoji}</Text>
                <Text
                  style={[
                    styles.interestName,
                    { color: isSelected ? theme.primary : theme.text },
                  ]}
                >
                  {interest.name}
                </Text>
                <View style={styles.checkIcon}>
                  {isSelected ? (
                    <CheckCircle
                      size={24}
                      color={theme.primary}
                      fill={theme.primary}
                    />
                  ) : (
                    <Circle size={24} color={theme.textTertiary} />
                  )}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Text style={[styles.selectedCount, { color: theme.textSecondary }]}>
          {selectedInterests.length} / {MAX_INTERESTS} selected
        </Text>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={loading || selectedInterests.length === 0}
          style={[
            styles.continueButton,
            {
              backgroundColor:
                selectedInterests.length > 0 ? theme.primary : theme.border,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color='#ffffff' />
          ) : (
            <Text style={styles.continueButtonText}>
              {selectedInterests.length > 0
                ? 'Continue'
                : 'Select at least one'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={[styles.skipButtonText, { color: theme.textSecondary }]}>
            I'll choose later
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 40,
      paddingBottom: 24,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 16,
      lineHeight: 22,
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
    interestCard: {
      width: '47%',
      padding: 20,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: 'center',
      position: 'relative',
      minHeight: 120,
      justifyContent: 'center',
    },
    emoji: {
      fontSize: 40,
      marginBottom: 12,
    },
    interestName: {
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
    },
    checkIcon: {
      position: 'absolute',
      top: 12,
      right: 12,
    },
    footer: {
      padding: 24,
      paddingBottom: 32,
      borderTopWidth: 1,
    },
    selectedCount: {
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 16,
      fontWeight: '500',
    },
    continueButton: {
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 3,
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
    },
  })
