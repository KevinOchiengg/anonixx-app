import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Users, Settings, Share2 } from 'lucide-react-native';

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

export default function GroupHeader({ group, onSettingsPress, onSharePress }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.accentBar} />
      <View style={styles.container}>
        {/* Main Header Row */}
        <View style={styles.mainRow}>
          <View style={styles.leftContent}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>{group.icon || '👥'}</Text>
            </View>

            <View style={styles.titleSection}>
              <Text style={styles.name}>{group.name}</Text>
              <View style={styles.memberRow}>
                <Users size={14} color={THEME.textSecondary} />
                <Text style={styles.memberText}>
                  {group.memberCount?.toLocaleString() || 0} members
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            {onSharePress && (
              <TouchableOpacity
                onPress={onSharePress}
                style={styles.actionButton}
                activeOpacity={0.7}
              >
                <Share2 size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            )}
            {onSettingsPress && (
              <TouchableOpacity
                onPress={onSettingsPress}
                style={styles.actionButton}
                activeOpacity={0.7}
              >
                <Settings size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Description */}
        {group.description && (
          <>
            <View style={styles.divider} />
            <Text style={styles.description}>{group.description}</Text>
          </>
        )}

        {/* Category Badge */}
        {group.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{group.category}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
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
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    opacity: 0.6,
    zIndex: 1,
  },
  container: {
    backgroundColor: THEME.surface,
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingLeft: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    borderRadius: 16,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  icon: {
    fontSize: 36,
  },
  titleSection: {
    flex: 1,
  },
  name: {
    color: THEME.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberText: {
    color: THEME.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 16,
  },
  description: {
    color: THEME.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  categoryBadge: {
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.3)',
  },
  categoryText: {
    color: THEME.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
