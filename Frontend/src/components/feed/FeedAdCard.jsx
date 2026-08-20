/**
 * FeedAdCard.jsx
 * Sponsored/house ad injected between posts in the main feed.
 * Mirrors the AdCard used inside a Circle's feed (CircleContentScreen.jsx),
 * restyled to match the main feed's card language (see MarketCard.jsx).
 *
 * Renders whichever media type the creator picked (image/gif/video/audio —
 * see CreateAdScreen.jsx). Video autoplays muted+looped as a preview, same
 * spirit as a GIF; there's no inline audio player since the whole card is
 * already one tap target that takes you to the linked Drop.
 *
 * Usage:
 *   <FeedAdCard ad={ad} onPress={(ad) => ...} />
 */
import React from 'react';
import {
  Image, Linking, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Megaphone, Music } from 'lucide-react-native';

import { rf, rp, rs, SPACING, RADIUS } from '../../utils/responsive';
import { THEME } from '../../utils/theme';

const AdVideoCover = React.memo(({ uri }) => {
  const player = useVideoPlayer({ uri }, (p) => { p.loop = true; p.muted = true; p.play(); });
  return (
    <VideoView
      style={styles.cover}
      player={player}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
});

const FeedAdCard = React.memo(function FeedAdCard({ ad, onPress }) {
  if (!ad) return null;

  const handlePress = () => {
    if (onPress) { onPress(ad); return; }
    Linking.openURL(ad.link_url).catch(() => {});
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.9}>
      <View style={styles.badge}>
        <Megaphone size={rs(11)} color={THEME.textSecondary} />
        <Text style={styles.badgeText}>{ad.ad_type === 'house' ? 'Anonixx' : 'Sponsored'}</Text>
      </View>

      {ad.media_url && ad.media_type === 'video' ? (
        <AdVideoCover uri={ad.media_url} />
      ) : ad.media_url && ad.media_type === 'audio' ? (
        <View style={styles.audioCover}>
          <Music size={rs(22)} color={THEME.primary} />
          <Text style={styles.audioCoverText}>Audio</Text>
        </View>
      ) : ad.media_url ? (
        // image or gif — Image renders animated gifs natively
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
  audioCover: {
    width:           '100%',
    height:          rs(72),
    borderRadius:    RADIUS.md,
    backgroundColor: THEME.primaryDim,
    borderWidth:     1,
    borderColor:     THEME.primaryBorder,
    marginBottom:    rp(12),
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             rp(8),
  },
  audioCoverText: { fontSize: rf(13), fontWeight: '700', color: THEME.primary },
  title: {
    fontSize:   rf(15),
    fontWeight: '600',
    color:      THEME.text,
    lineHeight: rf(21),
  },
});
