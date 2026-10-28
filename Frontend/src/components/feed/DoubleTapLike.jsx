/** Double-tap to like for feed slides. Native tap recognition (so a slight finger drift
 * doesn't drop the tap), a heart at each tap, and quick extra taps keep adding hearts. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { Heart } from 'lucide-react-native';

const DOUBLE_GAP = 300;   // second tap within this = like
const COMBO_GAP = 500;    // after a like, each tap within this adds another heart
const SIZE = 96;

function HeartPop({ x, y, rot, color, onDone }) {
  const scale = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(lift, { toValue: -90, duration: 520, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 520, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.25, duration: 520, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, [scale, lift, fade, onDone]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.heart,
        { left: x - SIZE / 2, top: y - SIZE / 2, opacity: fade },
        { transform: [{ translateY: lift }, { scale }, { rotate: `${rot}deg` }] },
      ]}
    >
      <Heart size={SIZE} color={color} fill={color} />
    </Animated.View>
  );
}

/** Hearts layer; render it last inside the slide. */
export function HeartBursts({ hearts, color, onDone }) {
  return hearts.map((h) => (
    <HeartPop key={h.id} x={h.x} y={h.y} rot={h.rot} color={color} onDone={() => onDone(h.id)} />
  ));
}

/** Returns { gesture, hearts, removeHeart }. onSingle runs after DOUBLE_GAP when no
 * second tap comes (pass null to skip the wait); onDoubleLike runs on each double tap;
 * onLong on a 450ms hold. */
export function useDoubleTapLike({ onSingle, onDoubleLike, onLong }) {
  const [hearts, setHearts] = useState([]);
  const last = useRef(0);
  const combo = useRef(false);
  const timer = useRef(null);
  const nextId = useRef(0);
  const cb = useRef({});
  cb.current = { onSingle, onDoubleLike, onLong };

  useEffect(() => () => clearTimeout(timer.current), []);

  const addHeart = useCallback((x, y) => {
    nextId.current += 1;
    const id = nextId.current;
    setHearts((prev) => [...prev.slice(-5), { id, x, y, rot: Math.round(Math.random() * 36 - 18) }]);
  }, []);

  const removeHeart = useCallback((id) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const onTap = useCallback((x, y) => {
    const now = Date.now();
    const gap = now - last.current;
    last.current = now;
    if (gap < (combo.current ? COMBO_GAP : DOUBLE_GAP)) {
      clearTimeout(timer.current);
      timer.current = null;
      combo.current = true;
      addHeart(x, y);
      cb.current.onDoubleLike?.();
      return;
    }
    combo.current = false;
    clearTimeout(timer.current);
    if (cb.current.onSingle) {
      timer.current = setTimeout(() => { timer.current = null; cb.current.onSingle?.(); }, DOUBLE_GAP);
    }
  }, [addHeart]);

  const cancelPending = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const gesture = useMemo(() => Gesture.Race(
    Gesture.Tap()
      .runOnJS(true)
      .maxDistance(24)
      .onEnd((e, success) => { if (success) onTap(e.x, e.y); }),
    Gesture.LongPress()
      .runOnJS(true)
      .minDuration(450)
      .onStart(() => cb.current.onLong?.()),
  ), [onTap]);

  return { gesture, hearts, removeHeart, cancelPending };
}

const styles = StyleSheet.create({
  heart: { position: 'absolute', width: SIZE, height: SIZE, zIndex: 100 },
});
