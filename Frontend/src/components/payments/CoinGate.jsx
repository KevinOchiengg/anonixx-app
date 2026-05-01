/**
 * CoinGate.jsx
 * Reusable coin-payment confirmation sheet.
 *
 * Shows: action label, cost, current balance, confirm/cancel.
 * If balance is insufficient → "Top Up" opens MpesaPaymentSheet.
 *
 * Usage:
 *   <CoinGate
 *     visible={visible}
 *     reason="connect_unlock"          // key from SPEND_COSTS
 *     cost={60}
 *     actionLabel="Send connect request"
 *     actionEmoji="🔗"
 *     onConfirm={onPaid}               // called only after successful debit
 *     onClose={() => setVisible(false)}
 *   />
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
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Coins, TrendingUp, X, Zap } from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

import { spendCoins } from '../../store/slices/coinsSlice';
import { useToast } from '../ui/Toast';
import MpesaPaymentSheet from './MpesaPaymentSheet';
import { BUTTON_HEIGHT, HIT_SLOP, rf, rp, rs, SCREEN } from '../../utils/responsive';
import { THEME } from '../../utils/theme';

const SHEET_HEIGHT = SCREEN.height * 0.52;

export default function CoinGate({
  visible,
  reason,
  cost,
  actionLabel,
  actionEmoji = '⚡',
  description,   // stored in the transaction record
  onConfirm,     // () => void — called after successful debit
  onClose,
}) {
  const dispatch      = useDispatch();
  const { showToast } = useToast();

  const balance = useSelector((state) => state.coins.balance);

  const [loading,       setLoading]       = useState(false);
  const [topUpVisible,  setTopUpVisible]  = useState(false);

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdrop   = useRef(new Animated.Value(0)).current;

  const canAfford = balance >= cost;
  const shortfall = cost - balance;

  // ── Animate in/out ──────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setLoading(false);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0, useNativeDriver: true, tension: 65, friction: 11,
        }),
        Animated.timing(backdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 280, useNativeDriver: true }),
        Animated.timing(backdrop,   { toValue: 0,            duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // ── Confirm ─────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const result = await dispatch(spendCoins({
      reason,
      description: description ?? actionLabel,
    }));
    setLoading(false);

    if (spendCoins.fulfilled.match(result)) {
      showToast({ type: 'success', message: `-${cost} coins` });
      onClose();
      // Small delay so sheet closes before the next action begins
      setTimeout(() => onConfirm?.(), 200);
    } else {
      const detail = result.payload?.detail ?? 'Could not spend coins.';
      if (result.payload?.status === 402 || detail.toLowerCase().includes('not enough')) {
        showToast({ type: 'warning', message: "You're short on coins. Top up first." });
        setTopUpVisible(true);
      } else {
        showToast({ type: 'error', message: detail });
      }
    }
  }, [loading, dispatch, reason, description, actionLabel, cost, onClose, onConfirm, showToast]);

  const handleTopUpClose = useCallback(() => {
    setTopUpVisible(false);
  }, []);

  const balanceColor = useMemo(
    () => (canAfford ? THEME.success : THEME.error),
    [canAfford]
  );

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>

            {/* Handle */}
            <View style={styles.handle} />

            {/* Close */}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={HIT_SLOP}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <X size={rs(16)} color={THEME.textSub} />
            </TouchableOpacity>

            <View style={styles.body}>
              {/* Action emoji */}
              <View style={styles.emojiWrap}>
                <Text style={styles.emoji}>{actionEmoji}</Text>
              </View>

              {/* Labels */}
              <Text style={styles.title}>{actionLabel}</Text>
              <Text style={styles.subtitle}>
                This action costs{' '}
                <Text style={styles.costInline}>{cost} coins</Text>
              </Text>

              {/* Balance vs cost */}
              <View style={styles.balanceCard}>
                <View style={styles.balanceRow}>
                  <View style={styles.balanceItem}>
                    <Text style={styles.balanceItemLabel}>Your balance</Text>
                    <View style={styles.balanceItemValue}>
                      <Coins size={rs(14)} color={THEME.gold} />
                      <Text style={[styles.balanceItemNum, { color: balanceColor }]}>
                        {balance}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.balanceDivider} />

                  <View style={styles.balanceItem}>
                    <Text style={styles.balanceItemLabel}>Cost</Text>
                    <View style={styles.balanceItemValue}>
                      <Zap size={rs(14)} color={THEME.primary} />
                      <Text style={[styles.balanceItemNum, { color: THEME.primary }]}>
                        {cost}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.balanceDivider} />

                  <View style={styles.balanceItem}>
                    <Text style={styles.balanceItemLabel}>After</Text>
                    <View style={styles.balanceItemValue}>
                      <Coins size={rs(14)} color={canAfford ? THEME.gold : THEME.error} />
                      <Text style={[
                        styles.balanceItemNum,
                        { color: canAfford ? THEME.text : THEME.error },
                      ]}>
                        {canAfford ? balance - cost : `−${shortfall}`}
                      </Text>
                    </View>
                  </View>
                </View>

                {!canAfford && (
                  <Text style={styles.shortfallHint}>
                    You need {shortfall} more coins. Top up to continue.
                  </Text>
                )}
              </View>

              {/* CTA */}
              {canAfford ? (
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={loading}
                  activeOpacity={0.87}
                  hitSlop={HIT_SLOP}
                  style={styles.confirmBtnWrap}
                >
                  <LinearGradient
                    colors={loading ? ['#555', '#444'] : [THEME.primary, '#e8432a']}
                    style={styles.confirmBtn}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {loading ? (
                      <Text style={styles.confirmBtnText}>Processing…</Text>
                    ) : (
                      <>
                        <Zap size={rs(16)} color="#fff" />
                        <Text style={styles.confirmBtnText}>
                          Confirm · {cost} coins
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setTopUpVisible(true)}
                  activeOpacity={0.87}
                  hitSlop={HIT_SLOP}
                  style={styles.confirmBtnWrap}
                >
                  <LinearGradient
                    colors={['#4CAF50', '#2E7D32']}
                    style={styles.confirmBtn}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <TrendingUp size={rs(16)} color="#fff" />
                    <Text style={styles.confirmBtnText}>
                      Top Up · Need {shortfall} more
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={onClose}
                hitSlop={HIT_SLOP}
                style={styles.cancelLink}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelLinkText}>Maybe later</Text>
              </TouchableOpacity>
            </View>

          </SafeAreaView>
        </Animated.View>
      </Modal>

      {/* Top-up sheet — sits on top of everything */}
      <MpesaPaymentSheet
        visible={topUpVisible}
        onClose={handleTopUpClose}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position:             'absolute',
    bottom:               0,
    left:                 0,
    right:                0,
    height:               SHEET_HEIGHT,
    backgroundColor:      THEME.surface,
    borderTopLeftRadius:  rs(24),
    borderTopRightRadius: rs(24),
    overflow:             'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.4, shadowRadius: 16 },
      android: { elevation: 20 },
    }),
  },
  handle: {
    alignSelf:       'center',
    width:           rs(40),
    height:          rs(4),
    borderRadius:    rs(2),
    backgroundColor: THEME.border,
    marginTop:       rp(12),
  },
  closeBtn: {
    position:        'absolute',
    top:             rp(14),
    right:           rp(16),
    width:           rs(32),
    height:          rs(32),
    borderRadius:    rs(16),
    backgroundColor: THEME.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  body: {
    flex:              1,
    alignItems:        'center',
    paddingHorizontal: rp(24),
    paddingTop:        rp(8),
    paddingBottom:     rp(12),
  },
  emojiWrap: {
    width:           rs(64),
    height:          rs(64),
    borderRadius:    rs(32),
    backgroundColor: THEME.surfaceAlt,
    borderWidth:     1,
    borderColor:     THEME.border,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    rp(12),
  },
  emoji: { fontSize: rf(30) },
  title: {
    color:      THEME.text,
    fontSize:   rf(18),
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign:  'center',
    marginBottom: rp(4),
  },
  subtitle: {
    color:        THEME.textSub,
    fontSize:     rf(13),
    textAlign:    'center',
    marginBottom: rp(18),
  },
  costInline: {
    color:      THEME.gold,
    fontWeight: '700',
  },

  // Balance card
  balanceCard: {
    width:             '100%',
    backgroundColor:   THEME.surfaceAlt,
    borderRadius:      rs(14),
    borderWidth:       1,
    borderColor:       THEME.border,
    paddingVertical:   rp(14),
    paddingHorizontal: rp(8),
    marginBottom:      rp(20),
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'space-around',
  },
  balanceItem:      { alignItems: 'center', flex: 1, gap: rp(4) },
  balanceItemLabel: { color: THEME.textSub, fontSize: rf(10), fontWeight: '600', letterSpacing: 0.4 },
  balanceItemValue: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  balanceItemNum:   { fontSize: rf(18), fontWeight: '800' },
  balanceDivider:   { width: 1, height: rs(32), backgroundColor: THEME.border },
  shortfallHint: {
    color:      THEME.error,
    fontSize:   rf(12),
    textAlign:  'center',
    marginTop:  rp(10),
    fontWeight: '500',
  },

  // Buttons
  confirmBtnWrap: { width: '100%', marginBottom: rp(10) },
  confirmBtn: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  confirmBtnText: { color: '#fff', fontSize: rf(15), fontWeight: '700' },
  cancelLink:     { paddingVertical: rp(8) },
  cancelLinkText: { color: THEME.textSub, fontSize: rf(13), textDecorationLine: 'underline' },
});
