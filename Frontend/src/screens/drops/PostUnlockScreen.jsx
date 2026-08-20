/**
 * PostUnlockScreen
 *
 * "Link up" landing page for a calm-feed post — pay coins to open a chat
 * connection with its anonymous author. Scoped to posts/{postId}/unlock,
 * which reuses the same drop_connections record shape so DropChatScreen
 * needs no changes to open the resulting chat.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';
import { Flame, Lock } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { fetchBalance } from '../../store/slices/coinsSlice';

// Must match COINS_UNLOCK_COST in Backend/app/api/v1/posts.py
const UNLOCK_COST = 30;

export default function PostUnlockScreen({ route, navigation }) {
  const { post } = route.params ?? {};
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const coinBalance = useSelector((state) => state.coins.balance);

  const [unlocking, setUnlocking] = useState(false);
  const successScale = React.useRef(new Animated.Value(1)).current;

  // Redux coins.balance defaults to 0 and nothing else guarantees it's been
  // fetched by the time someone lands here — without this, the screen shows
  // a stale/zero balance until after the first successful unlock.
  useEffect(() => {
    dispatch(fetchBalance());
  }, [dispatch]);

  const handleUnlock = useCallback(async () => {
    if (unlocking || !post?.id) return;
    setUnlocking(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/unlock`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        dispatch(fetchBalance());
        Animated.sequence([
          Animated.timing(successScale, { toValue: 1.06, duration: 140, useNativeDriver: true }),
          Animated.timing(successScale, { toValue: 1,    duration: 140, useNativeDriver: true }),
        ]).start(() => {
          navigation.replace('DropChat', { connectionId: data.connection_id });
        });
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: 'Not enough coins. Top up your wallet first.' });
      } else {
        showToast({ type: 'error', message: data.detail ?? 'Could not unlock. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Try again.' });
    } finally {
      setUnlocking(false);
    }
  }, [unlocking, post?.id, dispatch, navigation, showToast, successScale]);

  const canAfford = coinBalance >= UNLOCK_COST;

  return (
    <SafeAreaView style={s.root}>
      <DropScreenHeader title="Link up" navigation={navigation} />

      <View style={s.body}>
        <View style={s.iconWrap}>
          <Lock size={rs(28)} color={T.primary} strokeWidth={2} />
        </View>

        <Text style={s.authorName}>{post?.anonymous_name || 'Anonymous'}</Text>

        {!!post?.content && (
          <Text style={s.confession} numberOfLines={6}>
            &ldquo;{post.content}&rdquo;
          </Text>
        )}

        <Text style={s.copy}>
          Pay to open a private chat with whoever wrote this. If they reply,
          it's a real connection — no pressure either way.
        </Text>

        <View style={s.priceRow}>
          <Flame size={rs(16)} color={T.primary} />
          <Text style={s.priceText}>{UNLOCK_COST} coins</Text>
        </View>

        <Text style={s.balanceText}>
          Your balance: {coinBalance} coin{coinBalance === 1 ? '' : 's'}
        </Text>

        {canAfford ? (
          <Animated.View style={{ transform: [{ scale: successScale }], width: '100%' }}>
            <TouchableOpacity
              style={s.unlockBtn}
              onPress={handleUnlock}
              disabled={unlocking}
              activeOpacity={0.88}
              hitSlop={HIT_SLOP}
            >
              {unlocking
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.unlockBtnText}>Link up — {UNLOCK_COST} coins</Text>
              }
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <TouchableOpacity
            style={s.topUpBtn}
            onPress={() => navigation.navigate('Coins')}
            activeOpacity={0.88}
            hitSlop={HIT_SLOP}
          >
            <Text style={s.topUpBtnText}>Top up your coins</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.notNowBtn}>
          <Text style={s.notNowText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  iconWrap: {
    width: rs(56), height: rs(56), borderRadius: rs(28),
    backgroundColor: T.primaryDim, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(255,99,74,0.25)',
  },
  authorName: { fontSize: FONT.lg, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold', marginBottom: SPACING.sm },
  confession: {
    fontSize: FONT.md, color: T.textSecondary, textAlign: 'center',
    fontStyle: 'italic', lineHeight: FONT.md * 1.5, marginBottom: SPACING.lg,
  },
  copy: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: FONT.sm * 1.6, marginBottom: SPACING.lg },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(6) },
  priceText: { fontSize: FONT.lg, fontWeight: '700', color: T.text },
  balanceText: { fontSize: FONT.xs, color: T.textMute, marginBottom: SPACING.xl },
  unlockBtn: {
    height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.primary, width: '100%',
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(8) }, shadowOpacity: 0.45, shadowRadius: rs(20), elevation: 10,
  },
  unlockBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '700' },
  topUpBtn: {
    height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.surfaceAlt, width: '100%', borderWidth: 1, borderColor: T.border,
  },
  topUpBtnText: { color: T.text, fontSize: FONT.md, fontWeight: '700' },
  notNowBtn: { marginTop: SPACING.lg, padding: rp(8) },
  notNowText: { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '500' },
});
