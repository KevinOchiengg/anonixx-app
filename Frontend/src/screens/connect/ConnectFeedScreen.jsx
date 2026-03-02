import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  SectionList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context' // ✅ fixed deprecation
import { Plus, MessageCircle, Inbox, Footprints, Flame } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  getBroadcasts,
  getMyActiveBroadcast,
  getPendingOpeners,
  getDailyTokens,
} from '../../services/connectApi'
import BroadcastCard from '../../components/connect/BroadcastCard'

// ─────────────────────────────────────────────
// AURA CONFIG
// ─────────────────────────────────────────────
const AURA_COLORS = {
  purple_glow: '#9B59B6',
  red_shadow: '#E74C3C',
  green_mist: '#2ECC71',
  blue_void: '#3498DB',
  dark_phantom: '#7F8C8D',
  coral_flame: '#FF634A',
}

// ─────────────────────────────────────────────
// HINTS DISPLAY
// Small row showing aura dot + hint text
// ─────────────────────────────────────────────
function HintsDisplay({ hints, theme }) {
  if (!hints) return null

  const auraColor = AURA_COLORS[hints.avatar_aura] || AURA_COLORS.purple_glow

  const parts = []
  if (hints.vibe) parts.push(hints.vibe)
  if (hints.age_range) parts.push(hints.age_range)
  if (hints.city) parts.push(hints.city)

  return (
    <View style={hintsStyles.row}>
      {/* Aura dot */}
      <View style={[hintsStyles.auraDot, { backgroundColor: auraColor }]} />
      <Text style={[hintsStyles.text, { color: theme.textSecondary }]}>
        {parts.length > 0 ? parts.join(' • ') : 'Anonymous'}
      </Text>
    </View>
  )
}

const hintsStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  auraDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    fontSize: 13,
  },
})

// ─────────────────────────────────────────────
// DAILY TOKEN BADGE
// ─────────────────────────────────────────────
function TokenBadge({ remaining, theme }) {
  const isEmpty = remaining === 0
  return (
    <View
      style={[
        tokenStyles.badge,
        {
          backgroundColor: isEmpty ? theme.card : theme.primaryLight,
          borderColor: isEmpty ? theme.border : theme.primary,
        },
      ]}
    >
      <Footprints size={14} color={isEmpty ? theme.textSecondary : theme.primary} />
      <Text
        style={[
          tokenStyles.text,
          { color: isEmpty ? theme.textSecondary : theme.primary },
        ]}
      >
        {remaining}/5
      </Text>
    </View>
  )
}

const tokenStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
})

// ─────────────────────────────────────────────
// HOT TRACES SECTION HEADER
// ─────────────────────────────────────────────
function SectionHeader({ title, icon, theme }) {
  return (
    <View style={sectionStyles.row}>
      {icon}
      <Text style={[sectionStyles.title, { color: theme.text }]}>{title}</Text>
    </View>
  )
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function ConnectFeedScreen({ navigation }) {
  const { theme } = useTheme()
  const [broadcasts, setBroadcasts] = useState([])
  const [hotTraces, setHotTraces] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [myBroadcast, setMyBroadcast] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [dailyTokens, setDailyTokens] = useState(5)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [broadcastsData, myBroadcastData, pendingData, tokensData] =
        await Promise.all([
          getBroadcasts(),
          getMyActiveBroadcast(),
          getPendingOpeners(),
          getDailyTokens(),
        ])

      const all = broadcastsData.broadcasts || []

      // Hot Traces = top 3 by click_count
      const sorted = [...all].sort((a, b) => (b.click_count || 0) - (a.click_count || 0))
      setHotTraces(sorted.slice(0, 3))

      // All traces for main feed
      setBroadcasts(all)
      setMyBroadcast(myBroadcastData.broadcast)
      setPendingCount(pendingData.pending_openers?.length || 0)
      setDailyTokens(tokensData.remaining ?? 5)
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
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size='large' color={theme.primary} />
      </View>
    )
  }

  // Build sections for SectionList
  const sections = []

  // Hot Traces section (only if we have some)
  if (hotTraces.length > 0) {
    sections.push({
      key: 'hot',
      title: 'Hot Traces',
      data: hotTraces,
    })
  }

  // All Traces section
  sections.push({
    key: 'all',
    title: 'All Traces',
    data: broadcasts,
  })

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top']}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Traces
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Feel first. See later.
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* Daily Token Badge */}
          <TokenBadge remaining={dailyTokens} theme={theme} />

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

      {/* My Trace Status / Create Banner */}
      {myBroadcast ? (
        <TouchableOpacity
          style={[styles.myBroadcastBanner, { backgroundColor: theme.primaryLight }]}
          onPress={() => navigation.navigate('PendingOpeners')}
        >
          <Text style={[styles.myBroadcastText, { color: theme.primary }]}>
            ✨ Your trace is live • {myBroadcast.pending_openers} responses
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[
            styles.createBroadcastBanner,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          onPress={() => {
            if (dailyTokens === 0) return // silently guard — could show toast
            navigation.navigate('CreateBroadcast')
          }}
        >
          <Plus size={20} color={dailyTokens === 0 ? theme.textSecondary : theme.primary} />
          <View>
            <Text
              style={[
                styles.createBroadcastText,
                { color: dailyTokens === 0 ? theme.textSecondary : theme.text },
              ]}
            >
              {dailyTokens === 0 ? 'No traces left today' : 'Share your thoughts anonymously'}
            </Text>
            {dailyTokens === 0 && (
              <Text style={[styles.createBroadcastSub, { color: theme.textSecondary }]}>
                Resets at midnight
              </Text>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* Feed with Hot Traces + All Traces sections */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, section }) => (
          <BroadcastCard
            broadcast={item}
            onSendOpener={() => handleSendOpener(item.id)}
            isHot={section.key === 'hot'}
            hintsComponent={<HintsDisplay hints={item.hints} theme={theme} />}
          />
        )}
        renderSectionHeader={({ section }) => (
          <SectionHeader
            title={section.title}
            theme={theme}
            icon={
              section.key === 'hot' ? (
                <Flame size={16} color='#FF634A' />
              ) : null
            }
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
              No traces yet. Be the first to share!
            </Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
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
      alignItems: 'center',
      gap: 12,
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
    createBroadcastSub: {
      fontSize: 12,
      marginTop: 2,
    },
    list: {
      paddingBottom: 24,
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
