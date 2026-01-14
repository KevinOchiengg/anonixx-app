import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Coins } from 'lucide-react-native'

export default function CoinBadge({ amount, size = 'medium' }) {
  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.small
      case 'large':
        return styles.large
      default:
        return styles.medium
    }
  }

  return (
    <View style={[styles.container, getSizeStyle()]}>
      <Coins
        size={size === 'large' ? 20 : size === 'small' ? 12 : 16}
        color='#fbbf24'
      />
      <Text
        style={[
          styles.text,
          size === 'large' && styles.largeText,
          size === 'small' && styles.smallText,
        ]}
      >
        {amount}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  small: { paddingHorizontal: 8, paddingVertical: 4 },
  medium: { paddingHorizontal: 12, paddingVertical: 6 },
  large: { paddingHorizontal: 16, paddingVertical: 8 },
  text: { color: '#fbbf24', fontSize: 14, fontWeight: 'bold', marginLeft: 4 },
  smallText: { fontSize: 12 },
  largeText: { fontSize: 16 },
})
