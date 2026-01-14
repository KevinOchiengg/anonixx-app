import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  StyleSheet,
} from 'react-native'
import { Camera } from 'lucide-react-native'
import { pickImage } from '../../services/upload'

const interests = [
  'Music',
  'Art',
  'Tech',
  'Sports',
  'Travel',
  'Food',
  'Gaming',
  'Fashion',
  'Books',
  'Movies',
  'Fitness',
  'Photography',
]

export default function OnboardingScreen({ navigation }) {
  const [step, setStep] = useState(1)
  const [profile, setProfile] = useState({
    avatar: null,
    bio: '',
    interests: [],
  })

  const handlePickImage = async () => {
    const image = await pickImage()
    if (image) {
      setProfile((prev) => ({ ...prev, avatar: image.uri }))
    }
  }

  const toggleInterest = (interest) => {
    setProfile((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }))
  }

  const handleComplete = () => {
    console.log('Profile completed:', profile)
    // Navigate to main app
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Progress */}
        <View style={styles.progressContainer}>
          {[1, 2].map((s) => (
            <View
              key={s}
              style={[
                styles.progressBar,
                s <= step
                  ? styles.progressBarActive
                  : styles.progressBarInactive,
              ]}
            />
          ))}
        </View>

        {step === 1 && (
          <View>
            <Text style={styles.title}>Set up your profile</Text>
            <Text style={styles.subtitle}>
              Let's personalize your Echo experience
            </Text>

            <TouchableOpacity
              onPress={handlePickImage}
              style={styles.avatarContainer}
            >
              <View style={styles.avatarPlaceholder}>
                <Camera size={40} color='#a855f7' />
                <Text style={styles.avatarText}>Add Photo</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                value={profile.bio}
                onChangeText={(val) =>
                  setProfile((prev) => ({ ...prev, bio: val }))
                }
                placeholder='Tell us about yourself...'
                placeholderTextColor='#6b7280'
                multiline
                maxLength={150}
                style={styles.textArea}
              />
              <Text style={styles.charCount}>{profile.bio.length}/150</Text>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.title}>Your interests</Text>
            <Text style={styles.subtitle}>Select at least 3 interests</Text>

            <View style={styles.interestsContainer}>
              {interests.map((interest) => (
                <TouchableOpacity
                  key={interest}
                  onPress={() => toggleInterest(interest)}
                  style={[
                    styles.interestButton,
                    profile.interests.includes(interest)
                      ? styles.interestButtonActive
                      : styles.interestButtonInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.interestText,
                      profile.interests.includes(interest) &&
                        styles.interestTextActive,
                    ]}
                  >
                    {interest}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step < 2 ? (
          <TouchableOpacity
            onPress={() => setStep(step + 1)}
            disabled={
              (step === 1 && !profile.bio.trim()) ||
              (step === 2 && profile.interests.length < 3)
            }
            style={[
              styles.button,
              ((step === 1 && !profile.bio.trim()) ||
                (step === 2 && profile.interests.length < 3)) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleComplete}
            disabled={profile.interests.length < 3}
            style={[
              styles.button,
              profile.interests.length < 3 && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>Get Started</Text>
          </TouchableOpacity>
        )}

        {step > 1 && (
          <TouchableOpacity
            onPress={() => setStep(step - 1)}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  scrollView: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  progressContainer: { flexDirection: 'row', marginBottom: 32 },
  progressBar: { height: 8, flex: 1, borderRadius: 4, marginHorizontal: 4 },
  progressBarActive: { backgroundColor: '#a855f7' },
  progressBarInactive: { backgroundColor: '#374151' },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: { fontSize: 16, color: '#9ca3af', marginBottom: 32 },
  avatarContainer: { alignItems: 'center', marginBottom: 24 },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#16213e',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#a855f7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#a855f7', fontSize: 14, marginTop: 8 },
  inputContainer: { marginBottom: 32 },
  label: { color: '#ffffff', fontSize: 14, fontWeight: '500', marginBottom: 8 },
  textArea: {
    backgroundColor: '#16213e',
    color: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  interestsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  interestButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    marginRight: 8,
    marginBottom: 12,
    borderWidth: 2,
  },
  interestButtonActive: { backgroundColor: '#a855f7', borderColor: '#a855f7' },
  interestButtonInactive: {
    backgroundColor: 'transparent',
    borderColor: '#374151',
  },
  interestText: { color: '#ffffff', fontWeight: '500' },
  interestTextActive: { color: '#ffffff' },
  footer: { paddingHorizontal: 24, paddingBottom: 32 },
  button: {
    backgroundColor: '#a855f7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  backButton: { marginTop: 16, alignItems: 'center' },
  backButtonText: { color: '#9ca3af' },
})
