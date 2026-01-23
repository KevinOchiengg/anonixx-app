import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from 'react-native'
import {
  MessageCircle,
  Users,
  Calendar,
  Send,
  UserPlus,
} from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'

export default function ConnectionsScreen({ navigation }) {
  const { theme } = useTheme()
  const { isAuthenticated } = useAuth()

  const [invitesLeft, setInvitesLeft] = useState(3)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Only load if authenticated
    if (isAuthenticated) {
      loadInvitesLeft()
    } else {
      setLoading(false)
    }
  }, [isAuthenticated])

  const loadInvitesLeft = async () => {
    try {
      const token = await AsyncStorage.getItem('token')

      if (!token) {
        setLoading(false)
        return
      }

      const response = await fetch(
        'https://ulysses-apronlike-alethia.ngrok-free.dev/api/v1/connections/weekly-invites-left',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      if (response.ok) {
        const data = await response.json()
        setInvitesLeft(data.invites_left)
      }
    } catch (error) {
      console.error('Load invites error:', error)
    } finally {
      setLoading(false)
    }
  }

  const styles = createStyles(theme)

  // Show auth prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <StatusBar barStyle={theme.statusBar} />
        <View style={styles.authPrompt}>
          <MessageCircle size={64} color={theme.primary} />
          <Text style={[styles.authPromptTitle, { color: theme.text }]}>
            Sign up to make connections
          </Text>
          <Text style={[styles.authPromptText, { color: theme.textSecondary }]}>
            Create an account to connect with others anonymously and build
            meaningful relationships
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Auth', { screen: 'Register' })}
            style={[styles.authButton, { backgroundColor: theme.primary }]}
          >
            <UserPlus size={20} color='#ffffff' />
            <Text style={styles.authButtonText}>Sign Up</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
            style={[styles.authSecondaryButton, { borderColor: theme.border }]}
          >
            <Text
              style={[styles.authSecondaryButtonText, { color: theme.text }]}
            >
              Already have an account? Login
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <StatusBar barStyle={theme.statusBar} />
        <View style={styles.loadingContainer}>
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
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Connections
        </Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          Anonymous, intentional relationships
        </Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Weekly Invites Card */}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.cardHeader}>
            <Send size={24} color={theme.primary} />
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Weekly Invites
              </Text>
              <Text
                style={[styles.cardSubtitle, { color: theme.textSecondary }]}
              >
                {invitesLeft} invites left this week
              </Text>
            </View>
          </View>

          <Text style={[styles.cardDescription, { color: theme.textTertiary }]}>
            You can send {invitesLeft} more connection invites this week.
            Invites reset every Sunday.
          </Text>

          <TouchableOpacity
            style={[styles.cardButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.navigate('SendInvite')}
            disabled={invitesLeft === 0}
          >
            <Text style={styles.cardButtonText}>Send Connection Invite</Text>
          </TouchableOpacity>
        </View>

        {/* Active Connections */}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.cardHeader}>
            <Users size={24} color='#7A9D7E' />
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Active Connections
              </Text>
              <Text
                style={[styles.cardSubtitle, { color: theme.textSecondary }]}
              >
                0 connections
              </Text>
            </View>
          </View>

          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
            No active connections yet. Send an invite to start building
            meaningful relationships.
          </Text>
        </View>

        {/* Pending Invites */}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.cardHeader}>
            <Calendar size={24} color='#B87B8F' />
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Pending Invites
              </Text>
              <Text
                style={[styles.cardSubtitle, { color: theme.textSecondary }]}
              >
                0 pending
              </Text>
            </View>
          </View>

          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
            No pending invites
          </Text>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={[styles.infoTitle, { color: theme.text }]}>
            How Connections Work
          </Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            • Send up to 3 invites per week to people you resonate with
          </Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            • Both people stay anonymous unless you choose to reveal yourself
          </Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            • Build deeper relationships through ongoing conversations
          </Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            • Connections are about quality, not quantity
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
      paddingHorizontal: 20,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
    },
    content: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    authPrompt: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      gap: 16,
    },
    authPromptTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginTop: 16,
    },
    authPromptText: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
    },
    authButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 32,
      paddingVertical: 16,
      borderRadius: 12,
      marginTop: 16,
    },
    authButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    authSecondaryButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    authSecondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    card: {
      margin: 16,
      padding: 20,
      borderRadius: 16,
      gap: 16,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    cardHeaderText: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 2,
    },
    cardSubtitle: {
      fontSize: 14,
    },
    cardDescription: {
      fontSize: 14,
      lineHeight: 20,
    },
    cardButton: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    cardButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: 14,
      fontStyle: 'italic',
    },
    infoSection: {
      padding: 20,
      gap: 12,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 8,
    },
    infoText: {
      fontSize: 14,
      lineHeight: 20,
    },
  })
