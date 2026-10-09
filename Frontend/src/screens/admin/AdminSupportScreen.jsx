import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { rp, rf } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';
import { apiFetch, AdminHeader, a } from './adminShared';

const ConversationRow = React.memo(({ item, onPress }) => (
  <TouchableOpacity style={a.card} onPress={() => onPress(item)} activeOpacity={0.85}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: rp(8) }}>
      <Text style={[a.cardTitle, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
      {item.unread > 0 && (
        <View style={{ backgroundColor: T.primary, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ color: '#fff', fontSize: rf(10), fontWeight: '700', textAlign: 'center' }}>{item.unread}</Text>
        </View>
      )}
    </View>
    <Text style={a.cardBody} numberOfLines={2}>
      {item.last_sender === 'admin' ? 'You: ' : ''}{item.last_text}
    </Text>
    <Text style={a.cardMeta}>{item.last_at ? new Date(item.last_at).toLocaleString() : ''}</Text>
  </TouchableOpacity>
));

export default function AdminSupportScreen({ navigation }) {
  const { showToast } = useToast();
  const [convos, setConvos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { ok, data } = await apiFetch('/admin/support/conversations');
      if (ok) setConvos(data.conversations || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load inbox.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = useCallback((item) => {
    navigation.navigate('SupportChat', { userId: item.user_id, name: item.name });
  }, [navigation]);

  return (
    <SafeAreaView style={a.safe} edges={['top', 'left', 'right']}>
      <AdminHeader title="Support inbox" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={a.centered}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <FlatList
          data={convos}
          keyExtractor={(c) => c.user_id}
          renderItem={({ item }) => <ConversationRow item={item} onPress={open} />}
          contentContainerStyle={a.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.primary} />}
          ListEmptyComponent={<Text style={a.emptyText}>No conversations yet.</Text>}
        />
      )}
    </SafeAreaView>
  );
}
