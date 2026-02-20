import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native'
import { useDispatch } from 'react-redux'
import { ArrowLeft, Save, Info } from 'lucide-react-native'
import { createGroup } from '../../store/slices/groupsSlice'
import { useTheme } from '../../context/ThemeContext'

const { height, width } = Dimensions.get('window')

// NEW Cinematic Coral Theme
const THEME = {
  background: '#0b0f18',
  backgroundDark: '#06080f',
  surface: '#151924',
  surfaceDark: '#10131c',
  primary: '#FF634A',
  primaryDark: '#ff3b2f',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  input: 'rgba(30, 35, 45, 0.7)',
}

// Starry Background Component
const StarryBackground = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      top: Math.random() * height,
      left: Math.random() * width,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
    }))
  }, [])

  return (
    <>
      {stars.map((star) => (
        <View
          key={star.id}
          style={{
            position: 'absolute',
            backgroundColor: THEME.primary,
            borderRadius: 50,
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </>
  )
}

export default function CreateGroupScreen({ navigation }) {
  const dispatch = useDispatch()
  const { theme } = useTheme()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Group name is required')
      return
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Group description is required')
      return
    }

    setLoading(true)
    try {
      await dispatch(
        createGroup({ name: name.trim(), description: description.trim() })
      ).unwrap()
      Alert.alert('Success', 'Group created successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ])
    } catch (error) {
      console.error('❌ Create group error:', error)
      Alert.alert('Error', error.message || 'Failed to create group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='light-content' backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Group</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Info Box */}
        <View style={styles.infoBoxWrapper}>
          <View style={styles.infoAccentBar} />
          <View style={styles.infoBox}>
            <Info size={20} color={THEME.primary} />
            <Text style={styles.infoText}>
              Create a supportive community around a specific topic or interest
            </Text>
          </View>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Group Name */}
          <View style={styles.inputCardWrapper}>
            <View style={styles.inputAccentBar} />
            <View style={styles.inputCard}>
              <Text style={styles.label}>Group Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder='Enter group name'
                placeholderTextColor={THEME.textSecondary}
                style={styles.input}
                maxLength={50}
              />
              <Text style={styles.hint}>{name.length}/50 characters</Text>
            </View>
          </View>

          {/* Group Description */}
          <View style={styles.inputCardWrapper}>
            <View style={styles.inputAccentBar} />
            <View style={styles.inputCard}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder='What is this group about?'
                placeholderTextColor={THEME.textSecondary}
                style={styles.textArea}
                multiline
                numberOfLines={4}
                maxLength={200}
              />
              <Text style={styles.hint}>
                {description.length}/200 characters
              </Text>
            </View>
          </View>
        </View>

        {/* Create Button */}
        <View style={styles.createButtonWrapper}>
          <View style={styles.createAccentBar} />
          <TouchableOpacity
            onPress={handleCreate}
            disabled={loading}
            style={[
              styles.createButton,
              loading && styles.createButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator size='small' color='#ffffff' />
            ) : (
              <>
                <Save size={20} color='#ffffff' />
                <Text style={styles.createButtonText}>Create Group</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Guidelines */}
        <View style={styles.guidelinesWrapper}>
          <View style={styles.guidelinesAccentBar} />
          <View style={styles.guidelinesBox}>
            <Text style={styles.guidelinesTitle}>Community Guidelines:</Text>

            <View style={styles.guidelineItem}>
              <View style={styles.guidelineBullet} />
              <Text style={styles.guidelineText}>
                Be respectful and supportive
              </Text>
            </View>

            <View style={styles.guidelineItem}>
              <View style={styles.guidelineBullet} />
              <Text style={styles.guidelineText}>
                Keep discussions on-topic
              </Text>
            </View>

            <View style={styles.guidelineItem}>
              <View style={styles.guidelineBullet} />
              <Text style={styles.guidelineText}>
                No hate speech or harassment
              </Text>
            </View>

            <View style={styles.guidelineItem}>
              <View style={styles.guidelineBullet} />
              <Text style={styles.guidelineText}>
                Respect everyone's privacy
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.text,
  },
  scrollView: {
    flex: 1,
  },
  // Info Box
  infoBoxWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 16,
  },
  infoAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.6,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    padding: 16,
    paddingLeft: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.3)',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: THEME.text,
  },
  // Form
  form: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  inputCardWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  inputAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
  },
  inputCard: {
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 48,
    borderRadius: 12,
    backgroundColor: THEME.input,
    paddingHorizontal: 16,
    fontSize: 16,
    color: THEME.text,
    marginBottom: 8,
  },
  textArea: {
    minHeight: 100,
    borderRadius: 12,
    backgroundColor: THEME.input,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: THEME.text,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: THEME.textSecondary,
    marginLeft: 4,
  },
  // Create Button
  createButtonWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 8,
  },
  createAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.8,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: THEME.primary,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Guidelines
  guidelinesWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
  },
  guidelinesAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  guidelinesBox: {
    backgroundColor: THEME.surface,
    padding: 20,
    paddingLeft: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  guidelinesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 16,
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  guidelineBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.primary,
    marginTop: 7,
    marginRight: 12,
  },
  guidelineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: THEME.textSecondary,
  },
})
