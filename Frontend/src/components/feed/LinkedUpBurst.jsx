/** Link Up success: ♀ from the left, ♂ from the right, they meet and lock together
 * (web twin: Web/components/LinkedUp.tsx). Shown once when a fresh paid Link Up opens the chat. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Mars, Venus, VenusAndMars } from 'lucide-react-native';
import { T } from '../../utils/theme';
import { rf, rp, rs } from '../../utils/responsive';

export default function LinkedUpBurst({ visible, name }) {
  const [show, setShow] = useState(!!visible);
  const meet = useRef(new Animated.Value(0)).current;
  const lock = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return undefined;
    setShow(true);
    const run = Animated.sequence([
      Animated.timing(meet, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(lock, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.timing(words, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]);
    run.start(({ finished }) => { if (finished) setShow(false); });
    return () => run.stop();
  }, [visible, meet, lock, words, fade]);

  if (!show) return null;
  const side = (from) => ({
    opacity: meet.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 0] }),
    transform: [
      { translateX: meet.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
      { rotate: meet.interpolate({ inputRange: [0, 1], outputRange: [from < 0 ? '-25deg' : '25deg', '0deg'] }) },
    ],
  });
  const size = rs(56);

  return (
    <Animated.View style={[st.wrap, { opacity: fade }]}>
      <Pressable style={st.fill} onPress={() => setShow(false)} accessibilityRole="alert">
        <View style={st.stage}>
          <Animated.View style={[st.icon, side(-rs(90))]}><Venus size={size} color={T.primary} strokeWidth={2} /></Animated.View>
          <Animated.View style={[st.icon, side(rs(90))]}><Mars size={size} color={T.primary} strokeWidth={2} /></Animated.View>
          <Animated.View style={[st.icon, { opacity: lock, transform: [{ scale: lock.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
            <VenusAndMars size={size} color={T.primary} strokeWidth={2} />
          </Animated.View>
        </View>
        <Animated.View style={{ opacity: words, alignItems: 'center', gap: rp(6) }}>
          <Text style={st.title}>You're linked up.</Text>
          <Text style={st.sub}>{name || 'They'} is waiting. Say something worth answering.</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 60, elevation: 60, backgroundColor: 'rgba(11,15,24,0.86)' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rp(24) },
  stage: { width: rs(120), height: rs(72), alignItems: 'center', justifyContent: 'center', marginBottom: rp(10) },
  icon: { position: 'absolute', shadowColor: T.primary, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  title: { color: T.text, fontSize: rf(20), fontWeight: '800' },
  sub: { color: T.textSecondary, fontSize: rf(14), textAlign: 'center' },
});
