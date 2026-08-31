/**
 * AdminDeceptionReportsScreen.jsx
 *
 * Reports filed by unlockers who say a confession they paid to link up
 * with was fake/bait (GET /admin/deception-reports). Confirm refunds the
 * reporter's coins, claws back the poster's reward for that connection,
 * and strikes the poster — strike 2 suspends their posting for 7 days,
 * strike 3+ deactivates the account. Dismiss has no side effects.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Check, X, AlertTriangle } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const ReportCard = React.memo(({ item, onConfirm, onDismiss, busy }) => (
  <View style={s.card}>
    <View style={s.cardHeader}>
      <View style={s.badge}>
        <AlertTriangle size={rs(10)} color="#EF4444" />
        <Text style={s.badgeText}>
          {item.sender_name} · {item.sender_strikes} strike{item.sender_strikes === 1 ? '' : 's'} so far
        </Text>
      </View>
      <Text style={s.reporterText}>reported by {item.reporter_name}</Text>
    </View>

    <Text style={s.confession} numberOfLines={4}>
      {item.confession || '[no text]'}
    </Text>

    {!!item.note && (
      <View style={s.noteBox}>
        <Text style={s.noteLabel}>REPORTER'S NOTE</Text>
        <Text style={s.noteText}>{item.note}</Text>
      </View>
    )}

    <View style={s.actions}>
      <TouchableOpacity
        style={[s.actionBtn, s.confirmBtn]}
        onPress={() => onConfirm(item.id)}
        disabled={busy}
        activeOpacity={0.85}
      >
        <Check size={rs(14)} color="#EF4444" />
        <Text style={[s.actionText, { color: '#EF4444' }]}>Confirm — refund + strike</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.actionBtn, s.dismissBtn]}
        onPress={() => onDismiss(item.id)}
        disabled={busy}
        activeOpacity={0.85}
      >
        <X size={rs(14)} color="#10B981" />
        <Text style={[s.actionText, { color: '#10B981' }]}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  </View>
));

export default function AdminDeceptionReportsScreen({ navigation }) {
  const { showToast } = useToast();
  const [queue, setQueue]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);

  const authHeaders = useCallback(async () => {
    const token = await AsyncStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/deception-reports?status=pending&limit=50`, {
        headers: await authHeaders(),
      });
      if (res.ok) setQueue((await res.json()).reports || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load reports.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = useCallback(async (reportId) => {
    setBusyId(reportId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/deception-reports/${reportId}/confirm`, {
        method: 'POST', headers: await authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setQueue((prev) => prev.filter((r) => r.id !== reportId));
        const escalationCopy = {
          posting_suspended_7d: ' — posting suspended 7 days',
          account_deactivated:  ' — account deactivated',
        }[data.escalation] || '';
        showToast({
          type: 'success',
          message: `Refunded ${data.refunded}, clawed back ${data.clawed_back}${escalationCopy}.`,
        });
      } else {
        showToast({ type: 'error', message: 'Could not confirm.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not confirm. Try again.' });
    } finally {
      setBusyId(null);
    }
  }, [authHeaders, showToast]);

  const handleDismiss = useCallback(async (reportId) => {
    setBusyId(reportId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/deception-reports/${reportId}/dismiss`, {
        method: 'POST', headers: await authHeaders(),
      });
      if (res.ok) {
        setQueue((prev) => prev.filter((r) => r.id !== reportId));
        showToast({ type: 'success', message: 'Dismissed.' });
      } else {
        showToast({ type: 'error', message: 'Could not dismiss.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not dismiss. Try again.' });
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
        <Text style={s.headerTitle}>Deception reports</Text>
        <View style={s.headerBtn} />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <ReportCard item={item} onConfirm={handleConfirm} onDismiss={handleDismiss} busy={busyId === item.id} />
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: rp(6) },
  badge: { flexDirection: 'row', alignItems: 'center', gap: rp(5), backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: RADIUS.full, paddingHorizontal: rp(10), paddingVertical: rp(4) },
  badgeText: { fontSize: rf(10), color: '#EF4444', fontWeight: '700' },
  reporterText: { fontSize: rf(10), color: T.textMuted, fontStyle: 'italic' },
  confession: { fontSize: FONT.sm, color: T.text, lineHeight: rf(20), fontStyle: 'italic' },

  noteBox: { backgroundColor: T.surfaceAlt, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border, padding: rp(10), gap: rp(4) },
  noteLabel: { fontSize: rf(9), color: T.textMuted, letterSpacing: 1, fontWeight: '700' },
  noteText: { fontSize: FONT.xs, color: T.textSecondary, lineHeight: rf(17) },

  actions: { flexDirection: 'row', gap: rp(8) },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(6), paddingVertical: rp(10), borderRadius: RADIUS.sm, borderWidth: 1 },
  confirmBtn: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' },
  dismissBtn: { borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.08)' },
  actionText: { fontSize: FONT.xs, fontWeight: '700' },
});
