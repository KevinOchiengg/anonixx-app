/**
 * AdminModerationScreen.jsx
 *
 * Drops flagged (3+ reports) or auto-hidden (self-harm-concern) — the
 * queue existed server-side (GET /admin/moderation-queue) with nothing to
 * act on it until now. Dismiss clears the flag and keeps it live; delete
 * removes it and its unlock/connection records.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Check, Trash2, Flag } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const QueueCard = React.memo(({ item, onDismiss, onDelete, busy }) => (
  <View style={s.card}>
    <View style={s.cardHeader}>
      <View style={s.badge}>
        <Flag size={rs(10)} color="#EF4444" />
        <Text style={s.badgeText}>{item.report_count} report{item.report_count === 1 ? '' : 's'} · {item.moderation_status}</Text>
      </View>
    </View>
    <Text style={s.confession} numberOfLines={4}>
      {item.confession || `[${item.media_type} drop]`}
    </Text>
    <View style={s.actions}>
      <TouchableOpacity
        style={[s.actionBtn, s.dismissBtn]}
        onPress={() => onDismiss(item.id)}
        disabled={busy}
        activeOpacity={0.85}
      >
        <Check size={rs(14)} color="#10B981" />
        <Text style={[s.actionText, { color: '#10B981' }]}>Dismiss</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.actionBtn, s.deleteBtn]}
        onPress={() => onDelete(item.id)}
        disabled={busy}
        activeOpacity={0.85}
      >
        <Trash2 size={rs(14)} color="#EF4444" />
        <Text style={[s.actionText, { color: '#EF4444' }]}>Delete</Text>
      </TouchableOpacity>
    </View>
  </View>
));

export default function AdminModerationScreen({ navigation }) {
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
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/moderation-queue?limit=50`, { headers: await authHeaders() });
      if (res.ok) setQueue((await res.json()).drops || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load the queue.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleDismiss = useCallback(async (dropId) => {
    setBusyId(dropId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/drops/${dropId}/dismiss`, {
        method: 'PATCH', headers: await authHeaders(),
      });
      if (res.ok) {
        setQueue((prev) => prev.filter((d) => d.id !== dropId));
        showToast({ type: 'success', message: 'Cleared — drop stays live.' });
      } else {
        showToast({ type: 'error', message: 'Could not dismiss.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not dismiss. Try again.' });
    } finally {
      setBusyId(null);
    }
  }, [authHeaders, showToast]);

  const handleDelete = useCallback(async (dropId) => {
    setBusyId(dropId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/drops/${dropId}`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      if (res.ok) {
        setQueue((prev) => prev.filter((d) => d.id !== dropId));
        showToast({ type: 'success', message: 'Deleted.' });
      } else {
        showToast({ type: 'error', message: 'Could not delete.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not delete. Try again.' });
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
        <Text style={s.headerTitle}>Moderation queue</Text>
        <View style={s.headerBtn} />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => (
            <QueueCard item={item} onDismiss={handleDismiss} onDelete={handleDelete} busy={busyId === item.id} />
          )}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={<Text style={s.emptyText}>Nothing flagged right now.</Text>}
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
  cardHeader: { flexDirection: 'row' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: rp(5), backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: RADIUS.full, paddingHorizontal: rp(10), paddingVertical: rp(4) },
  badgeText: { fontSize: rf(10), color: '#EF4444', fontWeight: '700' },
  confession: { fontSize: FONT.sm, color: T.text, lineHeight: rf(20), fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: rp(8) },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(6), paddingVertical: rp(10), borderRadius: RADIUS.sm, borderWidth: 1 },
  dismissBtn: { borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.08)' },
  deleteBtn: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' },
  actionText: { fontSize: FONT.xs, fontWeight: '700' },
});
