import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Users, Lock } from 'lucide-react-native';

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
};

export default function GroupCard({ group, onPress }) {
  if (!group || !group.id) {
    console.warn('⚠️ GroupCard: Invalid group:', group);
    return null;
  }

  console.log('🔵 GroupCard rendering:', group.id, group.name);

  return (
    <View style={styles.cardWrapper}>
      <View style={styles.accentBar} />
      <TouchableOpacity
        onPress={() => {
          console.log('👆 GroupCard clicked:', group.id);
          onPress();
        }}
        style={styles.container}
        activeOpacity={0.8}
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
              {!group.isPublic && (
                <Lock size={16} color={THEME.textSecondary} />
              )}
            </View>

            <Text style={styles.description} numberOfLines={2}>
              {group.description}
            </Text>

            <View style={styles.divider} />

            <View style={styles.footer}>
              <View style={styles.memberCount}>
                <Users size={14} color={THEME.textSecondary} />
                <Text style={styles.memberText}>
                  {group.member_count?.toLocaleString() || 0} members
                </Text>
              </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
    zIndex: 1,
  },
  container: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 18,
    paddingLeft: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  content: {
    flexDirection: 'row',
  },
  iconContainer: {
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    borderRadius: 12,
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  icon: {
    fontSize: 32,
  },
  info: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  name: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  description: {
    color: THEME.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberText: {
    color: THEME.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  joinedBadge: {
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.3)',
  },
  joinedText: {
    color: THEME.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryBadge: {
    backgroundColor: THEME.backgroundDark,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  categoryText: {
    color: THEME.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
});
