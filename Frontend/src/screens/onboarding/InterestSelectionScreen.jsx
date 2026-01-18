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

export default function InterestSelectionScreen({ navigation }) {
  const { theme } = useTheme()
  const [selectedInterests, setSelectedInterests] = useState([])
  const [loading, setLoading] = useState(false)

  const toggleInterest = (interestId) => {
    if (selectedInterests.includes(interestId)) {
      setSelectedInterests(selectedInterests.filter((id) => id !== interestId))
    } else {
      setSelectedInterests([...selectedInterests, interestId])
    }
  }

 const handleContinue = async () => {
   if (selectedInterests.length === 0) {
     Alert.alert(
       'Select Interests',
       'Please select at least one interest to continue'
     )
     return
   }

   setLoading(true)
   try {
     const token = await AsyncStorage.getItem('token')

     const response = await fetch(
       'http://localhost:8000/api/v1/auth/interests',
       {
         method: 'PUT',
         headers: {
           'Content-Type': 'application/json',
           Authorization: `Bearer ${token}`,
         },
         body: JSON.stringify({
           interests: selectedInterests,
         }),
       }
     )

     const data = await response.json()

     if (!response.ok) {
       throw new Error(data.detail || 'Failed to save interests')
     }

     console.log('✅ Interests saved:', data.interests)

     // Mark that interests have been set
     await AsyncStorage.setItem('hasInterests', 'true')

     // Don't need to do anything else - AppNavigator will detect the change
     console.log('✅ Flag set, waiting for navigation...')
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
      "You'll see random content. You can set interests later in settings.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: async () => {
            await AsyncStorage.setItem('hasInterests', 'true')
            window.location.reload()
          },
        },
      ]
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
          What interests you?
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Choose topics you'd like to see in your feed
        </Text>
      </View>

      {/* Interests Grid */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {INTERESTS.map((interest) => {
            const isSelected = selectedInterests.includes(interest.id)
            return (
              <TouchableOpacity
                key={interest.id}
                onPress={() => toggleInterest(interest.id)}
                style={[
                  styles.interestCard,
                  {
                    backgroundColor: isSelected
                      ? theme.primaryLight
                      : theme.card,
                    borderColor: isSelected ? theme.primary : theme.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={styles.emoji}>{interest.emoji}</Text>
                <Text style={[styles.interestName, { color: theme.text }]}>
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
      <View style={styles.footer}>
        <Text style={[styles.selectedCount, { color: theme.textSecondary }]}>
          {selectedInterests.length} selected
        </Text>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={loading || selectedInterests.length === 0}
          style={[
            styles.continueButton,
            { backgroundColor: theme.primary },
            (loading || selectedInterests.length === 0) &&
              styles.continueButtonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color='#ffffff' />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={[styles.skipButtonText, { color: theme.textSecondary }]}>
            Skip for now
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
      paddingTop: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      lineHeight: 22,
    },
    scrollView: {
      flex: 1,
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
    },
    emoji: {
      fontSize: 40,
      marginBottom: 12,
    },
    interestName: {
      fontSize: 16,
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
    },
    selectedCount: {
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 16,
    },
    continueButton: {
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    continueButtonDisabled: {
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
    },
  })
