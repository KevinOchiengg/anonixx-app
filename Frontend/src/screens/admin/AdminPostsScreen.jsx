import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Alert } from '../../utils/confirm';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';

import { rs, rf, rp, RADIUS } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import T from '../../utils/theme';
import { apiFetch, AdminHeader, a } from './adminShared';
import VideoEditorModal from '../../components/compose/VideoEditorModal';
import { defaultEdit } from '../../utils/videoEdit';
import { useVideoPlayer } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';

// Must match DROP_SORTS in Backend/app/api/v1/admin.py.
const SORTS = [['recent', 'Newest'], ['views', 'Most viewed'], ['likes', 'Most liked'], ['comments', 'Most discussed'], ['engagement', 'Best engagement']];

const PROMO_HOURS = [[6, '6h'], [24, '1 day'], [72, '3 days'], [168, '7 days']];

const editFor = (post) => ({
  id: post.id, text: post.confession_full ?? post.confession ?? '', country: post.country || '',
  vedit: post.video_edit || null, touched: false,
  sound: post.sound?.id || '', mute: !!post.sound?.mute_original, soundTouched: false, mature: !!post.mature,
});

// Length of a video the list doesn't know yet, read once it loads.
function DurationProbe({ uri, onLength }) {
  const player = useVideoPlayer({ uri });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && player.duration) onLength(player.duration);
      if (status === 'error') onLength(-1);
    });
    return () => sub.remove();
  }, [player, onLength]);
  return null;
}

function Stat({ n, label, hot }) {
  return (
    <View style={[st.stat, hot && st.statHot]}>
      <Text style={st.statText}><Text style={st.statNum}>{n}</Text> {label}</Text>
    </View>
  );
}

// Super admin: the track that plays behind the drop, from the Sounds library.
function SoundPick({ sounds, video, value, mute, hearing, onChange, onHear }) {
  if (!sounds.length) return <Text style={a.cardMeta}>No sounds yet. Add some on the website's admin Sounds page.</Text>;
  return (
    <View style={st.promo}>
      <Text style={a.cardMeta}>Sound</Text>
      <View style={st.promoRow}>
        <TouchableOpacity onPress={() => onChange('', mute)} style={[st.sortChip, !value && st.sortChipOn]} activeOpacity={0.8}>
          <Text style={[st.sortText, !value && st.sortTextOn]}>No sound</Text>
        </TouchableOpacity>
        {sounds.map((snd) => (
          <TouchableOpacity
            key={snd.id} activeOpacity={0.8}
            onPress={() => onChange(snd.id, mute)} onLongPress={() => onHear(snd)}
            style={[st.sortChip, value === snd.id && st.sortChipOn]}
          >
            <Text style={[st.sortText, value === snd.id && st.sortTextOn]}>{hearing === snd.id ? `■ ${snd.title}` : snd.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={a.cardMeta}>Hold a sound to listen.</Text>
      {value && video ? (
        <TouchableOpacity onPress={() => onChange(value, !mute)} style={[st.sortChip, mute && st.sortChipOn, { alignSelf: 'flex-start' }]} activeOpacity={0.8}>
          <Text style={[st.sortText, mute && st.sortTextOn]}>{mute ? "Video's own sound: muted" : "Mute the video's own sound"}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Super admin: pull a video's sound out. Post it as its own audio drop with a caption you write and/or save it
// to Sounds under a name you give it. The video drop doesn't change.
function ExtractAudio({ item }) {
  const { showToast } = useToast();
  const [post, setPost] = useState(false);
  const [library, setLibrary] = useState(false);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const ready = (post || library) && (!library || title.trim().length > 0);

  const run = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const { ok, data } = await apiFetch(`/admin/drops/${item.id}/extract-audio`, {
      method: 'POST',
      body: { post, library, title: library ? title.trim() : null, caption: post ? caption.trim() : null },
    });
    setBusy(false);
    if (!ok) { showToast({ type: 'error', message: data?.detail || 'Could not extract the audio.' }); return; }
    setDone(true);
    showToast({ type: 'success', message: [data.drop_id ? 'Posted as an audio drop.' : '', data.sound ? `Saved to Sounds as "${data.sound.title}".` : ''].filter(Boolean).join(' ') });
  };

  if (done) return <Text style={st.sortText}>Audio extracted.</Text>;

  return (
    <View style={{ gap: rp(8) }}>
      <View style={st.promoRow}>
        <TouchableOpacity onPress={() => setPost((v) => !v)} style={[st.sortChip, post && st.sortChipOn]} activeOpacity={0.8}>
          <Text style={[st.sortText, post && st.sortTextOn]}>Post as audio drop</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setLibrary((v) => !v)} style={[st.sortChip, library && st.sortChipOn]} activeOpacity={0.8}>
          <Text style={[st.sortText, library && st.sortTextOn]}>Save to Sounds</Text>
        </TouchableOpacity>
      </View>
      {post ? (
        <TextInput
          style={[st.edit, { minHeight: rs(64) }]} value={caption} onChangeText={setCaption} maxLength={1800} multiline
          placeholder="Caption for the audio drop" placeholderTextColor={T.textMuted}
        />
      ) : null}
      {library ? (
        <TextInput
          style={[st.edit, { minHeight: 0 }]} value={title} onChangeText={setTitle} maxLength={80}
          placeholder="Name this sound" placeholderTextColor={T.textMuted}
        />
      ) : null}
      <TouchableOpacity style={[a.btn, !ready && { opacity: 0.45 }]} onPress={run} disabled={!ready || busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator size="small" color={T.primary} /> : <Text style={[a.btnText, { color: T.primary }]}>Extract audio</Text>}
      </TouchableOpacity>
    </View>
  );
}

const PostRow = React.memo(({ item, onDelete, editing, onEdit, onChangeText, onSave, onCancel, saving, promoting, onPromoting, onPromote, onVideoText, canPin, soundPick, sounds, hearing, onSound, onHear, mature, onMature }) => (
  <View style={a.card}>
    <Text style={a.cardMeta}>
      {item.is_admin_drop ? 'Anonixx' : (item.author || 'Anonymous')}
      {item.media_type ? ` · ${item.media_type}` : ''}
      {item.report_count ? ` · ${item.report_count} reports` : ''}
      {item.moderation_status ? ` · ${item.moderation_status}` : ''}
    </Text>
    {editing != null ? (
      <TextInput
        style={st.edit} value={editing} onChangeText={onChangeText} multiline maxLength={1800} autoFocus
        placeholder="Post text" placeholderTextColor={T.textMuted}
      />
    ) : null}
    {editing != null && canPin && soundPick && item.media_type !== 'voice' ? (
      <SoundPick
        sounds={sounds} video={item.media_type === 'video'} value={soundPick.sound} mute={soundPick.mute}
        hearing={hearing} onChange={onSound} onHear={onHear}
      />
    ) : null}
    {editing != null && canPin && item.is_admin_drop && item.media_type === 'video' && item.media_url ? (
      <ExtractAudio item={item} />
    ) : null}
    {editing != null ? (
      <TouchableOpacity onPress={onMature} style={[st.sortChip, mature && st.sortChipOn, { alignSelf: 'flex-start', marginTop: 8 }]} activeOpacity={0.8}>
        <Text style={[st.sortText, mature && st.sortTextOn]}>Mature: blurred until tapped</Text>
      </TouchableOpacity>
    ) : null}
    {editing == null ? (
      <Text style={a.cardBody} numberOfLines={4}>{item.confession || '(no text)'}</Text>
    ) : null}
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
    {editing != null && canPin && promoting ? (
      <View style={st.promo}>
        <View style={st.promoRow}>
          {[['pin', 'Pin to top'], ['boost', 'Boost']].map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => onPromoting({ ...promoting, kind: k })} style={[st.sortChip, promoting.kind === k && st.sortChipOn]} activeOpacity={0.8}>
              <Text style={[st.sortText, promoting.kind === k && st.sortTextOn]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={st.promoRow}>
          {PROMO_HOURS.map(([h, l]) => (
            <TouchableOpacity key={h} onPress={() => onPromoting({ ...promoting, hours: h })} style={[st.sortChip, promoting.hours === h && st.sortChipOn]} activeOpacity={0.8}>
              <Text style={[st.sortText, promoting.hours === h && st.sortTextOn]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={st.promoRow}>
          <TouchableOpacity style={a.btn} onPress={() => onPromoting(null)} activeOpacity={0.85}>
            <Text style={a.btnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={a.btn} onPress={() => onPromote(item, promoting)} disabled={saving} activeOpacity={0.85}>
            <Text style={[a.btnText, { color: T.primary }]}>Start</Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : null}
    {editing != null ? (
      <View style={a.actionRow}>
        {item.media_type === 'video' && item.media_url ? (
          <TouchableOpacity style={a.btn} onPress={() => onVideoText(item)} disabled={saving} activeOpacity={0.85}>
            <Text style={a.btnText}>Text over video</Text>
          </TouchableOpacity>
        ) : null}
        {canPin ? (
          <TouchableOpacity
            style={a.btn} disabled={saving} activeOpacity={0.85}
            onPress={() => (item.promo_kind ? onPromote(item, null) : onPromoting({ kind: 'pin', hours: 24 }))}
          >
            <Text style={a.btnText}>{item.promo_kind ? `Stop ${item.promo_kind}` : 'Pin / boost'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ) : null}
    <View style={a.actionRow}>
      {editing != null ? (
        <>
          <TouchableOpacity style={[a.btn, a.btnDanger]} onPress={() => onDelete(item)} disabled={saving} activeOpacity={0.85}>
            <Text style={[a.btnText, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity style={a.btn} onPress={onCancel} activeOpacity={0.85}>
            <Text style={a.btnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={a.btn} onPress={onSave} disabled={saving || (!editing.trim() && !item.media_url)} activeOpacity={0.85}>
            <Text style={[a.btnText, { color: T.primary }]}>{saving ? 'Saving…' : `Save · ${editing.length}/1800`}</Text>
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
  const [editing, setEditing] = useState(null); // { id, text, country, vedit, touched }
  const [saving, setSaving]   = useState(false);
  const [promoting, setPromoting] = useState(null); // { kind, hours }
  const [videoFor, setVideoFor] = useState(null);   // { post, duration }
  const [isSuper, setIsSuper] = useState(false);
  useEffect(() => {
    apiFetch('/admin/me').then(({ ok, data }) => { if (ok) setIsSuper(!!data?.is_super_admin); }).catch(() => {});
  }, []);
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
        if (hit?.is_admin_drop) setEditing((e) => e || editFor(hit));
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
      setEditing((e) => (e?.id === post.id ? null : e));
      showToast({ type: 'success', message: 'Post deleted.' });
      // From the feed's pencil: the drop is gone, so back to the feed.
      if (only) navigation.goBack();
    } else {
      showToast({ type: 'error', message: data?.detail || 'Could not delete.' });
    }
  }, [showToast, only, navigation]);

  const startEdit = useCallback((post) => { setPromoting(null); setEditing(editFor(post)); }, []);
  const toggleMature = useCallback(() => setEditing((e) => (e ? { ...e, mature: !e.mature } : e)), []);
  const changeEdit = useCallback((text) => setEditing((e) => (e ? { ...e, text } : e)), []);
  const cancelEdit = useCallback(() => { setEditing(null); setPromoting(null); }, []);
  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const post = posts.find((p) => p.id === editing.id);
    if (!editing.text.trim() && !post?.media_url) return;
    setSaving(true);
    const { ok, data } = await apiFetch(`/admin/drops/${editing.id}`, {
      method: 'PATCH',
      body: {
        confession: editing.text.trim(),
        ...(editing.touched && editing.vedit ? { video_edit: editing.vedit } : {}),
        ...(isSuper && editing.soundTouched ? { sound_id: editing.sound, sound_mute_original: editing.mute } : {}),
        ...(editing.mature !== !!post?.mature ? { mature: editing.mature } : {}),
      },
    });
    setSaving(false);
    if (ok) {
      setPosts((prev) => prev.map((p) => (p.id === editing.id ? {
        ...p, confession: data.confession, confession_full: data.confession, country: data.country,
        ...(editing.touched ? { video_edit: data.video_edit } : {}),
        ...('sound' in data ? { sound: data.sound } : {}),
        ...('mature' in data ? { mature: data.mature } : {}),
      } : p)));
      setEditing(null);
      showToast({ type: 'success', message: 'Drop updated.' });
      // From the feed's pencil: straight back to the drop.
      if (only) navigation.goBack();
    } else {
      showToast({ type: 'error', message: data?.detail || 'Could not save.' });
    }
  }, [editing, posts, showToast, only, navigation, isSuper]);

  const [sounds, setSounds] = useState([]);
  const [hearing, setHearing] = useState('');
  const soundPlayer = useAudioPlayer(null);
  useEffect(() => {
    if (!isSuper || !editing || sounds.length) return;
    apiFetch('/sounds').then(({ ok, data }) => { if (ok && data?.sounds) setSounds(data.sounds); }).catch(() => {});
  }, [isSuper, editing, sounds.length]);
  useEffect(() => { if (!editing && hearing) { soundPlayer.pause(); setHearing(''); } }, [editing, hearing, soundPlayer]);
  const changeSound = useCallback((sound, mute) => setEditing((e) => (e ? { ...e, sound, mute, soundTouched: true } : e)), []);
  const hearSound = useCallback((snd) => {
    if (hearing === snd.id) { soundPlayer.pause(); setHearing(''); return; }
    soundPlayer.replace({ uri: snd.url });
    soundPlayer.play();
    setHearing(snd.id);
  }, [hearing, soundPlayer]);

  const promote = useCallback(async (post, choice) => {
    setSaving(true);
    const { ok, data } = await apiFetch(`/admin/drops/${post.id}/promote`, choice ? { method: 'PATCH', body: choice } : { method: 'DELETE' });
    setSaving(false);
    if (ok) {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, promo_kind: data.promo_kind, promo_until: data.promo_until || null } : p)));
      setPromoting(null);
      showToast({ type: 'success', message: choice ? (choice.kind === 'pin' ? 'Pinned.' : 'Boosted.') : 'Stopped.' });
    } else {
      showToast({ type: 'error', message: data?.detail || 'Could not update.' });
    }
  }, [showToast]);

  const openVideoText = useCallback((post) => setVideoFor({ post, duration: post.duration_seconds || 0 }), []);
  const gotLength = useCallback((len) => {
    if (len < 0) {
      setVideoFor(null);
      showToast({ type: 'error', message: "This video can't be previewed here." });
      return;
    }
    setVideoFor((v) => (v ? { ...v, duration: len } : v));
  }, [showToast]);
  const videoDone = useCallback(({ edit }) => {
    setEditing((e) => (e ? { ...e, vedit: edit, touched: true } : e));
    setVideoFor(null);
  }, []);

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
              promoting={editing?.id === item.id ? promoting : null} onPromoting={setPromoting}
              onPromote={promote} onVideoText={openVideoText} canPin={isSuper}
              soundPick={editing?.id === item.id ? editing : null} sounds={sounds} hearing={hearing}
              onSound={changeSound} onHear={hearSound}
              mature={editing?.id === item.id && editing.mature} onMature={toggleMature}
            />
          )}
          extraData={[editing, promoting, saving, isSuper, sounds, hearing]}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={a.listContent}
          ListEmptyComponent={<Text style={a.emptyText}>No posts found.</Text>}
        />
      )}
      {videoFor && !videoFor.duration ? <DurationProbe uri={videoFor.post.media_url} onLength={gotLength} /> : null}
      {videoFor && videoFor.duration ? (
        <VideoEditorModal
          visible
          uri={videoFor.post.media_url}
          duration={videoFor.duration}
          landscape={false}
          value={(editing?.id === videoFor.post.id && editing.vedit) || defaultEdit(videoFor.duration)}
          onClose={() => setVideoFor(null)}
          onDone={videoDone}
        />
      ) : null}
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
  promo: { gap: rp(8), marginTop: rp(4) },
  promoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
});
