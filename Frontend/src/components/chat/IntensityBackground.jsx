/**
 * IntensityBackground
 *
 * A layered animated background for the chat screen.
 * Evolves silently as conversation intensity (0–100) increases.
 *
 * Layers (back → front):
 *   1. Glow        — large soft oval that brightens and breathes
 *   2. Particles   — 20 small drifting dots, revealed progressively
 *   3. Flash       — one-shot pulse on new message / typing
 *
 * All animations use useNativeDriver — zero JS-thread cost during animation.
 *
 * Props:
 *   intensity  {number}  0–100, smoothly transitioned on change
 *   event      {string|null}  'message' | 'typing' | null — micro-interaction
 */

import React, { useEffect, useRef, useMemo, memo } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

// ─── Palette (Anonixx coral) ──────────────────────────────────────────────────
const CORAL       = '#FF634A';
const CORAL_GLOW  = 'rgba(255, 99, 74,';   // prefix — append opacity + ')'

// ─── Intensity level thresholds ──────────────────────────────────────────────
//   0–20  Cold       20–40  Curious    40–60  Active
//  60–80  Tension   80–100  Intimate
const LEVELS = [
  { label: 'cold',     glowMax: 0.04, breatheMax: 0.03 },
  { label: 'curious',  glowMax: 0.09, breatheMax: 0.06 },
  { label: 'active',   glowMax: 0.16, breatheMax: 0.10 },
  { label: 'tension',  glowMax: 0.24, breatheMax: 0.15 },
  { label: 'intimate', glowMax: 0.34, breatheMax: 0.22 },
];

// ─── Static particle definitions (generated once at module load) ──────────────
const PARTICLES = Object.freeze(
  Array.from({ length: 20 }, (_, i) => ({
    id:           i,
    x:            Math.random() * W,
    y:            Math.random() * H,
    size:         1.5 + Math.random() * 2.5,          // 1.5–4 px
    driftMs:      7_000 + Math.random() * 8_000,       // 7–15 s per cycle
    driftPx:      25 + Math.random() * 55,             // 25–80 px upward drift
    opacityMax:   0.12 + Math.random() * 0.22,         // 0.12–0.34 at full intensity
    // Particles are revealed progressively — particle i visible when intensity > threshold
    threshold:    i / 20,                              // 0 → 0.95  (normalized 0–1)
  }))
);

// ─── Sub-components ───────────────────────────────────────────────────────────

const Glow = memo(({ intensityAnim, breatheAnim }) => {
  // Breathe amplitude scales with intensity (multiply two native-driver values)
  const AMPLITUDE = useRef(new Animated.Value(0.25)).current;
  const breatheContrib = Animated.multiply(
    breatheAnim,
    Animated.multiply(intensityAnim, AMPLITUDE),
  );
  const BASE = useRef(new Animated.Value(1.0)).current;
  const scale = Animated.add(BASE, breatheContrib);   // 1.0 → 1.25 at full intensity

  const opacity = intensityAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [LEVELS[0].glowMax, LEVELS[4].glowMax],
  });

  return (
    <Animated.View
      style={[styles.glow, { opacity, transform: [{ scale }] }]}
      pointerEvents="none"
    />
  );
});

const Particle = memo(({ p, intensityAnim, driftAnim }) => {
  const translateY = driftAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, -p.driftPx],
  });

  const opacity = intensityAnim.interpolate({
    inputRange:  [p.threshold, Math.min(p.threshold + 0.25, 1)],
    outputRange: [0, p.opacityMax],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left:      p.x,
          top:       p.y,
          width:     p.size,
          height:    p.size,
          borderRadius: p.size / 2,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

function IntensityBackground({ intensity = 0, event = null }) {
  // Master 0–1 intensity value — smoothly transitioned
  const intensityAnim = useRef(new Animated.Value(0)).current;

  // Continuous breathing pulse (fixed speed; amplitude driven by intensity)
  const breatheAnim   = useRef(new Animated.Value(0)).current;

  // One-shot flash on message / typing event
  const flashAnim     = useRef(new Animated.Value(0)).current;

  // Per-particle drift animations
  const driftAnims = useRef(
    PARTICLES.map(() => new Animated.Value(0))
  ).current;

  // ── Breathing loop ────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1, duration: 2_800, useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 0, duration: 2_800, useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // ── Particle drift loops (staggered) ──────────────────────────────────────
  useEffect(() => {
    PARTICLES.forEach((p, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(driftAnims[i], {
            toValue:  1,
            duration: p.driftMs,
            useNativeDriver: true,
          }),
          Animated.timing(driftAnims[i], {
            toValue:  0,
            duration: p.driftMs,
            useNativeDriver: true,
          }),
        ])
      );
      // Stagger start times so particles don't all move in sync
      setTimeout(() => loop.start(), i * 310);
    });
  }, []);

  // ── Intensity transitions ─────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(intensityAnim, {
      toValue:  Math.max(0, Math.min(intensity, 100)) / 100,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [intensity]);

  // ── Micro-interaction flash ───────────────────────────────────────────────
  useEffect(() => {
    if (!event) return;

    const peak = event === 'message' ? 0.12 : 0.06;

    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: peak, duration: 180, useNativeDriver: true,
      }),
      Animated.timing(flashAnim, {
        toValue: 0, duration: 350, useNativeDriver: true,
      }),
    ]).start();
  }, [event]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Glow */}
      <Glow intensityAnim={intensityAnim} breatheAnim={breatheAnim} />

      {/* Particles */}
      {PARTICLES.map((p, i) => (
        <Particle
          key={p.id}
          p={p}
          intensityAnim={intensityAnim}
          driftAnim={driftAnims[i]}
        />
      ))}

      {/* Flash overlay */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { opacity: flashAnim }]}
      />
    </View>
  );
}

export default memo(IntensityBackground);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  glow: {
    position:     'absolute',
    width:        W * 1.4,
    height:       H * 0.65,
    borderRadius: W,
    alignSelf:    'center',
    top:          H * 0.18,
    backgroundColor: CORAL,
  },
  particle: {
    position:        'absolute',
    backgroundColor: CORAL,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CORAL,
  },
});
