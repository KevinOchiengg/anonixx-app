/**
 * MarketCard.jsx
 * Native-feeling Anonixx Market promo card injected between confessions in the feed.
 *
 * Visual logic — "Locked Confession":
 *   Looks like a confession card but with a distinct gold border, EXCLUSIVE badge,
 *   teaser cutting off mid-sentence, blurred faux content below, and a single
 *   "Unlock for X coins →" CTA. Drives curiosity, not frustration.
 *
 * Usage:
 *   <MarketCard item={marketItem} onPress={(id) => nav.navigate('MarketItem', { itemId: id })} />
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Sparkles } from 'lucide-react-native';

import { rf, rp, rs } from '../../utils/responsive';
import { THEME } from '../../utils/theme';

const MarketCard = React.memo(({ item, onPress }) => {
  // Subtle pulsing glow on the EXCLUSIVE dot — pulls the eye without nagging
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  if (!item) return null;

  return (
    <TouchableOpacity
      onPress={() => onPress?.(item.id)}
      activeOpacity={0.92}
      style={styles.cardWrap}
    >
      {/* Gold accent border */}
      <View style={styles.glow} pointerEvents="none" />

      <View style={styles.card}>
        {/* Top row: badge + label */}
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <Animated.View style={[styles.dot, { opacity: pulse }]} />
            <Text style={styles.badgeText}>EXCLUSIVE</Text>
          </View>
          <Text style={styles.label}>Anonixx Intel</Text>
        </View>

        {/* Optional cover */}
        {item.media_url ? (
          <Image source={{ uri: item.media_url }} style={styles.cover} />
        ) : null}

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>

        {/* Teaser — cut mid-sentence */}
        <Text style={styles.teaser} numberOfLines={2}>
          {item.teaser}
        </Text>

        {/* Faux blurred lines hint at content underneath */}
        <View style={styles.fauxWrap}>
          <View style={[styles.fauxLine, { width: '92%', opacity: 0.18 }]} />
          <View style={[styles.fauxLine, { width: '78%', opacity: 0.13 }]} />
          <View style={[styles.fauxLine, { width: '60%', opacity: 0.08 }]} />
        </View>

        {/* CTA */}
        <View style={styles.ctaRow}>
          <View style={styles.ctaPill}>
            <Lock size={rs(13)} color={THEME.gold} />
            <Text style={styles.ctaText}>
              Unlock for {item.price_coins} coins
            </Text>
            <Text style={styles.arrow}>→</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default MarketCard;

const styles = StyleSheet.create({
  cardWrap: {
    marginHorizontal: rp(12),
    marginVertical:   rp(8),
    borderRadius:     rs(18),
    position:         'relative',
  },
  glow: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    bottom:          0,
    borderRadius:    rs(18),
    borderWidth:     1.5,
    borderColor:     THEME.goldBorder,
    ...Platform.select({
      ios:     { shadowColor: THEME.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.18, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  card: {
    backgroundColor:   THEME.surface,
    borderRadius:      rs(18),
    paddingHorizontal: rp(16),
    paddingTop:        rp(14),
    paddingBottom:     rp(14),
    overflow:          'hidden',
  },
  topRow: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    marginBottom:     rp(10),
  },
  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rs(6),
    backgroundColor:   'rgba(239,68,68,0.12)',
    borderRadius:      rs(20),
    paddingHorizontal: rp(10),
    paddingVertical:   rp(4),
    borderWidth:       1,
    borderColor:       'rgba(239,68,68,0.4)',
  },
  dot: {
    width:           rs(7),
    height:          rs(7),
    borderRadius:    rs(4),
    backgroundColor: '#ef4444',
  },
  badgeText: {
    color:         '#ef4444',
    fontSize:      rf(10),
    fontWeight:    '800',
    letterSpacing: 1.2,
  },
  label: {
    color:         THEME.gold,
    fontSize:      rf(10),
    fontWeight:    '700',
    letterSpacing: 1.2,
  },
  cover: {
    width:           '100%',
    height:          rs(140),
    borderRadius:    rs(12),
    marginBottom:    rp(12),
    backgroundColor: THEME.surfaceDark,
  },
  title: {
    color:         THEME.text,
    fontSize:      rf(17),
    fontWeight:    '700',
    fontFamily:    Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight:    rf(22),
    marginBottom:  rp(8),
  },
  teaser: {
    color:      THEME.text,
    fontSize:   rf(14),
    lineHeight: rf(20),
    opacity:    0.85,
    marginBottom: rp(10),
  },
  fauxWrap: {
    marginBottom: rp(14),
  },
  fauxLine: {
    height:          rs(8),
    borderRadius:    rs(4),
    backgroundColor: THEME.textMuted,
    marginBottom:    rp(8),
  },
  ctaRow: {
    flexDirection: 'row',
  },
  ctaPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rs(8),
    backgroundColor:   THEME.goldBg,
    borderRadius:      rs(20),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(9),
    borderWidth:       1,
    borderColor:       THEME.goldBorder,
  },
  ctaText: {
    color:      THEME.gold,
    fontSize:   rf(13),
    fontWeight: '700',
  },
  arrow: {
    color:      THEME.gold,
    fontSize:   rf(15),
    fontWeight: '700',
  },
});
