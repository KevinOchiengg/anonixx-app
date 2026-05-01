import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Send, Mic, Image as ImageIcon } from 'lucide-react-native';
import { THEME } from '../../utils/theme';

export default function MessageInput({ onSend, onVoicePress, onImagePress }) {
  const [messageText, setMessageText] = useState('');

  const handleSend = () => {
    if (!messageText.trim()) return;
    onSend(messageText.trim());
    setMessageText('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.wrapper}
    >
      <View style={styles.accentBar} />
      <View style={styles.container}>
        <TouchableOpacity onPress={onImagePress} style={styles.attachButton}>
          <ImageIcon size={22} color={THEME.textSecondary} />
        </TouchableOpacity>

        <TextInput
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
          placeholderTextColor={THEME.textSecondary}
          style={styles.input}
          multiline
          maxLength={1000}
        />

        {messageText.trim() ? (
          <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
            <Send size={20} color="#ffffff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onVoicePress} style={styles.voiceButton}>
            <Mic size={22} color={THEME.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    opacity: 0.4,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingLeft: 20,
    backgroundColor: THEME.surfaceDark,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  attachButton: {
    padding: 10,
    marginRight: 8,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    borderRadius: 20,
  },
  input: {
    flex: 1,
    backgroundColor: THEME.input,
    color: THEME.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: THEME.primary,
    borderRadius: 20,
    padding: 10,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  voiceButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    borderRadius: 20,
  },
});
