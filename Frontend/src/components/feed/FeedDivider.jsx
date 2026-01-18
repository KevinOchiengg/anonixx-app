import React from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import { useTheme } from '../../context/ThemeContext'

const { width } = Dimensions.get('window')

export default function FeedDivider({ text }) {
  const { theme } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
        <Text style={[styles.text, { color: theme.textSecondary }]}>
          {text}
        </Text>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width,
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  text: {
    fontSize: 14,
    fontStyle: 'italic',
  },
})
