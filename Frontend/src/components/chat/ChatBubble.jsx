import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME } from '../../utils/theme';

export default function ChatBubble({ message, isOwn }) {
  return (
    <View style={styles.bubbleWrapper}>
      <View
        style={[
          styles.accentBar,
          isOwn ? styles.ownAccentBar : styles.theirAccentBar,
        ]}
      />
      <View
        style={[styles.bubble, isOwn ? styles.ownBubble : styles.theirBubble]}
      >
        <Text style={styles.messageText}>{message.content}</Text>
        <Text style={styles.messageTime}>
          {new Date(message.createdAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleWrapper: {
    position: 'relative',
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    borderRadius: 12,
    opacity: 0.6,
  },
  ownAccentBar: {
    right: 0,
    backgroundColor: THEME.primary,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  theirAccentBar: {
    left: 0,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  bubble: {
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ownBubble: {
    backgroundColor: THEME.primary,
    paddingRight: 18,
    alignSelf: 'flex-end',
  },
  theirBubble: {
    backgroundColor: THEME.surface,
    paddingLeft: 18,
  },
  messageText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
  },
  messageTime: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 6,
  },
});
