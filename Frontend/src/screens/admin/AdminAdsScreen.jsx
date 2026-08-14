/**
 * AdminAdsScreen.jsx
 *
 * Sponsored feed-ad submissions awaiting review (GET /ads/admin/pending) —
 * the main feed reaches everyone, so a human approves each one before it
 * goes live. Approve makes it visible immediately; reject refunds the
 * coins the buyer paid (see PATCH /ads/admin/{id}/approve|reject).
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Check, X, Megaphone } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const AdCard = React.memo(({ item, onApprove, onReject, busy }) => (
  <View style={s.card}>
    <View style={s.badge}>
      <Megaphone size={rs(10)} color={T.primary} />
      <Text style={s.badgeText}>pending review</Text>
    </View>
    {item.media_url ? <Image source={{ uri: item.media_url }} style={s.cover} /> : null}
    <Text style={s.title} numberOfLines={2}>{item.title}</Text>
    <Text style={s.link} numberOfLines={1}>{item.link_url}</Text>
    <View style={s.actions}>
      <TouchableOpacity
        style={[s.actionBtn, s.approveBtn]}
        onPress={() => onApprove(item.id)}
        disabled={busy}
        activeOpacity={0.85}
      >
        <Check size={rs(14)} color="#10B981" />
        <Text style={[s.actionText, { color: '#10B981' }]}>Approve</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.actionBtn, s.rejectBtn]}
        onPress={() => onReject(item.id)}
        disabled={busy}
        activeOpacity={0.85}
      >
        <X size={rs(14)} color="#EF4444" />
        <Text style={[s.actionText, { color: '#EF4444' }]}>Reject</Text>
      </TouchableOpacity>
    </View>
  </View>
));

export default function AdminAdsScreen({ navigation }) {
  const { showToast } = useToast();
  const [ads, setAds]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);

  const authHeaders = useCallback(async () => {
    const token = await AsyncStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/ads/admin/pending`, { headers: await authHeaders() });
      if (res.ok) setAds((await res.json()).ads || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load pending ads.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = useCallback(async (adId) => {
    setBusyId(adId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/ads/admin/${adId}/approve`, {
        method: 'PATCH', headers: await authHeaders(),
      });
      if (res.ok) {
        setAds((prev) => prev.filter((a) => a.id !== adId));
        showToast({ type: 'success', message: 'Ad approved — now live.' });
      } else {
        showToast({ type: 'error', message: 'Could not approve.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not approve. Try again.' });
    } finally {
      setBusyId(null);
    }
  }, [authHeaders, showToast]);

  const handleReject = useCallback(async (adId) => {
    setBusyId(adId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/ads/admin/${adId}/reject`, {
        method: 'PATCH', headers: await authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAds((prev) => prev.filter((a) => a.id !== adId));
        showToast({ type: 'success', message: data.refunded ? `Rejected — ${data.refunded} coins refunded.` : 'Rejected.' });
      } else {
        showToast({ type: 'error', message: 'Could not reject.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not reject. Try again.' });
    } finally {
      setBusyId(null);
    }
  }, [authHeaders, showToast]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Feed ads</Text>
        <View style={s.headerBtn} />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <AdCard item={item} onApprove={handleApprove} onReject={handleReject} busy={busyId === item.id} />
          )}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={<Text style={s.emptyText}>Nothing pending review.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerBtn: { padding: rp(4), width: rs(28) },
  headerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },

  listContent: { padding: SPACING.md, gap: rp(10), paddingBottom: rs(40) },
  emptyText: { color: T.textMuted, fontSize: FONT.sm, textAlign: 'center', marginTop: rs(40) },

  card: { backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, padding: rp(12), gap: rp(10) },
  badge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rp(5),
    backgroundColor: 'rgba(255,99,74,0.1)', borderRadius: RADIUS.full, paddingHorizontal: rp(10), paddingVertical: rp(4),
  },
  badgeText: { fontSize: rf(10), color: T.primary, fontWeight: '700' },
  cover: { width: '100%', height: rs(140), borderRadius: RADIUS.sm, backgroundColor: T.surfaceAlt },
  title: { fontSize: FONT.sm, fontWeight: '700', color: T.text },
  link: { fontSize: rf(11), color: T.textSecondary },
  actions: { flexDirection: 'row', gap: rp(8) },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(6), paddingVertical: rp(10), borderRadius: RADIUS.sm, borderWidth: 1 },
  approveBtn: { borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.08)' },
  rejectBtn: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' },
  actionText: { fontSize: FONT.xs, fontWeight: '700' },
});
