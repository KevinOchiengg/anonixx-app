import React from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { X, LogIn, UserPlus } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

const { width } = Dimensions.get('window')

export default function AuthPromptModal({
  visible,
  onClose,
  onSignUp,
  onLogin,
  action,
}) {
  const { theme } = useTheme()

  const actionMessages = {
    respond: 'Sign up to respond to this post',
    save: 'Sign up to save posts',
    post: 'Sign up to share your thoughts',
    comment: 'Sign up to join the conversation',
    connect: 'Sign up to make connections',
    default: 'Sign up to continue',
  }

  const message = actionMessages[action] || actionMessages.default

  const styles = createStyles(theme)

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: theme.surface }]}>
          {/* Close Button */}
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={theme.textSecondary} />
          </TouchableOpacity>

          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.title, { color: theme.text }]}>
              Welcome to Anonixx
            </Text>

            <Text style={[styles.message, { color: theme.textSecondary }]}>
              {message}
            </Text>

            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
              A space that heals, not hurts. Join our community.
            </Text>

            {/* Buttons */}
            <View style={styles.buttons}>
              <TouchableOpacity
                onPress={onSignUp}
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.primary },
                ]}
              >
                <UserPlus size={20} color='#ffffff' />
                <Text style={styles.primaryButtonText}>Create Account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onLogin}
                style={[
                  styles.secondaryButton,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <LogIn size={20} color={theme.text} />
                <Text
                  style={[styles.secondaryButtonText, { color: theme.text }]}
                >
                  Login
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <TouchableOpacity onPress={onClose} style={styles.continueGuest}>
              <Text
                style={[
                  styles.continueGuestText,
                  { color: theme.textTertiary },
                ]}
              >
                Continue browsing as guest
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modal: {
      width: Math.min(width - 40, 400),
      borderRadius: 20,
      padding: 24,
      position: 'relative',
    },
    closeButton: {
      position: 'absolute',
      top: 16,
      right: 16,
      padding: 8,
      zIndex: 10,
    },
    content: {
      alignItems: 'center',
      gap: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginTop: 8,
    },
    message: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
    },
    subtitle: {
      fontSize: 14,
      textAlign: 'center',
      fontStyle: 'italic',
      marginBottom: 8,
    },
    buttons: {
      width: '100%',
      gap: 12,
      marginTop: 8,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 16,
      borderRadius: 12,
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },
    secondaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    continueGuest: {
      marginTop: 8,
      padding: 8,
    },
    continueGuestText: {
      fontSize: 13,
      textDecorationLine: 'underline',
    },
  })
