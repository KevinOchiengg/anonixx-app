/**
 * EntryOverlay
 *
 * Wraps any screen that should feel like "entering a space".
 * Renders an absolute dark overlay on top of content and fades it away
 * after `delay` ms, while showing a contextual loading message.
 *
 * Usage:
 *   <EntryOverlay isLoading={isFetching} delay={400}>
 *     <FlatList ... />
 *   </EntryOverlay>
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { getLoadingMessage, detectUserState } from '../../services/loadingMessageEngine';

function PulseDot({ delay = 0, color = '#a855f7' }) {
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scale, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.6, duration: 480, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color, transform: [{ scale }] },
      ]}
    />
  );
}

export default function EntryOverlay({
  children,
  isLoading  = false,
  delay      = 400,
  user       = null,
  eventType  = null,
}) {
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const msgOpacity     = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed]     = useState(false);
  const [message, setMessage]       = useState(() =>
    getLoadingMessage(eventType, detectUserState(user))
  );

  // Fade in message immediately
  useEffect(() => {
    Animated.timing(msgOpacity, {
      toValue: 1, duration: 400, delay: 200, useNativeDriver: true,
    }).start();
  }, []);

  // Cycle message while overlay is visible
  useEffect(() => {
    if (revealed) return;
    const id = setInterval(() => {
      Animated.timing(msgOpacity, { toValue: 0, duration: 200, useNativeDriver: true })
        .start(() => {
          setMessage(getLoadingMessage(null, detectUserState(user)));
          Animated.timing(msgOpacity, {
            toValue: 1, duration: 400,
            delay: 300 + Math.floor(Math.random() * 500),
            useNativeDriver: true,
          }).start();
        });
    }, 2600);
    return () => clearInterval(id);
  }, [revealed]);

  // Reveal content when loading is done
  useEffect(() => {
    if (isLoading) return;

    const timer = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0, duration: 600, useNativeDriver: true,
      }).start(() => setRevealed(true));
    }, delay);

    return () => clearTimeout(timer);
  }, [isLoading]);

  return (
    <View style={styles.root}>
      {children}

      {!revealed && (
        <Animated.View
          style={[styles.overlay, { opacity: overlayOpacity }]}
          pointerEvents={revealed ? 'none' : 'auto'}
        >
          <Animated.Text style={[styles.message, { opacity: msgOpacity }]}>
            {message}
          </Animated.Text>
          <View style={styles.dotsRow}>
            <PulseDot delay={0}   />
            <PulseDot delay={220} color="#14b8a6" />
            <PulseDot delay={440} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a1aee',
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 32,
    zIndex: 999,
  },
  message: {
    color:      '#9ca3af',
    fontSize:   16,
    fontStyle:  'italic',
    textAlign:  'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
});
