import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User, Heart, MessageCircle, LifeBuoy,
  Calendar, LogOut, ChevronRight, TrendingUp,
} from 'lucide-react-native';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useLogout } from '../../hooks/useLogout';

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  background:   '#0b0f18',
  surface:      '#151924',
  primary:      '#FF634A',
  primaryDim:   'rgba(255,99,74,0.08)',
  primaryBorder:'rgba(255,99,74,0.2)',
  text:         '#EAEAF0',
  textSecondary:'#9A9AA3',
  border:       'rgba(255,255,255,0.06)',
  avatarBg:     '#1e2330',
  iconBg:       '#1e2330',
};

// ─── Static data (module level) ───────────────────────────────────────────────
const MENU_ITEMS = [
  { title: 'Profile',            icon: User,         route: 'EditProfile',      description: 'Manage your account'   },
  { title: 'Your Impact',        icon: TrendingUp,   route: 'ImpactDashboard',  description: 'See your contribution' },
  { title: 'Saved Posts',        icon: Heart,        route: 'SavedPosts',       description: 'Your collection'       },
  { title: 'Connections',        icon: MessageCircle,route: 'Connections',      description: 'Your conversations'    },
  { title: 'Sunday Reflection',  icon: Calendar,     route: 'SundayReflection', description: 'Weekly mindfulness'    },
  { title: 'Crisis Resources',   icon: LifeBuoy,     route: 'CrisisResources',  description: 'Get help now'          },
];

// ─── Menu Item (memoized) ─────────────────────────────────────────────────────
const MenuItem = React.memo(({ title, icon: Icon, description, onPress }) => (
  <TouchableOpacity
    style={styles.menuItem}
    onPress={onPress}
    hitSlop={HIT_SLOP}
    activeOpacity={0.8}
  >
    <View style={styles.menuIcon}>
      <Icon size={rs(20)} color={T.text} />
    </View>
    <View style={styles.menuText}>
      <Text style={styles.menuTitle}>{title}</Text>
      <Text style={styles.menuDesc}>{description}</Text>
    </View>
    <ChevronRight size={rs(18)} color={T.textSecondary} />
  </TouchableOpacity>
));

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SettingsScreen({ navigation }) {
  const { confirmLogout } = useLogout(navigation);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <User size={rs(30)} color={T.textSecondary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Anonymous User</Text>
            <Text style={styles.profileTagline}>A space that heals, not hurts</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your Space</Text>
          {MENU_ITEMS.map(item => (
            <MenuItem
              key={item.route}
              title={item.title}
              icon={item.icon}
              description={item.description}
              onPress={() => navigation.navigate(item.route)}
            />
          ))}
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={confirmLogout}
            hitSlop={HIT_SLOP}
            activeOpacity={0.8}
          >
            <LogOut size={rs(20)} color={T.primary} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* App info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Anonixx</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <View style={styles.appDivider} />
          <Text style={styles.appTagline}>A space that heals, not hurts</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: T.background,
  },

  // Header
  header: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: {
    fontSize: FONT.xxl,
    fontWeight: '800',
    color: T.primary,
    letterSpacing: -0.5,
  },

  // Scroll
  scroll: { flex: 1 },
  content: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: T.border,
  },
  profileAvatar: {
    width: rs(60),
    height: rs(60),
    borderRadius: rs(30),
    backgroundColor: T.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: FONT.lg,
    fontWeight: '700',
    color: T.text,
    marginBottom: rp(3),
  },
  profileTagline: {
    fontSize: FONT.sm,
    color: T.textSecondary,
    fontStyle: 'italic',
  },

  // Section
  section: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    fontSize: FONT.xs,
    fontWeight: '700',
    color: T.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    paddingHorizontal: rp(4),
  },

  // Menu item
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: T.border,
  },
  menuIcon: {
    width: rs(42),
    height: rs(42),
    borderRadius: rs(21),
    backgroundColor: T.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  menuText: { flex: 1 },
  menuTitle: {
    fontSize: FONT.md,
    fontWeight: '600',
    color: T.text,
    marginBottom: rp(2),
  },
  menuDesc: {
    fontSize: FONT.xs,
    color: T.textSecondary,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: T.primaryBorder,
  },
  logoutText: {
    fontSize: FONT.md,
    fontWeight: '700',
    color: T.primary,
  },

  // App info
  appInfo: {
    alignItems: 'center',
    gap: rp(5),
    paddingVertical: SPACING.lg,
  },
  appName: {
    fontSize: FONT.md,
    fontWeight: '700',
    color: T.text,
  },
  appVersion: {
    fontSize: FONT.xs,
    color: T.textSecondary,
  },
  appDivider: {
    width: rs(36),
    height: 1,
    backgroundColor: T.border,
    marginVertical: rp(6),
  },
  appTagline: {
    fontSize: FONT.xs,
    fontStyle: 'italic',
    color: T.textSecondary,
  },
});
