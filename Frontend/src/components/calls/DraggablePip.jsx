import React, { useEffect, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

const MARGIN = 12;

/** One person's video in a 1-to-1 call. Full screen (mini=false) or the small video you can drag
 * anywhere; it settles in the nearest corner. The same view is kept when you swap, so the video
 * never reloads. A tap calls onTap (mini) or onMainTap (full screen). */
export default function DraggablePip({
  area, width, height, mini = true, onTap, onMainTap, style, children, top = 0, bottom = 0,
}) {
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const at = useRef({ x: 0, y: 0 });
  const corner = useRef(3);
  const live = useRef({});
  live.current = { area, mini, onTap, onMainTap, top, bottom };

  const settle = (i, animate = true) => {
    const { area: a, top: t, bottom: b } = live.current;
    if (!a) return;
    const x = i % 2 ? a.w - width - MARGIN : MARGIN;
    const y = i > 1 ? a.h - height - MARGIN - b : MARGIN + t;
    corner.current = i;
    at.current = { x, y };
    if (animate) Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false, friction: 8, tension: 70 }).start();
    else pos.setValue({ x, y });
  };

  useEffect(() => { if (mini) settle(corner.current, false); }, [mini, area?.w, area?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mini) settle(corner.current); }, [top, bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => live.current.mini,
    onPanResponderTerminationRequest: () => !live.current.mini,
    onPanResponderMove: (_e, g) => {
      if (live.current.mini) pos.setValue({ x: at.current.x + g.dx, y: at.current.y + g.dy });
    },
    onPanResponderRelease: (_e, g) => {
      const tap = Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6;
      if (!live.current.mini) {
        if (tap) live.current.onMainTap?.();
        return;
      }
      if (tap) {
        settle(corner.current);
        live.current.onTap?.();
        return;
      }
      const a = live.current.area;
      const cx = at.current.x + g.dx + g.vx * 160 + width / 2;
      const cy = at.current.y + g.dy + g.vy * 160 + height / 2;
      settle((cx > a.w / 2 ? 1 : 0) + (cy > a.h / 2 ? 2 : 0));
    },
    onPanResponderTerminate: () => { if (live.current.mini) settle(corner.current); },
  })).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={mini
        ? [styles.pip, style, { width, height, left: pos.x, top: pos.y }, !area && styles.hidden]
        : [StyleSheet.absoluteFill, styles.main]}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pip: { position: 'absolute', zIndex: 3 },
  main: { zIndex: 0 },
  hidden: { opacity: 0 },
});
