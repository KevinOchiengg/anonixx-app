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
  RefreshControl,
} from 'react-native'
import { ArrowLeft, MessageCircle, Sparkles } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { getConnections } from '../../services/connectApi'

export default function ConnectionsListScreen({ navigation }) {
  const { theme } = useTheme()
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadConnections()
  }, [])

  const loadConnections = async () => {
    try {
      const data = await getConnections()
      setConnections(data.connections || [])
    } catch (error) {
      console.error('❌ Load connections error:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadConnections()
  }

  const renderConnection = ({ item }) => (
    <TouchableOpacity
      onPress={() =>
        navigation.navigate('Chat', { connectionId: item.connection_id })
      }
      style={[
        styles.connectionCard,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
      activeOpacity={0.7}
    >
      <View style={styles.connectionHeader}>
        <View style={styles.nameContainer}>
          <Text style={[styles.anonymousName, { color: theme.text }]}>
            {item.anonymous_name}
          </Text>
          {item.is_revealed && <Sparkles size={16} color={theme.primary} />}
        </View>
        <Text style={[styles.timeAgo, { color: theme.textSecondary }]}>
          {item.time_ago}
        </Text>
      </View>

      <Text
        style={[styles.lastMessage, { color: theme.textSecondary }]}
        numberOfLines={2}
      >
        {item.last_message}
      </Text>

      <View style={styles.footer}>
        <Text style={[styles.stats, { color: theme.textTertiary }]}>
          {item.message_count} messages • {item.days_active} days
        </Text>

        {item.unread_count > 0 && (
          <View
            style={[styles.unreadBadge, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.unreadText}>{item.unread_count}</Text>
          </View>
        )}

        {item.reveal_eligible && !item.is_revealed && (
          <View
            style={[
              styles.revealBadge,
              { backgroundColor: theme.primaryLight },
            ]}
          >
            <Sparkles size={12} color={theme.primary} />
            <Text style={[styles.revealText, { color: theme.primary }]}>
              Can reveal
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )

  const styles = createStyles(theme)

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: theme.background },
        ]}
      >
        <ActivityIndicator size='large' color={theme.primary} />
      </View>
    )
  }

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
          Connections
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={connections}
        keyExtractor={(item) => item.connection_id}
        renderItem={renderConnection}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MessageCircle size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No connections yet
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              When someone accepts your opener, they'll appear here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    center: {
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
    connectionCard: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
    },
    connectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    nameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    anonymousName: {
      fontSize: 16,
      fontWeight: '700',
    },
    timeAgo: {
      fontSize: 13,
    },
    lastMessage: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    stats: {
      flex: 1,
      fontSize: 12,
    },
    unreadBadge: {
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    unreadText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: 'bold',
    },
    revealBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    revealText: {
      fontSize: 11,
      fontWeight: '600',
    },
    empty: {
      padding: 48,
      alignItems: 'center',
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      textAlign: 'center',
    },
  })
