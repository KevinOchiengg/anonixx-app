import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Settings, Edit, Lock, Palette, ChevronRight, LayoutDashboard } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useDispatch, useSelector } from 'react-redux'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Avatar from '../../components/common/Avatar'
import CoinBadge from '../../components/common/CoinBadge'
import { THEME } from '../../utils/theme'
import { API_BASE_URL } from '../../config/api'
import { fetchStreak } from '../../store/slices/coinsSlice'

export default function ProfileScreen({ navigation }) {
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const { balance, streak } = useSelector((state) => state.coins)

  // Real post/reaction counts — was hardcoded (42/328) before the dashboard existed.
  const [postCount, setPostCount] = useState(null)
  const [reactionCount, setReactionCount] = useState(null)

  useEffect(() => {
    dispatch(fetchStreak())
    ;(async () => {
      try {
        const token   = await AsyncStorage.getItem('token')
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const res     = await fetch(`${API_BASE_URL}/api/v1/posts/mine`, { headers })
        if (res.ok) {
          const data = await res.json()
          setPostCount(data.total_posts ?? 0)
          setReactionCount(data.total_likes ?? 0)
        }
      } catch {
        // silent — stat cards just show 0 if this fails, not worth a toast
      }
    })()
  }, [dispatch])

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Settings size={24} color='#ffffff' />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.profileHeader}>
          <Avatar
            uri={user?.avatar}
            size={100}
            name={user?.username || user?.anonymous_name}
            isPremium={user?.is_premium}
          />
          <Text style={styles.username}>
            {user?.username || user?.anonymous_name}
          </Text>
          {user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{postCount ?? '—'}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{reactionCount ?? '—'}</Text>
            <Text style={styles.statLabel}>Reactions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{streak ?? 0}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.dashboardCard}
          onPress={() => navigation.navigate('Dashboard')}
          activeOpacity={0.85}
        >
          <View style={styles.dashboardIconWrap}>
            <LayoutDashboard size={20} color={THEME.primary} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dashboardTitle}>Your Dashboard</Text>
            <Text style={styles.dashboardSubtitle}>Posts, activity, coins & earnings</Text>
          </View>
          <ChevronRight size={20} color={THEME.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.coinCard}
          onPress={() => navigation.navigate('Coins')}
        >
          <View>
            <Text style={styles.coinLabel}>Coin Balance</Text>
            <CoinBadge amount={balance || 0} size='large' />
          </View>
          <ChevronRight size={22} color={THEME.primary} />
        </TouchableOpacity>

        {!user?.is_premium && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Premium')}
          >
            <LinearGradient
              colors={['#a855f7', '#14b8a6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumCard}
            >
              <Text style={styles.premiumTitle}>👑 Upgrade to Premium</Text>
              <Text style={styles.premiumSubtitle}>
                Unlock exclusive features
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Edit size={20} color='#ffffff' />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.accountCard}>
          <TouchableOpacity
            style={styles.accountRow}
            onPress={() => navigation.navigate('ChangePassword')}
          >
            <Lock size={18} color={THEME.text} strokeWidth={1.8} />
            <View style={styles.accountRowBody}>
              <Text style={styles.accountRowLabel}>Email & Password</Text>
              <Text style={styles.accountRowDesc}>Manage login credentials</Text>
            </View>
            <ChevronRight size={18} color={THEME.textMuted} />
          </TouchableOpacity>
          <View style={styles.accountDivider} />
          <TouchableOpacity
            style={styles.accountRow}
            onPress={() => navigation.navigate('Messages', { screen: 'ChatProfileSetup' })}
          >
            <Palette size={18} color={THEME.text} strokeWidth={1.8} />
            <View style={styles.accountRowBody}>
              <Text style={styles.accountRowLabel}>Chat Interface</Text>
              <Text style={styles.accountRowDesc}>
                Background, font, stickers, gallery
              </Text>
            </View>
            <ChevronRight size={18} color={THEME.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: THEME.text },
  scrollView: { flex: 1 },
  profileHeader: { alignItems: 'center', paddingVertical: 32 },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.text,
    marginTop: 16,
  },
  bio: {
    fontSize: 14,
    color: THEME.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: THEME.text },
  statLabel: { fontSize: 12, color: THEME.textSecondary, marginTop: 4 },
  dashboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  dashboardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.primary + '1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardTitle: { color: THEME.text, fontSize: 15, fontWeight: '700' },
  dashboardSubtitle: { color: THEME.textSecondary, fontSize: 12, marginTop: 2 },
  coinCard: {
    backgroundColor: THEME.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coinLabel: { color: THEME.textSecondary, fontSize: 14, marginBottom: 8 },
  coinAction: { fontSize: 24, color: THEME.primary },
  premiumCard: {
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  premiumTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  premiumSubtitle: { fontSize: 14, color: '#e5e7eb' },
  editButton: {
    backgroundColor: THEME.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  editButtonText: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  sectionTitle: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  accountCard: {
    backgroundColor: THEME.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 32,
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  accountRowBody: { flex: 1, marginLeft: 12 },
  accountRowLabel: { color: THEME.text, fontSize: 15, fontWeight: '500' },
  accountRowDesc: { color: THEME.textSecondary, fontSize: 12, marginTop: 2 },
  accountDivider: {
    height: 1,
    backgroundColor: THEME.border,
    marginLeft: 46,
  },
})
