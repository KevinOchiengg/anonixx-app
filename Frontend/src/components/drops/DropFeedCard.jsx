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
import { Eye } from 'lucide-react-native';

import { rs, rf, rp, SPACING, RADIUS } from '../../utils/responsive';
import DropCardRenderer, { DROP_THEMES } from './DropCardRenderer';
import DropExpiryTimer from './DropExpiryTimer';
import DropReactions from './DropReactions';

const SCREEN_W = Dimensions.get('window').width;

const DropFeedCard = React.memo(function DropFeedCard({
  drop,
  width = SCREEN_W - SPACING.md * 2,
  onOpen,                  // optional override — defaults to navigate('DropLanding', { dropId })
  showReactions = true,
  showExpiry    = true,
  showPresence  = true,
}) {
  const navigation = useNavigation();

  const {
    id, confession, created_at, theme, mood_tag, emotional_context,
    tease_mode, media_url, media_type,
    user_reaction = null,
    readers_now = 0,
  } = drop || {};

  const themeObj = DROP_THEMES[theme] || DROP_THEMES['cinematic-coral'];

  const layoutMode = (media_type === 'image' || media_type === 'video') && media_url
    ? 'split'
    : 'split';

  const handleOpen = useCallback(() => {
    if (onOpen) { onOpen(drop); return; }
    navigation?.navigate?.('DropLanding', { dropId: id });
  }, [onOpen, drop, navigation, id]);

  return (
    <View style={[styles.wrap, { width }]}>
      <TouchableOpacity activeOpacity={0.92} onPress={handleOpen}>
        <DropCardRenderer
          confession={confession}
          moodTag={mood_tag || 'longing'}
          emotionalContext={emotional_context}
          teaseMode={!!tease_mode}
          theme={theme || 'cinematic-coral'}
          mediaUrl={media_url}
          layoutMode={layoutMode}
          confessionId={id}
          seed={id || confession}
          cardWidth={width}
        />
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
});

export default DropFeedCard;
