import React, { useState } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft, Sparkles } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { createBroadcast } from '../../services/connectApi'
import VibeTag from '../../components/connect/VibeTag'

const VIBE_TAGS = [
  'night owl',
  'early bird',
  'deep talks',
  'old soul',
  'bookworm',
  'creative',
  'overthinker',
  'needs space',
  'adventurous',
  'homebody',
  'music lover',
  'nature person',
  'city dweller',
  'coffee addict',
  'tea enthusiast',
  'spiritual',
  'logical',
  'emotional',
  'sarcastic',
  'sincere',
]

const MOOD_EMOJIS = ['🌙', '💭', '🌊', '🌱', '✨', '🔥', '❄️', '🌸']

const INTENTION_TAGS = [
  'seeking connection',
  'just talking',
  'seeing where it goes',
]

export default function CreateBroadcastScreen({ navigation }) {
  const { theme } = useTheme()
  const [content, setContent] = useState('')
  const [selectedVibeTags, setSelectedVibeTags] = useState([])
  const [selectedMood, setSelectedMood] = useState(null)
  const [selectedIntention, setSelectedIntention] = useState(null)
  const [loading, setLoading] = useState(false)

  const toggleVibeTag = (tag) => {
    if (selectedVibeTags.includes(tag)) {
      setSelectedVibeTags(selectedVibeTags.filter((t) => t !== tag))
    } else {
      if (selectedVibeTags.length >= 5) {
        Alert.alert('Limit reached', 'You can select up to 5 vibe tags')
        return
      }
      setSelectedVibeTags([...selectedVibeTags, tag])
    }
  }

  const handleSubmit = async () => {
    // Validation
    if (content.length < 100) {
      Alert.alert('Too short', 'Broadcast must be at least 100 characters')
      return
    }

    if (content.length > 300) {
      Alert.alert('Too long', 'Broadcast must be under 300 characters')
      return
    }

    if (selectedVibeTags.length < 3) {
      Alert.alert('Select tags', 'Please select at least 3 vibe tags')
      return
    }

    setLoading(true)

    try {
      await createBroadcast({
        content,
        vibe_tags: selectedVibeTags,
        mood_emoji: selectedMood,
        intention_tag: selectedIntention,
        timezone: 'EST', // TODO: Get actual timezone
      })

      Alert.alert(
        'Broadcast live! ✨',
        'Your anonymous broadcast is now visible. Others can send you openers.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      )
    } catch (error) {
      console.error('❌ Create broadcast error:', error)
      Alert.alert('Error', error.message || 'Failed to create broadcast')
    } finally {
      setLoading(false)
    }
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Create Broadcast
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Info */}
        <View style={[styles.infoBox, { backgroundColor: theme.primaryLight }]}>
          <Sparkles size={20} color={theme.primary} />
          <Text style={[styles.infoText, { color: theme.primary }]}>
            Share something real. Others will respond anonymously if they
            resonate.
          </Text>
        </View>

        {/* Content */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>
            What's on your mind?
          </Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Feeling like I'm the only one who overthinks every conversation..."
            placeholderTextColor={theme.placeholder}
            style={[
              styles.textInput,
              {
                backgroundColor: theme.input,
                borderColor: theme.inputBorder,
                color: theme.text,
              },
            ]}
            multiline
            maxLength={300}
            textAlignVertical='top'
          />
          <Text style={[styles.charCount, { color: theme.textSecondary }]}>
            {content.length}/300 (min 100)
          </Text>
        </View>

        {/* Vibe Tags */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>
            Your vibe (select 3-5)
          </Text>
          <View style={styles.tagsContainer}>
            {VIBE_TAGS.map((tag) => (
              <VibeTag
                key={tag}
                tag={tag}
                selected={selectedVibeTags.includes(tag)}
                onPress={toggleVibeTag}
              />
            ))}
          </View>
        </View>

        {/* Mood */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>
            Current mood (optional)
          </Text>
          <View style={styles.moodContainer}>
            {MOOD_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                onPress={() =>
                  setSelectedMood(selectedMood === emoji ? null : emoji)
                }
                style={[
                  styles.moodButton,
                  {
                    backgroundColor:
                      selectedMood === emoji ? theme.primary : theme.card,
                    borderColor:
                      selectedMood === emoji ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={styles.moodEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Intention */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>
            What are you seeking? (optional)
          </Text>
          <View style={styles.intentionContainer}>
            {INTENTION_TAGS.map((intention) => (
              <TouchableOpacity
                key={intention}
                onPress={() =>
                  setSelectedIntention(
                    selectedIntention === intention ? null : intention,
                  )
                }
                style={[
                  styles.intentionButton,
                  {
                    backgroundColor:
                      selectedIntention === intention
                        ? theme.primary
                        : theme.card,
                    borderColor:
                      selectedIntention === intention
                        ? theme.primary
                        : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.intentionText,
                    {
                      color:
                        selectedIntention === intention
                          ? '#ffffff'
                          : theme.text,
                    },
                  ]}
                >
                  {intention}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={
            loading || content.length < 100 || selectedVibeTags.length < 3
          }
          style={[
            styles.submitButton,
            { backgroundColor: theme.primary },
            (loading || content.length < 100 || selectedVibeTags.length < 3) &&
              styles.submitButtonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <>
              <Sparkles size={20} color='#ffffff' />
              <Text style={styles.submitButtonText}>Go Live</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    scrollView: {
      flex: 1,
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      margin: 16,
      borderRadius: 12,
    },
    infoText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    section: {
      paddingHorizontal: 16,
      marginBottom: 24,
    },
    label: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 12,
    },
    textInput: {
      minHeight: 120,
      borderRadius: 12,
      borderWidth: 1,
      padding: 16,
      fontSize: 15,
      lineHeight: 22,
    },
    charCount: {
      fontSize: 13,
      marginTop: 8,
      textAlign: 'right',
    },
    tagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    moodContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    moodButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moodEmoji: {
      fontSize: 28,
    },
    intentionContainer: {
      gap: 12,
    },
    intentionButton: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
    },
    intentionText: {
      fontSize: 15,
      fontWeight: '600',
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      margin: 16,
      padding: 18,
      borderRadius: 12,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
  })
