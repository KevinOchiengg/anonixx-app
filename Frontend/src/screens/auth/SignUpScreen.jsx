// import React, { useState } from 'react'
// import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
// import { SafeAreaView } from 'react-native-safe-area-context'
// import { useDispatch, useSelector } from 'react-redux'
// import { signup } from '../../store/slices/authSlice'
// import { Mail, Lock, User } from 'lucide-react-native'
// import Button from '../../components/common/Button'
// import Input from '../../components/common/Input'

// export default function SignUpScreen({ navigation }) {
//   const dispatch = useDispatch()
//   const { loading, error } = useSelector((state) => state.auth)
//   const [formData, setFormData] = useState({
//     username: '',
//     email: '',
//     password: '',
//     confirmPassword: '',
//   })
//   const [errors, setErrors] = useState({})

//   const validate = () => {
//     const newErrors = {}

//     if (!formData.username.trim()) {
//       newErrors.username = 'Username is required'
//     }

//     if (!formData.email.trim()) {
//       newErrors.email = 'Email is required'
//     } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
//       newErrors.email = 'Email is invalid'
//     }

//     if (!formData.password) {
//       newErrors.password = 'Password is required'
//     } else if (formData.password.length < 8) {
//       newErrors.password = 'Password must be at least 8 characters'
//     }

//     if (formData.password !== formData.confirmPassword) {
//       newErrors.confirmPassword = 'Passwords do not match'
//     }

//     setErrors(newErrors)
//     return Object.keys(newErrors).length === 0
//   }

//   const handleSignUp = async () => {
//     if (!validate()) return

//     try {
//       await dispatch(signup(formData)).unwrap()
//       navigation.navigate('Onboarding')
//     } catch (err) {
//       console.error('Signup failed:', err)
//     }
//   }

//   const updateField = (field, value) => {
//     setFormData((prev) => ({ ...prev, [field]: value }))
//     if (errors[field]) {
//       setErrors((prev) => ({ ...prev, [field]: null }))
//     }
//   }

//   return (
//     <SafeAreaView className='flex-1 bg-echo-dark'>
//       <ScrollView className='flex-1 px-6'>
//         <View className='mt-12 mb-8'>
//           <Text className='text-4xl font-bold text-white mb-2'>
//             Create Account
//           </Text>
//           <Text className='text-lg text-gray-400'>
//             Join Echo and start connecting
//           </Text>
//         </View>

//         <View className='mb-6'>
//           <Input
//             label='Username'
//             value={formData.username}
//             onChangeText={(val) => updateField('username', val)}
//             placeholder='Choose a username'
//             autoCapitalize='none'
//             icon={<User size={20} color='#6b7280' />}
//             error={errors.username}
//           />

//           <Input
//             label='Email'
//             value={formData.email}
//             onChangeText={(val) => updateField('email', val)}
//             placeholder='Enter your email'
//             keyboardType='email-address'
//             autoCapitalize='none'
//             icon={<Mail size={20} color='#6b7280' />}
//             error={errors.email}
//           />

//           <Input
//             label='Password'
//             value={formData.password}
//             onChangeText={(val) => updateField('password', val)}
//             placeholder='Create a password'
//             secureTextEntry
//             icon={<Lock size={20} color='#6b7280' />}
//             error={errors.password}
//           />

//           <Input
//             label='Confirm Password'
//             value={formData.confirmPassword}
//             onChangeText={(val) => updateField('confirmPassword', val)}
//             placeholder='Confirm your password'
//             secureTextEntry
//             icon={<Lock size={20} color='#6b7280' />}
//             error={errors.confirmPassword}
//           />

//           {error && <Text className='text-red-500 text-sm mb-3'>{error}</Text>}
//         </View>

//         <Button
//           title='Create Account'
//           onPress={handleSignUp}
//           loading={loading}
//           size='large'
//         />

//         <View className='flex-row justify-center items-center mt-6 mb-8'>
//           <Text className='text-gray-400'>Already have an account? </Text>
//           <TouchableOpacity onPress={() => navigation.navigate('Login')}>
//             <Text className='text-echo-purple font-semibold'>Sign In</Text>
//           </TouchableOpacity>
//         </View>

//         <Text className='text-gray-500 text-xs text-center mb-8'>
//           By signing up, you agree to our Terms of Service and Privacy Policy
//         </Text>
//       </ScrollView>
//     </SafeAreaView>
//   )
// }
import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { useDispatch, useSelector } from 'react-redux'
import { signup } from '../../store/slices/authSlice'

export default function SignUpScreen({ navigation }) {
  const dispatch = useDispatch()
  const { loading, error } = useSelector((state) => state.auth)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSignUp = async () => {
    if (!validate()) return

    try {
      await dispatch(signup(formData)).unwrap()
      navigation.navigate('Onboarding')
    } catch (err) {
      console.error('Signup failed:', err)
    }
  }

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }))
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a1a' }}>
      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ marginTop: 48, marginBottom: 32 }}>
          <Text
            style={{
              fontSize: 36,
              fontWeight: 'bold',
              color: '#ffffff',
              marginBottom: 8,
            }}
          >
            Create Account
          </Text>
          <Text style={{ fontSize: 18, color: '#9ca3af' }}>
            Join Echo and start connecting
          </Text>
        </View>

        {/* Username Input */}
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 14,
              fontWeight: '500',
              marginBottom: 8,
            }}
          >
            Username
          </Text>
          <TextInput
            value={formData.username}
            onChangeText={(val) => updateField('username', val)}
            placeholder='Choose a username'
            placeholderTextColor='#6b7280'
            autoCapitalize='none'
            style={{
              backgroundColor: '#16213e',
              color: '#ffffff',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: errors.username ? '#ef4444' : '#374151',
              fontSize: 16,
            }}
          />
          {errors.username && (
            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>
              {errors.username}
            </Text>
          )}
        </View>

        {/* Email Input */}
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 14,
              fontWeight: '500',
              marginBottom: 8,
            }}
          >
            Email
          </Text>
          <TextInput
            value={formData.email}
            onChangeText={(val) => updateField('email', val)}
            placeholder='Enter your email'
            placeholderTextColor='#6b7280'
            keyboardType='email-address'
            autoCapitalize='none'
            style={{
              backgroundColor: '#16213e',
              color: '#ffffff',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: errors.email ? '#ef4444' : '#374151',
              fontSize: 16,
            }}
          />
          {errors.email && (
            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>
              {errors.email}
            </Text>
          )}
        </View>

        {/* Password Input */}
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 14,
              fontWeight: '500',
              marginBottom: 8,
            }}
          >
            Password
          </Text>
          <TextInput
            value={formData.password}
            onChangeText={(val) => updateField('password', val)}
            placeholder='Create a password'
            placeholderTextColor='#6b7280'
            secureTextEntry
            style={{
              backgroundColor: '#16213e',
              color: '#ffffff',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: errors.password ? '#ef4444' : '#374151',
              fontSize: 16,
            }}
          />
          {errors.password && (
            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>
              {errors.password}
            </Text>
          )}
        </View>

        {/* Confirm Password Input */}
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              color: '#ffffff',
              fontSize: 14,
              fontWeight: '500',
              marginBottom: 8,
            }}
          >
            Confirm Password
          </Text>
          <TextInput
            value={formData.confirmPassword}
            onChangeText={(val) => updateField('confirmPassword', val)}
            placeholder='Confirm your password'
            placeholderTextColor='#6b7280'
            secureTextEntry
            style={{
              backgroundColor: '#16213e',
              color: '#ffffff',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: errors.confirmPassword ? '#ef4444' : '#374151',
              fontSize: 16,
            }}
          />
          {errors.confirmPassword && (
            <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>
              {errors.confirmPassword}
            </Text>
          )}
        </View>

        {error && (
          <Text style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>
            {error}
          </Text>
        )}

        {/* Sign Up Button */}
        <TouchableOpacity
          onPress={handleSignUp}
          disabled={loading}
          style={{
            backgroundColor: '#a855f7',
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
            opacity: loading ? 0.5 : 1,
            marginBottom: 16,
          }}
        >
          {loading ? (
            <ActivityIndicator color='#ffffff' />
          ) : (
            <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>
              Create Account
            </Text>
          )}
        </TouchableOpacity>

        {/* Login Link */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 32,
          }}
        >
          <Text style={{ color: '#9ca3af' }}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={{ color: '#a855f7', fontWeight: '600' }}>Sign In</Text>
          </TouchableOpacity>
        </View>

        <Text
          style={{
            color: '#6b7280',
            fontSize: 12,
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          By signing up, you agree to our Terms of Service and Privacy Policy
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}