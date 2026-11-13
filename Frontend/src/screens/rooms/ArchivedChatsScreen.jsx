/** Archived chats. Tap to open; long-press to select, then unarchive. Archived chats stay
 * archived when new messages arrive. */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Archive, ArchiveRestore, ArrowLeft } from 'lucide-react-native';
import { rs, rf, rp, FONT, SPACING, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { useToast } from '../../components/ui/Toast';
import { chatsApi } from '../../services/chats';
import { ChatRow } from '../../components/rooms/ChatBits';

export default function ArchivedChatsScreen({ navigation }) {
  const { showToast } = useToast();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState([]);

  const load = useCallback(() => {
    chatsApi.list().then((r) => setItems((r.connections || []).filter((c) => c.archived))).catch(() => setItems([]));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = useCallback((c) => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])), []);
  const unarchive = async () => {
    const ids = [...selected];
    setSelected([]);
    setItems((x) => x.filter((c) => !ids.includes(c.id)));
    const res = await Promise.allSettled(ids.map((id) => chatsApi.prefs(id, { archived: false })));
    if (res.some((r) => r.status === 'rejected')) { showToast({ type: 'error', message: 'Some chats could not be unarchived.' }); load(); }
    else showToast({ type: 'success', message: `${ids.length} ${ids.length === 1 ? 'chat' : 'chats'} unarchived` });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.head}>
        <TouchableOpacity onPress={() => (selected.length ? setSelected([]) : navigation.goBack())} hitSlop={HIT_SLOP} accessibilityLabel="Back">
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.title}>{selected.length ? selected.length : 'Archived'}</Text>
        {selected.length ? (
          <TouchableOpacity onPress={unarchive} hitSlop={HIT_SLOP} accessibilityLabel="Unarchive"><ArchiveRestore size={rs(22)} color={T.text} /></TouchableOpacity>
        ) : null}
      </View>
      {items === null ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ flexGrow: 1 }}
          ListHeaderComponent={items.length ? <Text style={s.note}>They stay here when they message. Long-press to unarchive.</Text> : null}
          ListEmptyComponent={(
            <View style={s.empty}>
              <View style={s.emptyIcon}><Archive size={rs(28)} color={T.primary} /></View>
              <Text style={s.emptyTitle}>No archived chats</Text>
              <Text style={s.emptyText}>Long-press a chat to tuck it away here.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ChatRow
              item={item}
              selected={selected.includes(item.id)}
              onPress={(c) => (selected.length ? toggle(c) : navigation.navigate('DropChat', { connectionId: c.id }))}
              onLongPress={toggle}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  head: { flexDirection: 'row', alignItems: 'center', gap: rp(18), paddingHorizontal: SPACING.md, height: rs(56) },
  title: { flex: 1, fontSize: rf(19), fontFamily: 'DMSans-Bold', color: T.text },
  note: { fontSize: rf(12.5), color: T.textSecondary, textAlign: 'center', paddingHorizontal: SPACING.xl, paddingVertical: rp(10) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  emptyIcon: { width: rs(64), height: rs(64), borderRadius: rs(32), backgroundColor: T.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: rp(14) },
  emptyTitle: { fontSize: rf(18), fontFamily: 'DMSans-Bold', color: T.text, marginBottom: rp(6) },
  emptyText: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: FONT.sm * 1.5 },
});
