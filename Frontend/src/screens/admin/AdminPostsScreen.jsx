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

const PostRow = React.memo(({ item, onDelete, editing, onEdit, onChangeText, onSave, onCancel, saving }) => (
  <View style={a.card}>
    <Text style={a.cardMeta}>
      {item.is_admin_drop ? 'Anonixx' : (item.author || 'Anonymous')}
      {item.media_type ? ` · ${item.media_type}` : ''}
      {item.report_count ? ` · ${item.report_count} reports` : ''}
      {item.moderation_status ? ` · ${item.moderation_status}` : ''}
    </Text>
    {editing != null ? (
      <TextInput
        style={st.edit} value={editing} onChangeText={onChangeText} multiline maxLength={500} autoFocus
        placeholder="Post text" placeholderTextColor={T.textMuted}
      />
    ) : (
      <Text style={a.cardBody} numberOfLines={4}>{item.confession || '(no text)'}</Text>
    )}
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
      {editing != null ? (
        <>
          <TouchableOpacity style={a.btn} onPress={onCancel} activeOpacity={0.85}>
            <Text style={a.btnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={a.btn} onPress={onSave} disabled={saving || !editing.trim()} activeOpacity={0.85}>
            <Text style={[a.btnText, { color: T.primary }]}>{saving ? 'Saving…' : `Save · ${editing.length}/500`}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {item.is_admin_drop ? (
            <TouchableOpacity style={a.btn} onPress={() => onEdit(item)} activeOpacity={0.85}>
              <Text style={a.btnText}>Edit</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[a.btn, a.btnDanger]} onPress={() => onDelete(item)} activeOpacity={0.85}>
            <Text style={[a.btnText, { color: '#EF4444' }]}>Delete post</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  </View>
));

export default function AdminPostsScreen({ navigation, route }) {
  const { showToast } = useToast();
  const [posts, setPosts]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(true);
  const [sort, setSort]       = useState('recent');
  // From the pencil on a drop in the feed: just that drop, open for editing.
  const [only, setOnly]       = useState(route?.params?.editId || null);
  const [editing, setEditing] = useState(null); // { id, text }
  const [saving, setSaving]   = useState(false);
  const timer = useRef(null);

  // Pages of 50; more load as you scroll to the bottom.
  const [moreBusy, setMoreBusy] = useState(false);
  const lastSearch = useRef('');
  const load = useCallback(async (search = '') => {
    setLoading(true);
    lastSearch.current = search;
    try {
      const params = new URLSearchParams({ limit: '50', sort });
      if (search.trim()) params.set('search', search.trim());
      if (only) params.set('id', only);
      const { ok, data } = await apiFetch(`/admin/drops?${params}`);
      if (ok) {
        setPosts(data.drops || []); setTotal(data.total || 0);
        const hit = only ? (data.drops || []).find((p) => p.id === only) : null;
        if (hit?.is_admin_drop) setEditing((e) => e || { id: hit.id, text: hit.confession_full ?? hit.confession ?? '' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not load posts.' });
    } finally {
      setLoading(false);
    }
  }, [showToast, sort, only]);

  const loadMore = useCallback(async () => {
    if (only || moreBusy || loading || posts.length >= total) return;
    setMoreBusy(true);
    try {
      const params = new URLSearchParams({ limit: '50', sort, skip: String(posts.length) });
      if (lastSearch.current.trim()) params.set('search', lastSearch.current.trim());
      const { ok, data } = await apiFetch(`/admin/drops?${params}`);
      if (ok) setPosts((p) => [...p, ...(data.drops || []).filter((x) => !p.some((y) => y.id === x.id))]);
    } catch {} finally { setMoreBusy(false); }
  }, [only, moreBusy, loading, posts.length, total, sort]);

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

  const startEdit = useCallback((post) => setEditing({ id: post.id, text: post.confession_full ?? post.confession ?? '' }), []);
  const changeEdit = useCallback((text) => setEditing((e) => (e ? { ...e, text } : e)), []);
  const cancelEdit = useCallback(() => setEditing(null), []);
  const saveEdit = useCallback(async () => {
    if (!editing?.text.trim()) return;
    setSaving(true);
    const { ok, data } = await apiFetch(`/admin/drops/${editing.id}`, { method: 'PATCH', body: { confession: editing.text.trim() } });
    setSaving(false);
    if (ok) {
      setPosts((prev) => prev.map((p) => (p.id === editing.id ? { ...p, confession: data.confession, confession_full: data.confession } : p)));
      setEditing(null);
      showToast({ type: 'success', message: 'Drop updated.' });
      // From the feed's pencil: straight back to the drop.
      if (only) navigation.goBack();
    } else {
      showToast({ type: 'error', message: data?.detail || 'Could not save.' });
    }
  }, [editing, showToast, only, navigation]);

  const confirmDelete = useCallback((post) => {
    Alert.alert('Delete this post?', 'This removes it for everyone and can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => doDelete(post) },
    ]);
  }, [doDelete]);

  return (
    <SafeAreaView style={a.safe} edges={['top', 'left', 'right']}>
      <AdminHeader title={only ? 'Edit drop' : `Posts (${total})`} onBack={() => navigation.goBack()} />
      {only ? null : <View style={a.searchRow}>
        <Search size={rs(15)} color={T.textMuted} />
        <TextInput
          value={query}
          onChangeText={onSearch}
          placeholder="Search confession text…"
          placeholderTextColor={T.textMuted}
          style={a.searchInput}
          autoCapitalize="none"
        />
      </View>}
      {only ? (
        <TouchableOpacity onPress={() => { setOnly(null); setEditing(null); }} style={st.onlyRow} activeOpacity={0.8}>
          <Text style={st.onlyText}>
            {posts[0] && !posts[0].is_admin_drop ? 'Only Anonixx drops can be edited. ' : 'Save takes you back to the drop. '}
            <Text style={{ color: T.primary }}>All posts</Text>
          </Text>
        </TouchableOpacity>
      ) : null}
      {only ? null : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.sortBar} contentContainerStyle={st.sortRow}>
        {SORTS.map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setSort(k)} style={[st.sortChip, sort === k && st.sortChipOn]} activeOpacity={0.8}>
            <Text style={[st.sortText, sort === k && st.sortTextOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>}
      {loading ? (
        <View style={a.centered}><ActivityIndicator color={T.primary} size="large" /></View>
      ) : (
        <FlatList
          data={posts}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={moreBusy ? <ActivityIndicator color={T.primary} style={{ marginVertical: 16 }} /> : null}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostRow
              item={item} onDelete={confirmDelete} onEdit={startEdit}
              editing={editing?.id === item.id ? editing.text : null}
              onChangeText={changeEdit} onSave={saveEdit} onCancel={cancelEdit} saving={saving}
            />
          )}
          extraData={editing}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={a.listContent}
          ListEmptyComponent={<Text style={a.emptyText}>No posts found.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  edit: { minHeight: rs(96), color: T.text, fontSize: rf(14), lineHeight: rf(20), textAlignVertical: 'top', borderWidth: 1, borderColor: T.border, borderRadius: RADIUS.md, padding: rp(10), backgroundColor: 'rgba(255,255,255,0.03)' },
  onlyRow: { paddingHorizontal: rp(16), paddingVertical: rp(6) },
  onlyText: { fontSize: rf(12), color: T.textSecondary },
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
