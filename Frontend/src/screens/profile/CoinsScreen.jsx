import React from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  StyleSheet,
} from 'react-native'
import { API_BASE_URL } from '../../config/api'
import { Coins, TrendingUp, Award } from 'lucide-react-native'
import { useSelector } from 'react-redux'
import CoinBadge from '../../components/common/CoinBadge'

const coinPacks = [
  { id: '100', coins: 100, price: '$0.99', popular: false },
  { id: '500', coins: 500, price: '$4.99', popular: true },
  { id: '1000', coins: 1000, price: '$8.99', popular: false },
]

export default function CoinsScreen({ navigation }) {
  const { balance, transactions } = useSelector((state) => state.coins)

  const renderTransaction = ({ item }) => (
    <View style={styles.transactionCard}>
      <View style={styles.transactionIcon}>
        {item.transaction_type === 'purchase' ? (
          <TrendingUp size={24} color='#10b981' />
        ) : (
          <Award size={24} color='#a855f7' />
        )}
      </View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle}>{item.description}</Text>
        <Text style={styles.transactionDate}>{item.created_at}</Text>
      </View>
      <Text
        style={[
          styles.transactionAmount,
          item.amount > 0 && styles.transactionAmountPositive,
        ]}
      >
        {item.amount > 0 ? '+' : ''}
        {item.amount}
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Coins</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your Balance</Text>
          <CoinBadge amount={balance || 0} size='large' />
        </View>

        <Text style={styles.sectionTitle}>Buy Coins</Text>
        <View style={styles.packsContainer}>
          {coinPacks.map((pack) => (
            <TouchableOpacity
              key={pack.id}
              style={[styles.packCard, pack.popular && styles.packCardPopular]}
            >
              {pack.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>POPULAR</Text>
                </View>
              )}
              <Coins size={48} color='#fbbf24' />
              <Text style={styles.packCoins}>{pack.coins} Coins</Text>
              <Text style={styles.packPrice}>{pack.price}</Text>
              <TouchableOpacity style={styles.buyButton}>
                <Text style={styles.buyButtonText}>Buy Now</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          scrollEnabled={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No transactions yet</Text>
          }
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  scrollView: { flex: 1 },
  balanceCard: {
    backgroundColor: '#16213e',
    margin: 16,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  balanceLabel: { color: '#9ca3af', fontSize: 16, marginBottom: 12 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
  },
  packsContainer: { flexDirection: 'row', paddingHorizontal: 16, gap: 12 },
  packCard: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#374151',
  },
  packCardPopular: { borderColor: '#a855f7' },
  popularBadge: {
    position: 'absolute',
    top: -12,
    backgroundColor: '#a855f7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  packCoins: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 12,
  },
  packPrice: { fontSize: 18, color: '#9ca3af', marginTop: 4, marginBottom: 16 },
  buyButton: {
    backgroundColor: '#a855f7',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    width: '100%',
  },
  buyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  transactionCard: {
    backgroundColor: '#16213e',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIcon: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    padding: 12,
    borderRadius: 12,
    marginRight: 12,
  },
  transactionInfo: { flex: 1 },
  transactionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  transactionDate: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  transactionAmount: { fontSize: 18, fontWeight: 'bold', color: '#ef4444' },
  transactionAmountPositive: { color: '#10b981' },
  emptyText: { color: '#6b7280', textAlign: 'center', padding: 32 },
})
