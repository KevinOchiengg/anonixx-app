import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, FlagTriangleRight } from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const STATUS_COPY = {
  flagged: { label: 'Under review',  color: T.warn },
  hidden:  { label: 'Hidden',        color: T.danger },
};

export default function ModerationHistoryScreen({ navigation }) {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/users/me/moderation-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load your flagged content.' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Report & Moderation History</Text>
        <View style={{ width: rs(22) }} />
      </View>

      {loading ? (
        <ActivityIndicator color={T.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            <Text style={s.emptyText}>Nothing here — none of your drops have been flagged.</Text>
          }
          renderItem={({ item }) => {
            const status = STATUS_COPY[item.moderation_status] || STATUS_COPY.flagged;
            return (
              <View style={s.row}>
                <View style={s.rowIcon}>
                  <FlagTriangleRight size={rs(15)} color={status.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText} numberOfLines={2}>
                    {item.confession || '(media drop)'}
                  </Text>
                  <Text style={[s.rowStatus, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>
            );
          }}
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
  headerTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text, flex: 1, textAlign: 'center' },
  listContent: { padding: SPACING.md },
  emptyText: {
    color: T.textSecondary, fontSize: FONT.sm, textAlign: 'center', marginTop: SPACING.xl,
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: T.surface, borderRadius: rs(12),
    padding: rp(14), marginBottom: SPACING.sm,
  },
  rowIcon: {
    width: rs(28), height: rs(28), borderRadius: rs(14),
    backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    marginRight: rp(12),
  },
  rowText: { color: T.text, fontSize: FONT.sm },
  rowStatus: { fontSize: rf(11), fontWeight: '700', marginTop: rp(4), letterSpacing: 0.3 },
});
