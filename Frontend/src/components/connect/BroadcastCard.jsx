import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { MessageCircle, Flame } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import VibeTag from './VibeTag'

export default function BroadcastCard({ broadcast, onSendOpener, isHot = false, hintsComponent }) {
  const { theme } = useTheme()

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: isHot ? '#FF634A' : theme.border, // ✅ hot traces get coral border
          borderWidth: isHot ? 1.5 : 1,
        },
      ]}
    >
      {/* Hot badge */}
      {isHot && (
        <View style={styles.hotBadge}>
          <Flame size={11} color='#FF634A' />
          <Text style={styles.hotBadgeText}>Hot</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.nameContainer}>
          <Text style={[styles.anonymousName, { color: theme.text }]}>
            {broadcast.anonymous_name}
          </Text>
          {broadcast.mood_emoji && (
            <Text style={styles.moodEmoji}>{broadcast.mood_emoji}</Text>
          )}
        </View>
        <Text style={[styles.timeAgo, { color: theme.textSecondary }]}>
          {broadcast.time_ago}
        </Text>
      </View>

      {/* Hints — replaces plain "Anonymous User" context */}
      {hintsComponent}

      {/* Content */}
      <Text style={[styles.content, { color: theme.text }]}>
        {broadcast.content}
      </Text>

      {/* Vibe Tags */}
      {broadcast.vibe_tags?.length > 0 && (
        <View style={styles.tags}>
          {broadcast.vibe_tags.map((tag) => (
            <VibeTag key={tag} tag={tag} disabled />
          ))}
        </View>
      )}

      {/* Intention Tag */}
      {broadcast.intention_tag && (
        <View
          style={[
            styles.intentionBadge,
            { backgroundColor: theme.primaryLight },
          ]}
        >
          <Text style={[styles.intentionText, { color: theme.primary }]}>
            {broadcast.intention_tag}
          </Text>
        </View>
      )}

      {/* Action */}
      {broadcast.already_responded ? (
        <View
          style={[
            styles.respondedBanner,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Text style={[styles.respondedText, { color: theme.textSecondary }]}>
            ✓ Already responded
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={onSendOpener}
          style={[styles.replyButton, { backgroundColor: theme.primary }]}
          activeOpacity={0.8}
        >
          <MessageCircle size={18} color='#ffffff' />
          <Text style={styles.replyButtonText}>Send opener</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  hotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-end',
    marginBottom: 6,
  },
  hotBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF634A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4, // ✅ reduced — hints sit right below
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  anonymousName: {
    fontSize: 16,
    fontWeight: '700',
  },
  moodEmoji: {
    fontSize: 20,
  },
  timeAgo: {
    fontSize: 13,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 12,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  intentionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  intentionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  replyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  replyButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  respondedBanner: {
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  respondedText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
