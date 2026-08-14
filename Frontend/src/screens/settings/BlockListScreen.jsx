import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, UserX } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

export default function BlockListScreen({ navigation }) {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/users/me/blocked`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load your block list.' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleUnblock = useCallback(async (userId) => {
    setUnblockingId(userId);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/users/${userId}/block`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showToast({ type: 'success', message: 'User unblocked.' });
    } catch {
      showToast({ type: 'error', message: 'Could not unblock. Try again.' });
    } finally {
      setUnblockingId(null);
    }
  }, [showToast]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Block List</Text>
        <View style={{ width: rs(22) }} />
      </View>

      {loading ? (
        <ActivityIndicator color={T.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            <Text style={s.emptyText}>You haven't blocked anyone.</Text>
          }
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={s.rowIcon}>
                <UserX size={rs(16)} color={T.textMuted} />
              </View>
              <Text style={s.rowLabel} numberOfLines={1}>
                {item.username || item.anonymous_name}
              </Text>
              <TouchableOpacity
                style={s.unblockBtn}
                onPress={() => handleUnblock(item.id)}
                disabled={unblockingId === item.id}
                hitSlop={HIT_SLOP}
              >
                {unblockingId === item.id
                  ? <ActivityIndicator size="small" color={T.primary} />
                  : <Text style={s.unblockText}>Unblock</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text },
  listContent: { padding: SPACING.md },
  emptyText: {
    color: T.textSecondary, fontSize: FONT.sm, textAlign: 'center', marginTop: SPACING.xl,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, borderRadius: rs(12),
    padding: rp(14), marginBottom: SPACING.sm,
  },
  rowIcon: {
    width: rs(32), height: rs(32), borderRadius: rs(16),
    backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    marginRight: rp(12),
  },
  rowLabel: { flex: 1, color: T.text, fontSize: FONT.md, fontWeight: '500' },
  unblockBtn: {
    paddingHorizontal: rp(12), paddingVertical: rp(6),
    borderRadius: rs(8), borderWidth: 1, borderColor: T.border,
  },
  unblockText: { color: T.primary, fontSize: rf(12), fontWeight: '600' },
});
