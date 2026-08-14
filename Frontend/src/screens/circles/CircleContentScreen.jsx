/**
 * CircleContentScreen.jsx
 *
 * The content feed inside a Circle — members-only. Admin/creator posts
 * (optionally coin-gated, shown blurred until unlocked), plus a strip of
 * member-bought ads at the top, priced by how long they run and auto-hidden
 * once expired (see POST/GET /circles/:id/ads in the backend).
 */
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Image, Modal, ScrollView, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Lock, Plus, Megaphone, X, Film } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

// ─── Post card ──────────────────────────────────────────────────
const PostCard = React.memo(({ post, auraColor, onUnlock, unlocking }) => (
  <View style={[s.postCard, { borderLeftColor: auraColor }]}>
    {post.media_url && !post.locked && (
      post.media_type === 'video' ? (
        <View style={[s.postMedia, s.postMediaVideo]}>
          <Film size={rs(28)} color={T.textMuted} />
        </View>
      ) : (
        <Image source={{ uri: post.media_url }} style={s.postMedia} resizeMode="cover" />
      )
    )}

    {post.locked && (
      <View style={[s.postMedia, s.lockedMedia]}>
        <Lock size={rs(22)} color="#fff" />
        <Text style={s.lockedText}>Blurred until unlocked</Text>
        <TouchableOpacity
          style={[s.unlockBtn, { backgroundColor: auraColor }]}
          onPress={() => onUnlock(post.id, post.unlock_price)}
          disabled={unlocking}
          activeOpacity={0.85}
        >
          {unlocking
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.unlockBtnText}>Unlock — {post.unlock_price} coins</Text>
          }
        </TouchableOpacity>
      </View>
    )}

    {!!post.caption && <Text style={s.postCaption}>{post.caption}</Text>}
  </View>
));

// ─── Ad card ────────────────────────────────────────────────────
const AdCard = React.memo(({ ad, onPress }) => (
  <TouchableOpacity style={s.adCard} onPress={() => onPress(ad)} activeOpacity={0.85}>
    <View style={s.adBadge}>
      <Megaphone size={rs(10)} color={T.textMuted} />
      <Text style={s.adBadgeText}>AD</Text>
    </View>
    {ad.media_url && <Image source={{ uri: ad.media_url }} style={s.adImage} resizeMode="cover" />}
    <Text style={s.adTitle} numberOfLines={2}>{ad.title}</Text>
  </TouchableOpacity>
));

// ─── Screen ─────────────────────────────────────────────────────
export default function CircleContentScreen({ route, navigation }) {
  const { circleId, circle } = route.params ?? {};
  const { showToast } = useToast();
  const auraColor = circle?.aura_color || T.primary;

  const [posts, setPosts]         = useState([]);
  const [ads, setAds]             = useState([]);
  const [loading, setLoading]     = useState(true);
  const [unlockingId, setUnlockingId] = useState(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [caption, setCaption]     = useState('');
  const [mediaUri, setMediaUri]   = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [unlockPrice, setUnlockPrice] = useState('');
  const [posting, setPosting]     = useState(false);

  const [adModalOpen, setAdModalOpen] = useState(false);
  const [adTitle, setAdTitle]     = useState('');
  const [adLink, setAdLink]       = useState('');
  const [adHours, setAdHours]     = useState('24');
  const [postingAd, setPostingAd] = useState(false);

  const canManage = !!(circle?.is_creator || circle?.is_admin);

  const authHeaders = useCallback(async (json = false) => {
    const token = await AsyncStorage.getItem('token');
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const [postsRes, adsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/posts`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/ads`, { headers }),
      ]);
      if (postsRes.ok) setPosts((await postsRes.json()).posts || []);
      if (adsRes.ok) setAds((await adsRes.json()).ads || []);
    } catch {
      showToast({ type: 'error', message: 'Could not load the circle feed.' });
    } finally {
      setLoading(false);
    }
  }, [circleId, authHeaders, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleUnlock = useCallback(async (postId, price) => {
    setUnlockingId(postId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/posts/${postId}/unlock`, {
        method: 'POST',
        headers: await authHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? data : p)));
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: data.detail || 'Not enough coins.' });
        navigation.navigate('Coins');
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not unlock.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not unlock. Try again.' });
    } finally {
      setUnlockingId(null);
    }
  }, [circleId, authHeaders, showToast, navigation]);

  const handlePickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setMediaUri(asset.uri);
    setMediaType(asset.type === 'video' ? 'video' : 'image');
  }, [showToast]);

  const handleSubmitPost = useCallback(async () => {
    if (!caption.trim() && !mediaUri) {
      showToast({ type: 'warning', message: 'Add a caption or attach media.' });
      return;
    }
    setPosting(true);
    try {
      let uploadedUrl = null;
      if (mediaUri) {
        const ext = mediaUri.split('?')[0].split('.').pop()?.toLowerCase() || (mediaType === 'video' ? 'mp4' : 'jpg');
        const form = new FormData();
        form.append('file', {
          uri: mediaUri, name: `circle_post.${ext}`,
          type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
        });
        const uploadRes = await fetch(`${API_BASE_URL}/api/v1/upload/${mediaType === 'video' ? 'video' : 'image'}`, {
          method: 'POST', headers: await authHeaders(), body: form,
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        uploadedUrl = (await uploadRes.json()).url;
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/posts`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          caption: caption.trim(),
          media_url: uploadedUrl,
          media_type: uploadedUrl ? mediaType : null,
          unlock_price: parseInt(unlockPrice, 10) || 0,
        }),
      });
      if (res.ok) {
        showToast({ type: 'success', message: 'Posted to the circle.' });
        setComposerOpen(false);
        setCaption(''); setMediaUri(null); setMediaType(null); setUnlockPrice('');
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast({ type: 'error', message: data.detail || 'Could not post.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not post. Try again.' });
    } finally {
      setPosting(false);
    }
  }, [caption, mediaUri, mediaType, unlockPrice, circleId, authHeaders, showToast, load]);

  const handleSubmitAd = useCallback(async () => {
    const hours = parseInt(adHours, 10);
    if (!adTitle.trim() || !adLink.trim() || !hours) {
      showToast({ type: 'warning', message: 'Fill in a title, link, and duration.' });
      return;
    }
    setPostingAd(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circles/${circleId}/ads`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ title: adTitle.trim(), link_url: adLink.trim(), duration_hours: hours }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast({ type: 'success', message: `Ad live for ${hours}h — ${data.coins_spent} coins.` });
        setAdModalOpen(false);
        setAdTitle(''); setAdLink(''); setAdHours('24');
        load();
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: data.detail || 'Not enough coins.' });
        navigation.navigate('Coins');
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not post ad.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not post ad. Try again.' });
    } finally {
      setPostingAd(false);
    }
  }, [adTitle, adLink, adHours, circleId, authHeaders, showToast, load, navigation]);

  const handleAdPress = useCallback((ad) => {
    if (ad.link_url?.startsWith('anonixx://')) {
      navigation.navigate('DropLanding', { dropId: ad.link_url.split('/').pop() });
    } else {
      Linking.openURL(ad.link_url).catch(() => {});
    }
  }, [navigation]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{circle?.name || 'Circle'} feed</Text>
        <TouchableOpacity onPress={() => setAdModalOpen(true)} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <Megaphone size={rs(18)} color={T.textMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={auraColor} size="large" /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              auraColor={auraColor}
              onUnlock={handleUnlock}
              unlocking={unlockingId === item.id}
            />
          )}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ads.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.adRow}>
              {ads.map((ad) => <AdCard key={ad.id} ad={ad} onPress={handleAdPress} />)}
            </ScrollView>
          ) : null}
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyText}>Nothing posted here yet.</Text>
            </View>
          }
        />
      )}

      {canManage && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: auraColor }]}
          onPress={() => setComposerOpen(true)}
          activeOpacity={0.88}
        >
          <Plus size={rs(24)} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* ── Post composer (admin/creator only) ── */}
      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView style={s.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>New post</Text>
              <TouchableOpacity onPress={() => setComposerOpen(false)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Caption…"
              placeholderTextColor={T.textMuted}
              style={s.sheetInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity style={s.mediaPickBtn} onPress={handlePickMedia} activeOpacity={0.85}>
              <Text style={s.mediaPickText}>{mediaUri ? 'Media attached ✓' : 'Attach photo/video'}</Text>
            </TouchableOpacity>
            <TextInput
              value={unlockPrice}
              onChangeText={(v) => setUnlockPrice(v.replace(/[^0-9]/g, ''))}
              placeholder="Unlock price in coins (0 = free)"
              placeholderTextColor={T.textMuted}
              style={s.sheetInput}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: auraColor }]}
              onPress={handleSubmitPost}
              disabled={posting}
              activeOpacity={0.88}
            >
              {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Post</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Ad form (any member) ── */}
      <Modal visible={adModalOpen} animationType="slide" transparent onRequestClose={() => setAdModalOpen(false)}>
        <KeyboardAvoidingView style={s.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Post an ad</Text>
              <TouchableOpacity onPress={() => setAdModalOpen(false)} hitSlop={HIT_SLOP}>
                <X size={rs(20)} color={T.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={s.sheetHint}>5 coins per hour it runs — deleted automatically when time's up.</Text>
            <TextInput
              value={adTitle}
              onChangeText={setAdTitle}
              placeholder="Ad title"
              placeholderTextColor={T.textMuted}
              style={s.sheetInput}
              maxLength={80}
            />
            <TextInput
              value={adLink}
              onChangeText={setAdLink}
              placeholder="Link (internal or external URL)"
              placeholderTextColor={T.textMuted}
              style={s.sheetInput}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TextInput
              value={adHours}
              onChangeText={(v) => setAdHours(v.replace(/[^0-9]/g, ''))}
              placeholder="Hours to run"
              placeholderTextColor={T.textMuted}
              style={s.sheetInput}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: auraColor }]}
              onPress={handleSubmitAd}
              disabled={postingAd}
              activeOpacity={0.88}
            >
              {postingAd
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.submitBtnText}>
                    Run ad — {(parseInt(adHours, 10) || 0) * 5} coins
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  headerBtn: { padding: rp(4) },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT.md, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: rs(60) },
  emptyText: { color: T.textMuted, fontSize: FONT.sm, fontStyle: 'italic' },

  listContent: { padding: SPACING.md, paddingBottom: rs(100), gap: SPACING.md },

  // Ads
  adRow: { gap: rp(10), paddingBottom: SPACING.md },
  adCard: { width: rs(140), backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, padding: rp(8), gap: rp(6) },
  adBadge: { flexDirection: 'row', alignItems: 'center', gap: rp(3), alignSelf: 'flex-start', backgroundColor: T.surfaceAlt, borderRadius: RADIUS.full, paddingHorizontal: rp(6), paddingVertical: rp(2) },
  adBadgeText: { fontSize: rf(8), color: T.textMuted, fontWeight: '700', letterSpacing: 0.5 },
  adImage: { width: '100%', height: rs(70), borderRadius: RADIUS.sm },
  adTitle: { fontSize: rf(11), color: T.text, fontWeight: '600' },

  // Posts
  postCard: { backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, borderLeftWidth: 3, overflow: 'hidden' },
  postMedia: { width: '100%', height: rs(220), backgroundColor: T.surfaceAlt },
  postMediaVideo: { alignItems: 'center', justifyContent: 'center' },
  lockedMedia: { alignItems: 'center', justifyContent: 'center', gap: rp(8), backgroundColor: 'rgba(0,0,0,0.75)' },
  lockedText: { color: 'rgba(255,255,255,0.7)', fontSize: FONT.xs },
  unlockBtn: { paddingHorizontal: rp(18), paddingVertical: rp(10), borderRadius: RADIUS.full },
  unlockBtnText: { color: '#fff', fontSize: FONT.sm, fontWeight: '700' },
  postCaption: { padding: rp(14), color: T.text, fontSize: FONT.sm, lineHeight: rf(20) },

  // FAB
  fab: {
    position: 'absolute', bottom: rs(24), right: rs(20),
    width: rs(52), height: rs(52), borderRadius: rs(26),
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: rs(4) }, shadowOpacity: 0.4, shadowRadius: rs(10), elevation: 8,
  },

  // Modals
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.md, gap: rp(10), borderWidth: 1, borderColor: T.border, borderBottomWidth: 0 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: FONT.lg, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },
  sheetHint: { fontSize: rf(11), color: T.textMuted, fontStyle: 'italic', marginTop: -rp(4) },
  sheetInput: {
    backgroundColor: T.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(14), paddingVertical: rp(12), color: T.text, fontSize: FONT.sm,
  },
  mediaPickBtn: { backgroundColor: T.surfaceAlt, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: T.border, paddingVertical: rp(12), alignItems: 'center' },
  mediaPickText: { color: T.textSecondary, fontSize: FONT.sm },
  submitBtn: { height: BUTTON_HEIGHT, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: rp(4), marginBottom: SPACING.md },
  submitBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
});
