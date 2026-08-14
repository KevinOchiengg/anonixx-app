/**
 * PulseLoader.jsx
 *
 * A warm, concentric heartbeat-style pulse used in place of the generic
 * native ActivityIndicator spinner across the app's core user-facing
 * moments (splash, drop landing, chat entry) — a plain spinner reads as
 * "please wait"; this reads closer to "something's about to happen."
 *
 * Not used in the admin panel — that's a utility surface, not part of the
 * product's intimacy framing, so it keeps the plain spinner.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import T from '../../utils/theme';

const RING_COUNT = 3;
const RING_DELAY_MS = 400;

export default function PulseLoader({ size = 56, color = T.primary }) {
  const anims = useRef(
    Array.from({ length: RING_COUNT }, () => ({
      scale:   new Animated.Value(0.4),
      opacity: new Animated.Value(0.7),
    }))
  ).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * RING_DELAY_MS),
          Animated.parallel([
            Animated.timing(anim.scale,   { toValue: 1,   duration: 1200, useNativeDriver: true }),
            Animated.timing(anim.opacity, { toValue: 0,   duration: 1200, useNativeDriver: true }),
          ]),
          Animated.timing(anim.scale,   { toValue: 0.4, duration: 0, useNativeDriver: true }),
          Animated.timing(anim.opacity, { toValue: 0.7, duration: 0, useNativeDriver: true }),
          Animated.delay((RING_COUNT - 1 - i) * RING_DELAY_MS),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ring,
            {
              width: size, height: size, borderRadius: size / 2,
              borderColor: color,
              opacity: anim.opacity,
              transform: [{ scale: anim.scale }],
            },
          ]}
        />
      ))}
      <View style={[styles.core, { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5 },
  core: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
});
