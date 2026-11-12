/** The Rooms tab, built like a messenger home. Four swipeable tabs: Chats (everyone you're
 * connected with), Updates (who's live + your Room), Knocks (who's at your door) and Calls
 * (call log). Long-press chats to pin, mute or archive them. Accepts { section } to open a tab
 * (knocks / connections|chats / live|myroom|updates / calls). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, BackHandler, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  Archive, ArrowLeft, BellOff, Bell, DoorOpen, MessageSquarePlus, MoreVertical, Phone, Pin, PinOff,
  Radio, Search, Star, Video, X, Compass, Settings, Menu as MenuIcon, Trash2, Home,
} from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';
import HamburgerMenu from '../../components/ui/HamburgerMenu';
import { useUnread } from '../../context/UnreadContext';
import T from '../../utils/theme';
import UnlockRequestsScreen from '../drops/UnlockRequestsScreen';
import RoomSettingsSheet from '../../components/rooms/RoomSettingsSheet';
import UpdatesPanel from '../../components/rooms/UpdatesPanel';
import CallsPanel from '../../components/rooms/CallsPanel';
import PickChatSheet from '../../components/rooms/PickChatSheet';
import { ChatRow, st as rowSt } from '../../components/rooms/ChatBits';
import { chatsApi, MUTE_OPTIONS } from '../../services/chats';
import { callsApi, callParams } from '../../services/calls';

const TABS = [['chats', 'Chats'], ['updates', 'Updates'], ['knocks', 'Knocks'], ['calls', 'Calls']];
const SECTION_TO_TAB = { knocks: 'knocks', connections: 'chats', chats: 'chats', live: 'updates', myroom: 'updates', updates: 'updates', calls: 'calls' };
const FILTERS = [['all', 'All'], ['unread', 'Unread'], ['guests', 'Guests'], ['rooms', 'Their Rooms']];

export default function MessagesScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { showToast } = useToast();
  const { refreshUnread } = useUnread();
  const { socketService } = useSocket();

  const startTab = SECTION_TO_TAB[route?.params?.section] || 'chats';
  const [tab, setTab] = useState(startTab);
  const [visited, setVisited] = useState(() => new Set([startTab]));
  const pager = useRef(null);
  const scrollX = useRef(new Animated.Value(TABS.findIndex(([k]) => k === startTab) * width)).current;

  const [chats, setChats] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [knocks, setKnocks] = useState([]);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [typingIds, setTypingIds] = useState(new Set());
  const [filter, setFilter] = useState('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hamburger, setHamburger] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [picker, setPicker] = useState(null); // 'chat' | 'call'
  const [missed, setMissed] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const callsRef = useRef(null);
  const updatesRef = useRef(null);

  const goTab = useCallback((key, animated = true) => {
    const i = TABS.findIndex(([k]) => k === key);
    setTab(key);
    setVisited((v) => (v.has(key) ? v : new Set(v).add(key)));
    pager.current?.scrollTo({ x: i * width, animated });
  }, [width]);

  useEffect(() => {
    const t = SECTION_TO_TAB[route?.params?.section];
    if (t) goTab(t, false);
  }, [route?.params?.section]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back: leave selection or search first, like any messenger.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selected.length) { setSelected([]); return true; }
      if (searching) { setSearching(false); setQuery(''); return true; }
      return false;
    });
    return () => sub.remove();
  }, [selected.length, searching]));

  // ── Data ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) { setChats([]); return; }
      const [list, k] = await Promise.all([
        chatsApi.list(),
        fetch(`${API_BASE_URL}/api/v1/unlock-requests/incoming`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ]);
      const rows = list.connections || [];
      setChats(rows);
      setKnocks(k?.requests || []);
      setOnlineIds(new Set(rows.filter((c) => c.other_is_online).map((c) => c.other_user_id)));
      refreshUnread();
    } catch {
      setChats((c) => c || []);
      showToast({ type: 'error', message: 'Connection error. Pull down to retry.' });
    } finally {
      setRefreshing(false);
    }
  }, [refreshUnread, showToast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live list: presence, typing, new messages and knocks.
  useEffect(() => {
    if (!socketService) return undefined;
    let pending = null;
    const soon = () => { clearTimeout(pending); pending = setTimeout(load, 400); };
    const timers = {};
    const onOnline = ({ userId }) => setOnlineIds((p) => new Set(p).add(userId));
    const onOffline = ({ userId }) => setOnlineIds((p) => { const s = new Set(p); s.delete(userId); return s; });
    const onTyping = ({ userId }) => {
      if (!userId) return;
      setTypingIds((p) => new Set(p).add(userId));
      clearTimeout(timers[userId]);
      timers[userId] = setTimeout(() => setTypingIds((p) => { const s = new Set(p); s.delete(userId); return s; }), 3000);
    };
    const events = [['user_online', onOnline], ['user_offline', onOffline], ['user_typing', onTyping],
      ['new_message', soon], ['messages_seen', soon], ['message_deleted', soon],
      ['unlock_request_received', soon], ['unlock_request_cancelled', soon]];
    events.forEach(([e, fn]) => socketService.on?.(e, fn));
    return () => {
      events.forEach(([e, fn]) => socketService.off?.(e, fn));
      clearTimeout(pending);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [socketService, load]);

  // ── Derived ─────────────────────────────────────────────────
  const inbox = useMemo(() => (chats || []).filter((c) => !c.archived), [chats]);
  const archived = useMemo(() => (chats || []).filter((c) => c.archived), [chats]);
  const unreadChats = inbox.filter((c) => c.unread_count > 0).length;
  const archivedUnread = archived.reduce((n, c) => n + (c.unread_count > 0 ? 1 : 0), 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? chats || [] : inbox;
    return base.filter((c) => {
      if (filter === 'unread' && !(c.unread_count > 0)) return false;
      if (filter === 'guests' && !c.is_sender) return false;
      if (filter === 'rooms' && c.is_sender) return false;
      if (!q) return true;
      return c.other_anonymous_name?.toLowerCase().includes(q)
        || c.last_message?.toLowerCase().includes(q)
        || c.confession?.toLowerCase().includes(q);
    });
  }, [chats, inbox, filter, query]);

  // ── Selection (long-press) ──────────────────────────────────
  const selecting = selected.length > 0;
  const selRows = (chats || []).filter((c) => selected.includes(c.id));
  const toggleSelect = useCallback((item) => setSelected((s) => (s.includes(item.id) ? s.filter((x) => x !== item.id) : [...s, item.id])), []);
  const clearSelection = useCallback(() => setSelected([]), []);

  const applyPrefs = useCallback(async (body, done) => {
    const ids = [...selected];
    clearSelection();
    const results = await Promise.allSettled(ids.map((id) => chatsApi.prefs(id, body)));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) showToast({ type: 'info', message: failed.reason?.message || 'Some chats could not be updated.' });
    else if (done) showToast({ type: 'success', message: done(ids.length) });
    load();
  }, [selected, clearSelection, showToast, load]);

  const allPinned = selRows.length > 0 && selRows.every((c) => c.pinned);
  const allMuted = selRows.length > 0 && selRows.every((c) => c.muted_until);
  const onPin = () => applyPrefs({ pinned: !allPinned });
  const onArchive = () => applyPrefs({ archived: true }, (n) => `${n} ${n === 1 ? 'chat' : 'chats'} archived`);
  const onMute = () => {
    if (allMuted) { applyPrefs({ mute: 'off' }); return; }
    Alert.alert('Mute notifications', 'Messages still arrive; you just won’t get a notification.', [
      ...MUTE_OPTIONS.map(([v, label]) => ({ text: label, onPress: () => applyPrefs({ mute: v }) })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Actions ─────────────────────────────────────────────────
  const openChat = useCallback((item) => {
    if (selecting) { toggleSelect(item); return; }
    navigation.navigate('DropChat', { connectionId: item.id });
  }, [navigation, selecting, toggleSelect]);

  const startCall = useCallback(async (item, video) => {
    setPicker(null);
    try {
      const d = await callsApi.direct(item.id, video);
      navigation.navigate('DropCall', callParams(d, { other: { name: item.other_anonymous_name, avatar_url: item.other_avatar_url, ...(d.other || {}) } }));
    } catch (e) {
      showToast({ type: e.status === 409 || e.status === 403 ? 'info' : 'error', message: e.message });
    }
  }, [navigation, showToast]);

  const onFab = () => {
    if (tab === 'chats') setPicker('chat');
    else if (tab === 'calls') setPicker('call');
    else if (tab === 'updates') updatesRef.current?.goLive();
  };

  const menuItems = [
    tab === 'calls' && { icon: Trash2, label: 'Clear call log', onPress: () => Alert.alert('Clear call log?', 'This only clears it for you.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => callsRef.current?.clear() }]) },
    tab === 'updates' && { icon: Radio, label: 'Go live', onPress: () => updatesRef.current?.goLive() },
    { icon: Star, label: 'Starred messages', onPress: () => navigation.navigate('StarredMessages') },
    { icon: Archive, label: `Archived${archived.length ? ` (${archived.length})` : ''}`, onPress: () => navigation.navigate('ArchivedChats') },
    { icon: Home, label: 'My Room', onPress: () => goTab('updates') },
    { icon: Settings, label: 'Room settings', onPress: () => setSettingsOpen(true) },
    { icon: MenuIcon, label: 'More of Anonixx', onPress: () => setHamburger(true) },
  ].filter(Boolean);

  // ── Pieces ──────────────────────────────────────────────────
  const header = selecting ? (
    <View style={s.header}>
      <TouchableOpacity onPress={clearSelection} hitSlop={HIT_SLOP} accessibilityLabel="Cancel selection"><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
      <Text style={[s.title, s.selTitle]}>{selected.length}</Text>
      <View style={s.headerIcons}>
        <TouchableOpacity onPress={onPin} hitSlop={HIT_SLOP} accessibilityLabel={allPinned ? 'Unpin' : 'Pin'}>
          {allPinned ? <PinOff size={rs(21)} color={T.text} /> : <Pin size={rs(21)} color={T.text} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={onMute} hitSlop={HIT_SLOP} accessibilityLabel={allMuted ? 'Unmute' : 'Mute'}>
          {allMuted ? <Bell size={rs(21)} color={T.text} /> : <BellOff size={rs(21)} color={T.text} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={onArchive} hitSlop={HIT_SLOP} accessibilityLabel="Archive"><Archive size={rs(21)} color={T.text} /></TouchableOpacity>
      </View>
    </View>
  ) : searching ? (
    <View style={s.header}>
      <TouchableOpacity onPress={() => { setSearching(false); setQuery(''); }} hitSlop={HIT_SLOP} accessibilityLabel="Close search"><ArrowLeft size={rs(22)} color={T.text} /></TouchableOpacity>
      <TextInput
        style={s.searchInput} value={query} onChangeText={setQuery} autoFocus
        placeholder="Search chats…" placeholderTextColor={T.textMuted} returnKeyType="search"
      />
      {query ? <TouchableOpacity onPress={() => setQuery('')} hitSlop={HIT_SLOP}><X size={rs(18)} color={T.textSecondary} /></TouchableOpacity> : null}
    </View>
  ) : (
    <View style={s.header}>
      <Text style={s.title}>Rooms</Text>
      <View style={s.headerIcons}>
        <TouchableOpacity onPress={() => { setSearching(true); goTab('chats'); }} hitSlop={HIT_SLOP} accessibilityLabel="Search chats">
          <Search size={rs(21)} color={T.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={HIT_SLOP} accessibilityLabel="More options">
          <MoreVertical size={rs(21)} color={T.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const counts = { chats: unreadChats, updates: liveCount, knocks: knocks.length, calls: missed };
  const tabW = width / TABS.length;
  const tabBar = !searching && !selecting ? (
    <View style={s.tabs} accessibilityRole="tablist">
      {TABS.map(([key, label]) => {
        const on = tab === key;
        const n = counts[key];
        return (
          <TouchableOpacity key={key} style={s.tab} onPress={() => goTab(key)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.tabText, on && s.tabTextOn]}>{label}</Text>
            {n > 0 ? (
              key === 'updates' ? <View style={s.tabDot} /> : (
                <View style={[s.tabBadge, key === 'knocks' && s.tabBadgeHot]}><Text style={s.tabBadgeText}>{n > 99 ? '99+' : n}</Text></View>
              )
            ) : null}
          </TouchableOpacity>
        );
      })}
      <Animated.View style={[s.indicator, { width: tabW, transform: [{ translateX: Animated.divide(scrollX, TABS.length) }] }]} />
    </View>
  ) : null;

  const chatsHeader = (
    <View>
      {!query ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {FILTERS.map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[s.chip, filter === k && s.chipOn]} activeOpacity={0.8}>
              <Text style={[s.chipText, filter === k && s.chipTextOn]}>{label}{k === 'unread' && unreadChats ? ` ${unreadChats}` : ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      {!query && archived.length > 0 ? (
        <TouchableOpacity style={s.utilRow} onPress={() => navigation.navigate('ArchivedChats')} activeOpacity={0.7}>
          <View style={s.utilIcon}><Archive size={rs(19)} color={T.primary} /></View>
          <Text style={s.utilText}>Archived</Text>
          {archivedUnread ? <Text style={s.utilCount}>{archivedUnread}</Text> : null}
        </TouchableOpacity>
      ) : null}
      {!query && knocks.length > 0 ? (
        <TouchableOpacity style={s.utilRow} onPress={() => goTab('knocks')} activeOpacity={0.7}>
          <View style={[s.utilIcon, s.utilIconHot]}><DoorOpen size={rs(19)} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.utilText}>{knocks.length === 1 ? '1 person is knocking' : `${knocks.length} people are knocking`}</Text>
            <Text style={s.utilSub} numberOfLines={1}>{knocks.slice(0, 3).map((k) => k.requester_anonymous_name || 'Someone').join(', ')} · tap to answer</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const emptyChats = chats === null ? (
    <ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} />
  ) : query ? (
    <Text style={s.emptyText}>No chats match “{query.trim()}”.</Text>
  ) : filter !== 'all' ? (
    <Text style={s.emptyText}>{filter === 'unread' ? 'You’re all caught up.' : filter === 'guests' ? 'Nobody you’ve let in yet.' : 'You’re not inside anyone’s Room yet.'}</Text>
  ) : (
    <View style={s.empty}>
      <View style={s.emptyIcon}><MessageSquarePlus size={rs(28)} color={T.primary} /></View>
      <Text style={s.emptyTitle}>No chats yet</Text>
      <Text style={s.emptyText}>Let someone in from Knocks, or knock on a Room you like. Every conversation lives here.</Text>
      <TouchableOpacity style={s.emptyBtn} onPress={() => (knocks.length ? goTab('knocks') : navigation.navigate('Feed'))}>
        <Text style={s.emptyBtnText}>{knocks.length ? `Answer ${knocks.length} at your door` : 'Find someone on the feed'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('DemoChat')} style={{ marginTop: rp(14) }}>
        <Text style={s.link}>See what a Room looks like inside</Text>
      </TouchableOpacity>
    </View>
  );

  const pages = {
    chats: (
      <FlatList
        data={chats === null ? [] : visible}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={chatsHeader}
        ListEmptyComponent={emptyChats}
        renderItem={({ item }) => (
          <ChatRow
            item={item}
            online={onlineIds.has(item.other_user_id)}
            typing={typingIds.has(item.other_user_id)}
            selected={selected.includes(item.id)}
            onPress={openChat}
            onLongPress={toggleSelect}
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: rs(110) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.primary} colors={[T.primary]} />}
        ListFooterComponent={chats && inbox.length ? (
          <Text style={s.footer}>Only the two of you can read a chat. Calls and chats are separate: ending one never ends the other.</Text>
        ) : null}
      />
    ),
    updates: <UpdatesPanel ref={updatesRef} navigation={navigation} onLiveCount={setLiveCount} />,
    knocks: <UnlockRequestsScreen embedded navigation={navigation} />,
    calls: <CallsPanel ref={callsRef} navigation={navigation} active={tab === 'calls'} onMissedCount={setMissed} />,
  };

  const FabIcon = tab === 'chats' ? MessageSquarePlus : tab === 'calls' ? Phone : tab === 'updates' ? Video : null;

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      {header}
      {tabBar}
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        scrollEnabled={!selecting && !searching}
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: TABS.findIndex(([k]) => k === startTab) * width, y: 0 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const key = TABS[Math.round(e.nativeEvent.contentOffset.x / width)]?.[0];
          if (key && key !== tab) { setTab(key); setVisited((v) => (v.has(key) ? v : new Set(v).add(key))); }
        }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        {TABS.map(([key]) => (
          <View key={key} style={{ width, flex: 1 }}>
            {visited.has(key) || key === 'calls' ? pages[key] : null}
          </View>
        ))}
      </Animated.ScrollView>

      {FabIcon && !selecting && !searching ? (
        <TouchableOpacity style={s.fab} onPress={onFab} activeOpacity={0.85}
          accessibilityLabel={tab === 'chats' ? 'New chat' : tab === 'calls' ? 'New call' : 'Go live'}>
          <FabIcon size={rs(23)} color="#fff" strokeWidth={2.2} />
        </TouchableOpacity>
      ) : null}

      {/* ⋮ menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
        <View style={[s.menu, { top: insets.top + rp(8) }]}>
          {menuItems.map(({ icon: Icon, label, onPress }) => (
            <TouchableOpacity key={label} style={s.menuItem} onPress={() => { setMenuOpen(false); onPress(); }}>
              <Icon size={rs(17)} color={T.textSecondary} />
              <Text style={s.menuText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      <PickChatSheet
        visible={picker === 'chat'}
        mode="open"
        title="New chat"
        onClose={() => setPicker(null)}
        onOpen={(c) => { setPicker(null); navigation.navigate('DropChat', { connectionId: c.id }); }}
        extras={[
          { label: 'Find someone new', hint: 'Browse the feed and knock on a Room', icon: <Compass size={rs(20)} color="#fff" />, onPress: () => { setPicker(null); navigation.navigate('Feed'); } },
          { label: 'Go live', hint: 'Open a voice or video session in your Room', icon: <Radio size={rs(20)} color="#fff" />, onPress: () => { setPicker(null); goTab('updates'); setTimeout(() => updatesRef.current?.goLive(), 350); } },
        ]}
      />
      <PickChatSheet
        visible={picker === 'call'}
        mode="call"
        title="New call"
        subtitle="Voice or video, free, with anyone you're connected with"
        onClose={() => setPicker(null)}
        onCall={startCall}
      />

      <HamburgerMenu visible={hamburger} onClose={() => setHamburger(false)} navigation={navigation} />
      <RoomSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} navigation={navigation} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: rp(18), paddingHorizontal: SPACING.md, height: rs(56) },
  title: { flex: 1, fontSize: rf(24), fontFamily: 'DMSans-Bold', color: T.primary, letterSpacing: -0.4 },
  selTitle: { color: T.text, fontSize: rf(20) },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: rp(22) },
  searchInput: { flex: 1, fontSize: FONT.md, color: T.text, padding: 0 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border },
  tab: { flex: 1, height: rs(44), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(5) },
  tabText: { fontSize: rf(13.5), fontFamily: 'DMSans-SemiBold', color: T.textSecondary },
  tabTextOn: { color: T.primary, fontFamily: 'DMSans-Bold' },
  tabBadge: { minWidth: rs(18), height: rs(18), borderRadius: rs(9), paddingHorizontal: rp(4), backgroundColor: T.textMuted, alignItems: 'center', justifyContent: 'center' },
  tabBadgeHot: { backgroundColor: T.primary },
  tabBadgeText: { fontSize: rf(10), fontWeight: '800', color: '#fff' },
  tabDot: { width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: T.primary },
  indicator: { position: 'absolute', bottom: -1, left: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: T.primary },
  chips: { gap: rp(8), paddingHorizontal: SPACING.md, paddingTop: rp(10), paddingBottom: rp(6) },
  chip: { paddingHorizontal: rp(14), height: rs(32), borderRadius: 999, backgroundColor: T.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: T.primaryTint, borderWidth: 1, borderColor: T.primaryBorder },
  chipText: { fontSize: rf(13), fontFamily: 'DMSans-SemiBold', color: T.textSecondary },
  chipTextOn: { color: T.primary },
  utilRow: { ...rowSt.row, gap: rp(14) },
  utilIcon: { width: rs(50), height: rs(50), alignItems: 'center', justifyContent: 'center' },
  utilIconHot: { borderRadius: rs(25), backgroundColor: T.primary },
  utilText: { flex: 1, fontSize: FONT.md, fontFamily: 'DMSans-SemiBold', color: T.text },
  utilSub: { fontSize: rf(12.5), color: T.textSecondary, marginTop: rp(2) },
  utilCount: { fontSize: rf(12), fontFamily: 'DMSans-Bold', color: T.primary },
  empty: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: rp(40) },
  emptyIcon: { width: rs(64), height: rs(64), borderRadius: rs(32), backgroundColor: T.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: rp(14) },
  emptyTitle: { fontSize: rf(18), fontFamily: 'DMSans-Bold', color: T.text, marginBottom: rp(6) },
  emptyText: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: FONT.sm * 1.5, padding: SPACING.md },
  emptyBtn: { marginTop: rp(10), height: rs(44), paddingHorizontal: rp(20), borderRadius: 999, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: '#fff' },
  link: { color: T.primary, fontFamily: 'DMSans-SemiBold', fontSize: rf(13) },
  footer: { fontSize: rf(11.5), color: T.textMuted, textAlign: 'center', paddingHorizontal: SPACING.xl, paddingTop: rp(18) },
  fab: {
    position: 'absolute', right: SPACING.md, bottom: rp(18), width: rs(56), height: rs(56), borderRadius: rs(18),
    backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  menu: {
    position: 'absolute', right: rp(10), minWidth: rs(210), paddingVertical: rp(6), borderRadius: rs(14),
    backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border, elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: rp(12), paddingHorizontal: rp(16), height: rs(46) },
  menuText: { fontSize: FONT.sm, color: T.text, fontFamily: 'DMSans-Medium' },
});
