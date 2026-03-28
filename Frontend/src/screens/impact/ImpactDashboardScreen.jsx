import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  TouchableOpacity,
} from 'react-native'
import {
  ArrowLeft,
  TrendingUp,
  Heart,
  MessageCircle,
  Award,
} from 'lucide-react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'
import { API_BASE_URL } from '../../config/api'
import StarryBackground from '../../components/common/StarryBackground';

export default function ImpactDashboardScreen({ navigation }) {
  const { theme } = useTheme()
  const [impact, setImpact] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadImpact()
  }, [])

  const loadImpact = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const response = await fetch(`${API_BASE_URL}/api/v1/impact/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (response.ok) {
        setImpact(data)
      }
    } catch (error) {
      console.error('❌ Load impact error:', error)
    } finally {
      setLoading(false)
    }
  }

  const styles = createStyles(theme)

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
      <StarryBackground />
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
          Your Impact
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, { color: theme.text }]}>
            You're making a difference
          </Text>
          <View style={[styles.scoreCard, { backgroundColor: theme.card }]}>
            <TrendingUp size={40} color={theme.primary} />
            <Text style={[styles.scoreValue, { color: theme.primary }]}>
              {impact.all_time.impact_score}
            </Text>
            <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>
              Impact Score
            </Text>
          </View>
        </View>

        {/* This Week */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            This Week
          </Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Heart size={24} color='#7A9D7E' />
              <Text style={[styles.statValue, { color: theme.text }]}>
                {impact.this_week.people_supported}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                People Supported
              </Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <MessageCircle size={24} color='#4A6FA5' />
              <Text style={[styles.statValue, { color: theme.text }]}>
                {impact.this_week.posts_shared}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Thoughts Shared
              </Text>
            </View>
          </View>
        </View>

        {/* All Time */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            All Time
          </Text>
          <View style={[styles.allTimeCard, { backgroundColor: theme.card }]}>
            <View style={styles.allTimeRow}>
              <Text
                style={[styles.allTimeLabel, { color: theme.textSecondary }]}
              >
                Thoughts shared
              </Text>
              <Text style={[styles.allTimeValue, { color: theme.text }]}>
                {impact.all_time.posts_shared}
              </Text>
            </View>
            <View style={styles.allTimeRow}>
              <Text
                style={[styles.allTimeLabel, { color: theme.textSecondary }]}
              >
                People supported
              </Text>
              <Text style={[styles.allTimeValue, { color: theme.text }]}>
                {impact.all_time.people_supported}
              </Text>
            </View>
            <View style={styles.allTimeRow}>
              <Text
                style={[styles.allTimeLabel, { color: theme.textSecondary }]}
              >
                Responses received
              </Text>
              <Text style={[styles.allTimeValue, { color: theme.text }]}>
                {impact.all_time.responses_received}
              </Text>
            </View>
            <View style={styles.allTimeRow}>
              <Text
                style={[styles.allTimeLabel, { color: theme.textSecondary }]}
              >
                Words saved
              </Text>
              <Text style={[styles.allTimeValue, { color: theme.text }]}>
                {impact.all_time.saves_received}
              </Text>
            </View>
          </View>
        </View>

        {/* Milestones */}
        {impact.milestones.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Milestones
            </Text>
            <View style={styles.milestonesGrid}>
              {impact.milestones.map((milestone, index) => (
                <View
                  key={index}
                  style={[
                    styles.milestoneCard,
                    { backgroundColor: theme.card },
                  ]}
                >
                  <Text style={styles.milestoneIcon}>{milestone.icon}</Text>
                  <Text style={[styles.milestoneName, { color: theme.text }]}>
                    {milestone.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Encouragement */}
        <View
          style={[
            styles.encouragement,
            { backgroundColor: theme.primaryLight },
          ]}
        >
          <Text style={[styles.encouragementText, { color: theme.primary }]}>
            Every word of support matters. Every story shared helps someone feel
            less alone. You're part of something meaningful.
          </Text>
        </View>
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
    heroSection: {
      padding: 24,
      alignItems: 'center',
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 24,
      textAlign: 'center',
    },
    scoreCard: {
      width: '100%',
      padding: 32,
      borderRadius: 20,
      alignItems: 'center',
      gap: 8,
    },
    scoreValue: {
      fontSize: 48,
      fontWeight: 'bold',
    },
    scoreLabel: {
      fontSize: 16,
      fontWeight: '600',
    },
    section: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    statCard: {
      flex: 1,
      padding: 20,
      borderRadius: 16,
      alignItems: 'center',
      gap: 8,
    },
    statValue: {
      fontSize: 32,
      fontWeight: 'bold',
    },
    statLabel: {
      fontSize: 12,
      textAlign: 'center',
    },
    allTimeCard: {
      padding: 20,
      borderRadius: 16,
      gap: 16,
    },
    allTimeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    allTimeLabel: {
      fontSize: 15,
    },
    allTimeValue: {
      fontSize: 18,
      fontWeight: '600',
    },
    milestonesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    milestoneCard: {
      width: '48%',
      padding: 20,
      borderRadius: 16,
      alignItems: 'center',
      gap: 8,
    },
    milestoneIcon: {
      fontSize: 36,
    },
    milestoneName: {
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    encouragement: {
      margin: 16,
      padding: 20,
      borderRadius: 16,
    },
    encouragementText: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  })
