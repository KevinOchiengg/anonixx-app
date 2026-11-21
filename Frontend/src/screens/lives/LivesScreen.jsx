import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { LinearGradient } from 'expo-linear-gradient';
import { Coins, Eye, Plus, Radio, Users, Wallet } from 'lucide-react-native';
import AuthorAvatar from '../../components/common/AuthorAvatar';
import { livesApi, startsLabel } from '../../utils/lives';
import { HIT_SLOP, RADIUS, rf, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

const TABS = [['live', 'Live now'], ['upcoming', 'Upcoming'], ['mine', 'My lives']];
const EMPTY = {
  live: 'Nobody is live right now. Be the first.',
  upcoming: 'No lives scheduled yet.',
  mine: "You haven't hosted a live yet.",
};

const LiveTile = React.memo(({ live, width, onPress }) => {
  const on = live.status === 'live';
  return (
    <TouchableOpacity style={[s.tile, { width }]} onPress={onPress} activeOpacity={0.85} accessibilityLabel={`${live.title} by ${live.host.name}`}>
      <View style={s.cover}>
        {live.cover_url ? <Image source={{ uri: live.cover_url }} style={StyleSheet.absoluteFill} /> : (
          <View style={s.coverPh}>
            <View style={s.coverAva}><AuthorAvatar uri={live.host.avatar_url} seed={live.host.id} name={live.host.name} gender={live.host.gender} /></View>
          </View>
        )}
        <View style={[s.badge, on && s.badgeOn]}>
          {on && <Radio size={rs(11)} color="#fff" />}
          <Text style={s.badgeText}>{on ? 'Live' : live.status === 'ended' ? 'Ended' : startsLabel(live.starts_at)}</Text>
        </View>
        {on && (
          <View style={s.count}><Eye size={rs(11)} color="#fff" /><Text style={s.badgeText}>{live.viewers}</Text></View>
        )}
        {live.promoted && <View style={s.promo}><Text style={s.promoText}>Promoted</Text></View>}
      </View>
      <View style={s.meta}>
        <View style={s.ava}><AuthorAvatar uri={live.host.avatar_url} seed={live.host.id} name={live.host.name} gender={live.host.gender} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{live.title}</Text>
          <Text style={s.host} numberOfLines={1}>{live.host.name || 'Anonymous'}</Text>
        </View>
      </View>
      <View style={s.foot}>
        <View style={s.footItem}><Coins size={rs(12)} color={T.gold} /><Text style={[s.footText, { color: T.gold }]}>{live.price}</Text></View>
        <View style={s.footItem}><Users size={rs(12)} color={T.textSecondary} /><Text style={s.footText}>{live.members}</Text></View>
      </View>
    </TouchableOpacity>
  );
});

export default function LivesScreen({ navigation }) {
  const user = useSelector((st) => st.auth.user);
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState('live');
  const [lives, setLives] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const tileWidth = (width - rp(16) * 2 - rp(12)) / 2;

  const load = useCallback(async () => {
    if (tab === 'mine' && !user) { setLives([]); return; }
    try {
      const r = await livesApi.browse(tab);
      setLives(r.lives);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [tab, user]);

  useEffect(() => { setLives(null); load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const requireUser = (route) => (user ? navigation.navigate(route) : navigation.navigate('AuthNav', { screen: 'Login' }));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.heading}>Lives</Text>
        {user && (
          <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('LiveEarnings')} hitSlop={HIT_SLOP} accessibilityLabel="Your earnings">
            <Wallet size={rs(18)} color={T.text} />
          </TouchableOpacity>
        )}
      </View>
      <View style={s.tabs}>
        {TABS.map(([k, label]) => (
          <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)} accessibilityState={{ selected: tab === k }}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!lives && !error ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(40) }} /> : (
        <FlatList
          data={lives || []}
          keyExtractor={(l) => l.id}
          numColumns={2}
          columnWrapperStyle={{ gap: rp(12) }}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
          renderItem={({ item }) => <LiveTile live={item} width={tileWidth} onPress={() => navigation.navigate('LiveRoom', { liveId: item.id })} />}
          ListEmptyComponent={<Text style={s.empty}>{error || (tab === 'mine' && !user ? 'Sign in to host a live.' : EMPTY[tab])}</Text>}
        />
      )}

      <TouchableOpacity style={s.fabWrap} onPress={() => requireUser('GoLive')} activeOpacity={0.88} accessibilityLabel="Go live">
        <LinearGradient colors={['#ff8a73', '#ff634a', '#ff4f7b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fab}>
          <Plus size={rs(18)} color="#fff" />
          <Text style={s.fabText}>Go live</Text>
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rp(16), paddingVertical: rp(10) },
  heading: { fontFamily: 'PlayfairDisplay-Bold', fontSize: rf(24), color: T.text },
  iconBtn: { width: rs(38), height: rs(38), borderRadius: rs(19), alignItems: 'center', justifyContent: 'center', backgroundColor: T.surfaceAlt },
  tabs: { flexDirection: 'row', gap: rp(8), paddingHorizontal: rp(16), marginBottom: rp(12) },
  tab: { height: rs(36), paddingHorizontal: rp(16), borderRadius: 999, borderWidth: 1, borderColor: T.border, justifyContent: 'center' },
  tabOn: { backgroundColor: T.primary, borderColor: T.primary },
  tabText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(13), color: T.textSecondary },
  tabTextOn: { color: '#fff' },
  list: { paddingHorizontal: rp(16), paddingBottom: rs(120), gap: rp(12) },
  tile: { borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  cover: { aspectRatio: 3 / 4, backgroundColor: '#1d1424' },
  coverPh: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  coverAva: { width: rs(72), height: rs(72), borderRadius: rs(36), overflow: 'hidden' },
  badge: { position: 'absolute', top: rp(8), left: rp(8), flexDirection: 'row', alignItems: 'center', gap: rp(4), paddingHorizontal: rp(8), paddingVertical: rp(4), borderRadius: rs(8), backgroundColor: 'rgba(0,0,0,0.55)' },
  badgeOn: { backgroundColor: '#EF4444' },
  badgeText: { fontFamily: 'DMSans-Bold', fontSize: rf(11), color: '#fff' },
  count: { position: 'absolute', top: rp(8), right: rp(8), flexDirection: 'row', alignItems: 'center', gap: rp(4), paddingHorizontal: rp(8), paddingVertical: rp(4), borderRadius: rs(8), backgroundColor: 'rgba(0,0,0,0.55)' },
  promo: { position: 'absolute', bottom: rp(8), left: rp(8), paddingHorizontal: rp(8), paddingVertical: rp(3), borderRadius: rs(6), backgroundColor: T.primary },
  promoText: { fontFamily: 'DMSans-Bold', fontSize: rf(10), color: '#fff' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: rp(8), paddingHorizontal: rp(10), paddingTop: rp(10) },
  ava: { width: rs(28), height: rs(28), borderRadius: rs(14), overflow: 'hidden', backgroundColor: T.surfaceAlt },
  title: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: T.text },
  host: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary },
  foot: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: rp(10), paddingVertical: rp(10) },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: rp(4) },
  footText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(12), color: T.textSecondary },
  empty: { textAlign: 'center', color: T.textSecondary, fontFamily: 'DMSans-Regular', fontSize: rf(14), marginTop: rp(40) },
  fabWrap: { position: 'absolute', right: rp(16), bottom: rp(20), borderRadius: 999, shadowColor: T.primary, shadowOffset: { width: 0, height: rs(6) }, shadowOpacity: 0.45, shadowRadius: rs(14), elevation: 8 },
  fab: { flexDirection: 'row', alignItems: 'center', gap: rp(6), height: rs(48), paddingHorizontal: rp(20), borderRadius: 999 },
  fabText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: '#fff' },
});
