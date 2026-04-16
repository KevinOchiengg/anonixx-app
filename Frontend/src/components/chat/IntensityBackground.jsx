/**
 * IntensityBackground — Cipher Mesh chat background.
 *
 * Design rationale:
 *   The old "breathing glow + drifting particles" felt alive and warm,
 *   which clashed with the anonymous/encrypted vibe. This replacement
 *   uses a static staggered dot mesh (halftone cipher pattern) to
 *   communicate "your identity is encrypted here" — the same visual
 *   language used by signal-processing and cryptography diagrams.
 *
 * Layers (back → front):
 *   1. Cipher mesh   — static staggered grid of coral dots + hollow rings
 *   2. Radial glow   — faint oval at screen center, intensity-reactive
 *   3. Flash overlay — barely-visible one-shot pulse on new message
 *
 * Props:
 *   intensity  {number}  0–100
 *   event      {string|null}  'message' | 'typing' | null
 */

import React, { useEffect, useRef, memo } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

// ─── Palette ──────────────────────────────────────────────────
const CORAL = '#FF634A';

// ─── Mesh config ─────────────────────────────────────────────
const DOT_GAP  = 28;                                 // px between dot centres
const DOT_R    = 1.8;                                // filled dot radius
const RING_R   = 3.2;                                // hollow ring outer radius
const COLS     = Math.ceil(W / DOT_GAP) + 2;
const ROWS     = Math.ceil(H / DOT_GAP) + 2;

// Build once at module level (Rule 5 — no per-render allocation)
const DOTS = Object.freeze(
  Array.from({ length: COLS * ROWS }, (_, i) => {
    const col     = i % COLS;
    const row     = Math.floor(i / COLS);
    const stagger = (row % 2) * (DOT_GAP / 2);
    // Make ~1 in every 11 dots a hollow ring to add cipher texture
    const isRing  = (col * 3 + row * 7) % 11 === 0;
    // Subtle opacity variation so the mesh has organic depth
    const opacity = isRing
      ? 0.05 + ((col + row) % 3) * 0.012
      : 0.028 + ((col * 2 + row * 5) % 4) * 0.007;
    return {
      id:      i,
      x:       col * DOT_GAP + stagger - DOT_GAP,
      y:       row * DOT_GAP - DOT_GAP,
      isRing,
      opacity,
    };
  })
);

// ─── Static mesh (no animation — zero JS-thread cost) ─────────
const CipherMesh = memo(() => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {DOTS.map((d) =>
      d.isRing ? (
        <View
          key={d.id}
          style={{
            position:    'absolute',
            left:        d.x - RING_R,
            top:         d.y - RING_R,
            width:       RING_R * 2,
            height:      RING_R * 2,
            borderRadius: RING_R,
            borderWidth:  1,
            borderColor: `rgba(255,99,74,${d.opacity})`,
          }}
        />
      ) : (
        <View
          key={d.id}
          style={{
            position:        'absolute',
            left:            d.x - DOT_R,
            top:             d.y - DOT_R,
            width:           DOT_R * 2,
            height:          DOT_R * 2,
            borderRadius:    DOT_R,
            backgroundColor: `rgba(255,99,74,${d.opacity})`,
          }}
        />
      )
    )}
  </View>
));

// ─── Main component ───────────────────────────────────────────
function IntensityBackground({ event = null }) {
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Micro-flash on new message (barely perceptible — 3% max)
  useEffect(() => {
    if (!event) return;
    const peak = event === 'message' ? 0.030 : 0.015;
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: peak, duration: 160, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0,    duration: 380, useNativeDriver: true }),
    ]).start();
  }, [event]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Layer 1 — static cipher mesh */}
      <CipherMesh />

      {/* Layer 2 — micro-flash on new message */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { opacity: flashAnim }]}
      />
    </View>
  );
}

export default memo(IntensityBackground);

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CORAL,
  },
});
