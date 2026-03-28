import React, { useEffect } from 'react'
import { View, Text, ActivityIndicator, Animated } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Storage from '../../services/storage' // ← CHANGE THIS LINE
import { useDispatch } from 'react-redux'
import { fetchProfile } from '../../store/slices/authSlice'
import StarryBackground from '../../components/common/StarryBackground';

export default function LoadingScreen() {
  const navigation = useNavigation()
  const dispatch = useDispatch()
  const fadeAnim = React.useRef(new Animated.Value(0)).current
  const scaleAnim = React.useRef(new Animated.Value(0.8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start()

    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const token = await Storage.getItem('authToken')

      if (token) {
        const result = await dispatch(fetchProfile()).unwrap()

        if (result) {
          setTimeout(() => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Main' }],
            })
          }, 1500)
        } else {
          navigateToAuth()
        }
      } else {
        navigateToAuth()
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      navigateToAuth()
    }
  }

  const navigateToAuth = () => {
    setTimeout(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Auth' }],
      })
    }, 1500)
  }

  return (
    <View className='flex-1 bg-echo-dark items-center justify-center'>
      <StarryBackground />
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }}
        className='items-center'
      >
        <View className='bg-gradient-to-br from-echo-purple to-echo-teal rounded-full w-32 h-32 items-center justify-center mb-6 shadow-2xl'>
          <Text className='text-white text-5xl font-bold'>A</Text>
        </View>

        <Text className='text-white text-5xl font-bold mb-2'>Anonixx</Text>
        <Text className='text-echo-teal text-lg mb-8'>
          Where anonymity meets authenticity
        </Text>

        <ActivityIndicator size='large' color='#a855f7' />

        <Text className='text-gray-400 text-sm mt-4'>
          Loading your experience...
        </Text>
      </Animated.View>

      <View className='absolute bottom-8'>
        <Text className='text-gray-600 text-xs'>Version 1.0.0</Text>
      </View>
    </View>
  )
}
