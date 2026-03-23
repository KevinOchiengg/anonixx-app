/**
 * CoinsScreen.jsx — Wallet: balance, top up, streak, transaction history.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  ArrowUpRight,
  Coins,
  Flame,
  Gift,
  ShoppingBag,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

import { fetchBalance, fetchTransactions, fetchStreak } from '../../store/slices/coinsSlice';
import DailyRewardBanner from '../../components/rewards/DailyRewardBanner';
import MpesaPaymentSheet from '../../components/payments/MpesaPaymentSheet';
import { HIT_SLOP, rf, rp, rs, SCREEN } from '../../utils/responsive';

// ─── Static maps ─────────────────────────────────────────────
const REASON_META = {
  welcome_bonus:    { icon: Gift,        color: '#a855f7', label: 'Welcome bonus'   },
  daily_login:      { icon: Flame,       color: '#f59e0b', label: 'Daily streak'    },
  streak_milestone: { icon: TrendingUp,  color: '#22c55e', label: 'Streak milestone'},
  referral_bonus:   { icon: Users,       color: '#3b82f6', label: 'Referral'        },
  milestone:        { icon: Zap,         color: '#FF634A', label: 'Achievement'     },
  mpesa_purchase:   { icon: ShoppingBag, color: '#22c55e', label: 'Top up'          },
  connect_unlock:   { icon: Zap,         color: '#ef4444', label: 'Connect unlock'  },
  drop_reveal:      { icon: Zap,         color: '#ef4444', label: 'Drop reveal'     },
  circle_entry:     { icon: Zap,         color: '#ef4444', label: 'Circle entry'    },
  streak_freeze:    { icon: Zap,         color: '#ef4444', label: 'Streak freeze'   },
};

const THEME = {
  bg:         '#0b0f18',
  surface:    '#151924',
  surfaceAlt: '#1a1f2e',
  border:     'rgba(255,255,255,0.07)',
  text:       '#EAEAF0',
  textSub:    '#9A9AA3',
  gold:       '#fbbf24',
  goldBg:     'rgba(251,191,36,0.08)',
  goldBorder: 'rgba(251,191,36,0.2)',
  primary:    '#FF634A',
  success:    '#22c55e',
  error:      '#ef4444',
};

// ─── Transaction row ──────────────────────────────────────────
const TransactionRow = React.memo(({ item }) => {
  const meta   = REASON_META[item.reason] ?? { icon: Coins, color: THEME.textSub, label: item.reason };
  const Icon   = meta.icon;
  const isEarn = item.amount > 0;

  const dateStr = useMemo(() => {
    try {
      return new Date(item.created_at).toLocaleDateString('en-KE', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [item.created_at]);

  return (
    <View style={txStyles.row}>
      <View style={[txStyles.iconWrap, { backgroundColor: meta.color + '22' }]}>
        <Icon size={rs(18)} color={meta.color} />
      </View>
      <View style={txStyles.info}>
        <Text style={txStyles.desc} numberOfLines={1}>{item.description}</Text>
        <Text style={txStyles.date}>{dateStr}</Text>
      </View>
      <Text style={[txStyles.amount, isEarn ? txStyles.earn : txStyles.spend]}>
        {isEarn ? '+' : ''}{item.amount}
      </Text>
    </View>
  );
});

const txStyles = StyleSheet.create({
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: rp(16),
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  iconWrap: {
    width:          rs(38),
    height:         rs(38),
    borderRadius:   rs(12),
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    rp(12),
  },
  info:   { flex: 1 },
  desc:   { color: THEME.text,   fontSize: rf(13), fontWeight: '600' },
  date:   { color: THEME.textSub, fontSize: rf(11), marginTop: rp(2) },
  amount: { fontSize: rf(15), fontWeight: '800', minWidth: rs(48), textAlign: 'right' },
  earn:   { color: THEME.success },
  spend:  { color: THEME.error },
});

// ─── Header component ─────────────────────────────────────────
const WalletHeader = React.memo(({ balance, streak, onTopUp, onBack }) => {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 9 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[hStyles.wrap, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
      <LinearGradient
        colors={['#1a1530', '#0b0f18']}
        style={hStyles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={hStyles.eyebrow}>YOUR WALLET</Text>
        <View style={hStyles.balanceRow}>
          <Coins size={rs(34)} color={THEME.gold} />
          <Text style={hStyles.balance}>{balance.toLocaleString()}</Text>
        </View>
        <Text style={hStyles.balanceSub}>coins available</Text>

        {streak > 0 && (
          <View style={hStyles.streakChip}>
            <Flame size={rs(13)} color={THEME.gold} />
            <Text style={hStyles.streakChipText}>{streak}-day streak</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={onTopUp}
          activeOpacity={0.88}
          hitSlop={HIT_SLOP}
          style={hStyles.topUpBtn}
        >
          <LinearGradient
            colors={['#4CAF50', '#2E7D32']}
            style={hStyles.topUpGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <ArrowUpRight size={rs(16)} color="#fff" />
            <Text style={hStyles.topUpText}>Top Up with M-Pesa</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
});

const hStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: rp(16),
    marginTop:        rp(8),
    borderRadius:     rs(20),
    overflow:         'hidden',
    borderWidth:      1,
    borderColor:      THEME.goldBorder,
    ...Platform.select({
      ios:     { shadowColor: THEME.gold, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  gradient: {
    alignItems:      'center',
    paddingVertical: rp(28),
    paddingHorizontal: rp(24),
  },
  eyebrow: {
    color:        THEME.textSub,
    fontSize:     rf(10),
    fontWeight:   '700',
    letterSpacing: 2,
    marginBottom:  rp(8),
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rs(10),
  },
  balance: {
    color:      THEME.gold,
    fontSize:   rf(48),
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    includeFontPadding: false,
  },
  balanceSub: {
    color:     THEME.textSub,
    fontSize:  rf(13),
    marginTop: rp(4),
    marginBottom: rp(16),
  },
  streakChip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             rs(5),
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius:    rs(20),
    paddingHorizontal: rp(12),
    paddingVertical:   rp(5),
    borderWidth:       1,
    borderColor:       THEME.goldBorder,
    marginBottom:      rp(16),
  },
  streakChipText: {
    color:    THEME.gold,
    fontSize: rf(12),
    fontWeight: '600',
  },
  topUpBtn: { width: '100%' },
  topUpGrad: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rs(8),
    height:          rs(48),
    borderRadius:    rs(14),
  },
  topUpText: {
    color:      '#fff',
    fontSize:   rf(14),
    fontWeight: '700',
  },
});

// ─── Screen ───────────────────────────────────────────────────
export default function CoinsScreen({ navigation }) {
  const dispatch = useDispatch();
  const { balance, transactions, streak, loading } = useSelector((state) => state.coins);
  const [sheetVisible, setSheetVisible] = useState(false);

  useEffect(() => {
    dispatch(fetchBalance());
    dispatch(fetchTransactions());
    dispatch(fetchStreak());
  }, []);

  const handleTopUp   = useCallback(() => setSheetVisible(true),  []);
  const handleCloseSheet = useCallback(() => setSheetVisible(false), []);

  const renderTransaction = useCallback(({ item }) => (
    <TransactionRow item={item} />
  ), []);

  const keyExtractor = useCallback((item, index) => item._id ?? String(index), []);

  const ListHeader = useMemo(() => (
    <>
      <WalletHeader
        balance={balance}
        streak={streak}
        onTopUp={handleTopUp}
        onBack={() => navigation?.goBack?.()}
      />
      <DailyRewardBanner />
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Transaction History</Text>
        <Text style={styles.sectionSub}>{transactions.length} records</Text>
      </View>
    </>
  ), [balance, streak, transactions.length, handleTopUp]);

  const ListEmpty = useMemo(() => (
    <View style={styles.emptyWrap}>
      <Coins size={rs(40)} color={THEME.border} />
      <Text style={styles.emptyTitle}>No transactions yet</Text>
      <Text style={styles.emptySub}>
        Claim your daily reward or top up to get started.
      </Text>
    </View>
  ), []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        {navigation?.canGoBack?.() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={HIT_SLOP}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ArrowLeft size={rs(20)} color={THEME.text} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <Text style={styles.navTitle}>Wallet</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={keyExtractor}
        renderItem={renderTransaction}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={loading ? null : ListEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        updateCellsBatchingPeriod={50}
      />

      <MpesaPaymentSheet visible={sheetVisible} onClose={handleCloseSheet} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: THEME.bg },
  navbar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: rp(16),
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  navTitle: {
    color:      THEME.text,
    fontSize:   rf(17),
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  backBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
  },
  sectionHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: rp(16),
    paddingTop:        rp(20),
    paddingBottom:     rp(8),
  },
  sectionTitle: {
    color:      THEME.text,
    fontSize:   rf(15),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionSub: {
    color:    THEME.textSub,
    fontSize: rf(12),
  },
  listContent: { paddingBottom: rp(32) },
  emptyWrap: {
    alignItems:   'center',
    paddingTop:   rp(48),
    paddingHorizontal: rp(40),
  },
  emptyTitle: {
    color:      THEME.textSub,
    fontSize:   rf(16),
    fontWeight: '600',
    marginTop:  rp(12),
    marginBottom: rp(6),
  },
  emptySub: {
    color:     THEME.textSub,
    fontSize:  rf(13),
    textAlign: 'center',
    lineHeight: rf(20),
    opacity:   0.7,
  },
});
