import React, { useEffect, useRef } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  StyleSheet,
} from 'react-native'
import { X, Heart, MapPin } from 'lucide-react-native'
import { useDispatch, useSelector } from 'react-redux'
import { fetchProfiles, swipeProfile } from '../../store/slices/datingSlice'

export default function DatingScreen({ navigation }) {
  const dispatch = useDispatch()
  const { profiles, currentIndex } = useSelector((state) => state.dating)
  const position = useRef(new Animated.ValueXY()).current
  const currentProfile = profiles[currentIndex]

  useEffect(() => {
    dispatch(fetchProfiles())
  }, [])

  const handleSwipe = (direction) => {
    const toValue = direction === 'right' ? 500 : -500

    Animated.timing(position, {
      toValue: { x: toValue, y: 0 },
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      dispatch(swipeProfile({ profileId: currentProfile.id, direction }))
      position.setValue({ x: 0, y: 0 })
    })
  }

  if (!currentProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No more profiles</Text>
          <TouchableOpacity style={styles.reloadButton}>
            <Text style={styles.reloadButtonText}>Reload</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Matches')}>
          <Text style={styles.matchesButton}>Matches</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardContainer}>
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { translateX: position.x },
                { translateY: position.y },
              ],
            },
          ]}
        >
          <Image
            source={{ uri: currentProfile.photos[0] }}
            style={styles.cardImage}
          />
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>
              {currentProfile.name}, {currentProfile.age}
            </Text>
            {currentProfile.location && (
              <View style={styles.locationContainer}>
                <MapPin size={16} color='#9ca3af' />
                <Text style={styles.locationText}>
                  {currentProfile.location}
                </Text>
              </View>
            )}
            {currentProfile.bio && (
              <Text style={styles.cardBio} numberOfLines={3}>
                {currentProfile.bio}
              </Text>
            )}
          </View>
        </Animated.View>
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          onPress={() => handleSwipe('left')}
          style={[styles.actionButton, styles.passButton]}
        >
          <X size={32} color='#ef4444' />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleSwipe('right')}
          style={[styles.actionButton, styles.likeButton]}
        >
          <Heart size={32} color='#a855f7' />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
  matchesButton: { color: '#a855f7', fontSize: 16, fontWeight: '600' },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    height: '75%',
    backgroundColor: '#16213e',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  cardImage: { width: '100%', height: '70%' },
  cardInfo: { padding: 20 },
  cardName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: { color: '#9ca3af', fontSize: 14, marginLeft: 4 },
  cardBio: { color: '#e5e7eb', fontSize: 16, lineHeight: 24 },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
    gap: 40,
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  passButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  likeButton: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderWidth: 2,
    borderColor: '#a855f7',
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 20, color: '#9ca3af', marginBottom: 24 },
  reloadButton: {
    backgroundColor: '#a855f7',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 24,
  },
  reloadButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
})
