import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { ArrowLeft, Check, X, Sparkles } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { getPendingReveals, respondToReveal } from '../../services/connectApi'

export default function RevealPendingScreen({ navigation }) {
  const { theme } = useTheme()
  const [reveals, setReveals] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  useEffect(() => {
    loadReveals()
  }, [])

  const loadReveals = async () => {
    try {
      const data = await getPendingReveals()
      setReveals(data.pending_reveals || [])
    } catch (error) {
      console.error('❌ Load pending reveals error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (revealId, anonymousName) => {
    Alert.alert(
      'Accept reveal?',
      `${anonymousName} will know you want to see their identity. Are you ready?`,
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setProcessingId(revealId)
            try {
              await respondToReveal(revealId, true)

              Alert.alert(
                '✨ Identity Revealed',
                'You can now see who they are. Head to your conversation.',
                [
                  {
                    text: 'View',
                    onPress: () => navigation.goBack(),
                  },
                ],
              )
            } catch (error) {
              console.error('❌ Accept reveal error:', error)
              Alert.alert('Error', error.message || 'Failed to accept reveal')
            } finally {
              setProcessingId(null)
            }
          },
        },
      ],
    )
  }

  const handleDecline = async (revealId, anonymousName) => {
    Alert.alert(
      'Decline reveal?',
      `${anonymousName} won't know you declined. The connection continues as is.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(revealId)
            try {
              await respondToReveal(revealId, false)
              loadReveals()
            } catch (error) {
              console.error('❌ Decline reveal error:', error)
            } finally {
              setProcessingId(null)
            }
          },
        },
      ],
    )
  }

  const renderReveal = ({ item }) => (
    <View
      style={[
        styles.revealCard,
        { backgroundColor: theme.card, borderColor: theme.primary },
      ]}
    >
      <View style={styles.revealHeader}>
        <Sparkles size={24} color={theme.primary} />
        <Text style={[styles.anonymousName, { color: theme.text }]}>
          {item.anonymous_name}
        </Text>
      </View>

      <Text style={[styles.revealMessage, { color: theme.text }]}>
        {item.anonymous_name} wants to reveal their identity to you.
      </Text>

      <View style={[styles.infoBox, { backgroundColor: theme.primaryLight }]}>
        <Text style={[styles.infoText, { color: theme.primary }]}>
          Before you decide:
        </Text>
        <Text style={[styles.infoSubtext, { color: theme.primary }]}>
          • This is entirely your choice{'\n'}• You can say no{'\n'}• Saying no
          won't hurt them{'\n'}• You don't have to reveal yours back
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => handleDecline(item.reveal_id, item.anonymous_name)}
          disabled={processingId === item.reveal_id}
          style={[
            styles.declineButton,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          {processingId === item.reveal_id ? (
            <ActivityIndicator size='small' color={theme.textSecondary} />
          ) : (
            <>
              <X size={18} color={theme.textSecondary} />
              <Text
                style={[styles.declineText, { color: theme.textSecondary }]}
              >
                Not Yet
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAccept(item.reveal_id, item.anonymous_name)}
          disabled={processingId === item.reveal_id}
          style={[styles.acceptButton, { backgroundColor: theme.primary }]}
        >
          {processingId === item.reveal_id ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <>
              <Check size={18} color='#ffffff' />
              <Text style={styles.acceptText}>Accept</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Reveal Requests
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size='large' color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={reveals}
          keyExtractor={(item) => item.reveal_id}
          renderItem={renderReveal}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Sparkles size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No pending reveal requests
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    list: {
      padding: 16,
    },
    revealCard: {
      borderRadius: 20,
      padding: 20,
      marginBottom: 16,
      borderWidth: 2,
    },
    revealHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    anonymousName: {
      fontSize: 18,
      fontWeight: '700',
    },
    revealMessage: {
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 16,
    },
    infoBox: {
      padding: 16,
      borderRadius: 12,
      marginBottom: 20,
    },
    infoText: {
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 8,
    },
    infoSubtext: {
      fontSize: 13,
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
    },
    declineButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: 16,
      borderRadius: 12,
    },
    declineText: {
      fontSize: 15,
      fontWeight: '600',
    },
    acceptButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: 16,
      borderRadius: 12,
    },
    acceptText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },
    empty: {
      padding: 48,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 15,
      marginTop: 16,
    },
  })
