import React from 'react'
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'

export default function LoadingSpinner({
  message = 'Loading...',
  size = 'large',
}) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color='#a855f7' />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a1a',
  },
  message: { color: '#ffffff', marginTop: 16, fontSize: 16 },
})
