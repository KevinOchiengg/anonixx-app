import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { THEME } from '../../utils/theme';

const { width } = Dimensions.get('window');

export default function MoodBalancer({ text }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width,
    paddingVertical: 32,
    paddingHorizontal: 40,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  content: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  text: {
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    fontWeight: '400',
    color: THEME.textSecondary,
    letterSpacing: 0.3,
  },
});
