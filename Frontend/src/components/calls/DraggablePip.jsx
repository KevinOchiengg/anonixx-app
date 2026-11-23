import React, { useEffect, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

const MARGIN = 12;

/** A small video you can drag anywhere over the call. It settles in the nearest corner, and a
 * tap (no drag) calls onTap. Moves by left/top so Android video surfaces follow it. */
export default function DraggablePip({ area, width, height, onTap, style, children, top = 0, bottom = 0 }) {
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const at = useRef({ x: 0, y: 0 });
  const corner = useRef(3);
  const areaRef = useRef(area);
  const tapRef = useRef(onTap);
  const insetRef = useRef({ top, bottom });
  areaRef.current = area;
  tapRef.current = onTap;
  insetRef.current = { top, bottom };

  const settle = (i, animate = true) => {
    const a = areaRef.current;
    if (!a) return;
    const x = i % 2 ? a.w - width - MARGIN : MARGIN;
    const { top: t, bottom: b } = insetRef.current;
    const y = i > 1 ? a.h - height - MARGIN - b : MARGIN + t;
    corner.current = i;
    at.current = { x, y };
    if (animate) Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false, friction: 8, tension: 70 }).start();
    else pos.setValue({ x, y });
  };

  useEffect(() => { settle(corner.current, false); }, [area?.w, area?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { settle(corner.current); }, [top, bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e, g) => pos.setValue({ x: at.current.x + g.dx, y: at.current.y + g.dy }),
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
        settle(corner.current);
        tapRef.current?.();
        return;
      }
      const a = areaRef.current;
      const cx = at.current.x + g.dx + g.vx * 160 + width / 2;
      const cy = at.current.y + g.dy + g.vy * 160 + height / 2;
      settle((cx > a.w / 2 ? 1 : 0) + (cy > a.h / 2 ? 2 : 0));
    },
    onPanResponderTerminate: () => settle(corner.current),
  })).current;

  if (!area) return null;
  return (
    <Animated.View {...pan.panHandlers} style={[styles.pip, style, { width, height, left: pos.x, top: pos.y }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pip: { position: 'absolute', zIndex: 3 },
});
