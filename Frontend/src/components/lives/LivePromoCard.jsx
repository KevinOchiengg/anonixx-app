import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import AuthorAvatar from '../common/AuthorAvatar';
import { startsLabel } from '../../utils/lives';
import { RADIUS, rf, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

/** A host's paid promotion in the main feed. */
export default function LivePromoCard({ live, onPress }) {
  const on = live.status === 'live';
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(live)} activeOpacity={0.9} accessibilityLabel={`${live.title}, promoted live`}>
      <View style={s.media}>
        {live.cover_url ? <Image source={{ uri: live.cover_url }} style={StyleSheet.absoluteFill} /> : (
          <View style={s.ava}><AuthorAvatar uri={live.host.avatar_url} seed={live.host.id} name={live.host.name} gender={live.host.gender} /></View>
        )}
        <View style={[s.badge, on && s.badgeOn]}>
          <Text style={s.badgeText}>{on ? 'LIVE NOW' : `Starts ${startsLabel(live.starts_at)}`}</Text>
        </View>
      </View>
      <Text style={s.host}>{live.host.name || 'Anonymous'} · Promoted</Text>
      <Text style={s.title} numberOfLines={2}>{live.title}</Text>
      <View style={s.cta}>
        <Text style={s.ctaText}>{on ? 'Watch free preview' : 'See the live'}</Text>
        <ChevronRight size={rs(18)} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { gap: rp(8), padding: rp(12), borderRadius: RADIUS.xl, backgroundColor: '#1f1219', borderWidth: 1, borderColor: 'rgba(255,99,74,0.4)' },
  media: { aspectRatio: 4 / 5, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: '#2a1520', alignItems: 'center', justifyContent: 'center' },
  ava: { width: rs(96), height: rs(96), borderRadius: rs(48), overflow: 'hidden', borderWidth: 3, borderColor: T.primary },
  badge: { position: 'absolute', top: rp(10), left: rp(10), paddingHorizontal: rp(10), paddingVertical: rp(5), borderRadius: rs(8), backgroundColor: 'rgba(0,0,0,0.6)' },
  badgeOn: { backgroundColor: '#EF4444' },
  badgeText: { fontFamily: 'DMSans-Bold', fontSize: rf(12), color: '#fff' },
  host: { fontFamily: 'DMSans-Regular', fontSize: rf(13), color: T.textSecondary },
  title: { fontFamily: 'DMSans-Bold', fontSize: rf(20), color: T.text },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(4), height: rs(46), borderRadius: 999, backgroundColor: T.primary },
  ctaText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: '#fff' },
});
