import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Eye, MessageCircle, User } from 'lucide-react-native'
import { useDispatch, useSelector } from 'react-redux'
import { datingAPI } from '../../services/api'
import Button from '../../components/common/Button'
import CoinBadge from '../../components/common/CoinBadge'
import StarryBackground from '../../components/common/StarryBackground';

const REVEAL_COST = 200

export default function ProfileRevealScreen({ route, navigation }) {
  const { matchId, profile } = route.params
  const dispatch = useDispatch()
  const { balance } = useSelector((state) => state.coins)
  const [loading, setLoading] = React.useState(false)

  const handleReveal = async () => {
    if (balance < REVEAL_COST) {
      alert('Insufficient coins. Please purchase more coins.')
      return
    }

    setLoading(true)
    try {
      await datingAPI.revealIdentity(matchId)
      // Update match with revealed info
      navigation.goBack()
    } catch (error) {
      console.error('Reveal failed:', error)
      alert('Failed to reveal identity. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className='flex-1 bg-echo-dark'>
      <StarryBackground />
      <ScrollView className='flex-1 px-4 py-6'>
        <View className='items-center mb-6'>
          <View className='relative mb-4'>
            <Image
              source={{ uri: profile.photos[0] }}
              className='w-48 h-48 rounded-full'
              blurRadius={profile.isRevealed ? 0 : 20}
            />
            {!profile.isRevealed && (
              <View className='absolute inset-0 items-center justify-center'>
                <View className='bg-echo-navy/90 rounded-full p-4'>
                  <Eye size={48} color='#a855f7' />
                </View>
              </View>
            )}
          </View>

          <Text className='text-white text-2xl font-bold mb-2'>
            {profile.isRevealed ? profile.name : 'Hidden Profile'}
          </Text>
          <Text className='text-gray-400 text-center mb-4'>
            {profile.isRevealed
              ? 'This profile has been revealed'
              : "Reveal this person's full profile"}
          </Text>
        </View>

        {!profile.isRevealed && (
          <>
            <View className='bg-echo-card rounded-2xl p-6 mb-4'>
              <Text className='text-white font-bold text-lg mb-3'>
                What you'll see:
              </Text>
              <View className='flex-row items-center mb-2'>
                <User size={16} color='#a855f7' />
                <Text className='text-gray-300 ml-2'>
                  Full name and profile
                </Text>
              </View>
              <View className='flex-row items-center mb-2'>
                <MessageCircle size={16} color='#14b8a6' />
                <Text className='text-gray-300 ml-2'>
                  Detailed bio and interests
                </Text>
              </View>
              <View className='flex-row items-center'>
                <Eye size={16} color='#fbbf24' />
                <Text className='text-gray-300 ml-2'>All profile photos</Text>
              </View>
            </View>

            <View className='bg-gradient-to-r from-echo-gold/20 to-yellow-600/20 rounded-2xl p-6 mb-6 border border-echo-gold/30'>
              <Text className='text-white font-bold text-lg mb-2'>
                Cost to Reveal
              </Text>
              <View className='flex-row items-center justify-between'>
                <CoinBadge amount={REVEAL_COST} size='large' />
                <Text className='text-gray-400'>Your balance: {balance}</Text>
              </View>
            </View>

            <Button
              title='Reveal Identity'
              onPress={handleReveal}
              loading={loading}
              disabled={balance < REVEAL_COST}
              icon={<Eye size={20} color='#ffffff' />}
            />

            {balance < REVEAL_COST && (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('Profile', { screen: 'Coins' })
                }
                className='mt-3'
              >
                <Text className='text-echo-purple text-center'>
                  Get more coins
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {profile.isRevealed && (
          <View className='bg-echo-card rounded-2xl p-6'>
            <Text className='text-white font-semibold mb-2'>Bio</Text>
            <Text className='text-gray-400 mb-4'>{profile.bio}</Text>

            <Text className='text-white font-semibold mb-2'>Interests</Text>
            <View className='flex-row flex-wrap'>
              {profile.interests?.map((interest, index) => (
                <View
                  key={index}
                  className='bg-echo-navy px-3 py-2 rounded-full mr-2 mb-2'
                >
                  <Text className='text-white text-xs'>{interest}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
