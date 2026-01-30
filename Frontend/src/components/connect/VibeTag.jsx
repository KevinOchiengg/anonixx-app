import React from 'react'
import { TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../context/ThemeContext'

export default function VibeTag({ tag, selected, onPress, disabled = false }) {
  const { theme } = useTheme()

  return (
    <TouchableOpacity
      onPress={() => !disabled && onPress?.(tag)}
      disabled={disabled}
      style={[
        styles.tag,
        {
          backgroundColor: selected ? theme.primary : theme.card,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.tagText,
          {
            color: selected ? '#ffffff' : theme.text,
          },
        ]}
      >
        {tag}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
  },
})
