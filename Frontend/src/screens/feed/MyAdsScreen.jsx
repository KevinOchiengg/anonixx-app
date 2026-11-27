/** Your ads: spend, views and taps for each; pause, resume or stop (unused coins come back).
 * Same as Web MyAdsPage. */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { Alert } from '../../utils/confirm';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const STATUS = { pending_review: 'In review', approved: 'Running', finished: 'Budget used', ended: 'Stopped', rejected: 'Rejected, refunded' };

async function call(path, method = 'GET', body) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'That did not work.');
  return data;
}

export default function MyAdsScreen({ navigation }) {
  const { showToast } = useToast();
  const [ads, setAds] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    call('/ads/mine').then((r) => setAds(r.ads || [])).catch((e) => { setAds([]); showToast({ type: 'error', message: e.message }); });
  }, [showToast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (id, path, method, body, done) => {
    setBusy(id);
    try { const r = await call(path, method, body); done?.(r); } catch (e) { showToast({ type: 'error', message: e.message }); }
    setBusy(null);
    load();
  };

  const stop = (ad) => {
    const left = Math.max(0, ad.budget_coins - ad.spent_coins);
    Alert.alert('Stop this ad?', `It leaves the feed for good. ${left} unused coins come back to you.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop ad', style: 'destructive', onPress: () => act(ad.id, `/ads/mine/${ad.id}/stop`, 'POST', null, (r) => showToast({ type: 'success', message: `${r.refunded} coins are back in your wallet.` })) },
    ]);
  };

  const renderItem = ({ item: ad }) => {
    const live = ad.status === 'approved' || ad.status === 'pending_review';
    const pct = ad.budget_coins ? Math.min(100, Math.round((ad.spent_coins / ad.budget_coins) * 100)) : 0;
    const label = live && !ad.active ? 'Paused' : STATUS[ad.status] || ad.status;
    return (
      <View style={s.card}>
        <View style={s.top}>
          <Text style={s.title} numberOfLines={2}>{ad.title.split('\n')[0]}</Text>
          <Text style={[s.status, ad.status === 'approved' && ad.active && { color: '#10B981' }]}>{label}</Text>
        </View>
        <View style={s.meter}><View style={[s.meterFill, { width: `${pct}%` }]} /></View>
        <Text style={s.meta}>{ad.spent_coins} of {ad.budget_coins} coins · {ad.views} views · {ad.taps} taps · {ad.tap_rate}% tap rate</Text>
        {live ? (
          <View style={s.actions}>
            <TouchableOpacity style={s.btn} disabled={busy === ad.id} onPress={() => act(ad.id, `/ads/mine/${ad.id}`, 'PATCH', { active: !ad.active })}>
              <Text style={s.btnText}>{ad.active ? 'Pause' : 'Resume'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btn} disabled={busy === ad.id} onPress={() => stop(ad)}>
              <Text style={s.btnText}>Stop and refund</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
        <Text style={s.headerTitle}>My ads</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateAd')} hitSlop={HIT_SLOP} accessibilityLabel="New ad"><Plus size={rs(22)} color={T.primary} /></TouchableOpacity>
      </View>
      {ads === null ? <ActivityIndicator color={T.primary} style={{ marginTop: rs(40) }} /> : (
        <FlatList
          data={ads}
          keyExtractor={(a) => a.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ListEmptyComponent={(
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No ads yet</Text>
              <Text style={s.emptyText}>Promote a drop or your Room. You pay per view, and every coin you don't use comes back.</Text>
              <TouchableOpacity style={s.primary} onPress={() => navigation.navigate('CreateAd')}><Text style={s.primaryText}>New ad</Text></TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: rp(12) },
  headerTitle: { color: T.text, fontSize: FONT.md, fontWeight: '700', fontFamily: 'PlayfairDisplay-Bold' },
  list: { padding: SPACING.md, gap: rp(12), paddingBottom: rs(40) },
  card: { padding: rp(14), borderRadius: RADIUS.lg || 16, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, gap: rp(8) },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: rp(10) },
  title: { flex: 1, color: T.text, fontSize: FONT.sm, fontWeight: '700' },
  status: { color: T.textSecondary, fontSize: rf(11), fontWeight: '800' },
  meter: { height: rs(6), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  meterFill: { height: '100%', backgroundColor: T.primary },
  meta: { color: T.textSecondary, fontSize: rf(12) },
  actions: { flexDirection: 'row', gap: rp(8) },
  btn: { flex: 1, paddingVertical: rp(10), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  btnText: { color: T.text, fontSize: FONT.xs, fontWeight: '700' },
  empty: { alignItems: 'center', gap: rp(10), marginTop: rs(60), paddingHorizontal: SPACING.lg },
  emptyTitle: { color: T.text, fontSize: rf(18), fontWeight: '800' },
  emptyText: { color: T.textSecondary, fontSize: FONT.sm, textAlign: 'center', lineHeight: rf(19) },
  primary: { paddingHorizontal: rp(28), paddingVertical: rp(12), borderRadius: RADIUS.full, backgroundColor: T.primary },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: FONT.sm },
});
