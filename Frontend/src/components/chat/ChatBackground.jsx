/**
 * ChatBackground.jsx
 *
 * Renders a curated background pattern (see config/patterns.js) behind
 * `children` — a LinearGradient base plus a procedural overlay (dots,
 * noise, diagonal lines, grid, or a soft glow). No image assets needed, so
 * it scales cleanly from a small setup-screen swatch to a full chat screen.
 *
 * Usage:
 *   <ChatBackground pattern="velvet-dots" style={{ flex: 1 }}>
 *     ...chat content...
 *   </ChatBackground>
 */
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BACKGROUND_PATTERN_MAP, DEFAULT_BACKGROUND_PATTERN } from '../../config/patterns';

function useOverlayShapes(overlay) {
  return useMemo(() => {
    if (!overlay || overlay.kind === 'none') return null;

    if (overlay.kind === 'dots' || overlay.kind === 'noise') {
      const count = overlay.density || 30;
      const isNoise = overlay.kind === 'noise';
      return Array.from({ length: count }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: isNoise ? Math.random() * 2 + 1 : Math.random() * 4 + 2,
      }));
    }

    if (overlay.kind === 'lines') {
      const count = overlay.count || 10;
      const primary = Array.from({ length: count }, (_, i) => ({
        id: `p${i}`,
        top: `${(i / count) * 130 - 15}%`,
        rotate: '25deg',
      }));
      if (!overlay.crosshatch) return primary;
      const secondary = Array.from({ length: count }, (_, i) => ({
        id: `s${i}`,
        top: `${(i / count) * 130 - 15}%`,
        rotate: '-25deg',
      }));
      return [...primary, ...secondary];
    }

    if (overlay.kind === 'grid') {
      const n = 8;
      const horizontal = Array.from({ length: n }, (_, i) => ({ id: `h${i}`, pos: `${(i / (n - 1)) * 100}%` }));
      const vertical = Array.from({ length: n }, (_, i) => ({ id: `v${i}`, pos: `${(i / (n - 1)) * 100}%` }));
      return { horizontal, vertical };
    }

    return null;
  }, [overlay?.kind, overlay?.density, overlay?.count, overlay?.crosshatch]);
}

const ChatBackground = React.memo(function ChatBackground({ pattern, style, children }) {
  const def = BACKGROUND_PATTERN_MAP[pattern] || BACKGROUND_PATTERN_MAP[DEFAULT_BACKGROUND_PATTERN];
  const shapes = useOverlayShapes(def.overlay);

  return (
    <View style={[styles.fill, style]}>
      <LinearGradient colors={def.gradient} style={StyleSheet.absoluteFill} />

      {def.overlay?.kind === 'dots' || def.overlay?.kind === 'noise' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {shapes.map((d) => (
            <View
              key={d.id}
              style={{
                position: 'absolute', top: d.top, left: d.left,
                width: d.size, height: d.size, borderRadius: d.size,
                backgroundColor: def.overlay.color,
              }}
            />
          ))}
        </View>
      ) : null}

      {def.overlay?.kind === 'lines' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {shapes.map((l) => (
            <View
              key={l.id}
              style={{
                position: 'absolute', top: l.top, left: '-20%',
                width: '140%', height: 1.5,
                backgroundColor: def.overlay.color,
                transform: [{ rotate: l.rotate }],
              }}
            />
          ))}
        </View>
      ) : null}

      {def.overlay?.kind === 'grid' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {shapes.horizontal.map((h) => (
            <View key={h.id} style={{ position: 'absolute', top: h.pos, left: 0, right: 0, height: 1, backgroundColor: def.overlay.color }} />
          ))}
          {shapes.vertical.map((v) => (
            <View key={v.id} style={{ position: 'absolute', left: v.pos, top: 0, bottom: 0, width: 1, backgroundColor: def.overlay.color }} />
          ))}
        </View>
      ) : null}

      {def.overlay?.kind === 'glow' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.glow, { top: '-15%', left: '-10%', backgroundColor: def.overlay.color }]} />
          <View style={[styles.glowSmall, { bottom: '-10%', right: '-15%', backgroundColor: def.overlay.color }]} />
        </View>
      ) : null}

      {children}
    </View>
  );
});

export default ChatBackground;

const styles = StyleSheet.create({
  fill: { overflow: 'hidden' },
  glow: {
    position: 'absolute', width: '80%', aspectRatio: 1, borderRadius: 999,
  },
  glowSmall: {
    position: 'absolute', width: '55%', aspectRatio: 1, borderRadius: 999,
  },
});
