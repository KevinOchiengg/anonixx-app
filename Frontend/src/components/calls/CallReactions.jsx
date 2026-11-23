import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { rs, rf, rp, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';

export const CALL_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

function Floater({ emoji, left, onDone }) {
  const v = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 2400, useNativeDriver: true }).start(() => done.current());
  }, [v]);
  return (
    <Animated.Text
      style={[styles.floater, {
        left,
        opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -rs(280)] }) },
          { scale: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 1.2, 1] }) },
        ],
      }]}
    >
      {emoji}
    </Animated.Text>
  );
}

/** Reactions floating up the screen. items: [{ id, emoji, left }] */
export function ReactionLayer({ items, onDone }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((r) => <Floater key={r.id} emoji={r.emoji} left={r.left} onDone={() => onDone(r.id)} />)}
    </View>
  );
}

export function ReactionPicker({ onPick }) {
  return (
    <View style={styles.picker}>
      {CALL_REACTIONS.map((e) => (
        <TouchableOpacity key={e} onPress={() => onPick(e)} hitSlop={HIT_SLOP} style={styles.pick} accessibilityLabel={`React ${e}`}>
          <Text style={styles.pickText}>{e}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  floater: { position: 'absolute', bottom: rp(150), fontSize: rf(36) },
  picker: {
    alignSelf: 'center', flexDirection: 'row', gap: rp(6), paddingHorizontal: rp(10), paddingVertical: rp(8),
    borderRadius: 999, backgroundColor: 'rgba(17,19,24,0.92)', borderWidth: 1, borderColor: T.border, marginBottom: rp(6),
  },
  pick: { width: rs(40), height: rs(40), alignItems: 'center', justifyContent: 'center' },
  pickText: { fontSize: rf(26) },
});
