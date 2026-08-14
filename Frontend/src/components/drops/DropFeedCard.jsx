/**
 * DropFeedCard.jsx
 *
 * A single drop as it appears inside a feed (ConfessionMarketplace, Connect, etc.).
 * This composes the 3 primitives:
 *
 *   <DropCardRenderer />   — the card itself
 *   <DropExpiryTimer />    — ghost 72h countdown
 *   <DropReactions />      — the 4 emotional reactions
 *
 * Plus optional presence signal ("3 people are reading this right now")
 * and tap-to-open handler that routes to DropLanding.
 *
 * All rendering is memoized so long FlatLists stay smooth.
 *
 * Minimal drop shape expected:
 *   {
 *     id, confession, created_at,
 *     theme, mood_tag, emotional_context, tease_mode,
 *     media_url, media_type,              // optional
 *     reaction_counts: { held, felt, burn, metoo },
 *     user_reaction,                      // null | 'held' | 'felt' | 'burn' | 'metoo'
 *     readers_now                         // optional presence int
 *   }
 */
import React, { useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Eye, Flame, Play } from 'lucide-react-native';

import { rs, rf, rp, SPACING, RADIUS } from '../../utils/responsive';
import DropCardRenderer, { DROP_THEMES } from './DropCardRenderer';
import DropExpiryTimer from './DropExpiryTimer';
import DropReactions from './DropReactions';

const SCREEN_W = Dimensions.get('window').width;

const DropFeedCard = React.memo(function DropFeedCard({
  drop,
  width = SCREEN_W - SPACING.md * 2,
  onOpen,                  // optional override — defaults to navigate('DropLanding', { dropId })
  onOozeIn,                // primary unlock CTA — defaults to navigate('DropLanding', { dropId, autoOpenUnlock: true })
  showReactions = true,
  showExpiry    = true,
  showPresence  = true,
}) {
  const navigation = useNavigation();

  const {
    id, confession, created_at, theme, mood_tag, emotional_context,
    tease_mode, media_url, media_type, card_image_url, already_unlocked,
    font_style,
    user_reaction = null,
    readers_now = 0,
  } = drop || {};

  const themeObj = DROP_THEMES[theme] || DROP_THEMES['desire'];

  const layoutMode = (media_type === 'image' || media_type === 'video') && media_url
    ? 'split'
    : 'split';

  // Video drops can't render their raw file through an ImageBackground —
  // use the server-generated poster-frame thumbnail (card_image_url) as the
  // static preview instead, with a play affordance. Tapping through to
  // DropLanding/MediaFeed is where actual video playback happens.
  const isVideo = media_type === 'video';
  const previewUrl = isVideo ? (card_image_url || media_url) : media_url;

  const handleOpen = useCallback(() => {
    if (onOpen) { onOpen(drop); return; }
    navigation?.navigate?.('DropLanding', { dropId: id });
  }, [onOpen, drop, navigation, id]);

  const handleOozeIn = useCallback(() => {
    if (onOozeIn) { onOozeIn(drop); return; }
    navigation?.navigate?.('DropLanding', { dropId: id, autoOpenUnlock: true });
  }, [onOozeIn, drop, navigation, id]);

  return (
    <View style={[styles.wrap, { width }]}>
      <TouchableOpacity activeOpacity={0.92} onPress={handleOpen}>
        <DropCardRenderer
          confession={confession}
          moodTag={mood_tag || 'longing'}
          emotionalContext={emotional_context}
          teaseMode={!!tease_mode}
          theme={theme || 'desire'}
          mediaUrl={previewUrl}
          layoutMode={layoutMode}
          confessionId={id}
          seed={id || confession}
          cardWidth={width}
          fontStyle={font_style}
        />
        {isVideo && previewUrl && (
          <View style={styles.playBadge} pointerEvents="none">
            <Play size={rs(22)} color="#fff" fill="#fff" />
          </View>
        )}
      </TouchableOpacity>

      {/* Meta row — presence + expiry, sitting just below the card */}
      {(showPresence || showExpiry) && (
        <View style={styles.metaRow}>
          {showPresence && readers_now > 0 ? (
            <View style={styles.presence}>
              <Eye size={rs(11)} color={themeObj.accent} />
              <Text style={[styles.presenceText, { color: themeObj.accent }]}>
                {readers_now === 1
                  ? 'someone is reading this right now'
                  : `${readers_now} reading right now`}
              </Text>
            </View>
          ) : <View style={{ flex: 1 }} />}

          {showExpiry && (
            <DropExpiryTimer
              createdAt={created_at}
              accent={themeObj.accent}
              align="right"
            />
          )}
        </View>
      )}

      {/* Ooze In — primary unlock CTA */}
      {id && !already_unlocked && (
        <TouchableOpacity
          style={[styles.oozeBtn, { backgroundColor: themeObj.accent }]}
          onPress={handleOozeIn}
          activeOpacity={0.88}
        >
          <Flame size={rs(15)} color="#fff" strokeWidth={2.5} />
          <Text style={styles.oozeBtnText}>Link up</Text>
        </TouchableOpacity>
      )}

      {/* Reactions — emotional text signals */}
      {showReactions && id && (
        <DropReactions
          dropId={id}
          initialReaction={user_reaction}
          accent={themeObj.accent}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
    borderRadius: RADIUS.lg,
    overflow:     'visible',
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: rs(8) },
    shadowOpacity:0.35,
    shadowRadius: rs(20),
    elevation:    8,
  },
  metaRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: rp(4),
    paddingTop:        rp(8),
    paddingBottom:     rp(4),
  },
  presence: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(6),
    flex:          1,
  },
  presenceText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    letterSpacing: 0.3,
  },
  oozeBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               rp(6),
    marginTop:         rp(8),
    paddingVertical:   rp(11),
    borderRadius:      RADIUS.md,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: rs(3) },
    shadowOpacity:     0.3,
    shadowRadius:      rs(8),
    elevation:         4,
  },
  oozeBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(13),
    color:         '#fff',
    letterSpacing: 0.4,
  },
  playBadge: {
    position:        'absolute',
    bottom:          '18%',
    alignSelf:       'center',
    width:           rs(48),
    height:          rs(48),
    borderRadius:    rs(24),
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems:      'center',
    justifyContent:  'center',
  },
});

export default DropFeedCard;
