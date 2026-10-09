import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';
import { apiFetch, AdminHeader, a } from './adminShared';

const FILTERS = ['pending', 'accepted', 'rejected'];

const RefundRow = React.memo(({ item, canDecide, onAccept, onReject }) => (
  <View style={a.card}>
    <Text style={a.cardTitle}>
      {item.coins} coins{item.kes ? ` · KES ${item.kes}` : ''}
    </Text>
    <Text style={a.cardMeta}>
      {item.user_name || 'User'}{item.user_email ? ` · ${item.user_email}` : ''} · balance {item.user_balance}
    </Text>
    <Text style={a.cardBody}>{item.reason}</Text>
    <Text style={a.cardMeta}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text>
    {item.status !== 'pending' ? (
      <View style={a.badge}><Text style={a.badgeText}>{item.status}</Text></View>
    ) : canDecide ? (
      <View style={a.actionRow}>
        <TouchableOpacity style={[a.btn, a.btnPrimary]} onPress={() => onAccept(item)} activeOpacity={0.85}>
          <Text style={[a.btnText, { color: '#fff' }]}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[a.btn, a.btnDanger]} onPress={() => onReject(item)} activeOpacity={0.85}>
          <Text style={[a.btnText, { color: '#EF4444' }]}>Reject</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <Text style={a.cardMeta}>Awaiting a super admin.</Text>
    )}
  </View>
));

export default function AdminRefundsScreen({ navigation, route }) {
  const isSuper = !!route.params?.isSuper;
  const { showToast } = useToast();
  const [filter, setFilter]   = useState('pending');
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await apiFetch(`/admin/refunds?status=${filter}`);
      if (ok) setRefunds(data.refunds || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load refunds.' });
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (item, action) => {
    const { ok, data } = await apiFetch(`/admin/refunds/${item.id}/${action}`, { method: 'POST', body: {} });
    if (ok) {
      setRefunds((prev) => prev.filter((r) => r.id !== item.id));
      showToast({
        type: 'success',
        message: action === 'accept'
          ? `Accepted. ${data.coins_clawed_back} coins removed — send the money back manually.`
          : 'Rejected.',
      });
    } else {
      showToast({ type: 'error', message: data?.detail || 'Action failed.' });
    }
  }, [showToast]);

  const onAccept = useCallback((item) => {
    Alert.alert(
      'Accept refund?',
      `Removes up to ${item.coins} coins from the user and tells them the money is coming back. You still send the money yourself (M-Pesa / Stripe).`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Accept', onPress: () => decide(item, 'accept') }],
    );
  }, [decide]);

  const onReject = useCallback((item) => {
    Alert.alert('Reject refund?', 'The user is told their request was declined.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => decide(item, 'reject') },
    ]);
  }, [decide]);

  return (
    <SafeAreaView style={a.safe} edges={['top', 'left', 'right']}>
      <AdminHeader title="Refunds" onBack={() => navigation.goBack()} />
      <View style={[a.actionRow, { paddingHorizontal: 16, marginTop: 12 }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[a.btn, filter === f && a.btnPrimary]}
            onPress={() => setFilter(f)}
            activeOpacity={0.85}
          >
            <Text style={[a.btnText, filter === f && { color: '#fff' }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <View style={a.centered}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <FlatList
          data={refunds}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RefundRow item={item} canDecide={isSuper} onAccept={onAccept} onReject={onReject} />
          )}
          contentContainerStyle={a.listContent}
          ListEmptyComponent={<Text style={a.emptyText}>No {filter} refund requests.</Text>}
        />
      )}
    </SafeAreaView>
  );
}
