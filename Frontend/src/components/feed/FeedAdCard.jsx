/**
 * FeedAdCard.jsx
 * Sponsored/house ad injected between posts in the main feed.
 * Mirrors the AdCard used inside a Circle's feed (CircleContentScreen.jsx),
 * restyled to match the main feed's card language (see MarketCard.jsx).
 *
 * Usage:
 *   <FeedAdCard ad={ad} onPress={(ad) => ...} />
 */
import React from 'react';
import {
  Image, Linking, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Megaphone } from 'lucide-react-native';

import { rf, rp, rs, SPACING, RADIUS } from '../../utils/responsive';
import { THEME } from '../../utils/theme';

const FeedAdCard = React.memo(function FeedAdCard({ ad, onPress }) {
  const navigation = useNavigation();

  if (!ad) return null;

  const handlePress = () => {
    if (onPress) { onPress(ad); return; }
    if (ad.link_url?.startsWith('anonixx://drop/')) {
      navigation.navigate('DropLanding', { dropId: ad.link_url.split('/').pop() });
    } else {
      Linking.openURL(ad.link_url).catch(() => {});
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.9}>
      <View style={styles.badge}>
        <Megaphone size={rs(11)} color={THEME.textSecondary} />
        <Text style={styles.badgeText}>{ad.ad_type === 'house' ? 'Anonixx' : 'Sponsored'}</Text>
      </View>

      {ad.media_url ? (
        <Image source={{ uri: ad.media_url }} style={styles.cover} resizeMode="cover" />
      ) : null}

      <Text style={styles.title} numberOfLines={2}>{ad.title}</Text>
    </TouchableOpacity>
  );
});

export default FeedAdCard;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginVertical:   rp(8),
    backgroundColor:  THEME.surface,
    borderRadius:     RADIUS.lg,
    borderWidth:      1,
    borderColor:      THEME.border,
    padding:          rp(14),
  },
  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    gap:               rp(5),
    backgroundColor:   THEME.surfaceAlt,
    borderRadius:      RADIUS.full,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(4),
    marginBottom:      rp(10),
  },
  badgeText: {
    fontSize:      rf(10),
    fontWeight:    '700',
    color:         THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cover: {
    width:           '100%',
    height:          rs(150),
    borderRadius:    RADIUS.md,
    backgroundColor: THEME.surfaceAlt,
    marginBottom:    rp(12),
  },
  title: {
    fontSize:   rf(15),
    fontWeight: '600',
    color:      THEME.text,
    lineHeight: rf(21),
  },
});
