import React, { useState } from 'react'
import { View, Text, TouchableOpacity} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDispatch } from 'react-redux'
import { socialLogin } from '../../store/slices/authSlice'
import Button from '../../components/common/Button'
import * as Google from 'expo-auth-session/providers/google'
import * as AppleAuthentication from 'expo-apple-authentication'

export default function SocialAuthScreen({ navigation }) {
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      // Implement Google OAuth
      // const result = await Google.useAuthRequest({...});
      // if (result?.type === 'success') {
      //   await dispatch(socialLogin({ provider: 'google', token: result.authentication.accessToken }));
      // }
      console.log('Google login initiated')
    } catch (error) {
      console.error('Google login failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAppleLogin = async () => {
    try {
      setLoading(true)
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })

      await dispatch(
        socialLogin({
          provider: 'apple',
          token: credential.identityToken,
        })
      )
    } catch (error) {
      console.error('Apple login failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className='flex-1 bg-echo-dark px-6'>
      <View className='flex-1 justify-center'>
        <Text className='text-4xl font-bold text-white mb-2'>
          Continue with
        </Text>
        <Text className='text-lg text-gray-400 mb-8'>
          Choose your preferred sign in method
        </Text>

        <Button
          title='Continue with Google'
          onPress={handleGoogleLogin}
          loading={loading}
          variant='outline'
          style={{ marginBottom: 12 }}
        />

        <Button
          title='Continue with Apple'
          onPress={handleAppleLogin}
          loading={loading}
          variant='outline'
        />

        <TouchableOpacity
          onPress={() => navigation.navigate('Login')}
          className='mt-8 items-center'
        >
          <Text className='text-gray-400'>
            Or{' '}
            <Text className='text-echo-purple font-semibold'>
              sign in with email
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
