/** Pick from your chats, messenger-style. Modes:
 *  'open'    tap a chat to open it (New chat), with optional extra rows on top
 *  'call'    voice / video buttons on each row (New call)
 *  'forward' tick up to MAX_FORWARD chats, then send */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Phone, Search, Send, Video } from 'lucide-react-native';
import { rs, rf, rp, FONT, SPACING, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';
import { chatsApi, MAX_FORWARD } from '../../services/chats';
import { Avatar, st as rowSt } from './ChatBits';

export default function PickChatSheet({ visible, mode = 'open', title, subtitle, exclude, extras = [], onClose, onOpen, onCall, onForward }) {
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPicked([]); setQ(''); setBusy(false);
    chatsApi.list().then((r) => setChats(r.connections || [])).catch(() => setChats([]));
  }, [visible]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (chats || [])
      .filter((c) => c.id !== exclude)
      .filter((c) => !term || c.other_anonymous_name?.toLowerCase().includes(term))
      .sort((a, b) => (a.other_anonymous_name || '').localeCompare(b.other_anonymous_name || ''));
  }, [chats, q, exclude]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_FORWARD ? p : [...p, id]));

  const send = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try { await onForward(picked); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.wrap, { paddingTop: insets.top }]}>
        <View style={s.head}>
          <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} accessibilityLabel="Back"><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{title}</Text>
            <Text style={s.sub}>
              {mode === 'forward' ? (picked.length ? `${picked.length} of ${MAX_FORWARD} selected` : `Up to ${MAX_FORWARD} chats`) : subtitle || `${list.length} ${list.length === 1 ? 'chat' : 'chats'}`}
            </Text>
          </View>
        </View>
        <View style={s.search}>
          <Search size={rs(16)} color={T.textMuted} />
          <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="Search name" placeholderTextColor={T.textMuted} />
        </View>
        {chats === null ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} /> : (
          <FlatList
            data={list}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + rs(90) }}
            ListHeaderComponent={extras.length && !q ? (
              <View>
                {extras.map((x) => (
                  <TouchableOpacity key={x.label} style={rowSt.row} onPress={x.onPress} activeOpacity={0.7}>
                    <View style={s.extraIcon}>{x.icon}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={rowSt.name}>{x.label}</Text>
                      {x.hint ? <Text style={s.hint}>{x.hint}</Text> : null}
                    </View>
                  </TouchableOpacity>
                ))}
                {list.length ? <Text style={s.section}>Your chats</Text> : null}
              </View>
            ) : null}
            ListEmptyComponent={<Text style={s.empty}>{q ? `No chats match “${q}”.` : 'No chats yet. Let someone in, or knock on a Room you like.'}</Text>}
            renderItem={({ item }) => {
              const on = picked.includes(item.id);
              return (
                <TouchableOpacity
                  style={[rowSt.row, on && rowSt.rowSelected]}
                  activeOpacity={0.7}
                  onPress={() => (mode === 'forward' ? toggle(item.id) : mode === 'open' ? onOpen(item) : null)}
                  disabled={mode === 'call'}
                >
                  <View>
                    <Avatar name={item.other_anonymous_name} url={item.other_avatar_url} seed={item.other_user_id} size={rs(46)} />
                    {on ? <View style={rowSt.check}><Text style={s.tick}>✓</Text></View> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={rowSt.name} numberOfLines={1}>{item.other_anonymous_name}</Text>
                    <Text style={s.hint} numberOfLines={1}>{item.is_sender ? 'Your guest' : 'You’re inside their Room'}</Text>
                  </View>
                  {mode === 'call' ? (
                    <View style={s.callBtns}>
                      <TouchableOpacity onPress={() => onCall(item, false)} hitSlop={HIT_SLOP} accessibilityLabel={`Voice call ${item.other_anonymous_name}`}>
                        <Phone size={rs(21)} color={T.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => onCall(item, true)} hitSlop={HIT_SLOP} accessibilityLabel={`Video call ${item.other_anonymous_name}`}>
                        <Video size={rs(23)} color={T.primary} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        )}
        {mode === 'forward' && picked.length ? (
          <TouchableOpacity style={[s.fab, { bottom: insets.bottom + rp(20) }]} onPress={send} disabled={busy} accessibilityLabel="Forward">
            {busy ? <ActivityIndicator color="#fff" /> : <Send size={rs(22)} color="#fff" />}
          </TouchableOpacity>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: T.background },
  head: { flexDirection: 'row', alignItems: 'center', gap: rp(16), paddingHorizontal: SPACING.md, paddingVertical: rp(12) },
  title: { fontSize: rf(18), fontFamily: 'DMSans-Bold', color: T.text },
  sub: { fontSize: rf(12), color: T.textSecondary },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: rp(8), marginHorizontal: SPACING.md, marginBottom: rp(6),
    paddingHorizontal: rp(14), height: rs(42), borderRadius: 999, backgroundColor: T.surface,
  },
  input: { flex: 1, color: T.text, fontSize: FONT.sm, padding: 0 },
  extraIcon: { width: rs(46), height: rs(46), borderRadius: rs(23), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: rf(12.5), fontFamily: 'DMSans-SemiBold', color: T.textSecondary, paddingHorizontal: SPACING.md, paddingTop: rp(10), paddingBottom: rp(4) },
  hint: { fontSize: rf(12.5), color: T.textSecondary, marginTop: rp(2) },
  empty: { textAlign: 'center', color: T.textSecondary, fontSize: FONT.sm, padding: SPACING.xl },
  tick: { color: '#fff', fontSize: rf(11), fontWeight: '900' },
  callBtns: { flexDirection: 'row', alignItems: 'center', gap: rp(22), paddingRight: rp(4) },
  fab: {
    position: 'absolute', right: SPACING.md + rp(4), width: rs(56), height: rs(56), borderRadius: rs(18),
    backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', elevation: 6,
  },
});
