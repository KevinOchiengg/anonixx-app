import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { Plus, MessageCircle, Inbox } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  getBroadcasts,
  getMyActiveBroadcast,
  getPendingOpeners,
} from '../../services/connectApi'
import BroadcastCard from '../../components/connect/BroadcastCard'

export default function ConnectFeedScreen({ navigation }) {
  const { theme } = useTheme()
  const [broadcasts, setBroadcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [myBroadcast, setMyBroadcast] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [broadcastsData, myBroadcastData, pendingData] = await Promise.all([
        getBroadcasts(),
        getMyActiveBroadcast(),
        getPendingOpeners(),
      ])

      setBroadcasts(broadcastsData.broadcasts || [])
      setMyBroadcast(myBroadcastData.broadcast)
      setPendingCount(pendingData.pending_openers?.length || 0)
    } catch (error) {
      console.error('❌ Load Connect feed error:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  const handleSendOpener = (broadcastId) => {
    navigation.navigate('SendOpener', { broadcastId })
  }

  const styles = createStyles(theme)

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
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
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Connect
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Feel first. See later.
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* Pending Openers */}
          <TouchableOpacity
            onPress={() => navigation.navigate('PendingOpeners')}
            style={styles.headerButton}
          >
            <Inbox size={24} color={theme.text} />
            {pendingCount > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                <Text style={styles.badgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Connections */}
          <TouchableOpacity
            onPress={() => navigation.navigate('ConnectionsList')}
            style={styles.headerButton}
          >
            <MessageCircle size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* My Broadcast Status */}
      {myBroadcast ? (
        <TouchableOpacity
          style={[
            styles.myBroadcastBanner,
            { backgroundColor: theme.primaryLight },
          ]}
          onPress={() => navigation.navigate('PendingOpeners')}
        >
          <Text style={[styles.myBroadcastText, { color: theme.primary }]}>
            ✨ Your broadcast is live • {myBroadcast.pending_openers} responses
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[
            styles.createBroadcastBanner,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          onPress={() => navigation.navigate('CreateBroadcast')}
        >
          <Plus size={20} color={theme.primary} />
          <Text style={[styles.createBroadcastText, { color: theme.text }]}>
            Share your thoughts anonymously
          </Text>
        </TouchableOpacity>
      )}

      {/* Broadcasts Feed */}
      <FlatList
        data={broadcasts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BroadcastCard
            broadcast={item}
            onSendOpener={() => handleSendOpener(item.id)}
          />
        )}
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
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No broadcasts yet. Be the first to share!
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
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
    },
    headerSubtitle: {
      fontSize: 14,
      marginTop: 2,
      fontStyle: 'italic',
    },
    headerActions: {
      flexDirection: 'row',
      gap: 16,
    },
    headerButton: {
      position: 'relative',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: 'bold',
    },
    myBroadcastBanner: {
      padding: 12,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    myBroadcastText: {
      fontSize: 14,
      fontWeight: '600',
    },
    createBroadcastBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 16,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
    },
    createBroadcastText: {
      fontSize: 15,
      fontWeight: '500',
    },
    list: {
      padding: 16,
    },
    empty: {
      padding: 32,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 15,
      textAlign: 'center',
    },
  })
