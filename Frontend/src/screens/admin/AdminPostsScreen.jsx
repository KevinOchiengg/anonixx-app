import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';

import { rs, rf, rp, RADIUS } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';
import { apiFetch, AdminHeader, a } from './adminShared';

// Must match DROP_SORTS in Backend/app/api/v1/admin.py.
const SORTS = [['recent', 'Newest'], ['views', 'Most viewed'], ['likes', 'Most liked'], ['comments', 'Most discussed'], ['engagement', 'Best engagement']];

function Stat({ n, label, hot }) {
  return (
    <View style={[st.stat, hot && st.statHot]}>
      <Text style={st.statText}><Text style={st.statNum}>{n}</Text> {label}</Text>
    </View>
  );
}

const PostRow = React.memo(({ item, onDelete }) => (
  <View style={a.card}>
    <Text style={a.cardMeta}>
      {item.is_admin_drop ? 'Anonixx' : (item.author || 'Anonymous')}
      {item.media_type ? ` · ${item.media_type}` : ''}
      {item.report_count ? ` · ${item.report_count} reports` : ''}
      {item.moderation_status ? ` · ${item.moderation_status}` : ''}
    </Text>
    <Text style={a.cardBody} numberOfLines={4}>{item.confession || '(no text)'}</Text>
    {item.stats && (
      <View style={st.stats}>
        <Stat n={item.stats.views} label="views" />
        <Stat n={item.stats.likes} label="likes" />
        <Stat n={item.stats.comments} label="comments" />
        <Stat n={item.stats.saves} label="saves" />
        {!!item.stats.reactions && <Stat n={item.stats.reactions} label="reactions" />}
        {item.kind !== 'confession' && !item.is_admin_drop && <Stat n={item.stats.linkups} label="link ups" />}
        <Stat n={item.stats.engagement == null ? '—' : `${item.stats.engagement}%`} label="engagement" hot />
      </View>
    )}
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
  const [sort, setSort]       = useState('recent');
  const timer = useRef(null);

  const load = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50', sort });
      if (search.trim()) params.set('search', search.trim());
      const { ok, data } = await apiFetch(`/admin/drops?${params}`);
      if (ok) { setPosts(data.drops || []); setTotal(data.total || 0); }
    } catch {
      showToast({ type: 'error', message: 'Could not load posts.' });
    } finally {
      setLoading(false);
    }
  }, [showToast, sort]);

  useEffect(() => { load(query); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.sortBar} contentContainerStyle={st.sortRow}>
        {SORTS.map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setSort(k)} style={[st.sortChip, sort === k && st.sortChipOn]} activeOpacity={0.8}>
            <Text style={[st.sortText, sort === k && st.sortTextOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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

const st = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6), marginTop: rp(2) },
  stat: { paddingHorizontal: rp(8), paddingVertical: rp(3), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  statHot: { borderColor: T.primaryBorder, backgroundColor: T.primaryTint },
  statText: { fontSize: rf(11), color: T.textSecondary },
  statNum: { color: T.text, fontWeight: '800' },
  sortBar: { flexGrow: 0, marginTop: rp(8) },
  sortRow: { paddingHorizontal: rp(16), gap: rp(8) },
  sortChip: { paddingHorizontal: rp(12), paddingVertical: rp(7), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.borderStrong },
  sortChipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  sortText: { fontSize: rf(12), fontWeight: '700', color: T.textSecondary },
  sortTextOn: { color: T.text },
});
