/** Search across every drop (backend search.py), same as Web components/search/AllSearch.tsx.
 * Tapping a result opens the swipe feed at it and carries on through the results. */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioLines, Bell, BellRing, Flame, Image as ImageIcon, Play, Type } from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';
import { getDeviceId } from '../../utils/deviceId';
import { rs, rf } from '../../utils/responsive';
import T from '../../utils/theme';

// Same facts the feed shows on hookup posts (DropsSwipeScreen hookupTags).
const hookupFacts = (h) => (h ? [
  h.area ? `Location: ${h.area}` : null,
  h.age ? `Age: ${h.age}` : null,
  h.gender && h.gender !== 'other' ? `Gender: ${h.gender}` : null,
].filter(Boolean) : []);

const CHIPS = [
  ['kind', 'hookup', 'Hookups'], ['kind', 'confession', 'Confessions'],
  ['media', 'video', 'Videos'], ['media', 'audio', 'Audio'], ['media', 'photo', 'Photos'],
  ['since', 'today', 'Today'], ['since', 'week', 'This week'],
];

async function call(path, body) {
  const [token, device] = await Promise.all([AsyncStorage.getItem('token'), getDeviceId().catch(() => '')]);
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(device ? { 'X-Device-Id': device } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || 'Something went wrong');
  return data;
}

export default function AllSearch({ query, signedIn, navigation, header, likeId, onClearLike, onPick }) {
  const [q, setQ] = useState(query.trim());
  const [sel, setSel] = useState({});
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [queryId, setQueryId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [popular, setPopular] = useState([]);
  const [saved, setSaved] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    call('/search/suggest').then((r) => { setPopular(r.popular || []); }).catch(() => {});
  }, []);

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  Object.entries(sel).forEach(([k, v]) => params.set(k, v));
  const qs = params.toString();
  const path = likeId ? `/search/similar/${encodeURIComponent(likeId)}` : qs ? `/search?${qs}` : null;
  const searching = !!path;

  useEffect(() => {
    setSaved('');
    if (!path) { setItems([]); setCursor(null); setQueryId(null); return; }
    const mine = ++seq.current;
    setLoading(true);
    setFailed(false);
    call(path)
      .then((r) => {
        if (mine !== seq.current) return;
        setItems(r.results || []);
        setCursor(r.cursor || null);
        setQueryId(r.query_id || null);
      })
      .catch(() => { if (mine === seq.current) { setItems([]); setFailed(true); } })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [path]);

  const more = async () => {
    if (!cursor || loading || likeId) return;
    const mine = seq.current;
    setLoading(true);
    try {
      const r = await call(`/search?${qs}&cursor=${encodeURIComponent(cursor)}`);
      if (mine !== seq.current) return;
      setItems((cur) => [...cur, ...(r.results || [])]);
      setCursor(r.cursor || null);
    } catch { /* keep what's shown */ } finally {
      if (mine === seq.current) setLoading(false);
    }
  };

  const toggle = (key, value) => setSel((cur) => {
    const next = { ...cur };
    if (next[key] === value) delete next[key];
    else next[key] = value;
    return next;
  });

  const open = (post, position) => {
    if (queryId) call('/search/tap', { query_id: queryId, drop_id: post.id, position, action: 'open' }).catch(() => {});
    navigation.navigate('Main', { screen: 'Feed', params: { screen: 'FeedSwipe', params: { dropId: post.id, queue: items } } });
  };

  const save = async () => {
    setSaved('busy');
    try {
      await call('/search/saved', { q, kind: sel.kind || null, media: sel.media || null, topic: null });
      setSaved('done');
    } catch { setSaved('error'); }
  };


  const Header = (
    <View>
      {header}
      {likeId ? (
        <View style={s.likeRow}>
          <Text style={s.likeTitle}>More like this</Text>
          <TouchableOpacity onPress={onClearLike} activeOpacity={0.8}><Text style={s.likeBack}>Back to search</Text></TouchableOpacity>
        </View>
      ) : searching ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {CHIPS.map(([k, v, l]) => <Chip key={k + v} label={l} on={sel[k] === v} onPress={() => toggle(k, v)} />)}
          </ScrollView>
          {signedIn && (
            <TouchableOpacity style={s.save} onPress={save} disabled={saved === 'busy' || saved === 'done'} activeOpacity={0.85}>
              {saved === 'done' ? <BellRing size={rs(15)} color={T.primary} /> : <Bell size={rs(15)} color={T.primary} />}
              <Text style={s.saveText}>{saved === 'done' ? "Saved. We'll tell you when new ones drop." : saved === 'error' ? "Couldn't save it. Tap to retry." : 'Save this search'}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          {popular.length > 0 && (
            <>
              <Text style={s.section}>Trending searches</Text>
              <View style={[s.chips, s.wrap]}>
                {popular.map((p) => <Chip key={p} label={p} onPress={() => onPick?.(p)} />)}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );

  return (
    <FlatList
      data={items}
      numColumns={2}
      keyExtractor={(p) => p.id}
      columnWrapperStyle={s.row}
      renderItem={({ item, index }) => <Tile post={item} onPress={() => open(item, index)} />}
      ListHeaderComponent={Header}
      ListEmptyComponent={!loading && searching ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>{failed ? "Couldn't search right now." : 'Nothing matches that yet.'}</Text>
          <Text style={s.note}>{failed ? 'Check your connection and try again.' : 'Try another word.'}</Text>
        </View>
      ) : null}
      ListFooterComponent={loading ? <ActivityIndicator color={T.primary} style={{ marginVertical: rs(16) }} /> : null}
      onEndReached={more}
      onEndReachedThreshold={0.5}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.list}
    />
  );
}

function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress} activeOpacity={0.8} accessibilityState={{ selected: !!on }}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Tile({ post, onPress }) {
  const first = post.images?.[0];
  const cover = post.cover_url || post.card_image_url || post.image_url || (typeof first === 'string' ? first : first?.url) || null;
  const audio = !!post.audio_url && !post.video_url;
  const Badge = post.video_url ? Play : audio ? AudioLines : cover ? ImageIcon : Type;
  return (
    <TouchableOpacity style={s.tile} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.thumb, !cover && s.thumbPlain]}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
          <View style={s.quote}>
            {audio ? <AudioLines size={rs(34)} color={T.primary} /> : <Text style={s.quoteText} numberOfLines={7}>{post.content}</Text>}
          </View>
        )}
        <View style={s.badge}><Badge size={rs(13)} color="#fff" /></View>
        {post.kind === 'hookup' && (
          <View style={s.kind}><Flame size={rs(11)} color="#fff" /><Text style={s.kindText}>Hookup</Text></View>
        )}
        <Text style={s.likes}>{post.likes_count || 0} likes</Text>
      </View>
      {post.kind === 'hookup' && hookupFacts(post.hookup).length > 0 && (
        <View style={s.tags}>
          {hookupFacts(post.hookup).map((t) => <Text key={t} style={s.tag}>{t}</Text>)}
        </View>
      )}
      {!!cover && !!post.content && <Text style={s.cap} numberOfLines={2}>{post.content}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  list: { paddingBottom: rs(40) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  likeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: rs(14), marginVertical: rs(8) },
  likeTitle: { color: T.text, fontSize: rf(15), fontWeight: '800' },
  likeBack: { color: T.primary, fontSize: rf(13), fontWeight: '700' },
  row: { gap: rs(10), paddingHorizontal: rs(14) },
  chips: { gap: rs(8), paddingHorizontal: rs(14), paddingVertical: rs(6) },
  chip: { paddingHorizontal: rs(12), paddingVertical: rs(7), borderRadius: rs(16), backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  chipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  chipText: { color: T.textSecondary, fontSize: rf(12), fontWeight: '700' },
  chipTextOn: { color: T.text },
  save: { flexDirection: 'row', alignItems: 'center', gap: rs(6), alignSelf: 'flex-start', marginHorizontal: rs(14), marginVertical: rs(6), paddingHorizontal: rs(12), paddingVertical: rs(8), borderRadius: rs(999), borderWidth: 1, borderColor: T.primaryBorder, backgroundColor: T.primaryTint },
  saveText: { color: T.text, fontSize: rf(13), fontWeight: '700' },
  section: { color: T.textSecondary, fontSize: rf(12), fontWeight: '800', marginHorizontal: rs(14), marginTop: rs(10) },
  note: { color: T.textSecondary, fontSize: rf(13), marginHorizontal: rs(14), marginVertical: rs(8) },
  empty: { paddingVertical: rs(30), alignItems: 'center' },
  emptyTitle: { color: T.text, fontSize: rf(15), fontWeight: '800' },
  tile: { flex: 1, marginBottom: rs(12) },
  thumb: { aspectRatio: 3 / 4, borderRadius: rs(14), overflow: 'hidden', backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  thumbPlain: { backgroundColor: T.surfaceAlt, borderColor: T.primaryBorder },
  quote: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rs(12) },
  quoteText: { color: T.text, fontSize: rf(13), fontWeight: '700', lineHeight: rf(18) },
  badge: { position: 'absolute', top: rs(8), right: rs(8), width: rs(26), height: rs(26), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  kind: { position: 'absolute', top: rs(8), left: rs(8), flexDirection: 'row', alignItems: 'center', gap: rs(3), paddingHorizontal: rs(7), paddingVertical: rs(3), borderRadius: rs(999), backgroundColor: T.primary },
  kindText: { color: '#fff', fontSize: rf(10), fontWeight: '800' },
  likes: { position: 'absolute', left: rs(8), bottom: rs(8), color: '#fff', fontSize: rf(11), fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: rs(6), paddingVertical: rs(2), borderRadius: rs(6), overflow: 'hidden' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(4), marginTop: rs(6) },
  tag: { color: T.text, fontSize: rf(10), fontWeight: '700', paddingHorizontal: rs(7), paddingVertical: rs(2), borderRadius: rs(999), backgroundColor: T.primaryDim, borderWidth: 1, borderColor: T.primaryBorder, overflow: 'hidden' },
  cap: { color: T.text, fontSize: rf(12), lineHeight: rf(16), marginTop: rs(6) },
});
