/** The splash shown while fonts and the session load. Uses no providers (it renders before them). */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, Animated, StyleSheet, Dimensions, Easing, TouchableOpacity,
} from 'react-native';

const { width, height } = Dimensions.get('window');
const BG    = '#0b0f18';
const CORAL = '#FF634A';

const STARS = Array.from({ length: 32 }, (_, i) => ({
  id:      i,
  top:     Math.random() * height,
  left:    Math.random() * width,
  size:    Math.random() * 2 + 0.5,
  opacity: Math.random() * 0.5 + 0.08,
}));

// Optional `hint` and `onRetry` for long waits: a quiet line, then a way out.
export default function AppLoadingScreen({ hint = null, onRetry = null }) {
  const fade     = useRef(new Animated.Value(0)).current;
  const glow     = useRef(new Animated.Value(0)).current;
  const dotPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1, duration: 500, useNativeDriver: true,
    }).start();

    // Slow breathing glow behind the wordmark — a heartbeat, not a spinner.
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    // The dot between "ano" and "nixx" pulses on its own faster rhythm —
    // the one bit of punctuation in the wordmark gets to feel alive.
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1.7, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1,   duration: 700, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
      ]),
    ).start();
  }, [fade, glow, dotPulse]);

  const glowScale   = glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.2] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.22] });

  return (
    <View style={styles.root}>
      {STARS.map((s) => (
        <View
          key={s.id}
          style={[
            styles.star,
            { top: s.top, left: s.left, width: s.size, height: s.size, borderRadius: s.size, opacity: s.opacity },
          ]}
        />
      ))}

      <Animated.View style={[styles.center, { opacity: fade }]}>
        <Animated.View
          style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
          pointerEvents="none"
        />

        <View style={styles.wordmarkRow}>
          <Text style={styles.wordmark}>ano</Text>
          <Animated.View style={[styles.dot, { transform: [{ scale: dotPulse }] }]} />
          <Text style={styles.wordmark}>nixx</Text>
        </View>

        <Text style={styles.tagline}>Ask and you shall be given</Text>

        {!!hint && <Text style={styles.hint}>{hint}</Text>}

        {!!onRetry && (
          <TouchableOpacity onPress={onRetry} style={styles.retryBtn} activeOpacity={0.85}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: BG,
    alignItems:      'center',
    justifyContent:  'center',
  },
  star: {
    position:        'absolute',
    backgroundColor: CORAL,
  },
  center: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  glow: {
    position:        'absolute',
    width:           240,
    height:          240,
    borderRadius:    120,
    backgroundColor: CORAL,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  wordmark: {
    fontSize:      38,
    fontFamily:    'PlayfairDisplay-Bold',
    color:         '#EAEAF0',
    letterSpacing: -0.5,
  },
  dot: {
    width:            8,
    height:           8,
    borderRadius:     4,
    backgroundColor:  CORAL,
    marginHorizontal: 8,
    shadowColor:      CORAL,
    shadowOffset:     { width: 0, height: 0 },
    shadowOpacity:    0.9,
    shadowRadius:     8,
  },
  tagline: {
    marginTop:     16,
    fontSize:      12,
    fontFamily:    'DMSans-Regular',
    color:         '#9A9AA3',
    letterSpacing: 1.4,
  },
  hint: {
    marginTop:     22,
    fontSize:      11,
    fontFamily:    'DMSans-Italic',
    color:         '#5A5F70',
    letterSpacing: 0.4,
    textAlign:     'center',
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop:         14,
    paddingHorizontal: 20,
    paddingVertical:   8,
    borderRadius:      999,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.4)',
  },
  retryText: {
    fontSize:      12,
    fontFamily:    'DMSans-Bold',
    color:         CORAL,
    letterSpacing: 0.5,
  },
});
