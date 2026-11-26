import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AtSign, Bell, Coins, DoorOpen, Gift, Heart, MessageCircle, Radio, Sparkles,
} from 'lucide-react-native';
import Avatar from '../../components/common/Avatar';
import { useUnread } from '../../context/UnreadContext';
import { ACTIVITY_FILTERS, activityApi, openActivity, sectionOf, timeAgo } from '../../utils/activity';
import { rs, rf, rp } from '../../utils/responsive';
import T from '../../utils/theme';

const BLUE = '#3b82f6';

const KIND_ICON = {
  like: { Icon: Heart, color: T.primary },
  comment_like: { Icon: Heart, color: T.primary },
  comment: { Icon: MessageCircle, color: BLUE },
  reply: { Icon: MessageCircle, color: BLUE },
  mention: { Icon: AtSign, color: T.violet },
  linkup_in: { Icon: DoorOpen, color: T.primary },
  linkup_request: { Icon: DoorOpen, color: T.primary },
  linkup_accepted: { Icon: DoorOpen, color: T.primary },
  linkup_mutual: { Icon: Sparkles, color: T.primary },
  linkup_short: { Icon: Coins, color: T.gold },
  linkup_declined: { Icon: DoorOpen, color: T.textMuted },
  coins: { Icon: Coins, color: T.gold },
  gift: { Icon: Gift, color: T.violet },
  live_join: { Icon: Radio, color: T.primary },
  live_started: { Icon: Radio, color: T.primary },
  live_payout: { Icon: Coins, color: T.gold },
};
const FALLBACK_ICON = { Icon: Bell, color: T.primary };
const COIN_KINDS = new Set(['gift', 'live_join', 'coins']);

const iconFor = (kind) => KIND_ICON[kind] || FALLBACK_ICON;

function Who({ item }) {
  const [first, second] = item.actors;
  const others = item.count - 1;
  if (others <= 0) return <Text style={s.bold}>{first.name}</Text>;
  if (others === 1 && second) {
    return <><Text style={s.bold}>{first.name}</Text> and <Text style={s.bold}>{second.name}</Text></>;
  }
  return <><Text style={s.bold}>{first.name}</Text> and {others} others</>;
}

const RowAvatar = React.memo(({ item }) => {
  const { Icon, color } = iconFor(item.kind);
  const [first, second] = item.actors;
  if (!first) {
    return (
      <View style={[s.tile, { backgroundColor: `${color}24` }]}>
        <Icon size={rs(22)} color={color} strokeWidth={2} />
      </View>
    );
  }
  return (
    <View style={s.ava}>
      {second ? (
        <>
          <View style={s.backFace}>
            <Avatar uri={second.avatar_url} seed={second.id} name={second.name} gender={second.gender} size={rs(36)} />
          </View>
          <View style={s.frontFace}>
            <Avatar uri={first.avatar_url} seed={first.id} name={first.name} gender={first.gender} size={rs(36)} />
          </View>
        </>
      ) : (
        <Avatar uri={first.avatar_url} seed={first.id} name={first.name} gender={first.gender} size={rs(48)} />
      )}
      <View style={[s.kind, { backgroundColor: color }]}>
        <Icon size={rs(11)} color={color === T.gold ? '#1a1205' : '#fff'} strokeWidth={2.6} />
      </View>
    </View>
  );
});

function Thumb({ item }) {
  const d = item.drop;
  if (d?.image) return <Image source={{ uri: d.image }} style={s.thumb} />;
  if (d?.snippet) {
    return (
      <View style={[s.thumb, s.thumbText]}>
        <Text style={s.thumbTextInner} numberOfLines={6}>{d.snippet}</Text>
      </View>
    );
  }
  if (item.coins && COIN_KINDS.has(item.kind)) return <Text style={s.coins}>+{item.coins}</Text>;
  return null;
}

const Row = React.memo(({ item, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.7}
    disabled={!item.url}
    onPress={() => onPress(item)}
    style={[s.row, !item.read && s.rowUnread]}
  >
    <RowAvatar item={item} />
    <View style={s.body}>
      <Text style={s.line}>
        {item.actors.length ? <><Who item={item} /> {item.action}</> : <Text style={s.bold}>{item.title}</Text>}
        <Text style={s.time}>{` · ${timeAgo(item.at)}`}</Text>
      </Text>
      {item.text ? (
        <Text style={s.text} numberOfLines={2}>{item.actors.length ? `“${item.text}”` : item.text}</Text>
      ) : null}
    </View>
    <Thumb item={item} />
  </TouchableOpacity>
));

export default function ActivityScreen({ navigation }) {
  const { refreshUnread } = useUnread();
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (category) => {
    setError('');
    try {
      const r = await activityApi.list(category);
      setItems(r.items);
      setNext(r.next);
      if (r.items.some((i) => !i.read)) {
        activityApi.markRead(category).then(refreshUnread).catch(() => {});
      }
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  }, [refreshUnread]);

  useEffect(() => {
    setItems(null);
    load(filter);
  }, [filter, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  }, [filter, load]);

  const loadMore = useCallback(async () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await activityApi.list(filter, next);
      setItems((cur) => [...(cur || []), ...r.items]);
      setNext(r.next);
    } catch {
      // keep what is already shown
    } finally {
      setLoadingMore(false);
    }
  }, [filter, next, loadingMore]);

  const sections = useMemo(() => {
    const out = [];
    for (const it of items || []) {
      const title = sectionOf(it);
      const last = out[out.length - 1];
      if (last?.title === title) last.data.push(it);
      else out.push({ title, data: [it] });
    }
    return out;
  }, [items]);

  const onPressRow = useCallback((item) => openActivity(navigation, item.url), [navigation]);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Activity</Text>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {ACTIVITY_FILTERS.map((f) => {
            const on = f.key === filter;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[s.chip, on && s.chipOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {items === null ? (
        <ActivityIndicator color={T.primary} style={s.loading} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => <Row item={item} onPress={onPressRow} />}
          renderSectionHeader={({ section }) => <Text style={s.section}>{section.title}</Text>}
          stickySectionHeadersEnabled={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={T.primary} style={s.more} /> : null}
          ListEmptyComponent={(
            <View style={s.empty}>
              <View style={[s.tile, { backgroundColor: T.primaryDim }]}>
                <Bell size={rs(22)} color={T.primary} strokeWidth={2} />
              </View>
              <Text style={s.emptyTitle}>{error ? "Couldn't load" : 'Nothing here yet'}</Text>
              <Text style={s.emptyText}>{error || 'Likes, comments and Link Ups land here.'}</Text>
            </View>
          )}
          contentContainerStyle={s.list}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  header: { paddingHorizontal: rp(16), paddingVertical: rp(12) },
  title: { color: T.text, fontSize: rf(22), fontWeight: '800' },
  chips: { paddingHorizontal: rp(16), paddingBottom: rp(10), gap: rp(8) },
  chip: {
    height: rs(32), paddingHorizontal: rp(14), borderRadius: rs(16), justifyContent: 'center',
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
  },
  chipOn: { backgroundColor: T.primary, borderColor: T.primary },
  chipText: { color: T.textSecondary, fontSize: rf(13), fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  loading: { marginTop: rp(48) },
  list: { paddingBottom: rp(32), flexGrow: 1 },
  section: {
    color: T.textSecondary, fontSize: rf(12), fontWeight: '700', letterSpacing: 0.7,
    textTransform: 'uppercase', marginTop: rp(14), marginBottom: rp(4), marginHorizontal: rp(16),
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: rp(12), minHeight: rs(68),
    paddingHorizontal: rp(16), paddingVertical: rp(10),
  },
  rowUnread: { backgroundColor: T.primaryDim },
  ava: { width: rs(48), height: rs(48) },
  backFace: { position: 'absolute', left: 0, top: 0 },
  frontFace: {
    position: 'absolute', right: 0, bottom: 0, borderRadius: rs(20), borderWidth: 2, borderColor: T.background,
  },
  kind: {
    position: 'absolute', right: -rs(3), bottom: -rs(3), width: rs(20), height: rs(20), borderRadius: rs(10),
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: T.background,
  },
  tile: { width: rs(48), height: rs(48), borderRadius: rs(14), alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: rp(3) },
  line: { color: T.text, fontSize: rf(14), lineHeight: rf(19) },
  bold: { fontWeight: '700' },
  time: { color: T.textSecondary },
  text: { color: T.textSecondary, fontSize: rf(13) },
  thumb: { width: rs(44), height: rs(58), borderRadius: rs(6), backgroundColor: T.surfaceAlt },
  thumbText: { padding: rp(5), overflow: 'hidden', backgroundColor: '#2a1420' },
  thumbTextInner: { color: T.text, fontSize: rf(7.5), lineHeight: rf(10) },
  coins: { color: T.gold, fontSize: rf(14), fontWeight: '700' },
  more: { marginVertical: rp(16) },
  empty: { alignItems: 'center', gap: rp(8), paddingTop: rp(64), paddingHorizontal: rp(24) },
  emptyTitle: { color: T.text, fontSize: rf(16), fontWeight: '700' },
  emptyText: { color: T.textSecondary, fontSize: rf(14), textAlign: 'center' },
});
