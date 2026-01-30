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
import { ArrowLeft, Check, X } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  getPendingOpeners,
  acceptOpener,
  declineOpener,
} from '../../services/connectApi'

export default function PendingOpenersScreen({ navigation }) {
  const { theme } = useTheme()
  const [openers, setOpeners] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  useEffect(() => {
    loadOpeners()
  }, [])

  const loadOpeners = async () => {
    try {
      const data = await getPendingOpeners()
      setOpeners(data.pending_openers || [])
    } catch (error) {
      console.error('❌ Load openers error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (connectionId) => {
    setProcessingId(connectionId)
    try {
      await acceptOpener(connectionId)

      Alert.alert(
        'Connection started! 💬',
        'You can now chat with them. Head to your connections.',
        [
          {
            text: 'View Connections',
            onPress: () => navigation.navigate('ConnectionsList'),
          },
          {
            text: 'OK',
            onPress: () => loadOpeners(),
          },
        ],
      )
    } catch (error) {
      console.error('❌ Accept opener error:', error)
      Alert.alert('Error', error.message || 'Failed to accept opener')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDecline = async (connectionId) => {
    Alert.alert(
      'Decline opener?',
      "This person won't know you declined. No hard feelings.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(connectionId)
            try {
              await declineOpener(connectionId)
              loadOpeners()
            } catch (error) {
              console.error('❌ Decline opener error:', error)
            } finally {
              setProcessingId(null)
            }
          },
        },
      ],
    )
  }

  const renderOpener = ({ item }) => (
    <View
      style={[
        styles.openerCard,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={styles.openerHeader}>
        <Text style={[styles.anonymousName, { color: theme.text }]}>
          {item.anonymous_name}
        </Text>
        <Text style={[styles.timeAgo, { color: theme.textSecondary }]}>
          {item.time_ago}
        </Text>
      </View>

      <Text style={[styles.message, { color: theme.text }]}>
        {item.opening_message}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => handleDecline(item.connection_id)}
          disabled={processingId === item.connection_id}
          style={[
            styles.declineButton,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          {processingId === item.connection_id ? (
            <ActivityIndicator size='small' color={theme.textSecondary} />
          ) : (
            <>
              <X size={18} color={theme.textSecondary} />
              <Text
                style={[styles.declineText, { color: theme.textSecondary }]}
              >
                Pass
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleAccept(item.connection_id)}
          disabled={processingId === item.connection_id}
          style={[styles.acceptButton, { backgroundColor: theme.primary }]}
        >
          {processingId === item.connection_id ? (
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
          Pending Openers
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size='large' color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={openers}
          keyExtractor={(item) => item.connection_id}
          renderItem={renderOpener}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No pending openers yet.
              </Text>
              <Text
                style={[styles.emptySubtext, { color: theme.textTertiary }]}
              >
                When someone resonates with your broadcast, they'll appear here.
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
    openerCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
    },
    openerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    anonymousName: {
      fontSize: 16,
      fontWeight: '700',
    },
    timeAgo: {
      fontSize: 13,
    },
    message: {
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 16,
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
      padding: 14,
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
      padding: 14,
      borderRadius: 12,
    },
    acceptText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },
    empty: {
      padding: 32,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      textAlign: 'center',
    },
  })
