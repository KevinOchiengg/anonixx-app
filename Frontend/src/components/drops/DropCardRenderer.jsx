/**
 * DropCardRenderer.jsx
 *
 * The visual heart of Anonixx Drops.
 * Renders a confession card with four zones, dynamic variation, and 14 themes.
 *
 *   Zone 1 — Background (diagonal gradient, grain, ghost quote mark)
 *   Zone 2 — Confession text (Playfair Italic, auto-scaling, accent line)
 *   Zone 3 — Mood tag + optional emotional context
 *   Zone 4 — Identity bar (anonixx wordmark)
 *
 * Renders at card aspect (1:1 square) — scales to parent width.
 * Use <DropCardRenderer confession=... theme=... /> anywhere a card is needed.
 */
import React, { useMemo, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import Svg, { Circle, Line } from 'react-native-svg';
import { rf, rp, rs } from '../../utils/responsive';

// ─── Themes ───────────────────────────────────────────────────
// After Dark / Tier-2 themes have been removed entirely — every drop uses
// the same base theme now. What used to be theme-based colors are now
// driven by confession type instead (see CARD_INTENTS below).
export const DROP_THEMES = {
  'desire': {
    tier: 1,
    label: 'Desire',
    bgFrom: '#14060a', bgTo: '#2a0f18',
    accent: '#FF3B7A', accentGlow: 'rgba(255,59,122,0.14)',
    textColor: '#F6E6EC', ghostColor: 'rgba(255,59,122,0.05)',
    moodColor: '#C48A98', identityColor: '#FF3B7A',
  },
};

// ─── Confession types ──────────────────────────────────────────
// The audience/nature a drop is written for — chosen at compose time
// (DropsComposeScreen's "Confession Type" picker). It owns the card's whole
// visual identity: palette + a distinct background pattern (see
// CARD_PATTERNS below). When `intent` is passed to DropCardRenderer and
// matches a key here, it overrides the theme-derived palette entirely.
// Trimmed to the 3 broadest intents + General as the default catch-all —
// Single Parent / Gay / Lesbian were cut in favor of covering the widest
// range of "why someone opens the app" (casual / serious / just lonely)
// rather than specific-audience recognition.
// Kept in sync with VALID_INTENTS in Backend/app/api/v1/drops.py — same ids.
// Key order here IS the picker's display order (CARD_INTENT_LIST below is
// built straight off Object.entries), so reordering these reorders the UI.
// Renamed 2026-09-10 from real-connection / general / no-strings /
// generous-arrangement. Old ids may still exist on drops written before
// this migration ran — see scripts/migrate_intent_ids.py.
export const CARD_INTENTS = {
  'meet-me': {
    // Dating / serious relationship — actually looking for something
    // that lasts, not just tonight.
    label: 'Meet Me',
    sublabel: 'looking for something real',
    pattern: 'constellation',
    moodTag: 'longing',
    bgFrom: '#12070c', bgTo: '#2a121b',
    accent: '#FF6B8A', accentGlow: 'rgba(255,107,138,0.16)',
    textColor: '#FBE8ED', ghostColor: 'rgba(255,107,138,0.06)',
    moodColor: '#C98A9B', identityColor: '#FF6B8A',
  },
  'skeleton-in-the-closet': {
    // Catch-all confessions — the things that are hard to say to anyone
    // you actually know.
    label: 'Skeleton In The Closet',
    sublabel: "secrets don't stay buried",
    pattern: 'none',
    moodTag: 'untold',
    bgFrom: '#14060a', bgTo: '#2a0f18',
    accent: '#FF3B7A', accentGlow: 'rgba(255,59,122,0.14)',
    textColor: '#F6E6EC', ghostColor: 'rgba(255,59,122,0.05)',
    moodColor: '#C48A98', identityColor: '#FF3B7A',
  },
  'just-tonight': {
    // Casual, no strings attached — the tagline carries the meaning now,
    // no acronym to decode.
    label: 'Just Tonight',
    sublabel: 'no strings attached affair',
    pattern: 'streaks',
    moodTag: 'horny',
    bgFrom: '#0a0000', bgTo: '#2b0505',
    accent: '#FF1744', accentGlow: 'rgba(255,23,68,0.18)',
    textColor: '#FFE4E4', ghostColor: 'rgba(255,23,68,0.06)',
    moodColor: '#C97A7A', identityColor: '#FF1744',
  },
  'the-exchange': {
    // Paid arrangement — services for a token, 18+.
    label: 'The Exchange',
    sublabel: 'services for a token',
    pattern: 'ripples',
    moodTag: 'discreet',
    bgFrom: '#050e14', bgTo: '#0e2432',
    accent: '#4FC3E8', accentGlow: 'rgba(79,195,232,0.16)',
    textColor: '#E3F6FC', ghostColor: 'rgba(79,195,232,0.06)',
    moodColor: '#7FAAB8', identityColor: '#4FC3E8',
  },
};

export const CARD_INTENT_LIST = Object.entries(CARD_INTENTS).map(([id, v]) => ({ id, ...v }));

// ─── Seeded PRNG ────────────────────────────────────────────────
// mulberry32 — small, fast, deterministic from a numeric seed. Used to
// place pattern elements so the same confession always renders the same
// pattern (no flicker/reflow), while different confessions get visibly
// different layouts within the same intent.
const mulberry32 = (seed) => {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ─── Background patterns ────────────────────────────────────────
// Each draws behind the confession text at low opacity, stroke-only (no
// fill) so it reads as texture, not decoration competing with the words.
// This is the thing a screenshot needs to stop a thumb mid-scroll — every
// pattern is intent-specific, not a generic wash.
// Exported so the compose screen's confession-type picker can render the
// same texture in miniature — the tile previews the real card, rather than
// standing in for it with an unrelated icon.
export const CardPattern = React.memo(function CardPattern({ type, width, height, color, seed }) {
  if (!type || type === 'none') return null;
  const rand = mulberry32((seed >>> 0) || 1);
  const els = [];

  if (type === 'streaks') {
    // Sharp diagonal streaks, urgent energy, uneven rhythm from seed.
    const n = 7;
    let x = -width * 0.15;
    for (let i = 0; i < n; i++) {
      x += width * (0.1 + rand() * 0.09);
      const len = height * (0.5 + rand() * 0.5);
      const skew = width * 0.22;
      els.push(
        <Line key={i}
          x1={x} y1={height} x2={x + skew} y2={height - len}
          stroke={color} strokeWidth={i % 3 === 0 ? 2.4 : 1.1}
          opacity={0.16 + (i % 3 === 0 ? 0.16 : 0)} />
      );
    }
  }

  if (type === 'constellation') {
    // Scattered points connected by thin lines — finding each other.
    const n = 9;
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({ x: rand() * width, y: rand() * height, r: 1.2 + rand() * 1.6 });
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1 + Math.floor(rand() * 2)) % pts.length];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < width * 0.55) {
        els.push(
          <Line key={`l${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={color} strokeWidth={0.8} opacity={0.28} />
        );
      }
    }
    pts.forEach((p, i) => els.push(
      <Circle key={`p${i}`} cx={p.x} cy={p.y} r={p.r} fill={color} opacity={0.55} />
    ));
  }

  if (type === 'ripples') {
    // Concentric ripples from an off-center source — a voice reaching out.
    const cx = width * (0.6 + rand() * 0.25);
    const cy = height * (0.2 + rand() * 0.2);
    for (let i = 0; i < 6; i++) {
      const r = width * (0.1 + i * 0.11);
      els.push(
        <Circle key={i} cx={cx} cy={cy} r={r}
          stroke={color} strokeWidth={1} fill="none"
          opacity={0.34 - i * 0.045} />
      );
    }
  }

  return (
    <Svg
      style={[StyleSheet.absoluteFillObject, { pointerEvents: 'none' }]}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {els}
    </Svg>
  );
});

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
    // Small positive jitter, not negative — the card clips overflow, so a
    // negative top/left pushed the quote mark's top-left curl past the
    // card edge and cut it off. Keeping both >= 0 keeps the glyph's
    // characteristic shape fully visible while still varying its position.
    quoteTop:         6 + (s % 16),               // 6 to 21
    quoteLeft:         6 + (s % 12),               // 6 to 17
    rare,
  };
};

// Muted, looping, autoplaying — a silent live preview instead of a single
// freeze-frame, so a video drop's media zone actually shows what was picked
// instead of one thumbnail moment. No controls: this is a card preview, not
// a player, so there's nothing to seek or unmute.
//
// trimStart/trimEnd (seconds) are optional — when set, the loop stays
// inside that window instead of the whole file, so the compose-time
// preview matches what the trim modal actually posts.
const VideoPreviewBackground = React.memo(function VideoPreviewBackground({
  uri, style, trimStart = null, trimEnd = null,
}) {
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = trimEnd == null;
    p.muted = true;
    if (trimStart) p.currentTime = trimStart;
    p.play();
  });

  // Refs, not the timeUpdate listener's dependency — avoids re-subscribing
  // the native listener every time the trim window changes.
  const trimRef = useRef({ start: trimStart || 0, end: trimEnd });
  trimRef.current = { start: trimStart || 0, end: trimEnd };

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const { start, end } = trimRef.current;
    if (end != null && (currentTime >= end || currentTime < start)) {
      player.currentTime = start;
    }
  });

  if (!uri) return null;
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} />;
});

// ─── Main component ──────────────────────────────────────────
const DropCardRenderer = React.memo(function DropCardRenderer({
  confession      = '',
  moodTag         = 'longing',
  emotionalContext= null,         // "written at 2:14am" | "kept for 3 years"
  theme           = 'desire',
  // Confession type — "meet-me" | "skeleton-in-the-closet" | "just-tonight" |
  // "the-exchange". When set and recognized, fully overrides theme's palette
  // and adds the intent's background pattern. `theme` is only the legacy
  // fallback for drops created before intents existed.
  intent          = null,
  mediaUrl        = null,         // image/video background (overlay mode)
  mediaType       = 'image',      // 'image' | 'video' — how to render mediaUrl
  // Optional trim window (seconds) for video previews — keeps the
  // compose-time loop matching what will actually get posted once trimmed.
  trimStart       = null,
  trimEnd         = null,
  layoutMode      = 'split',      // 'split' | 'overlay' (for image/video drops)
  seed            = null,         // for variation — defaults to confession text
  cardWidth       = 360,          // scales everything proportionally
  showIdentityBar = true,
  // Compose-mode: type directly into the rendered card instead of a
  // separate input box.
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
  const t = CARD_INTENTS[intent] || DROP_THEMES[theme] || DROP_THEMES['desire'];
  const patternSeed = useMemo(
    () => stringSeed((seed || confession || '') + (intent || theme || '')),
    [seed, confession, intent, theme]
  );
  const variation = useMemo(() => getVariation(seed || confession), [seed, confession]);

  const fontSize = getConfessionFontSize(confession, cardWidth);
  const identityBarHeight = Math.round(cardWidth * 0.08); // 8% of card

  // Overlay mode — media fills the card, text sits on gradient
  if (layoutMode === 'overlay' && mediaUrl) {
    const overlayGradientContent = (
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
        locations={[0.3, 0.7, 1]}
        style={styles.overlayGradient}
      >
        {/* Ghost quote */}
        <Text
          style={[styles.ghostQuote, {
            color: t.ghostColor,
            fontSize: Math.round(cardWidth * 0.6),
            top: variation.quoteTop,
            left: variation.quoteLeft,
            pointerEvents: 'none',
          }]}
        >
          "
        </Text>

        {/* Confession */}
        <View style={[styles.overlayTextWrap, {
          paddingBottom: showIdentityBar
            ? identityBarHeight + rp(16)
            : rp(24),
        }]}>
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
            {confession}
          </Text>
        </View>
      </LinearGradient>
    );

    return (
      <View style={[styles.card, { width: cardWidth, height: cardWidth, backgroundColor: t.bgFrom }]}>
        {mediaType === 'video' ? (
          <View style={styles.overlayMedia}>
            <VideoPreviewBackground uri={mediaUrl} style={StyleSheet.absoluteFill} trimStart={trimStart} trimEnd={trimEnd} />
            {overlayGradientContent}
          </View>
        ) : (
          <ImageBackground source={{ uri: mediaUrl }} style={styles.overlayMedia} resizeMode="cover">
            {overlayGradientContent}
          </ImageBackground>
        )}

        {showIdentityBar && (
          <>
            <IdentityBar
              theme={t}
              height={identityBarHeight}
              overlay
            />
          </>
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
      {/* Decorative layer — glow, background pattern, ghost quote. Wrapped
          in one pointerEvents="none" View rather than relying on each
          native child (esp. the SVG pattern) to forward touch-passthrough
          itself — that's what was silently eating taps meant for the
          TextInput on every intent except "Skeleton In The Closet" (the only
          one with pattern: 'none', so it had no SVG in the way). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {/* Faint grain / glow overlay — rare variant gets stronger */}
        <View
          style={[styles.glow, {
            backgroundColor: t.accentGlow,
            opacity: variation.rare ? 0.18 : 0.10,
          }]}
        />

        {/* Confession-type background pattern — the thing that makes a
            screenshot of this card instantly read as "this is about X"
            before a single word is read. */}
        <CardPattern
          type={t.pattern}
          width={cardWidth}
          height={cardWidth}
          color={t.accent}
          seed={patternSeed}
        />

        {/* Ghost quote mark — Playfair, partially cropped */}
        <Text
          style={[styles.ghostQuote, {
            color: t.ghostColor,
            fontSize: Math.round(cardWidth * 0.6),
            top: variation.quoteTop,
            left: variation.quoteLeft,
          }]}
        >
          "
        </Text>
      </View>

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
              text={confession}
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
          {/* Bottom 40% — image or video */}
          <View style={[styles.splitMediaZone, {
            height: Math.round(cardWidth * 0.40),
            borderTopColor: t.accent + '66',
          }]}>
            {mediaType === 'video' ? (
              <VideoPreviewBackground uri={mediaUrl} style={{ flex: 1 }} trimStart={trimStart} trimEnd={trimEnd} />
            ) : (
              <ImageBackground
                source={{ uri: mediaUrl }}
                style={{ flex: 1 }}
                resizeMode="cover"
              />
            )}
          </View>
        </>
      ) : (
        // Text-only card
        <View style={[styles.textCardContent, {
          transform: [{ translateY: variation.textShiftY }],
          paddingBottom: showIdentityBar
            ? identityBarHeight + rp(16)
            : rp(24),
        }]}>
          <ConfessionBlock
            theme={t}
            text={confession}
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
        <>
          <IdentityBar
            theme={t}
            height={identityBarHeight}
          />
        </>
      )}
    </LinearGradient>
  );
});

// ─── Sub-components ──────────────────────────────────────────
const ConfessionBlock = React.memo(function ConfessionBlock({
  theme, text, fontSize, accentHeight,
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
          <>
            {/* Custom placeholder — deliberately its own style, not the
                chosen fontStyle (which can be an extra-bold display face).
                Playfair italic, regular weight, wide tracking: reads like
                a quiet, quoted line rather than shouted card copy. */}
            {!text && !!placeholder && (
              <Text
                pointerEvents="none"
                style={[styles.confessionInput, styles.placeholderOverlay, {
                  fontFamily:    'PlayfairDisplay-Italic',
                  fontStyle:     'italic',
                  fontWeight:    '400',
                  fontSize:      Math.round(fontSize * 0.72),
                  lineHeight:    Math.round(fontSize * 0.72 * 1.6),
                  letterSpacing: 0.4,
                  color:         theme.textColor + '66',
                }]}
              >
                {placeholder}
              </Text>
            )}
            <TextInput
              style={[textStyle, styles.confessionInput, { minHeight: Math.round(fontSize * 1.6 * 3) }]}
              value={text}
              onChangeText={onChangeText}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              maxLength={maxLength || undefined}
              autoCapitalize="sentences"
              autoCorrect
            />
          </>
        ) : (
          <Text style={textStyle}>{text}</Text>
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

const IdentityBar = React.memo(function IdentityBar({ theme, height, overlay }) {
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
  placeholderOverlay: {
    position: 'absolute',
    top:      0,
    left:     0,
    right:    0,
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
