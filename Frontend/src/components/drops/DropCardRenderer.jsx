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
import { View, Text, TextInput, StyleSheet, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { rf, rp, rs } from '../../utils/responsive';

// ─── Themes ───────────────────────────────────────────────────
// Each theme defines the mood. Tier 1 is open to all, Tier 2 requires 18+
// verification + a separate explicit-content opt-in (see api/v1/drops.py).
// Reduced to 3 curated themes — mirrors Backend/app/api/v1/drops.py's
// TIER_1_THEMES/TIER_2_THEMES exactly, keep both in sync if this changes.
export const DROP_THEMES = {
  // ── Tier 1 ──
  'desire': {
    tier: 1,
    label: 'Desire',
    bgFrom: '#14060a', bgTo: '#2a0f18',
    accent: '#FF3B7A', accentGlow: 'rgba(255,59,122,0.14)',
    textColor: '#F6E6EC', ghostColor: 'rgba(255,59,122,0.05)',
    moodColor: '#C48A98', identityColor: '#FF3B7A',
  },

  // ── Tier 2 (18+ verified, explicit opt-in required) ──
  // Midnight Sin listed first within this tier per request — still gated
  // identically to After Dark, this only affects display order.
  'midnight-sin': {
    tier: 2,
    label: 'Midnight Sin',
    bgFrom: '#02030a', bgTo: '#0a0418',
    accent: '#FF006E', accentGlow: 'rgba(255,0,110,0.14)',
    textColor: '#F2D8E4', ghostColor: 'rgba(255,0,110,0.05)',
    moodColor: '#A0708A', identityColor: '#FF006E',
  },
  'after-dark': {
    tier: 2,
    label: 'After Dark',
    bgFrom: '#08020c', bgTo: '#1a0824',
    accent: '#B026FF', accentGlow: 'rgba(176,38,255,0.14)',
    textColor: '#EEDDFF', ghostColor: 'rgba(176,38,255,0.05)',
    moodColor: '#8B6BA8', identityColor: '#B026FF',
  },
};

export const TIER_1_THEMES = Object.entries(DROP_THEMES)
  .filter(([, t]) => t.tier === 1)
  .map(([id, t]) => ({ id, ...t }));

export const TIER_2_THEMES = Object.entries(DROP_THEMES)
  .filter(([, t]) => t.tier === 2)
  .map(([id, t]) => ({ id, ...t }));

// ─── Card font styles ──────────────────────────────────────────
// `fontFamily` names map to real loaded assets (see src/config/fonts.js,
// wired up via useFonts() in App.js) — the fontStyle/fontWeight/
// letterSpacing values below are kept alongside them as a second layer
// of differentiation on top of the actual typeface change.
const CARD_FONT_STYLES = {
  'classic': {
    fontFamily:    'PlayfairDisplay-Italic',
    fontStyle:     'italic',
    fontWeight:    '400',
    letterSpacing: 0.3,
  },
  'sultry-script': {
    fontFamily:    'DancingScript-Regular',
    fontStyle:     'italic',
    fontWeight:    '300',
    letterSpacing: 0,
  },
  'bold-tease': {
    fontFamily:    'Montserrat-ExtraBold',
    fontStyle:     'normal',
    fontWeight:    '800',
    letterSpacing: 0.6,
  },
};

// ─── Text sizing ─────────────────────────────────────────────
// Scales confession text based on length — the shorter the confession,
// the bigger it breathes on the card.
const getConfessionFontSize = (text, cardWidth) => {
  const len = text?.length || 0;
  // Base sizes are at 1080px card width — scale proportionally to actual render width.
  // Bumped up from 52/44/36/32 — the card's whole job is to be a bold,
  // stop-the-scroll visual; the text is the one thing on it that has to
  // carry that, so it needs more visual weight than a body-text size.
  const scale = cardWidth / 1080;
  if (len < 80)        return Math.round(68 * scale);
  if (len < 160)       return Math.round(56 * scale);
  if (len < 240)       return Math.round(46 * scale);
  return Math.round(40 * scale);
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
  theme           = 'desire',
  mediaUrl        = null,         // image/video background (overlay mode)
  layoutMode      = 'split',      // 'split' | 'overlay' (for image/video drops)
  confessionId    = null,         // deep-link slug
  seed            = null,         // for variation — defaults to confession text
  cardWidth       = 360,          // scales everything proportionally
  showIdentityBar = true,
  // Compose-mode: type directly into the rendered card instead of a
  // separate input box. Tease-cutting is a reader-facing effect, so it's
  // suppressed while editable — the writer always sees their own full text.
  editable        = false,
  onChangeText    = null,
  placeholder     = '',
  maxLength       = null,
  // Card font style — "classic" | "sultry-script" | "bold-tease". Family
  // names below are aspirational (no custom fonts are loaded anywhere in
  // this app yet — see CARD_FONT_STYLES comment); the italic/weight/
  // letter-spacing values are what actually render the difference today.
  fontStyle       = 'classic',
}) {
  const t = DROP_THEMES[theme] || DROP_THEMES['desire'];
  const variation = useMemo(() => getVariation(seed || confession), [seed, confession]);
  const teaseResult = useMemo(
    () => (teaseMode && !editable ? applyTease(confession) : { body: confession, teased: false }),
    [confession, teaseMode, editable]
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
                <Text style={[styles.teaseHint, { color: t.accent }]}>see where this goes →</Text>
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
              editable={editable}
              onChangeText={onChangeText}
              placeholder={placeholder}
              maxLength={maxLength}
              fontStyle={fontStyle}
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
            editable={editable}
            onChangeText={onChangeText}
            placeholder={placeholder}
            maxLength={maxLength}
            fontStyle={fontStyle}
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
  editable, onChangeText, placeholder, maxLength, fontStyle,
}) {
  const fontDef = CARD_FONT_STYLES[fontStyle] || CARD_FONT_STYLES['classic'];
  const textStyle = {
    fontFamily:    fontDef.fontFamily,
    fontStyle:     fontDef.fontStyle,
    fontWeight:    fontDef.fontWeight,
    fontSize,
    lineHeight:    Math.round(fontSize * 1.6),
    letterSpacing: fontDef.letterSpacing,
    color:         theme.textColor,
  };
  return (
    <View style={styles.confessionRow}>
      <View style={[styles.accentLine, {
        backgroundColor: theme.accent,
        opacity: 0.7,
        height: Math.round(fontSize * 2.4 * accentHeight),
      }]} />
      <View style={styles.confessionTextWrap}>
        {editable ? (
          <TextInput
            style={[textStyle, styles.confessionInput]}
            value={text}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={theme.textColor + '55'}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            maxLength={maxLength || undefined}
            autoCapitalize="sentences"
            autoCorrect
          />
        ) : (
          <Text style={textStyle}>{text}</Text>
        )}
        {teased && (
          <Text style={[styles.teaseHint, { color: theme.accent }]}>
            see where this goes →
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
  confessionInput: {
    padding:        0,
    margin:         0,
    textAlignVertical: 'top',
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
