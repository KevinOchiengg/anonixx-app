import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';

import { rs } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';
import { apiFetch, AdminHeader, a } from './adminShared';

const PostRow = React.memo(({ item, onDelete }) => (
  <View style={a.card}>
    <Text style={a.cardMeta}>
      {item.is_admin_drop ? 'Anonixx' : (item.author || 'Anonymous')}
      {item.media_type ? ` · ${item.media_type}` : ''}
      {item.report_count ? ` · ${item.report_count} reports` : ''}
      {item.moderation_status ? ` · ${item.moderation_status}` : ''}
    </Text>
    <Text style={a.cardBody} numberOfLines={4}>{item.confession || '(no text)'}</Text>
    <Text style={a.cardMeta}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</Text>
    <View style={a.actionRow}>
      <TouchableOpacity style={[a.btn, a.btnDanger]} onPress={() => onDelete(item)} activeOpacity={0.85}>
        <Text style={[a.btnText, { color: '#EF4444' }]}>Delete post</Text>
      </TouchableOpacity>
    </View>
  </View>
));

export default function AdminPostsScreen({ navigation }) {
  const { showToast } = useToast();
  const [posts, setPosts]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const load = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      const { ok, data } = await apiFetch(`/admin/drops?${params}`);
      if (ok) { setPosts(data.drops || []); setTotal(data.total || 0); }
    } catch {
      showToast({ type: 'error', message: 'Could not load posts.' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(''); }, [load]);

  const onSearch = useCallback((text) => {
    setQuery(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(text), 350);
  }, [load]);

  const doDelete = useCallback(async (post) => {
    const { ok, data } = await apiFetch(`/admin/drops/${post.id}`, { method: 'DELETE' });
    if (ok) {
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      showToast({ type: 'error', message: data?.detail || 'Could not delete.' });
    }
  }, [showToast]);

  const confirmDelete = useCallback((post) => {
    Alert.alert('Delete this post?', 'This removes it for everyone and can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDelete(post) },
    ]);
  }, [doDelete]);

  return (
    <SafeAreaView style={a.safe} edges={['top', 'left', 'right']}>
      <AdminHeader title={`Posts (${total})`} onBack={() => navigation.goBack()} />
      <View style={a.searchRow}>
        <Search size={rs(15)} color={T.textMuted} />
        <TextInput
          value={query}
          onChangeText={onSearch}
          placeholder="Search confession text…"
          placeholderTextColor={T.textMuted}
          style={a.searchInput}
          autoCapitalize="none"
        />
      </View>
      {loading ? (
        <View style={a.centered}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PostRow item={item} onDelete={confirmDelete} />}
          contentContainerStyle={a.listContent}
          ListEmptyComponent={<Text style={a.emptyText}>No posts found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}
