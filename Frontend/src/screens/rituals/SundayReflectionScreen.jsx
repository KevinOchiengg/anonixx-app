import React, { useState, useEffect } from 'react'
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
} from 'react-native'
import { ArrowLeft, Heart, MessageCircle, BookOpen } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'

export default function SundayReflectionScreen({ navigation }) {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [weekSummary, setWeekSummary] = useState(null)
  const [alreadyReflected, setAlreadyReflected] = useState(false)
  const [reflectionText, setReflectionText] = useState('')
  const [selectedMood, setSelectedMood] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [pastReflections, setPastReflections] = useState([])

  const moods = [
    { id: 'good', emoji: '😊', label: 'Good' },
    { id: 'mixed', emoji: '😐', label: 'Mixed' },
    { id: 'struggling', emoji: '😔', label: 'Struggling' },
  ]

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const token = await AsyncStorage.getItem('token')

      // Load Sunday prompt
      const promptRes = await fetch(
        'http://localhost:8000/api/v1/rituals/sunday-prompt',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      const promptData = await promptRes.json()
      if (promptRes.ok) {
        setWeekSummary(promptData.week_summary)
        setAlreadyReflected(promptData.already_reflected)
      }

      // Load past reflections
      const pastRes = await fetch(
        'http://localhost:8000/api/v1/rituals/past-reflections',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      const pastData = await pastRes.json()
      if (pastRes.ok) {
        setPastReflections(pastData.reflections)
      }
    } catch (error) {
      console.error('❌ Load reflection data error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!reflectionText.trim()) {
      Alert.alert('Error', 'Please write your reflection')
      return
    }

    if (!selectedMood) {
      Alert.alert('Error', 'Please select how you felt this week')
      return
    }

    setSubmitting(true)
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(
        'http://localhost:8000/api/v1/rituals/reflect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: reflectionText.trim(),
            mood: selectedMood,
          }),
        }
      )

      const data = await response.json()

      if (response.ok) {
        Alert.alert('Saved', data.message, [
          {
            text: 'OK',
            onPress: () => {
              setReflectionText('')
              setSelectedMood(null)
              loadData()
            },
          },
        ])
      } else {
        Alert.alert('Error', data.detail || 'Failed to save reflection')
      }
    } catch (error) {
      console.error('❌ Submit reflection error:', error)
      Alert.alert('Error', 'Failed to save reflection')
    } finally {
      setSubmitting(false)
    }
  }

  const styles = createStyles(theme)

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <StatusBar barStyle={theme.statusBar} />
        <View style={styles.centered}>
          <ActivityIndicator size='large' color={theme.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Sunday Reflection
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Week Summary */}
        <View style={[styles.summaryCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.summaryTitle, { color: theme.text }]}>
            Your week in review
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Heart size={20} color='#7A9D7E' />
              <Text style={[styles.statValue, { color: theme.text }]}>
                {weekSummary?.people_supported || 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                supported
              </Text>
            </View>

            <View style={styles.stat}>
              <MessageCircle size={20} color='#4A6FA5' />
              <Text style={[styles.statValue, { color: theme.text }]}>
                {weekSummary?.posts_shared || 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                shared
              </Text>
            </View>
          </View>
        </View>

        {/* Reflection Form */}
        {!alreadyReflected ? (
          <View style={styles.section}>
            <Text style={[styles.prompt, { color: theme.text }]}>
              What moved you this week?
            </Text>

            <TextInput
              value={reflectionText}
              onChangeText={setReflectionText}
              placeholder='Share your thoughts...'
              placeholderTextColor={theme.placeholder}
              multiline
              style={[
                styles.textInput,
                { color: theme.text, backgroundColor: theme.input },
              ]}
              maxLength={1000}
            />

            <Text style={[styles.moodLabel, { color: theme.text }]}>
              How did you feel this week?
            </Text>

            <View style={styles.moodButtons}>
              {moods.map((mood) => (
                <TouchableOpacity
                  key={mood.id}
                  onPress={() => setSelectedMood(mood.id)}
                  style={[
                    styles.moodButton,
                    {
                      backgroundColor:
                        selectedMood === mood.id
                          ? theme.primaryLight
                          : theme.card,
                      borderColor:
                        selectedMood === mood.id ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  <Text
                    style={[
                      styles.moodText,
                      {
                        color:
                          selectedMood === mood.id ? theme.primary : theme.text,
                      },
                    ]}
                  >
                    {mood.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.submitButton, { backgroundColor: theme.primary }]}
            >
              {submitting ? (
                <ActivityIndicator size='small' color='#ffffff' />
              ) : (
                <Text style={styles.submitButtonText}>Save Reflection</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[styles.alreadyReflected, { backgroundColor: theme.card }]}
          >
            <BookOpen size={32} color={theme.primary} />
            <Text style={[styles.alreadyText, { color: theme.text }]}>
              You've reflected this week
            </Text>
            <Text
              style={[styles.alreadySubtext, { color: theme.textSecondary }]}
            >
              Come back next Sunday for your weekly check-in
            </Text>
          </View>
        )}

        {/* Past Reflections */}
        {pastReflections.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Past Reflections
            </Text>

            {pastReflections.map((reflection) => (
              <View
                key={reflection.id}
                style={[styles.pastReflection, { backgroundColor: theme.card }]}
              >
                <View style={styles.reflectionHeader}>
                  <Text
                    style={[
                      styles.reflectionMood,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {moods.find((m) => m.id === reflection.mood)?.emoji}{' '}
                    {moods.find((m) => m.id === reflection.mood)?.label}
                  </Text>
                  <Text
                    style={[
                      styles.reflectionDate,
                      { color: theme.textTertiary },
                    ]}
                  >
                    {reflection.weeks_ago === 0
                      ? 'This week'
                      : `${reflection.weeks_ago} weeks ago`}
                  </Text>
                </View>
                <Text style={[styles.reflectionContent, { color: theme.text }]}>
                  {reflection.content}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollView: {
      flex: 1,
    },
    summaryCard: {
      margin: 16,
      padding: 20,
      borderRadius: 16,
    },
    summaryTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 20,
    },
    stat: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
    },
    statValue: {
      fontSize: 32,
      fontWeight: 'bold',
    },
    statLabel: {
      fontSize: 13,
    },
    section: {
      padding: 16,
    },
    prompt: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 16,
      textAlign: 'center',
    },
    textInput: {
      minHeight: 150,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      lineHeight: 24,
      textAlignVertical: 'top',
    },
    moodLabel: {
      fontSize: 16,
      fontWeight: '600',
      marginTop: 24,
      marginBottom: 12,
    },
    moodButtons: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    moodButton: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      borderWidth: 2,
      alignItems: 'center',
      gap: 8,
    },
    moodEmoji: {
      fontSize: 32,
    },
    moodText: {
      fontSize: 14,
      fontWeight: '600',
    },
    submitButton: {
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    submitButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    alreadyReflected: {
      margin: 16,
      padding: 40,
      borderRadius: 16,
      alignItems: 'center',
      gap: 12,
    },
    alreadyText: {
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    alreadySubtext: {
      fontSize: 14,
      textAlign: 'center',
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    pastReflection: {
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
    },
    reflectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    reflectionMood: {
      fontSize: 14,
      fontWeight: '600',
    },
    reflectionDate: {
      fontSize: 12,
    },
    reflectionContent: {
      fontSize: 15,
      lineHeight: 22,
    },
  })
