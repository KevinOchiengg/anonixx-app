import React, { useState } from 'react'
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
} from 'react-native'
import { useDispatch } from 'react-redux'
import { ArrowLeft, Save } from 'lucide-react-native'
import { createGroup } from '../../store/slices/groupsSlice'
import { useTheme } from '../../context/ThemeContext'

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
          Create Group
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Box */}
        <View
          style={[
            styles.infoBox,
            { backgroundColor: theme.primaryLight, borderColor: theme.primary },
          ]}
        >
          <Text style={[styles.infoText, { color: theme.primary }]}>
            💡 Create a supportive community around a specific topic or interest
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Group Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>
              Group Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder='Enter group name'
              placeholderTextColor={theme.placeholder}
              style={[
                styles.input,
                {
                  backgroundColor: theme.input,
                  borderColor: theme.inputBorder,
                  color: theme.text,
                },
              ]}
              maxLength={50}
            />
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              {name.length}/50 characters
            </Text>
          </View>

          {/* Group Description */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.text }]}>
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder='What is this group about?'
              placeholderTextColor={theme.placeholder}
              style={[
                styles.textArea,
                {
                  backgroundColor: theme.input,
                  borderColor: theme.inputBorder,
                  color: theme.text,
                },
              ]}
              multiline
              numberOfLines={4}
              maxLength={200}
            />
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              {description.length}/200 characters
            </Text>
          </View>
        </View>

        {/* Create Button */}
        <TouchableOpacity
          onPress={handleCreate}
          disabled={loading}
          style={[
            styles.createButton,
            { backgroundColor: theme.primary },
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

        {/* Guidelines */}
        <View
          style={[
            styles.guidelinesBox,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.guidelinesTitle, { color: theme.text }]}>
            Community Guidelines:
          </Text>
          <Text style={[styles.guidelineText, { color: theme.textSecondary }]}>
            • Be respectful and supportive
          </Text>
          <Text style={[styles.guidelineText, { color: theme.textSecondary }]}>
            • Keep discussions on-topic
          </Text>
          <Text style={[styles.guidelineText, { color: theme.textSecondary }]}>
            • No hate speech or harassment
          </Text>
          <Text style={[styles.guidelineText, { color: theme.textSecondary }]}>
            • Respect everyone's privacy
          </Text>
        </View>
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
      marginHorizontal: 16,
      marginTop: 16,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    infoText: {
      fontSize: 14,
      lineHeight: 20,
    },
    form: {
      paddingHorizontal: 16,
      marginTop: 24,
    },
    inputGroup: {
      marginBottom: 24,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    input: {
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 16,
      fontSize: 16,
    },
    textArea: {
      minHeight: 100,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      textAlignVertical: 'top',
    },
    hint: {
      fontSize: 12,
      marginTop: 4,
      marginLeft: 4,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 16,
      marginTop: 8,
      padding: 16,
      borderRadius: 12,
    },
    createButtonDisabled: {
      opacity: 0.5,
    },
    createButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#ffffff',
      marginLeft: 8,
    },
    guidelinesBox: {
      marginHorizontal: 16,
      marginTop: 24,
      marginBottom: 32,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    guidelinesTitle: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 12,
    },
    guidelineText: {
      fontSize: 13,
      marginBottom: 8,
      lineHeight: 20,
    },
  })
