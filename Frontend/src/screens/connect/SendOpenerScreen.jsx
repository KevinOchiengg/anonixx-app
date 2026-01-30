import React, { useState } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { ArrowLeft, Send } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { sendOpener } from '../../services/connectApi'

export default function SendOpenerScreen({ route, navigation }) {
  const { broadcastId } = route.params
  const { theme } = useTheme()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (message.trim().length < 20) {
      Alert.alert('Too short', 'Write something meaningful (20+ characters)')
      return
    }

    if (message.split(' ').length < 5) {
      Alert.alert('Too brief', 'Please write at least 5 words')
      return
    }

    setLoading(true)

    try {
      await sendOpener(broadcastId, message.trim())

      Alert.alert(
        'Opener sent! 💌',
        `They'll see your message and can choose to respond. Check your connections.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      )
    } catch (error) {
      console.error('❌ Send opener error:', error)
      Alert.alert('Error', error.message || 'Failed to send opener')
    } finally {
      setLoading(false)
    }
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Send Opener</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.form}>
          {/* Instruction */}
          <View style={[styles.infoBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.infoTitle, { color: theme.text }]}>
              Make it personal
            </Text>
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              Reference something in their broadcast. Show you actually read it and
              resonated with it.
            </Text>
          </View>

          {/* Input */}
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="I do this too. Last week I rewrote a text for 20 minutes. Sometimes I wish my brain had an off switch."
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
            maxLength={200}
            textAlignVertical="top"
            autoFocus
          />

          <Text style={[styles.charCount, { color: theme.textSecondary }]}>
            {message.length}/200 (min 20)
          </Text>

          {/* Send Button */}
          <TouchableOpacity
            onPress={handleSend}
            disabled={loading || message.trim().length < 20}
            style={[
              styles.sendButton,
              { backgroundColor: theme.primary },
              (loading || message.trim().length < 20) && styles.sendButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Send size={20} color="#ffffff" />
                <Text style={styles.sendButtonText}>Send Opener</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    content: {
      flex: 1,
    },
    form: {
      flex: 1,
      padding: 16,
    },
    infoBox: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 24,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 8,
    },
    infoText: {
      fontSize: 14,
      lineHeight: 20,
    },
    textInput: {
      minHeight: 150,
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
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 24,
      padding: 18,
      borderRadius: 12,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
  })