import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Users, Lock } from 'lucide-react-native'

export default function GroupCard({ group, onPress }) {
  // ✅ FIXED: Add validation and logging
  if (!group || !group.id) {
    console.warn('⚠️ GroupCard: Invalid group:', group)
    return null
  }

  console.log('🔵 GroupCard rendering:', group.id, group.name)

  return (
    <TouchableOpacity
      onPress={() => {
        console.log('👆 GroupCard clicked:', group.id)
        onPress()
      }}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>
            {group.category === 'gaming'
              ? '🎮'
              : group.category === 'music'
              ? '🎵'
              : group.category === 'sports'
              ? '⚽'
              : group.category === 'tech'
              ? '💻'
              : group.category === 'food'
              ? '🍔'
              : group.category === 'travel'
              ? '✈️'
              : group.category === 'art'
              ? '🎨'
              : '👥'}
          </Text>
        </View>

        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {group.name}
            </Text>
            {!group.isPublic && <Lock size={16} color='#6b7280' />}
          </View>

          <Text style={styles.description} numberOfLines={2}>
            {group.description}
          </Text>

          <View style={styles.footer}>
            <View style={styles.memberCount}>
              <Users size={14} color='#6b7280' />
              <Text style={styles.memberText}>
                {/* ✅ FIXED: member_count not memberCount */}
                {group.member_count?.toLocaleString() || 0} members
              </Text>
            </View>

            {/* ✅ FIXED: is_member not joined */}
            {group.is_member && (
              <View style={styles.joinedBadge}>
                <Text style={styles.joinedText}>Joined</Text>
              </View>
            )}

            {group.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{group.category}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  content: { flexDirection: 'row' },
  iconContainer: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderRadius: 12,
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: { fontSize: 32 },
  info: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', flex: 1 },
  description: { color: '#9ca3af', fontSize: 14, marginBottom: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  memberCount: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  memberText: { color: '#9ca3af', fontSize: 12, marginLeft: 4 },
  joinedBadge: {
    backgroundColor: 'rgba(20, 184, 166, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  joinedText: { color: '#14b8a6', fontSize: 12, fontWeight: '600' },
  categoryBadge: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: { color: '#9ca3af', fontSize: 12 },
})
