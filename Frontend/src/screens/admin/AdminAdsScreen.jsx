/** Ads (super admin): post an ad that scrolls in the feed like a drop, see its views, taps and
 * tap rate, pause or delete it. Member ads waiting for review sit underneath. Same as Web/app/admin/ads. */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '../../components/ui/Toast';
import { Alert } from '../../utils/confirm';
import { uploadToR2 } from '../../utils/upload';
import { rf, rp, rs, FONT, RADIUS } from '../../utils/responsive';
import T from '../../utils/theme';
import { apiFetch, AdminHeader, a } from './adminShared';

const BLANK = { title: '', link_url: '', cta: '', countries: '', days: '', web: true, app: true, adult: false };

const Chip = ({ on, label, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[s.chip, on && s.chipOn]} activeOpacity={0.8}>
    <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
  </TouchableOpacity>
);

function NewAd({ onDone }) {
  const { showToast } = useToast();
  const [f, setF] = useState(BLANK);
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState('');
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (!r.canceled && r.assets?.[0]) setMedia(r.assets[0]);
  };

  const submit = async () => {
    if (!f.title.trim() || !f.link_url.trim()) { showToast({ type: 'warning', message: 'Add the caption and the link.' }); return; }
    if (!f.web && !f.app) { showToast({ type: 'warning', message: 'Pick the website, the app, or both.' }); return; }
    try {
      let media_url = null;
      let media_type = 'image';
      if (media) {
        media_type = media.type === 'video' ? 'video' : 'image';
        setBusy('Uploading…');
        media_url = await uploadToR2(media.uri, media_type, media_type === 'video' ? 'video/mp4' : 'image/jpeg');
      }
      setBusy('Saving…');
      const days = parseInt(f.days, 10);
      const { ok, data } = await apiFetch('/ads/admin', {
        method: 'POST',
        body: {
          title: f.title, link_url: f.link_url.trim(), cta: f.cta || null, adult: f.adult, media_url, media_type,
          platforms: [f.web && 'web', f.app && 'app'].filter(Boolean),
          countries: f.countries.split(',').map((c) => c.trim()).filter(Boolean),
          ends_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
        },
      });
      if (!ok) throw new Error(data?.detail || 'Could not publish the ad.');
      setF(BLANK); setMedia(null);
      showToast({ type: 'success', message: 'Ad is live.' });
      onDone();
    } catch (e) {
      showToast({ type: 'error', message: e.message || 'Could not publish the ad.' });
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={a.card}>
      <Text style={a.cardTitle}>New ad</Text>
      <TextInput style={[s.input, { minHeight: rs(80) }]} value={f.title} onChangeText={(v) => set('title', v)} maxLength={900} multiline
        placeholder="Caption (first line shows in bold)" placeholderTextColor={T.textMuted} textAlignVertical="top" />
      <TextInput style={s.input} value={f.link_url} onChangeText={(v) => set('link_url', v)} autoCapitalize="none" keyboardType="url"
        placeholder="Link, https://…" placeholderTextColor={T.textMuted} />
      <TextInput style={s.input} value={f.cta} onChangeText={(v) => set('cta', v)} maxLength={30}
        placeholder="Button text (Check it out)" placeholderTextColor={T.textMuted} />
      <TextInput style={s.input} value={f.countries} onChangeText={(v) => set('countries', v)}
        placeholder="Countries, comma separated (blank = everywhere)" placeholderTextColor={T.textMuted} />
      <TextInput style={s.input} value={f.days} onChangeText={(v) => set('days', v.replace(/\D/g, ''))} keyboardType="number-pad"
        placeholder="Runs for how many days (blank = until you stop it)" placeholderTextColor={T.textMuted} />
      <TouchableOpacity style={a.btn} onPress={pick} activeOpacity={0.85}>
        <Text style={a.btnText}>{media ? `${media.type === 'video' ? 'Video' : 'Photo'} picked · change` : 'Add a photo or video'}</Text>
      </TouchableOpacity>
      {media && media.type !== 'video' ? <Image source={{ uri: media.uri }} style={s.cover} /> : null}
      <View style={s.chips}>
        <Chip on={f.web} label="Website" onPress={() => set('web', !f.web)} />
        <Chip on={f.app} label="App" onPress={() => set('app', !f.app)} />
        <Chip on={f.adult} label="18+" onPress={() => set('adult', !f.adult)} />
      </View>
      {f.adult ? <Text style={a.cardMeta}>Only people who confirmed they're 18+ see it.</Text> : null}
      <TouchableOpacity style={[a.btn, a.btnPrimary]} onPress={submit} disabled={!!busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[a.btnText, { color: '#fff' }]}>Publish ad</Text>}
      </TouchableOpacity>
    </View>
  );
}

const AdRow = ({ ad, busy, onToggle, onDelete }) => (
  <View style={a.card}>
    {ad.media_url && ad.media_type !== 'video' ? <Image source={{ uri: ad.media_url }} style={s.cover} /> : null}
    <Text style={a.cardTitle} numberOfLines={3}>{ad.title}</Text>
    <Text style={a.cardMeta} numberOfLines={1}>{ad.link_url}</Text>
    <View style={s.chips}>
      <View style={a.badge}><Text style={[a.badgeText, { color: ad.ended ? T.error || '#ef4444' : ad.active ? '#10B981' : T.textSecondary }]}>{ad.ended ? 'Ended' : ad.active ? 'Running' : 'Paused'}</Text></View>
      {ad.adult ? <View style={a.badge}><Text style={a.badgeText}>18+</Text></View> : null}
      {(ad.platforms?.length ? ad.platforms : ['web', 'app']).map((p) => (
        <View key={p} style={a.badge}><Text style={a.badgeText}>{p === 'web' ? 'Website' : 'App'}</Text></View>
      ))}
    </View>
    <View style={s.stats}>
      <Text style={s.stat}><Text style={s.statNum}>{ad.views}</Text> views</Text>
      <Text style={s.stat}><Text style={[s.statNum, { color: T.primary }]}>{ad.taps}</Text> taps</Text>
      <Text style={s.stat}><Text style={s.statNum}>{ad.tap_rate}%</Text> tap rate</Text>
      <Text style={s.stat}><Text style={s.statNum}>{ad.likes}</Text> likes</Text>
      <Text style={s.stat}><Text style={s.statNum}>{ad.hides}</Text> hid it</Text>
    </View>
    <View style={a.actionRow}>
      <TouchableOpacity style={[a.btn, a.btnDanger]} onPress={onDelete} disabled={busy}><Text style={a.btnText}>Delete</Text></TouchableOpacity>
      <TouchableOpacity style={a.btn} onPress={onToggle} disabled={busy}><Text style={a.btnText}>{ad.active ? 'Pause' : 'Run'}</Text></TouchableOpacity>
    </View>
  </View>
);

export default function AdminAdsScreen({ navigation }) {
  const { showToast } = useToast();
  const [ads, setAds] = useState(null);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const [all, wait] = await Promise.all([apiFetch('/ads/admin/all'), apiFetch('/ads/admin/pending')]);
    if (!all.ok) { showToast({ type: 'error', message: all.data?.detail || 'Could not load ads.' }); setAds([]); return; }
    setAds((all.data.ads || []).filter((x) => x.status !== 'pending_review'));
    setPending(wait.ok ? wait.data.ads || [] : []);
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const run = async (id, path, method, body) => {
    setBusy(id);
    const { ok, data } = await apiFetch(path, { method, body });
    setBusy(null);
    if (!ok) showToast({ type: 'error', message: data?.detail || 'That did not work.' });
    load();
  };

  const remove = (ad) => Alert.alert('Delete this ad?', 'It leaves the feed and its numbers are gone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => run(ad.id, `/ads/admin/${ad.id}`, 'DELETE') },
  ]);

  return (
    <SafeAreaView style={a.safe} edges={['top']}>
      <AdminHeader title="Ads" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={a.listContent} keyboardShouldPersistTaps="handled">
        <Text style={a.cardBody}>Ads scroll in the feed like drops, about one every 9. Each person sees the same ad at most 3 times a day. Premium members never see ads.</Text>
        <NewAd onDone={load} />
        {!ads ? <ActivityIndicator color={T.primary} style={{ marginTop: rs(20) }} /> : ads.length === 0 ? (
          <Text style={a.emptyText}>No ads yet.</Text>
        ) : ads.map((ad) => (
          <AdRow key={ad.id} ad={ad} busy={busy === ad.id}
            onToggle={() => run(ad.id, `/ads/admin/${ad.id}`, 'PATCH', { active: !ad.active })}
            onDelete={() => remove(ad)} />
        ))}
        {pending.length ? (
          <>
            <Text style={[a.cardTitle, { marginTop: rp(12) }]}>Waiting for review</Text>
            {pending.map((ad) => (
              <View key={ad.id} style={a.card}>
                {ad.media_url && ad.media_type !== 'video' ? <Image source={{ uri: ad.media_url }} style={s.cover} /> : null}
                <Text style={a.cardTitle} numberOfLines={2}>{ad.title}</Text>
                <Text style={a.cardMeta} numberOfLines={1}>{ad.link_url}</Text>
                <View style={a.actionRow}>
                  <TouchableOpacity style={[a.btn, a.btnDanger]} disabled={busy === ad.id} onPress={() => run(ad.id, `/ads/admin/${ad.id}/reject`, 'PATCH')}><Text style={a.btnText}>Reject</Text></TouchableOpacity>
                  <TouchableOpacity style={[a.btn, a.btnPrimary]} disabled={busy === ad.id} onPress={() => run(ad.id, `/ads/admin/${ad.id}/approve`, 'PATCH')}><Text style={[a.btnText, { color: '#fff' }]}>Approve</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  input: { color: T.text, fontSize: FONT.sm, borderWidth: 1, borderColor: T.border, borderRadius: RADIUS.md, paddingHorizontal: rp(12), paddingVertical: rp(10), backgroundColor: 'rgba(255,255,255,0.03)' },
  cover: { width: '100%', height: rs(160), borderRadius: RADIUS.md, backgroundColor: T.surfaceAlt },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  chip: { paddingHorizontal: rp(12), paddingVertical: rp(7), borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.border },
  chipOn: { borderColor: T.primary, backgroundColor: 'rgba(255,99,74,0.12)' },
  chipText: { color: T.textSecondary, fontSize: FONT.xs, fontWeight: '700' },
  chipTextOn: { color: T.primary },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(10) },
  stat: { color: T.textSecondary, fontSize: rf(12) },
  statNum: { color: T.text, fontWeight: '800' },
});
