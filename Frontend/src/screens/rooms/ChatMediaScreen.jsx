/** Media, voice and links shared in one chat (params: { connectionId, name }). Photos and
 * videos in a grid (tap to view), voice notes with playback, links that open. View-once media
 * never appears here. */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ArrowLeft, Link as LinkIcon, Play, X } from 'lucide-react-native';
import { rs, rf, rp, FONT, SPACING, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { chatsApi } from '../../services/chats';
import { chatTime } from '../../components/rooms/ChatBits';
import VoiceWaveform from '../../components/common/VoiceWaveform';

const TABS = [['media', 'Media'], ['voice', 'Voice'], ['links', 'Links']];
function poster(url) { return url ? url.replace(/\.\w+(\?.*)?$/, '.jpg$1') : url; }

function Viewer({ item, onClose }) {
  const player = useVideoPlayer(item.media_type === 'video' ? { uri: item.media_url } : null, (p) => { p.loop = true; p.play(); });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.viewer}>
        {item.media_type === 'video'
          ? <VideoView player={player} style={s.viewerMedia} contentFit="contain" nativeControls />
          : <Image source={{ uri: item.media_url }} style={s.viewerMedia} resizeMode="contain" />}
        <TouchableOpacity style={s.viewerClose} onPress={onClose} hitSlop={HIT_SLOP} accessibilityLabel="Close"><X size={rs(22)} color="#fff" /></TouchableOpacity>
      </View>
    </Modal>
  );
}

export default function ChatMediaScreen({ route, navigation }) {
  const { connectionId, name } = route.params;
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState('media');
  const [data, setData] = useState({});
  const [counts, setCounts] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async (kind) => {
    try {
      const r = await chatsApi.media(connectionId, kind);
      setData((d) => ({ ...d, [kind]: r.items || [] }));
      setCounts(r.counts);
    } catch {
      setData((d) => ({ ...d, [kind]: [] }));
    }
  }, [connectionId]);
  useEffect(() => { if (!data[tab]) load(tab); }, [tab, data, load]);

  const items = data[tab];
  const cell = (width - rp(4) * 4) / 3;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.head}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back"><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{name || 'Shared'}</Text>
      </View>
      <View style={s.tabs}>
        {TABS.map(([k, label]) => (
          <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{label}{counts?.[k] ? ` ${counts[k]}` : ''}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!items ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} /> : (
        <FlatList
          key={tab}
          data={items}
          keyExtractor={(m) => m.id}
          numColumns={tab === 'media' ? 3 : 1}
          contentContainerStyle={tab === 'media' ? { padding: rp(4), gap: rp(4) } : { padding: SPACING.md, gap: rp(12) }}
          columnWrapperStyle={tab === 'media' ? { gap: rp(4) } : undefined}
          ListEmptyComponent={<Text style={s.empty}>{tab === 'media' ? 'No photos or videos yet.' : tab === 'voice' ? 'No voice notes yet.' : 'No links yet.'}</Text>}
          renderItem={({ item: m }) => {
            if (tab === 'media') {
              return (
                <TouchableOpacity onPress={() => setOpen(m)} activeOpacity={0.85}>
                  <Image source={{ uri: m.media_type === 'video' ? poster(m.media_url) : m.media_url }} style={{ width: cell, height: cell, backgroundColor: T.surfaceAlt }} />
                  {m.media_type === 'video' ? <View style={s.play}><Play size={rs(14)} color="#fff" fill="#fff" /></View> : null}
                </TouchableOpacity>
              );
            }
            if (tab === 'voice') {
              return (
                <View style={s.card}>
                  <Text style={s.meta}>{m.is_own ? 'You' : name} · {chatTime(m.created_at)}</Text>
                  <VoiceWaveform uri={m.media_url} durationSeconds={m.duration_seconds} compact speed />
                </View>
              );
            }
            return (
              <View style={s.card}>
                <Text style={s.meta}>{m.is_own ? 'You' : name} · {chatTime(m.created_at)}</Text>
                {(m.links || []).map((u) => (
                  <TouchableOpacity key={u} style={s.link} onPress={() => Linking.openURL(u).catch(() => {})}>
                    <LinkIcon size={rs(16)} color={T.primary} />
                    <Text style={s.linkText} numberOfLines={2}>{u}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={s.linkMsg} numberOfLines={3}>{m.content}</Text>
              </View>
            );
          }}
        />
      )}
      {open ? <Viewer item={open} onClose={() => setOpen(null)} /> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  head: { flexDirection: 'row', alignItems: 'center', gap: rp(18), paddingHorizontal: SPACING.md, height: rs(56) },
  title: { flex: 1, fontSize: rf(19), fontFamily: 'DMSans-Bold', color: T.text },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border },
  tab: { flex: 1, height: rs(44), alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: T.primary },
  tabText: { fontSize: rf(13.5), fontFamily: 'DMSans-SemiBold', color: T.textSecondary },
  tabTextOn: { color: T.primary, fontFamily: 'DMSans-Bold' },
  empty: { textAlign: 'center', color: T.textSecondary, fontSize: FONT.sm, padding: SPACING.xl, width: '100%' },
  play: { position: 'absolute', left: rp(6), bottom: rp(6) },
  card: { padding: SPACING.md, borderRadius: rs(14), backgroundColor: T.surface, gap: rp(8) },
  meta: { fontSize: rf(12), color: T.textSecondary },
  link: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  linkText: { flex: 1, color: T.primary, fontSize: FONT.sm, textDecorationLine: 'underline' },
  linkMsg: { fontSize: rf(13), color: T.text },
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerMedia: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: rp(50), right: rp(20), width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
