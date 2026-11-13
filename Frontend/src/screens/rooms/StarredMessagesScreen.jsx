/** Starred messages, across every chat or one chat (params: { connectionId?, name? }).
 * Tap to open the chat; long-press to unstar. */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowLeft, Mic, Star, Video as VideoIcon,
} from 'lucide-react-native';
import { rs, rf, rp, FONT, SPACING, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { useToast } from '../../components/ui/Toast';
import { chatsApi } from '../../services/chats';
import { chatTime, duration } from '../../components/rooms/ChatBits';

export default function StarredMessagesScreen({ route, navigation }) {
  const { connectionId, name } = route.params || {};
  const { showToast } = useToast();
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    chatsApi.starred(connectionId).then((r) => setItems(r.messages || [])).catch(() => setItems([]));
  }, [connectionId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unstar = (m) => Alert.alert('Unstar this message?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Unstar',
      onPress: async () => {
        setItems((x) => x.filter((i) => i.id !== m.id));
        try { await chatsApi.star(m.connection_id, m.id, false); } catch (e) { showToast({ type: 'error', message: e.message }); load(); }
      },
    },
  ]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.head}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} accessibilityLabel="Back"><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Starred messages</Text>
          {name ? <Text style={s.sub}>{name}</Text> : null}
        </View>
      </View>
      {items === null ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} /> : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: SPACING.md, gap: rp(10), flexGrow: 1 }}
          ListEmptyComponent={(
            <View style={s.empty}>
              <View style={s.emptyIcon}><Star size={rs(28)} color={T.primary} /></View>
              <Text style={s.emptyTitle}>No starred messages</Text>
              <Text style={s.emptyText}>Star a message to keep it here. Only you see them.</Text>
            </View>
          )}
          renderItem={({ item: m }) => (
            <TouchableOpacity
              style={s.item} activeOpacity={0.75}
              onPress={() => navigation.navigate('DropChat', { connectionId: m.connection_id })}
              onLongPress={() => unstar(m)}
            >
              <View style={s.meta}>
                <Text style={s.who} numberOfLines={1}>{m.is_own ? `You ▸ ${m.other_anonymous_name}` : `${m.other_anonymous_name} ▸ You`}</Text>
                <Text style={s.when}>{chatTime(m.created_at)}</Text>
              </View>
              <View style={[s.bubble, m.is_own ? s.own : s.their]}>
                {m.media_type === 'image' && m.media_url ? <Image source={{ uri: m.media_url }} style={s.media} /> : null}
                {m.media_type === 'voice' ? (
                  <View style={s.voice}><Mic size={rs(16)} color={T.primary} /><Text style={s.text}>Voice note {duration(m.duration_seconds)}</Text></View>
                ) : null}
                {m.media_type === 'video' ? <View style={s.voice}><VideoIcon size={rs(16)} color={T.primary} /><Text style={s.text}>Video</Text></View> : null}
                {m.content ? <Text style={s.text}>{m.content}</Text> : null}
                <Star size={rs(11)} color={T.gold} fill={T.gold} style={s.star} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  head: { flexDirection: 'row', alignItems: 'center', gap: rp(18), paddingHorizontal: SPACING.md, height: rs(56) },
  title: { fontSize: rf(19), fontFamily: 'DMSans-Bold', color: T.text },
  sub: { fontSize: rf(12.5), color: T.textSecondary },
  item: { gap: rp(6) },
  meta: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  who: { flex: 1, fontSize: rf(12.5), fontFamily: 'DMSans-SemiBold', color: T.textSecondary },
  when: { fontSize: rf(11.5), color: T.textMuted },
  bubble: { maxWidth: '88%', borderRadius: rs(14), padding: rp(10), paddingRight: rp(24), gap: rp(6) },
  own: { alignSelf: 'flex-end', backgroundColor: T.myBubble || T.primaryTint },
  their: { alignSelf: 'flex-start', backgroundColor: T.theirBubble || T.surface },
  text: { fontSize: FONT.sm, color: T.text, lineHeight: FONT.sm * 1.4 },
  media: { width: rs(200), height: rs(200), borderRadius: rs(10) },
  voice: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  star: { position: 'absolute', right: rp(8), bottom: rp(8) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  emptyIcon: { width: rs(64), height: rs(64), borderRadius: rs(32), backgroundColor: T.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: rp(14) },
  emptyTitle: { fontSize: rf(18), fontFamily: 'DMSans-Bold', color: T.text, marginBottom: rp(6) },
  emptyText: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: FONT.sm * 1.5 },
});
