/** My posts: everything the user has dropped, with its engagement, and edit / boost (hookups,
 * paid in coins) / add time / delete. Web twin: Web/components/MyPostsPage.tsx.
 * Backend: GET /drops/mine, PATCH /drops/{id}, POST /drops/{id}/boost|extend, DELETE /drops/{id}. */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Eye, Heart, MessageCircle, Bookmark, DoorOpen, Rocket, Pencil, Clock, Trash2,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';
import { timeLeft } from '../../config/linkup';
import { fetchBalance } from '../../store/slices/coinsSlice';
import { useToast } from '../../components/ui/Toast';
import { alpha } from '../../components/feed/ConfessionCard';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';

const MAX = 500;
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n || 0));

async function call(path, method = 'GET', body) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Something went wrong. Try again.');
  return data;
}

function Stat({ Icon, n, label }) {
  return (
    <View style={s.stat} accessibilityLabel={`${n} ${label}`}>
      <Icon size={rs(14)} color={T.textSecondary} />
      <Text style={s.statText}>{compact(n)}</Text>
    </View>
  );
}

function Btn({ Icon, label, onPress, hot, disabled }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} hitSlop={HIT_SLOP} activeOpacity={0.8}
      style={[s.btn, hot && s.btnHot, disabled && { opacity: 0.5 }]} accessibilityLabel={label}>
      <Icon size={rs(14)} color={hot ? '#fff' : T.text} />
      {!!label && <Text style={[s.btnText, hot && { color: '#fff' }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

function PostCard({ p, cost, hours, onChange, onRemove }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.content);
  const [busy, setBusy] = useState('');
  const hookup = p.kind === 'hookup';
  const left = hookup && p.is_live ? timeLeft(p.live_until) : null;
  const boostLeft = p.boosted_until ? timeLeft(p.boosted_until) : null;

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { showToast({ type: 'error', message: e.message }); } finally { setBusy(''); }
  };
  const save = () => run('save', async () => {
    const text = draft.trim();
    await call(`/drops/${p.id}`, 'PATCH', { content: text });
    onChange(p.id, { content: text, edited_at: new Date().toISOString() });
    setEditing(false);
    showToast({ type: 'success', message: 'Saved.' });
  });
  const boost = () => Alert.alert('Boost this post?', `It shows higher in the feed for ${hours} hours. ${cost} coins.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: `Boost · ${cost}`, onPress: () => run('boost', async () => {
      const r = await call(`/drops/${p.id}/boost`, 'POST');
      onChange(p.id, { boosted_until: r.boosted_until });
      dispatch(fetchBalance());
      showToast({ type: 'success', message: `Boosted for ${hours} hours.` });
    }) },
  ]);
  const remove = () => Alert.alert('Delete this post?', 'This can\'t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => run('delete', async () => {
      await call(`/drops/${p.id}`, 'DELETE');
      onRemove(p.id);
    }) },
  ]);

  return (
    <View style={[s.card, hookup && s.cardHk]}>
      <View style={s.top}>
        <Text style={[s.kind, { color: hookup ? T.primary : T.violet }]}>{hookup ? 'HOOKUP CONFESSION' : 'CONFESSION'}</Text>
        <Text style={s.when}>{p.time_ago}{p.edited_at ? ' · edited' : ''}</Text>
      </View>

      {editing ? (
        <View style={{ gap: rp(8) }}>
          <TextInput style={s.input} value={draft} onChangeText={(v) => setDraft(v.slice(0, MAX))} multiline autoFocus textAlignVertical="top" />
          <View style={s.row}>
            <Text style={s.when}>{MAX - draft.length}</Text>
            <View style={{ flex: 1 }} />
            <Btn Icon={ArrowLeft} label="Cancel" onPress={() => { setEditing(false); setDraft(p.content); }} />
            <Btn Icon={Pencil} label={busy === 'save' ? 'Saving…' : 'Save'} hot onPress={save} disabled={busy === 'save' || !draft.trim() || draft.trim() === p.content} />
          </View>
        </View>
      ) : (
        <Text style={s.text} numberOfLines={4}>{p.content || 'Media post'}</Text>
      )}

      {(p.under_review || hookup || boostLeft) && (
        <View style={s.row}>
          {p.under_review && <Text style={[s.chip, s.chipWarn]}>Under review</Text>}
          {hookup && <Text style={[s.chip, left && s.chipLive]}>{left ? `Deletes in ${left.replace(' left', '')}` : 'Ended'}</Text>}
          {!!boostLeft && <Text style={[s.chip, s.chipBoost]}>Boosted · {boostLeft}</Text>}
        </View>
      )}

      {hookup && <Text style={s.note}>Stays up 7 days, then deletes itself. Link Ups you never answer are refunded.</Text>}

      <View style={s.row}>
        <Stat Icon={Eye} n={p.views_count} label="views" />
        <Stat Icon={Heart} n={p.likes_count} label="likes" />
        <Stat Icon={MessageCircle} n={p.comments_count} label="comments" />
        <Stat Icon={Bookmark} n={p.saves_count} label="saves" />
        {hookup && <Stat Icon={DoorOpen} n={p.knocks_count} label="knocks" />}
      </View>

      {!editing && (
        <View style={[s.row, s.actions]}>
          <Btn Icon={Pencil} label="Edit" onPress={() => setEditing(true)} />
          {hookup && p.is_live && !p.under_review && (
            <Btn Icon={Rocket} label={`${boostLeft ? 'Boost more' : 'Boost'} · ${cost}`} hot onPress={boost} disabled={busy === 'boost'} />
          )}
          <View style={{ flex: 1 }} />
          <Btn Icon={Trash2} label="" onPress={remove} disabled={busy === 'delete'} />
        </View>
      )}
    </View>
  );
}

export default function MyPostsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await call('/drops/mine')); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const change = (id, patch) => setData((d) => d && { ...d, posts: d.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const remove = (id) => setData((d) => d && { ...d, posts: d.posts.filter((p) => p.id !== id) });
  const posts = data?.posts || [];
  const knocks = posts.reduce((n, p) => n + (p.knocks_count || 0), 0);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back">
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.title}>My posts</Text>
      </View>

      {!data && !error ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} /> : error ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>{error}</Text>
          <Btn Icon={Clock} label="Try again" onPress={load} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={T.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={(
            <View style={s.sum}>
              {[[posts.length, 'Posts'], [data.total_views, 'Views'], [data.total_likes, 'Likes'], [knocks, 'Knocks']].map(([n, l]) => (
                <View key={l} style={s.sumBox}><Text style={s.sumN}>{compact(n)}</Text><Text style={s.sumL}>{l}</Text></View>
              ))}
            </View>
          )}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>Nothing posted yet.</Text></View>}
          renderItem={({ item }) => (
            <PostCard p={item} cost={data.boost_cost} hours={data.boost_hours} onChange={change} onRemove={remove} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  note: { color: T.textMute, fontSize: FONT.xs, lineHeight: FONT.xs * 1.45 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  title: { color: T.text, fontFamily: 'DMSans-Bold', fontSize: FONT.lg },
  list: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: rp(60) },
  sum: { flexDirection: 'row', gap: rp(8), marginBottom: SPACING.xs },
  sumBox: { flex: 1, alignItems: 'center', paddingVertical: rp(12), borderRadius: RADIUS.md, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  sumN: { color: T.text, fontFamily: 'DMSans-Bold', fontSize: FONT.lg },
  sumL: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.xs },
  card: { gap: rp(10), padding: rp(14), borderRadius: RADIUS.lg, backgroundColor: T.surfaceDark, borderWidth: 1, borderColor: T.border },
  cardHk: { borderColor: alpha(T.primary, 0.28) },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kind: { fontFamily: 'DMSans-Bold', fontSize: FONT.xs, letterSpacing: 0.6 },
  when: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.xs },
  text: { color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md, lineHeight: rf(23) },
  input: { minHeight: rs(110), padding: rp(10), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceAlt, color: T.text, fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: rp(8) },
  chip: { overflow: 'hidden', paddingHorizontal: rp(9), paddingVertical: rp(3), borderRadius: RADIUS.full, backgroundColor: T.surfaceAlt, color: T.textSecondary, fontFamily: 'DMSans-SemiBold', fontSize: FONT.xs },
  chipLive: { color: '#34d399', backgroundColor: 'rgba(52,211,153,0.1)' },
  chipBoost: { color: T.primary, backgroundColor: alpha(T.primary, 0.14) },
  chipWarn: { color: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.12)' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: rp(4), marginRight: rp(6) },
  statText: { color: T.textSecondary, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm },
  actions: { borderTopWidth: 1, borderTopColor: T.border, paddingTop: rp(10) },
  btn: { flexDirection: 'row', alignItems: 'center', gap: rp(6), paddingHorizontal: rp(12), paddingVertical: rp(7), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface },
  btnHot: { backgroundColor: T.primary, borderColor: T.primary },
  btnText: { color: T.text, fontFamily: 'DMSans-SemiBold', fontSize: FONT.sm },
  empty: { alignItems: 'center', gap: SPACING.sm, marginTop: rp(40) },
  emptyText: { color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: FONT.md },
});
