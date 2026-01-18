import React from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import { useTheme } from '../../context/ThemeContext'

const { width } = Dimensions.get('window')

export default function MoodBalancer({ text }) {
  const { theme } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.content, { backgroundColor: '#7A9D7E20' }]}>
        <Text style={[styles.emoji, { color: theme.text }]}>✨</Text>
        <Text style={[styles.text, { color: theme.text }]}>{text}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width,
    paddingVertical: 40,
    paddingHorizontal: 40,
    justifyContent: 'center',
  },
  content: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  text: {
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
})
