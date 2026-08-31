/**
 * AdminDashboardScreen.jsx
 *
 * Platform overview for admins — user/content counts, a revenue figure
 * that refreshes on a short poll (a "live" cash-flow feel without standing
 * up a new Socket.IO event path just for this), and entry points into
 * user management and the moderation queue.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Users, Flag, DollarSign, TrendingUp, Megaphone, AlertTriangle } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const REVENUE_POLL_MS = 5000;

const StatCard = React.memo(({ label, value, sub }) => (
  <View style={s.statCard}>
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
    {sub ? <Text style={s.statSub}>{sub}</Text> : null}
  </View>
));

export default function AdminDashboardScreen({ navigation }) {
  const { showToast } = useToast();
  const [stats, setStats]     = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const authHeaders = useCallback(async () => {
    const token = await AsyncStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadStats = useCallback(async (silent = false) => {
    try {
      const headers = await authHeaders();
      const [statsRes, revRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/admin/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/admin/revenue`, { headers }),
      ]);
      if (statsRes.status === 403) {
        showToast({ type: 'error', message: 'Admin access required.' });
        navigation.goBack();
        return;
      }
      if (statsRes.ok) setStats(await statsRes.json());
      if (revRes.ok) setRevenue(await revRes.json());
    } catch {
      if (!silent) showToast({ type: 'error', message: 'Could not load dashboard.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authHeaders, showToast, navigation]);

  useEffect(() => {
    loadStats(false);
    pollRef.current = setInterval(() => loadStats(true), REVENUE_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [loadStats]);

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, s.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={T.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Admin</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Revenue ticker */}
        <View style={s.revenueCard}>
          <View style={s.revenueTop}>
            <TrendingUp size={rs(16)} color={T.primary} />
            <Text style={s.revenueLabel}>Total revenue</Text>
            <View style={s.liveDot} />
          </View>
          <Text style={s.revenueValue}>${revenue?.total_usd?.toFixed(2) ?? '0.00'}</Text>
          {revenue?.by_method && Object.keys(revenue.by_method).length > 0 && (
            <View style={s.methodRow}>
              {Object.entries(revenue.by_method).map(([method, data]) => (
                <View key={method} style={s.methodChip}>
                  <Text style={s.methodChipText}>{method}: ${data.total_usd.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Stat grid */}
        <View style={s.statGrid}>
          <StatCard label="Total users" value={stats?.users?.total ?? 0} sub={`${stats?.users?.active_last_30d ?? 0} active (30d)`} />
          <StatCard label="Admins" value={stats?.users?.admins ?? 0} />
          <StatCard label="Banned" value={stats?.users?.banned ?? 0} />
          <StatCard label="Verified" value={stats?.users?.verified ?? 0} />
          <StatCard label="Total posts" value={stats?.content?.total_posts ?? 0} sub={`${stats?.content?.posts_today ?? 0} today`} />
          <StatCard label="Total drops" value={stats?.content?.total_drops ?? 0} />
        </View>

        {/* Nav */}
        <TouchableOpacity style={s.navCard} onPress={() => navigation.navigate('AdminUsers')} activeOpacity={0.85}>
          <Users size={rs(20)} color={T.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.navCardTitle}>Users</Text>
            <Text style={s.navCardDesc}>Search, ban, verify, grant admin, adjust coins</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={s.navCard} onPress={() => navigation.navigate('AdminModeration')} activeOpacity={0.85}>
          <Flag size={rs(20)} color={T.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.navCardTitle}>Moderation queue</Text>
            <Text style={s.navCardDesc}>Flagged and hidden drops awaiting review</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={s.navCard} onPress={() => navigation.navigate('AdminAds')} activeOpacity={0.85}>
          <Megaphone size={rs(20)} color={T.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.navCardTitle}>Feed ads</Text>
            <Text style={s.navCardDesc}>Sponsored ad submissions awaiting review</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={s.navCard} onPress={() => navigation.navigate('AdminDeceptionReports')} activeOpacity={0.85}>
          <AlertTriangle size={rs(20)} color={T.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.navCardTitle}>Deception reports</Text>
            <Text style={s.navCardDesc}>Fake confession claims — refund + strike on confirm</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerBtn: { padding: rp(4), width: rs(28) },
  headerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  content: { padding: SPACING.md, gap: SPACING.md, paddingBottom: rs(60) },

  revenueCard: {
    backgroundColor: T.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: T.primaryBorder,
    padding: SPACING.md, gap: rp(8),
  },
  revenueTop: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  revenueLabel: { flex: 1, fontSize: FONT.xs, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  liveDot: { width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: '#10B981' },
  revenueValue: { fontSize: rf(34), fontWeight: '800', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6), marginTop: rp(4) },
  methodChip: { backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full, paddingHorizontal: rp(10), paddingVertical: rp(4) },
  methodChipText: { fontSize: rf(11), color: T.textSecondary },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(10) },
  statCard: {
    width: '31%', backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    padding: rp(12), gap: rp(2),
  },
  statValue: { fontSize: FONT.lg, fontWeight: '800', color: T.text },
  statLabel: { fontSize: rf(10), color: T.textSecondary },
  statSub: { fontSize: rf(9), color: T.textMuted },

  navCard: {
    flexDirection: 'row', alignItems: 'center', gap: rp(12),
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, padding: SPACING.md,
  },
  navCardTitle: { fontSize: FONT.sm, fontWeight: '700', color: T.text },
  navCardDesc: { fontSize: rf(11), color: T.textSecondary, marginTop: rp(2) },
});
