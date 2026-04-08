import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Animated,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { getLoadingMessage, detectUserState } from '../../services/loadingMessageEngine';

const { height, width } = Dimensions.get('window');

const COLORS = {
  background:    '#0b0f18',
  primary:       '#FF634A',
  textSecondary: '#9A9AA3',
};

// ─── Star field (static, generated once) ─────────────────────────────────────
const StarField = React.memo(() => {
  const stars = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        top:     Math.random() * height,
        left:    Math.random() * width,
        size:    Math.random() * 2.5 + 1,
        opacity: Math.random() * 0.5 + 0.15,
      })),
    []
  );

  return (
    <>
      {stars.map(s => (
        <View
          key={s.id}
          style={{
            position:        'absolute',
            backgroundColor: COLORS.primary,
            borderRadius:    50,
            top:             s.top,
            left:            s.left,
            width:           s.size,
            height:          s.size,
            opacity:         s.opacity,
          }}
        />
      ))}
    </>
  );
});

// ─── Pulsing ring around spinner ──────────────────────────────────────────────
function PulseRing() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1.6, duration: 1200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.ring,
        { transform: [{ scale }], opacity },
      ]}
    />
  );
}

// ─── Custom spinner ───────────────────────────────────────────────────────────
function Spinner() {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1, duration: 1000, useNativeDriver: true,
      })
    ).start();
  }, []);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.spinnerWrap}>
      <PulseRing />
      <Animated.View style={[styles.spinnerArc, { transform: [{ rotate }] }]} />
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * LoadingSpinner
 *
 * Props:
 *   message        {string}   — static override message (skips engine)
 *   dynamic        {boolean}  — use message engine (default true)
 *   user           {object}   — user object for state-based messages
 *   showBackground {boolean}  — show starfield background (default true)
 *   size           {string}   — ignored (kept for API compat); spinner is custom
 */
export default function LoadingSpinner({
  message:        staticMessage = null,
  dynamic:        useDynamic    = true,
  user           = null,
  showBackground = true,
}) {
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const [msg, setMsg] = useState(
    staticMessage ?? (useDynamic ? getLoadingMessage(null, detectUserState(user)) : 'Loading…')
  );

  const fadeToMessage = (next) => {
    Animated.timing(msgOpacity, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(() => {
        setMsg(next);
        Animated.timing(msgOpacity, {
          toValue: 1,
          duration: 400,
          delay: 300 + Math.floor(Math.random() * 500),
          useNativeDriver: true,
        }).start();
      });
  };

  useEffect(() => {
    // Show initial message immediately
    Animated.timing(msgOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    if (!useDynamic || staticMessage) return;

    const id = setInterval(() => {
      fadeToMessage(getLoadingMessage(null, detectUserState(user)));
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.container}>
      {showBackground && <StarField />}
      <View style={styles.content}>
        <Spinner />
        <Animated.Text style={[styles.message, { opacity: msgOpacity }]}>
          {msg}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  content: {
    alignItems: 'center',
    zIndex: 10,
  },
  spinnerWrap: {
    width:          48,
    height:         48,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   20,
  },
  ring: {
    position:    'absolute',
    width:       48,
    height:      48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  spinnerArc: {
    width:        48,
    height:       48,
    borderRadius: 24,
    borderWidth:  3,
    borderColor:  'transparent',
    borderTopColor: COLORS.primary,
  },
  message: {
    color:      COLORS.textSecondary,
    fontSize:   15,
    fontStyle:  'italic',
    textAlign:  'center',
    lineHeight: 22,
    paddingHorizontal: 24,
  },
});
