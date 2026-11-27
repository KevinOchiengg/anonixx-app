/** A feed ad that scrolls like a drop (web twin: Web/components/AdDrop.tsx): full-screen media,
 * an "Ad" label, the caption, one button. Taps go through /ads/{id}/go so they're counted;
 * views, likes and hides are counted too. */
import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EyeOff, Heart, Megaphone } from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';
import { getDeviceId } from '../../utils/deviceId';
import { splitHook } from '../../utils/captionHook';
import { T } from '../../utils/theme';
import { rf, rp, rs, HIT_SLOP } from '../../utils/responsive';

export async function adHeaders() {
  const [token, device] = await Promise.all([AsyncStorage.getItem('token'), getDeviceId().catch(() => null)]);
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(device ? { 'X-Device-Id': device } : {}) };
}

async function track(id, type) {
  try {
    await fetch(`${API_BASE_URL}/api/v1/ads/${id}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await adHeaders()) },
      body: JSON.stringify({ type }),
    });
  } catch { /* offline: the count is skipped */ }
}

async function open(ad) {
  if (/^https?:\/\//.test(ad.link_url)) {
    const device = await getDeviceId().catch(() => '');
    Linking.openURL(`${API_BASE_URL}/api/v1/ads/${ad.id}/go?v=${encodeURIComponent(device || '')}`).catch(() => {});
    return;
  }
  track(ad.id, 'tap');
  Linking.openURL(ad.link_url).catch(() => {});
}

function AdVideo({ uri, playing }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; });
  useEffect(() => { if (playing) player.play(); else player.pause(); }, [playing, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

export default function AdDrop({ ad, isActive, onHide, bottomInset = 0, topInset = 0 }) {
  const [liked, setLiked] = useState(false);
  const counted = useRef(false);
  const parts = splitHook(ad.title);

  useEffect(() => {
    if (isActive && !counted.current) { counted.current = true; track(ad.id, 'seen'); }
  }, [isActive, ad.id]);

  const like = () => setLiked((was) => { track(ad.id, was ? 'unlike' : 'like'); return !was; });
  const cover = ad.media_type === 'video' ? ad.cover_url : ad.media_url;

  return (
    <View style={st.slide} accessibilityLabel="Ad">
      {ad.media_type === 'video' && ad.media_url ? (
        <AdVideo uri={ad.media_url} playing={isActive} />
      ) : cover ? (
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(5,7,12,0.85)']} style={st.shade} />

      <View style={[st.tag, { top: topInset + rp(8) }]}>
        <Megaphone size={rs(13)} color="#fff" strokeWidth={2} />
        <Text style={st.tagText}>AD</Text>
      </View>

      <View style={[st.rail, { bottom: bottomInset + rs(150) }]}>
        <TouchableOpacity style={st.railBtn} onPress={like} hitSlop={HIT_SLOP} accessibilityLabel="Like">
          <Heart size={rs(22)} color={liked ? T.primary : '#fff'} fill={liked ? T.primary : 'none'} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={st.railBtn} onPress={() => { track(ad.id, 'hide'); onHide?.(ad.id); }} hitSlop={HIT_SLOP} accessibilityLabel="Not interested">
          <EyeOff size={rs(22)} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={[st.foot, { bottom: bottomInset + rs(40) }]}>
        <Text style={st.cap} numberOfLines={5}>
          {parts ? <><Text style={st.hook}>{parts.hook}{'\n'}</Text>{parts.rest}</> : ad.title}
        </Text>
        <TouchableOpacity style={st.btn} onPress={() => open(ad)} activeOpacity={0.85}>
          <Text style={st.btnText}>{ad.cta || 'Check it out'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  slide: { flex: 1, backgroundColor: T.background, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  tag: { position: 'absolute', left: rp(16), flexDirection: 'row', alignItems: 'center', gap: rp(6), paddingHorizontal: rp(11), paddingVertical: rp(5), borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  tagText: { color: '#fff', fontSize: rf(12), fontWeight: '800', letterSpacing: 0.8 },
  rail: { position: 'absolute', right: rp(12), gap: rp(14) },
  railBtn: { width: rs(46), height: rs(46), borderRadius: rs(23), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  foot: { position: 'absolute', left: rp(16), right: rs(72), gap: rp(12) },
  cap: { color: '#fff', fontSize: rf(15), lineHeight: rf(21) },
  hook: { fontFamily: 'PlayfairDisplay-Italic', fontSize: rf(18), lineHeight: rf(24) },
  btn: { alignSelf: 'flex-start', paddingHorizontal: rp(22), paddingVertical: rp(12), borderRadius: 999, backgroundColor: T.primary },
  btnText: { color: '#fff', fontSize: rf(15), fontWeight: '800' },
});
