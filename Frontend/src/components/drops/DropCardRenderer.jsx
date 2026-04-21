/**
 * DropCardRenderer.jsx
 *
 * The visual heart of Anonixx Drops.
 * Renders a confession card with four zones, dynamic variation, and 14 themes.
 *
 *   Zone 1 — Background (diagonal gradient, grain, ghost quote mark)
 *   Zone 2 — Confession text (Playfair Italic, auto-scaling, accent line)
 *   Zone 3 — Mood tag + optional emotional context
 *   Zone 4 — Identity bar (anonixx + deep link)
 *
 * Renders at card aspect (1:1 square) — scales to parent width.
 * Use <DropCardRenderer confession=... theme=... /> anywhere a card is needed.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { rf, rp, rs } from '../../utils/responsive';

// ─── Themes ───────────────────────────────────────────────────
// Each theme defines the mood. Tier 1 is open to all, Tier 2 requires 18+ opt-in.
export const DROP_THEMES = {
  // ── Tier 1 ──
  'cinematic-coral': {
    tier: 1,
    label: 'Cinematic Coral',
    bgFrom: '#0b0f18', bgTo: '#131825',
    accent: '#FF634A', accentGlow: 'rgba(255,99,74,0.12)',
    textColor: '#EAEAF0', ghostColor: 'rgba(255,255,255,0.04)',
    moodColor: '#9A9AA3', identityColor: '#FF634A',
  },
  'midnight': {
    tier: 1,
    label: 'Midnight',
    bgFrom: '#05070d', bgTo: '#0d1223',
    accent: '#4A6FFF', accentGlow: 'rgba(74,111,255,0.10)',
    textColor: '#EAEAF0', ghostColor: 'rgba(74,111,255,0.05)',
    moodColor: '#7E88A6', identityColor: '#4A6FFF',
  },
  'desire': {
    tier: 1,
    label: 'Desire',
    bgFrom: '#14060a', bgTo: '#2a0f18',
    accent: '#FF3B7A', accentGlow: 'rgba(255,59,122,0.14)',
    textColor: '#F6E6EC', ghostColor: 'rgba(255,59,122,0.05)',
    moodColor: '#C48A98', identityColor: '#FF3B7A',
  },
  'devotion': {
    tier: 1,
    label: 'Devotion',
    bgFrom: '#120a1c', bgTo: '#261640',
    accent: '#B388FF', accentGlow: 'rgba(179,136,255,0.12)',
    textColor: '#EDE4FF', ghostColor: 'rgba(179,136,255,0.05)',
    moodColor: '#9D8BB8', identityColor: '#B388FF',
  },
  'solitude': {
    tier: 1,
    label: 'Solitude',
    bgFrom: '#0a0f14', bgTo: '#1a2332',
    accent: '#7DD3C0', accentGlow: 'rgba(125,211,192,0.10)',
    textColor: '#E4F0EC', ghostColor: 'rgba(255,255,255,0.03)',
    moodColor: '#8CA89F', identityColor: '#7DD3C0',
  },
  'flame': {
    tier: 1,
    label: 'Flame',
    bgFrom: '#1a0a05', bgTo: '#2e1408',
    accent: '#FF9040', accentGlow: 'rgba(255,144,64,0.14)',
    textColor: '#FFE8D6', ghostColor: 'rgba(255,144,64,0.05)',
    moodColor: '#C49880', identityColor: '#FF9040',
  },
  'confession': {
    tier: 1,
    label: 'Confession',
    bgFrom: '#0c0a14', bgTo: '#1d1828',
    accent: '#F5E6C8', accentGlow: 'rgba(245,230,200,0.08)',
    textColor: '#F5E6C8', ghostColor: 'rgba(245,230,200,0.04)',
    moodColor: '#A89B82', identityColor: '#F5E6C8',
  },
  'secret': {
    tier: 1,
    label: 'Secret',
    bgFrom: '#060a10', bgTo: '#0f1822',
    accent: '#4FBDDB', accentGlow: 'rgba(79,189,219,0.10)',
    textColor: '#DDEEF5', ghostColor: 'rgba(79,189,219,0.04)',
    moodColor: '#7A9AA8', identityColor: '#4FBDDB',
  },
  'ash': {
    tier: 1,
    label: 'Ash',
    bgFrom: '#0e0e0e', bgTo: '#1c1c1c',
    accent: '#C9C9C9', accentGlow: 'rgba(201,201,201,0.08)',
    textColor: '#E8E8E8', ghostColor: 'rgba(255,255,255,0.04)',
    moodColor: '#8A8A8A', identityColor: '#C9C9C9',
  },

  // ── Tier 2 (18+ verified, explicit opt-in required) ──
  'after-dark': {
    tier: 2,
    label: 'After Dark',
    bgFrom: '#08020c', bgTo: '#1a0824',
    accent: '#B026FF', accentGlow: 'rgba(176,38,255,0.14)',
    textColor: '#EEDDFF', ghostColor: 'rgba(176,38,255,0.05)',
    moodColor: '#8B6BA8', identityColor: '#B026FF',
  },
  'uncensored': {
    tier: 2,
    label: 'Uncensored',
    bgFrom: '#120202', bgTo: '#2a0808',
    accent: '#FF1744', accentGlow: 'rgba(255,23,68,0.16)',
    textColor: '#FFE0E4', ghostColor: 'rgba(255,23,68,0.06)',
    moodColor: '#B07078', identityColor: '#FF1744',
  },
  'forbidden': {
    tier: 2,
    label: 'Forbidden',
    bgFrom: '#0a0005', bgTo: '#1f0612',
    accent: '#D4004F', accentGlow: 'rgba(212,0,79,0.14)',
    textColor: '#F5D8E2', ghostColor: 'rgba(212,0,79,0.06)',
    moodColor: '#A06880', identityColor: '#D4004F',
  },
  'bare': {
    tier: 2,
    label: 'Bare',
    bgFrom: '#0d0806', bgTo: '#1f140e',
    accent: '#E8A87C', accentGlow: 'rgba(232,168,124,0.12)',
    textColor: '#F2E4D6', ghostColor: 'rgba(232,168,124,0.06)',
    moodColor: '#A8907C', identityColor: '#E8A87C',
  },
  'midnight-sin': {
    tier: 2,
    label: 'Midnight Sin',
    bgFrom: '#02030a', bgTo: '#0a0418',
    accent: '#FF006E', accentGlow: 'rgba(255,0,110,0.14)',
    textColor: '#F2D8E4', ghostColor: 'rgba(255,0,110,0.05)',
    moodColor: '#A0708A', identityColor: '#FF006E',
  },
};

export const TIER_1_THEMES = Object.entries(DROP_THEMES)
  .filter(([, t]) => t.tier === 1)
  .map(([id, t]) => ({ id, ...t }));

export const TIER_2_THEMES = Object.entries(DROP_THEMES)
  .filter(([, t]) => t.tier === 2)
  .map(([id, t]) => ({ id, ...t }));

// ─── Text sizing ─────────────────────────────────────────────
// Scales confession text based on length — the shorter the confession,
// the bigger it breathes on the card.
const getConfessionFontSize = (text, cardWidth) => {
  const len = text?.length || 0;
  // Base sizes are at 1080px card width — scale proportionally to actual render width.
  const scale = cardWidth / 1080;
  if (len < 80)        return Math.round(52 * scale);
  if (len < 160)       return Math.round(44 * scale);
  if (len < 240)       return Math.round(36 * scale);
  return Math.round(32 * scale);
};

// ─── Tease mode ──────────────────────────────────────────────
// Cuts confession at a tension point — mid-thought, never at a period.
// Approx 60-70% through the text, preferably after "I", "you", "we", "—".
const applyTease = (text) => {
  if (!text || text.length < 40) return { body: text, teased: false };
  const cutZone = Math.floor(text.length * 0.65);
  // Find the best cut point near the target — prefer after a dash or pronoun.
  const windowStart = Math.max(20, cutZone - 25);
  const windowEnd = Math.min(text.length - 10, cutZone + 25);
  const candidates = [];
  for (let i = windowStart; i < windowEnd; i++) {
    const ch = text[i];
    const next = text[i + 1];
    // Prefer cutting after a dash or at a pronoun
    if (ch === '—') candidates.push({ idx: i + 1, score: 10 });
    else if (ch === ' ' && next && /^[A-Z]/.test(next)) candidates.push({ idx: i, score: 5 });
    else if (ch === ' ') candidates.push({ idx: i, score: 2 });
  }
  if (candidates.length === 0) return { body: text, teased: false };
  candidates.sort((a, b) => b.score - a.score);
  const cut = candidates[0].idx;
  return {
    body: text.slice(0, cut).trimEnd() + '—',
    teased: true,
  };
};

// ─── Dynamic variation ───────────────────────────────────────
// Deterministic per-card variation from a seed (drop ID or confession hash).
// Prevents visual fatigue across the feed without looking random.
const stringSeed = (s) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

const getVariation = (seed) => {
  const s = stringSeed(seed);
  const rare = (s % 20) === 0;
  return {
    textShiftY:       ((s % 40) - 20),           // ±20px
    moodAlign:        (s % 2) === 0 ? 'left' : 'center',
    accentHeight:     0.85 + ((s % 30) / 100),   // 85% to 115%
    quoteTop:         -((s % 40) + 20),          // vertical position of ghost quote
    quoteLeft:        -((s % 30) + 10),
    rare,
  };
};

// ─── Main component ──────────────────────────────────────────
const DropCardRenderer = React.memo(function DropCardRenderer({
  confession      = '',
  moodTag         = 'longing',
  emotionalContext= null,         // "written at 2:14am" | "kept for 3 years"
  teaseMode       = false,        // forces tease regardless of random
  theme           = 'cinematic-coral',
  mediaUrl        = null,         // image/video background (overlay mode)
  layoutMode      = 'split',      // 'split' | 'overlay' (for image/video drops)
  confessionId    = null,         // deep-link slug
  seed            = null,         // for variation — defaults to confession text
  cardWidth       = 360,          // scales everything proportionally
  showIdentityBar = true,
}) {
  const t = DROP_THEMES[theme] || DROP_THEMES['cinematic-coral'];
  const variation = useMemo(() => getVariation(seed || confession), [seed, confession]);
  const teaseResult = useMemo(
    () => (teaseMode ? applyTease(confession) : { body: confession, teased: false }),
    [confession, teaseMode]
  );

  const fontSize = getConfessionFontSize(teaseResult.body, cardWidth);
  const identityBarHeight = Math.round(cardWidth * 0.08); // 8% of card

  // Overlay mode — media fills the card, text sits on gradient
  if (layoutMode === 'overlay' && mediaUrl) {
    return (
      <View style={[styles.card, { width: cardWidth, height: cardWidth, backgroundColor: t.bgFrom }]}>
        <ImageBackground source={{ uri: mediaUrl }} style={styles.overlayMedia} resizeMode="cover">
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
            locations={[0.3, 0.7, 1]}
            style={styles.overlayGradient}
          >
            {/* Ghost quote */}
            <Text
              pointerEvents="none"
              style={[styles.ghostQuote, {
                color: t.ghostColor,
                fontSize: Math.round(cardWidth * 0.6),
                top: variation.quoteTop,
                left: variation.quoteLeft,
              }]}
            >
              "
            </Text>

            {/* Confession */}
            <View style={[styles.overlayTextWrap, { paddingBottom: showIdentityBar ? identityBarHeight + rp(16) : rp(24) }]}>
              <View style={[styles.accentLine, {
                backgroundColor: t.accent,
                opacity: 0.7,
                height: Math.round(fontSize * 2.4 * variation.accentHeight),
              }]} />
              <Text
                style={[styles.overlayText, {
                  color: t.textColor,
                  fontSize,
                  textShadowColor: 'rgba(0,0,0,0.8)',
                  textShadowRadius: 12,
                  textShadowOffset: { width: 0, height: 2 },
                }]}
              >
                {teaseResult.body}
              </Text>
              {teaseResult.teased && (
                <Text style={[styles.teaseHint, { color: t.accent }]}>read the full confession →</Text>
              )}
            </View>
          </LinearGradient>
        </ImageBackground>

        {showIdentityBar && (
          <IdentityBar
            theme={t}
            height={identityBarHeight}
            confessionId={confessionId}
            overlay
          />
        )}
      </View>
    );
  }

  // Standard / split layout
  return (
    <LinearGradient
      colors={[t.bgFrom, t.bgTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { width: cardWidth, height: cardWidth }]}
    >
      {/* Faint grain / glow overlay — rare variant gets stronger */}
      <View
        pointerEvents="none"
        style={[styles.glow, {
          backgroundColor: t.accentGlow,
          opacity: variation.rare ? 0.18 : 0.10,
        }]}
      />

      {/* Ghost quote mark — Playfair, partially cropped */}
      <Text
        pointerEvents="none"
        style={[styles.ghostQuote, {
          color: t.ghostColor,
          fontSize: Math.round(cardWidth * 0.6),
          top: variation.quoteTop,
          left: variation.quoteLeft,
        }]}
      >
        "
      </Text>

      {/* Media zone for split-layout image/video drops */}
      {layoutMode === 'split' && mediaUrl ? (
        <>
          {/* Top 52% — confession text */}
          <View style={[styles.splitTextZone, {
            height: Math.round(cardWidth * 0.52),
            transform: [{ translateY: variation.textShiftY }],
          }]}>
            <ConfessionBlock
              theme={t}
              text={teaseResult.body}
              teased={teaseResult.teased}
              fontSize={fontSize}
              accentHeight={variation.accentHeight}
            />
            <MoodBlock
              theme={t}
              moodTag={moodTag}
              emotionalContext={emotionalContext}
              align={variation.moodAlign}
            />
          </View>
          {/* Bottom 40% — image */}
          <View style={[styles.splitMediaZone, {
            height: Math.round(cardWidth * 0.40),
            borderTopColor: t.accent + '66',
          }]}>
            <ImageBackground
              source={{ uri: mediaUrl }}
              style={{ flex: 1 }}
              resizeMode="cover"
            />
          </View>
        </>
      ) : (
        // Text-only card
        <View style={[styles.textCardContent, {
          transform: [{ translateY: variation.textShiftY }],
          paddingBottom: showIdentityBar ? identityBarHeight + rp(16) : rp(24),
        }]}>
          <ConfessionBlock
            theme={t}
            text={teaseResult.body}
            teased={teaseResult.teased}
            fontSize={fontSize}
            accentHeight={variation.accentHeight}
          />
          <MoodBlock
            theme={t}
            moodTag={moodTag}
            emotionalContext={emotionalContext}
            align={variation.moodAlign}
          />
        </View>
      )}

      {showIdentityBar && (
        <IdentityBar
          theme={t}
          height={identityBarHeight}
          confessionId={confessionId}
        />
      )}
    </LinearGradient>
  );
});

// ─── Sub-components ──────────────────────────────────────────
const ConfessionBlock = React.memo(function ConfessionBlock({
  theme, text, teased, fontSize, accentHeight,
}) {
  return (
    <View style={styles.confessionRow}>
      <View style={[styles.accentLine, {
        backgroundColor: theme.accent,
        opacity: 0.7,
        height: Math.round(fontSize * 2.4 * accentHeight),
      }]} />
      <View style={styles.confessionTextWrap}>
        <Text
          style={{
            fontFamily:    'PlayfairDisplay-Italic',
            fontSize,
            lineHeight:    Math.round(fontSize * 1.6),
            letterSpacing: 0.3,
            color:         theme.textColor,
          }}
        >
          {text}
        </Text>
        {teased && (
          <Text style={[styles.teaseHint, { color: theme.accent }]}>
            read the full confession →
          </Text>
        )}
      </View>
    </View>
  );
});

const MoodBlock = React.memo(function MoodBlock({
  theme, moodTag, emotionalContext, align,
}) {
  return (
    <View style={[styles.moodWrap, { alignItems: align === 'center' ? 'center' : 'flex-start' }]}>
      <Text style={{
        fontFamily:    'DMSans-Regular',
        fontSize:      rf(11),
        color:         theme.moodColor,
        letterSpacing: 3,
      }}>
        · {moodTag} ·
      </Text>
      {emotionalContext ? (
        <Text style={{
          fontFamily: 'DMSans-Italic',
          fontSize:   rf(10),
          color:      theme.moodColor,
          opacity:    0.5,
          marginTop:  rp(4),
        }}>
          {emotionalContext}
        </Text>
      ) : null}
    </View>
  );
});

const IdentityBar = React.memo(function IdentityBar({ theme, height, confessionId, overlay }) {
  return (
    <View style={[styles.identityBar, {
      height,
      backgroundColor: overlay ? 'rgba(21,25,36,0.85)' : '#151924',
      borderTopColor:  'rgba(255,255,255,0.06)',
    }]}>
      <Text style={{
        fontFamily:    'DMSans-Bold',
        fontSize:      rf(13),
        color:         theme.identityColor,
        letterSpacing: -0.3,
      }}>
        anonixx
      </Text>
      <Text style={{
        fontFamily: 'DMSans-Regular',
        fontSize:   rf(10),
        color:      '#9A9AA3',
      }}>
        anonixx.app/c/{(confessionId || '••••••').toString().slice(0, 8)}
      </Text>
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderRadius: rs(16),
    overflow:     'hidden',
    position:     'relative',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
  },
  ghostQuote: {
    position:     'absolute',
    fontFamily:   'PlayfairDisplay-Bold',
    lineHeight:   undefined,
    includeFontPadding: false,
  },

  // Text-only card
  textCardContent: {
    flex:              1,
    paddingHorizontal: rp(22),
    paddingTop:        rp(28),
    justifyContent:    'center',
  },

  // Split layout
  splitTextZone: {
    paddingHorizontal: rp(22),
    paddingTop:        rp(24),
    justifyContent:    'center',
  },
  splitMediaZone: {
    borderTopWidth: 1,
  },

  // Confession block
  confessionRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
  },
  accentLine: {
    width:         rs(3),
    borderRadius:  rs(2),
    marginRight:   rp(14),
  },
  confessionTextWrap: {
    flex: 1,
  },
  teaseHint: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(12),
    marginTop:  rp(12),
  },

  // Mood block
  moodWrap: {
    marginTop: rp(20),
  },

  // Identity bar
  identityBar: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: rp(20),
    borderTopWidth:    1,
  },

  // Overlay mode
  overlayMedia: {
    flex: 1,
  },
  overlayGradient: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayTextWrap: {
    paddingHorizontal: rp(22),
    paddingBottom:     rp(24),
    flexDirection:     'row',
    alignItems:        'flex-start',
  },
  overlayText: {
    flex:       1,
    fontFamily: 'PlayfairDisplay-Italic',
    lineHeight: undefined,
  },
});

export default DropCardRenderer;
