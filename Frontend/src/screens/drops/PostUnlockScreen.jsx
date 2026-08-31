/**
 * PostUnlockScreen
 *
 * "Link up" landing page for a calm-feed post — sends the author a request
 * to unlock (chat with) them. Nothing is charged here: coins only move once
 * the author accepts, via POST /unlock-requests (see UnlockWaitingScreen).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';
import { Flame, Camera, Video as VideoIcon, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { fetchBalance } from '../../store/slices/coinsSlice';

// Must match COINS_UNLOCK_COST in Backend/app/api/v1/drops.py
const UNLOCK_COST = 50;
// Must match MAX_REQUEST_VIDEO_SECONDS in Backend/app/api/v1/unlock_requests.py
const MAX_CLUE_VIDEO_SECONDS = 30;

// Same signed-upload flow CreatePostScreen.jsx uses — kept as its own local
// copy here rather than a shared util, matching how each screen in this app
// already carries its own copy of this helper.
const uploadToCloudinary = async (uri, resourceType, token) => {
  const signRes = await fetch(`${API_BASE_URL}/api/v1/upload/sign`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ resource_type: resourceType === 'video' ? 'video' : 'image' }),
  });
  if (!signRes.ok) throw new Error('Could not get upload signature.');
  const { signature, timestamp, api_key, cloud_name, folder } = await signRes.json();

  const ext      = uri.split('?')[0].split('.').pop()?.toLowerCase() || '';
  const mimeType = resourceType === 'video' ? `video/${ext || 'mp4'}` : `image/${ext || 'jpeg'}`;
  const formData = new FormData();
  formData.append('file',      { uri, type: mimeType, name: `upload.${ext}` });
  formData.append('api_key',   api_key);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder',    folder);

  const res  = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`,
    { method: 'POST', body: formData },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
};

export default function PostUnlockScreen({ route, navigation }) {
  const { post } = route.params ?? {};
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const coinBalance = useSelector((state) => state.coins.balance);

  const [unlocking, setUnlocking] = useState(false);

  // Optional clue attached to the request — never required to unlock.
  const [mediaUri,      setMediaUri]      = useState(null);
  const [mediaType,     setMediaType]     = useState(null); // 'image' | 'video'
  const [mediaThumb,    setMediaThumb]    = useState(null); // video poster frame
  const [mediaDuration, setMediaDuration] = useState(0);    // seconds, video only

  // Redux coins.balance defaults to 0 and nothing else guarantees it's been
  // fetched by the time someone lands here — without this, the screen shows
  // a stale/zero balance until after the first successful unlock.
  useEffect(() => {
    dispatch(fetchBalance());
  }, [dispatch]);

  const handlePickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:       ['images', 'videos'],
      quality:          0.85,
      allowsEditing:    false,
      videoMaxDuration: MAX_CLUE_VIDEO_SECONDS,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const kind  = asset.type === 'video' ? 'video' : 'image';
    const durationSecs = asset.duration ? asset.duration / 1000 : 0;

    if (kind === 'video' && durationSecs > MAX_CLUE_VIDEO_SECONDS) {
      showToast({ type: 'warning', message: `Keep the video under ${MAX_CLUE_VIDEO_SECONDS}s.` });
      return;
    }

    setMediaUri(asset.uri);
    setMediaType(kind);
    setMediaDuration(durationSecs);
    if (kind === 'video') {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
        setMediaThumb(uri);
      } catch { setMediaThumb(null); }
    } else {
      setMediaThumb(null);
    }
  }, [showToast]);

  const handleClearMedia = useCallback(() => {
    setMediaUri(null);
    setMediaType(null);
    setMediaThumb(null);
    setMediaDuration(0);
  }, []);

  const handleUnlock = useCallback(async () => {
    if (unlocking || !post?.id) return;
    setUnlocking(true);
    try {
      const token = await AsyncStorage.getItem('token');

      const body = { target_type: 'post', target_id: post.id, payment_method: 'coins' };
      if (mediaUri && mediaType) {
        try {
          body.media_url = await uploadToCloudinary(mediaUri, mediaType, token);
          body.media_type = mediaType;
          if (mediaType === 'video') body.media_duration = mediaDuration;
        } catch {
          showToast({ type: 'error', message: 'Could not upload your clue. Try again.' });
          setUnlocking(false);
          return;
        }
      }

      const res   = await fetch(`${API_BASE_URL}/api/v1/unlock-requests`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      // Already unlocked earlier — skip straight to the existing chat, no
      // waiting screen needed since nothing's pending.
      if (res.ok && data.already_unlocked) {
        navigation.replace('DropChat', { connectionId: data.connection_id });
        return;
      }

      const requestId = res.ok ? data.request_id : data?.detail?.request_id;
      if (requestId) {
        navigation.replace('UnlockWaitingScreen', {
          requestId,
          targetType: 'post',
          targetId: post.id,
          ownerAnonymousName: post.anonymous_name,
          confessionSnippet: post.content,
        });
        return;
      }

      if (res.status === 402) {
        showToast({ type: 'warning', message: 'Not enough coins. Top up your wallet first.' });
      } else {
        const message = typeof data.detail === 'string' ? data.detail : data.detail?.message;
        showToast({ type: 'error', message: message ?? 'Could not send request. Try again.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Try again.' });
    } finally {
      setUnlocking(false);
    }
  }, [unlocking, post?.id, post?.anonymous_name, post?.content, mediaUri, mediaType, mediaDuration, navigation, showToast]);

  const canAfford = coinBalance >= UNLOCK_COST;

  return (
    <SafeAreaView style={s.root}>
      <DropScreenHeader title="Link up" navigation={navigation} />

      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.iconWrap}>
          {post?.avatar_url ? (
            <Image source={{ uri: post.avatar_url }} style={s.avatarImage} />
          ) : (
            <Text style={s.avatarInitial}>
              {post?.anonymous_name?.[0]?.toUpperCase() || 'A'}
            </Text>
          )}
        </View>

        <Text style={s.authorName}>{post?.anonymous_name || 'Anonymous'}</Text>

        {!!post?.content && (
          <Text style={s.confession} numberOfLines={6}>
            &ldquo;{post.content}&rdquo;
          </Text>
        )}

        <Text style={s.copy}>
          Send a request to open a private chat with whoever wrote this.
          They'll need to accept first — you're only charged coins if they do.
        </Text>

        {/* Optional clue — never required to unlock. */}
        <View style={s.mediaSection}>
          {mediaUri ? (
            <View style={s.mediaPreviewWrap}>
              <Image
                source={{ uri: mediaType === 'video' ? (mediaThumb || mediaUri) : mediaUri }}
                style={s.mediaPreview}
              />
              {mediaType === 'video' && (
                <View style={s.mediaPlayBadge}>
                  <VideoIcon size={rs(14)} color="#fff" strokeWidth={2} />
                </View>
              )}
              <TouchableOpacity style={s.mediaRemoveBtn} onPress={handleClearMedia} hitSlop={HIT_SLOP}>
                <X size={rs(14)} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.mediaAddBtn} onPress={handlePickMedia} activeOpacity={0.85} hitSlop={HIT_SLOP}>
              <Camera size={rs(16)} color={T.primary} strokeWidth={2} />
              <Text style={s.mediaAddText}>Attach a photo or short video (optional)</Text>
            </TouchableOpacity>
          )}
          <Text style={s.mediaHint}>
            Gives them a clue who they'd be talking to before they accept. Keep it
            decent — reported content can get your account restricted.
          </Text>
        </View>

        <View style={s.priceRow}>
          <Flame size={rs(16)} color={T.primary} />
          <Text style={s.priceText}>{UNLOCK_COST} coins</Text>
        </View>

        <Text style={s.balanceText}>
          Your balance: {coinBalance} coin{coinBalance === 1 ? '' : 's'}
        </Text>

        {canAfford ? (
          <>
            <TouchableOpacity
              style={s.unlockBtn}
              onPress={handleUnlock}
              disabled={unlocking}
              activeOpacity={0.88}
              hitSlop={HIT_SLOP}
            >
              {unlocking
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.unlockBtnText}>Link up</Text>
              }
            </TouchableOpacity>
            <Text style={s.chargeNote}>
              {UNLOCK_COST} coins — only deducted if they accept your request.
            </Text>
          </>
        ) : (
          <TouchableOpacity
            style={s.topUpBtn}
            onPress={() => navigation.navigate('Coins')}
            activeOpacity={0.88}
            hitSlop={HIT_SLOP}
          >
            <Text style={s.topUpBtnText}>Top up your coins</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.notNowBtn}>
          <Text style={s.notNowText}>Not now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  iconWrap: {
    width: rs(56), height: rs(56), borderRadius: rs(28),
    backgroundColor: T.primaryDim, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg, borderWidth: 1, borderColor: 'rgba(255,99,74,0.25)',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: FONT.lg, fontWeight: '700', color: T.primary },
  authorName: { fontSize: FONT.lg, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold', marginBottom: SPACING.sm },
  confession: {
    fontSize: FONT.md, color: T.textSecondary, textAlign: 'center',
    fontStyle: 'italic', lineHeight: FONT.md * 1.5, marginBottom: SPACING.lg,
  },
  copy: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: FONT.sm * 1.6, marginBottom: SPACING.lg },

  mediaSection: { width: '100%', alignItems: 'center', marginBottom: SPACING.lg },
  mediaAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(8),
    width: '100%', height: rs(48), borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: T.border, borderStyle: 'dashed',
    backgroundColor: T.surfaceAlt,
  },
  mediaAddText: { fontSize: FONT.sm, fontWeight: '600', color: T.text },
  mediaPreviewWrap: {
    width: rs(96), height: rs(96), borderRadius: RADIUS.md, overflow: 'hidden',
    backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border,
  },
  mediaPreview: { width: '100%', height: '100%' },
  mediaPlayBadge: {
    position: 'absolute', bottom: rp(6), left: rp(6),
    width: rs(22), height: rs(22), borderRadius: rs(11),
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  mediaRemoveBtn: {
    position: 'absolute', top: rp(6), right: rp(6),
    width: rs(20), height: rs(20), borderRadius: rs(10),
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  mediaHint: {
    fontSize: rf(10.5), color: T.textMute, textAlign: 'center',
    lineHeight: rf(15), marginTop: rp(8), paddingHorizontal: SPACING.sm,
  },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6), marginBottom: rp(6) },
  priceText: { fontSize: FONT.lg, fontWeight: '700', color: T.text },
  balanceText: { fontSize: FONT.xs, color: T.textMute, marginBottom: SPACING.xl },
  unlockBtn: {
    height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.primary, width: '100%',
    shadowColor: T.primary, shadowOffset: { width: 0, height: rs(8) }, shadowOpacity: 0.45, shadowRadius: rs(20), elevation: 10,
  },
  unlockBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '700' },
  chargeNote: {
    fontSize: FONT.xs, color: T.textMute, textAlign: 'center',
    marginTop: rp(10), lineHeight: rf(17),
  },
  topUpBtn: {
    height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.surfaceAlt, width: '100%', borderWidth: 1, borderColor: T.border,
  },
  topUpBtnText: { color: T.text, fontSize: FONT.md, fontWeight: '700' },
  notNowBtn: { marginTop: SPACING.lg, padding: rp(8) },
  notNowText: { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '500' },
});
