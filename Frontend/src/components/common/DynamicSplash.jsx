import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { getLoadingMessage, detectUserState } from '../../services/loadingMessageEngine';

function PulseDot({ delay = 0 }) {
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scale, { toValue: 1,   duration: 500, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.6, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.dot, { transform: [{ scale }] }]} />
  );
}

export default function DynamicSplash() {
  const { loadingEvent } = useSocket();
  const { user }         = useAuth();

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale   = useRef(new Animated.Value(0.85)).current;
  const msgOpacity  = useRef(new Animated.Value(0)).current;
  const [message, setMessage] = useState('');

  const fadeToMessage = (msg) => {
    Animated.timing(msgOpacity, {
      toValue: 0, duration: 200, useNativeDriver: true,
    }).start(() => {
      setMessage(msg);
      Animated.timing(msgOpacity, {
        toValue: 1,
        duration: 400,
        delay: 300 + Math.floor(Math.random() * 500),
        useNativeDriver: true,
      }).start();
    });
  };

  const cycleMessage = () => {
    fadeToMessage(getLoadingMessage(null, detectUserState(user)));
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(logoScale,   { toValue: 1, friction: 5,   useNativeDriver: true }),
    ]).start();

    cycleMessage();
    const id = setInterval(cycleMessage, 2800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loadingEvent) return;
    fadeToMessage(getLoadingMessage(loadingEvent.type, detectUserState(user)));
  }, [loadingEvent]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.logoWrap, {
          opacity:   logoOpacity,
          transform: [{ scale: logoScale }],
        }]}
      >
        <View style={styles.logoCircle}>
          <Text style={styles.logoLetter}>A</Text>
        </View>
        <Text style={styles.appName}>Anonixx</Text>
        <Text style={styles.tagline}>Where anonymity meets authenticity</Text>
      </Animated.View>

      <Animated.Text style={[styles.message, { opacity: msgOpacity }]}>
        {message}
      </Animated.Text>

      <View style={styles.dotsRow}>
        <PulseDot delay={0}   />
        <PulseDot delay={250} />
        <PulseDot delay={500} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f18',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FF634A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#FF634A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  logoLetter: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '800',
  },
  appName: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  tagline: {
    color: '#14b8a6',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  message: {
    color: '#9ca3af',
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    paddingHorizontal: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF634A',
  },
});
