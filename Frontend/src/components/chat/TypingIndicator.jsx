import React, { useEffect, useRef } from 'react'
import { View, Animated } from 'react-native'

export default function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animate = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: -8,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      ).start()
    }

    animate(dot1, 0)
    animate(dot2, 150)
    animate(dot3, 300)
  }, [])

  return (
    <View className='flex-row items-center bg-echo-card rounded-2xl px-4 py-3 self-start mb-3'>
      <Animated.View
        style={{ transform: [{ translateY: dot1 }] }}
        className='w-2 h-2 rounded-full bg-gray-400 mr-1'
      />
      <Animated.View
        style={{ transform: [{ translateY: dot2 }] }}
        className='w-2 h-2 rounded-full bg-gray-400 mr-1'
      />
      <Animated.View
        style={{ transform: [{ translateY: dot3 }] }}
        className='w-2 h-2 rounded-full bg-gray-400'
      />
    </View>
  )
}
