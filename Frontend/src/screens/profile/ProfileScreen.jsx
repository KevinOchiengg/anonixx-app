import React from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
} from 'react-native'
import {
  Settings,
  Edit,
  TrendingUp,
  Heart,
  MessageCircle,
} from 'lucide-react-native'
import { useSelector } from 'react-redux'
import Avatar from '../../components/common/Avatar'
import CoinBadge from '../../components/common/CoinBadge'
import StarryBackground from '../../components/common/StarryBackground';

export default function ProfileScreen({ navigation }) {
  const { user } = useSelector((state) => state.auth)
  const { balance } = useSelector((state) => state.coins)

  return (
    <SafeAreaView style={styles.container}>
      <StarryBackground />
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
            <Text style={styles.statNumber}>42</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>328</Text>
            <Text style={styles.statLabel}>Reactions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>7</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.coinCard}
          onPress={() => navigation.navigate('Coins')}
        >
          <View>
            <Text style={styles.coinLabel}>Coin Balance</Text>
            <CoinBadge amount={balance || 0} size='large' />
          </View>
          <Text style={styles.coinAction}>→</Text>
        </TouchableOpacity>

        {!user?.is_premium && (
          <TouchableOpacity
            style={styles.premiumCard}
            onPress={() => navigation.navigate('Premium')}
          >
            <Text style={styles.premiumTitle}>👑 Upgrade to Premium</Text>
            <Text style={styles.premiumSubtitle}>
              Unlock exclusive features
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Edit size={20} color='#ffffff' />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  scrollView: { flex: 1 },
  profileHeader: { alignItems: 'center', paddingVertical: 32 },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 16,
  },
  bio: {
    fontSize: 14,
    color: '#9ca3af',
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
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  coinCard: {
    backgroundColor: '#16213e',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coinLabel: { color: '#9ca3af', fontSize: 14, marginBottom: 8 },
  coinAction: { fontSize: 24, color: '#fbbf24' },
  premiumCard: {
    backgroundColor: 'linear-gradient(135deg, #a855f7, #14b8a6)',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
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
    backgroundColor: '#16213e',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
})
