import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Image } from 'react-native';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { getLoadingMessage, detectUserState } from '../../services/loadingMessageEngine';
import PulseLoader from './PulseLoader';

const LOGO = require('../../../assets/logo.png');

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
        <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />
      </Animated.View>

      <Animated.Text style={[styles.message, { opacity: msgOpacity }]}>
        {message}
      </Animated.Text>

      <PulseLoader size={48} />
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
    alignItems:   'center',
    marginBottom: 56,
  },
  logoImage: {
    width:  240,
    height: 64,
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
});
