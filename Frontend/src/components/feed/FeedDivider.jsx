import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { THEME } from '../../utils/theme';

const { width } = Dimensions.get('window');

export default function FeedDivider({ text }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.line} />
        <Text style={styles.text}>{text}</Text>
        <View style={styles.line} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width,
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.border,
  },
  text: {
    fontSize: 13,
    fontStyle: 'italic',
    color: THEME.textSecondary,
    letterSpacing: 0.3,
  },
});
