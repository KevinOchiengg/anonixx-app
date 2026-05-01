import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Share,
  Platform,
} from 'react-native';
import { Heart, MessageCircle, Share2, Eye, Bookmark } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config/api';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS, SCREEN, HIT_SLOP,
} from '../../utils/responsive';
import { THEME } from '../../utils/theme';

const BASE_URL = 'https://anonixx-app.onrender.com';

const TOPIC_META = {
  relationships:  { emoji: '💔', label: 'Love'       },
  anxiety:        { emoji: '😰', label: 'Anxiety'    },
  depression:     { emoji: '😢', label: 'Low'        },
  self_growth:    { emoji: '💪', label: 'Growth'     },
  school_career:  { emoji: '🎓', label: 'Career'     },
  family:         { emoji: '👨‍👩‍👧‍👦', label: 'Family'     },
  lgbtq:          { emoji: '🏳️‍🌈', label: 'LGBTQ+'     },
  addiction:      { emoji: '💊', label: 'Addiction'  },
  sleep:          { emoji: '😴', label: 'Sleep'      },
  identity:       { emoji: '🎭', label: 'Identity'   },
  wins:           { emoji: '🎉', label: 'Win'        },
  friendship:     { emoji: '🤝', label: 'Friends'    },
  financial:      { emoji: '💰', label: 'Money'      },
  health:         { emoji: '🏥', label: 'Health'     },
  general:        { emoji: '🌟', label: 'General'    },
};

// ─── ActionButton ─────────────────────────────────────────────
const ActionButton = React.memo(({ icon: Icon, count, onPress, active, activeColor }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.4, duration: 90,  useNativeDriver: true }),
      Animated.spring(scale,  { toValue: 1,   friction: 5,   useNativeDriver: true }),
    ]).start();
    onPress?.();
  }, [onPress, scale]);

  const color = active ? activeColor : 'rgba(255,255,255,0.88)';

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.actionBtn}
      hitSlop={HIT_SLOP}
      activeOpacity={0.75}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon
          size={rs(28)}
          color={color}
          fill={active ? activeColor : 'transparent'}
          strokeWidth={active ? 0 : 2}
        />
      </Animated.View>
      {count !== undefined && (
        <Text style={[styles.actionCount, { color }]}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
        </Text>
      )}
    </TouchableOpacity>
  );
});

// ─── FullScreenPostCard ───────────────────────────────────────
function FullScreenPostCard({ post, onReact, onComment }) {
  const [saved, setSaved] = useState(false);

  const entranceY  = useRef(new Animated.Value(24)).current;
  const entranceOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entranceOp, { toValue: 1, duration: 420, delay: 60,  useNativeDriver: true }),
      Animated.timing(entranceY,  { toValue: 0, duration: 380, delay: 60,  useNativeDriver: true }),
    ]).start();
    recordView();
  }, []);

  const recordView = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      await fetch(`${API_BASE_URL}/api/v1/posts/${post.id}/view`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* silent */ }
  }, [post.id]);

  // ── Share — HTTPS link so it's tappable in WhatsApp/SMS ────
  const handleShare = useCallback(async () => {
    try {
      const link     = `${BASE_URL}/api/v1/posts/${post.id}/open`;
      const preview  = post.content?.substring(0, 100) ?? '';
      const ellipsis = (post.content?.length ?? 0) > 100 ? '…' : '';
      await Share.share({
        message: `"${preview}${ellipsis}"\n\nRead on Anonixx 👇\n${link}`,
        url:     link,
        title:   'Anonymous confession on Anonixx',
      });
    } catch { /* silent */ }
  }, [post.id, post.content]);

  const handleSave = useCallback(() => setSaved((v) => !v), []);

  const displayName  = post.is_anonymous
    ? (post.anonymous_name || 'Anonymous')
    : (post.user?.username  || 'Anonymous');
  const avatarChar   = displayName.charAt(0).toUpperCase();
  const primaryTopic = post.topics?.[0];
  const topicMeta    = TOPIC_META[primaryTopic] ?? { emoji: '🌟', label: 'Confession' };
  const isLong       = (post.content?.split(' ').length ?? 0) > 40;

  return (
    <View style={styles.container}>

      <View style={styles.scrimTop}    pointerEvents="none" />
      <View style={styles.scrimBottom} pointerEvents="none" />

      <Animated.View style={[styles.topicPill, { opacity: entranceOp }]} pointerEvents="none">
        <Text style={styles.topicEmoji}>{topicMeta.emoji}</Text>
        <Text style={styles.topicLabel}>{topicMeta.label}</Text>
      </Animated.View>

      <View style={styles.viewsBadge} pointerEvents="none">
        <Eye size={rs(11)} color="rgba(255,255,255,0.4)" strokeWidth={2} />
        <Text style={styles.viewsText}>{post.views_count ?? 0}</Text>
      </View>

      <Animated.View
        style={[
          styles.centerContent,
          { opacity: entranceOp, transform: [{ translateY: entranceY }] },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.quoteChar} pointerEvents="none">"</Text>
        <Text style={[styles.confessionText, isLong && styles.confessionTextSmall]}>
          {post.content || ''}
        </Text>
      </Animated.View>

      <Animated.View
        style={[styles.bottomRow, { opacity: entranceOp, transform: [{ translateY: entranceY }] }]}
      >
        <View style={styles.authorBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarChar}</Text>
          </View>
          <View>
            <Text style={styles.authorName}>{displayName}</Text>
            {post.topics && post.topics.length > 1 && (
              <Text style={styles.extraTopics}>
                {post.topics.slice(1).map((t) => TOPIC_META[t]?.emoji ?? '🌟').join('  ')}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actions}>
          <ActionButton
            icon={Heart}
            count={post.reactions_count ?? 0}
            onPress={() => onReact(post.id)}
            active={!!post.user_reaction}
            activeColor={THEME.primary}
          />
          <ActionButton
            icon={MessageCircle}
            count={post.comments_count ?? 0}
            onPress={() => onComment(post.id)}
            active={false}
            activeColor={THEME.primary}
          />
          <ActionButton
            icon={Bookmark}
            onPress={handleSave}
            active={saved}
            activeColor="#c9a84c"
          />
          <ActionButton
            icon={Share2}
            onPress={handleShare}
            active={false}
            activeColor={THEME.primary}
          />
        </View>
      </Animated.View>

    </View>
  );
}

export default React.memo(FullScreenPostCard);

const styles = StyleSheet.create({
  container: {
    width:           SCREEN.width,
    height:          SCREEN.height,
    backgroundColor: THEME.background,
    overflow:        'hidden',
  },
  scrimTop: {
    position:        'absolute',
    top:             0, left: 0, right: 0,
    height:          SCREEN.height * 0.28,
    backgroundColor: 'rgba(11,15,24,0.55)',
  },
  scrimBottom: {
    position:        'absolute',
    bottom:          0, left: 0, right: 0,
    height:          SCREEN.height * 0.44,
    backgroundColor: 'rgba(11,15,24,0.80)',
  },
  topicPill: {
    position:          'absolute',
    top:               rh(58),
    left:              SPACING.lg,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.xs,
    backgroundColor:   'rgba(255,255,255,0.08)',
    borderRadius:      RADIUS.full,
    paddingHorizontal: rp(12),
    paddingVertical:   rp(6),
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.1)',
  },
  topicEmoji: { fontSize: rf(14) },
  topicLabel: {
    fontSize:      FONT.xs,
    fontWeight:    '600',
    color:         'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  viewsBadge: {
    position:      'absolute',
    top:           rh(62),
    right:         SPACING.lg,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  viewsText: {
    fontSize:   FONT.xs,
    color:      'rgba(255,255,255,0.38)',
    fontWeight: '500',
  },
  centerContent: {
    position:          'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: rp(36),
    paddingVertical:   rh(120),
  },
  quoteChar: {
    position:    'absolute',
    top:         rh(-10),
    left:        rp(16),
    fontFamily:  'PlayfairDisplay_700Bold',
    fontSize:    rf(110),
    color:       'rgba(255,99,74,0.07)',
    lineHeight:  rf(110),
  },
  confessionText: {
    fontFamily:       'PlayfairDisplay_500Medium',
    fontSize:         rf(25),
    lineHeight:       rf(25) * 1.58,
    color:            THEME.text,
    textAlign:        'center',
    letterSpacing:    0.15,
    textShadowColor:  'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  confessionTextSmall: {
    fontSize:   rf(20),
    lineHeight: rf(20) * 1.62,
  },
  bottomRow: {
    position:       'absolute',
    bottom:         rh(44),
    left:           SPACING.lg,
    right:          SPACING.lg,
    flexDirection:  'row',
    alignItems:     'flex-end',
    justifyContent: 'space-between',
  },
  authorBlock: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
    flex:          1,
    paddingRight:  SPACING.md,
  },
  avatar: {
    width:           rs(42),
    height:          rs(42),
    borderRadius:    RADIUS.full,
    backgroundColor: THEME.primary,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1.5,
    borderColor:     'rgba(255,255,255,0.12)',
  },
  avatarText: {
    fontSize:   rf(17),
    fontWeight: '700',
    color:      '#fff',
  },
  authorName: {
    fontSize:     FONT.sm,
    fontWeight:   '600',
    color:        THEME.text,
    marginBottom: 2,
  },
  extraTopics: {
    fontSize: rf(12),
    opacity:  0.65,
  },
  actions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.lg,
  },
  actionBtn: {
    alignItems:     'center',
    justifyContent: 'center',
    gap:            3,
    minWidth:       rs(32),
  },
  actionCount: {
    fontSize:         FONT.xs,
    fontWeight:       '700',
    color:            'rgba(255,255,255,0.88)',
    textShadowColor:  'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
