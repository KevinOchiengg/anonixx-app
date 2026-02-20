import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

// NEW Cinematic Coral Theme
const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
};

export default function MoodBalancer({ text }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>✨</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width,
    paddingVertical: 40,
    paddingHorizontal: 40,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  content: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 99, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.15)',
  },
  emoji: {
    fontSize: 32,
    marginBottom: 8,
    color: THEME.primary,
  },
  text: {
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
    color: THEME.text,
  },
});
