import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  Image,
  StyleSheet,
  StatusBar,
  Animated,
  TouchableOpacity,
} from 'react-native'
import { Sparkles, MessageCircle } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

export default function RevealMomentScreen({ route, navigation }) {
  const { connectionId, revealedIdentity } = route.params
  const { theme } = useTheme()

  const [fadeAnim] = useState(new Animated.Value(0))
  const [scaleAnim] = useState(new Animated.Value(0.8))
  const [showCountdown, setShowCountdown] = useState(true)
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    // Countdown
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval)
          setShowCountdown(false)
          startRevealAnimation()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(countdownInterval)
  }, [])

  const startRevealAnimation = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start()
  }

  const styles = createStyles(theme)

  if (showCountdown) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <StatusBar barStyle={theme.statusBar} />

        <View style={styles.countdownContainer}>
          <Sparkles size={48} color={theme.primary} />
          <Text style={[styles.countdownTitle, { color: theme.text }]}>
            Anonymous → Real
          </Text>
          <Text style={[styles.countdownNumber, { color: theme.primary }]}>
            {countdown}
          </Text>
          <Text
            style={[styles.countdownSubtext, { color: theme.textSecondary }]}
          >
            Both of you are ready
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      <View style={styles.revealContainer}>
        <Animated.View
          style={[
            styles.revealContent,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Avatar */}
          {revealedIdentity?.avatar_url ? (
            <Image
              source={{ uri: revealedIdentity.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: theme.primary },
              ]}
            >
              <Text style={styles.avatarText}>
                {revealedIdentity?.name?.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}

          {/* Name & Details */}
          <Text style={[styles.name, { color: theme.text }]}>
            {revealedIdentity?.name || 'Anonymous'}
          </Text>

          <View style={styles.details}>
            {revealedIdentity?.age && (
              <Text style={[styles.detail, { color: theme.textSecondary }]}>
                {revealedIdentity.age} years old
              </Text>
            )}
            {revealedIdentity?.city && (
              <Text style={[styles.detail, { color: theme.textSecondary }]}>
                {revealedIdentity.city}
              </Text>
            )}
          </View>

          {/* Message */}
          <View
            style={[styles.messageBox, { backgroundColor: theme.primaryLight }]}
          >
            <Text style={[styles.message, { color: theme.primary }]}>
              "Nice to finally meet you."
            </Text>
          </View>

          {/* Continue */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat', { connectionId })}
            style={[styles.continueButton, { backgroundColor: theme.primary }]}
          >
            <MessageCircle size={20} color='#ffffff' />
            <Text style={styles.continueButtonText}>Continue Conversation</Text>
          </TouchableOpacity>

          {/* Optional: Reveal Back */}
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('RevealInitiate', { connectionId })
            }
            style={styles.revealBackButton}
          >
            <Text
              style={[styles.revealBackText, { color: theme.textSecondary }]}
            >
              Reveal your identity too
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    countdownContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 24,
    },
    countdownTitle: {
      fontSize: 24,
      fontWeight: '700',
    },
    countdownNumber: {
      fontSize: 72,
      fontWeight: 'bold',
    },
    countdownSubtext: {
      fontSize: 16,
    },
    revealContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    revealContent: {
      alignItems: 'center',
      width: '100%',
    },
    avatar: {
      width: 160,
      height: 160,
      borderRadius: 80,
      marginBottom: 24,
    },
    avatarPlaceholder: {
      width: 160,
      height: 160,
      borderRadius: 80,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    avatarText: {
      fontSize: 64,
      fontWeight: 'bold',
      color: '#ffffff',
    },
    name: {
      fontSize: 32,
      fontWeight: 'bold',
      marginBottom: 12,
    },
    details: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    detail: {
      fontSize: 16,
    },
    messageBox: {
      padding: 20,
      borderRadius: 16,
      marginBottom: 32,
    },
    message: {
      fontSize: 18,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    continueButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 32,
      paddingVertical: 16,
      borderRadius: 12,
      marginBottom: 16,
    },
    continueButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
    revealBackButton: {
      padding: 12,
    },
    revealBackText: {
      fontSize: 15,
      fontWeight: '600',
    },
  })
