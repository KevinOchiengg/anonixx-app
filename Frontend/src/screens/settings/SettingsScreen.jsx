import React, { useMemo } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native'
import {
  User,
  Heart,
  MessageCircle,
  LifeBuoy,
  Calendar,
  LogOut,
  ChevronRight,
  TrendingUp,
  Sun,
  Moon,
} from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { useLogout } from '../../hooks/useLogout'

const { height, width } = Dimensions.get('window')

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
  avatarBg: '#3a3f50',
  avatarIcon: '#5a5f70',
}

// Starry Background Component
const StarryBackground = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      top: Math.random() * height,
      left: Math.random() * width,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
    }))
  }, [])

  return (
    <>
      {stars.map((star) => (
        <View
          key={star.id}
          style={{
            position: 'absolute',
            backgroundColor: THEME.primary,
            borderRadius: 50,
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </>
  )
}

export default function SettingsScreen({ navigation }) {
  const { theme, isDarkMode, toggleTheme } = useTheme()
  const { confirmLogout } = useLogout(navigation)

  const handleLogoutPress = () => {
    console.log('🔴 Logout button pressed from Settings')
    confirmLogout()
  }

  const menuItems = [
    {
      title: 'Profile',
      icon: User,
      onPress: () => navigation.navigate('EditProfile'),
      description: 'Manage your account',
    },
    {
      title: 'Your Impact',
      icon: TrendingUp,
      onPress: () => navigation.navigate('ImpactDashboard'),
      description: 'See your contribution',
    },
    {
      title: 'Saved Posts',
      icon: Heart,
      onPress: () => navigation.navigate('SavedPosts'),
      description: 'Your collection',
    },
    {
      title: 'Connections',
      icon: MessageCircle,
      onPress: () => navigation.navigate('Connections'),
      description: 'Your conversations',
    },
    {
      title: 'Sunday Reflection',
      icon: Calendar,
      onPress: () => navigation.navigate('SundayReflection'),
      description: 'Weekly mindfulness',
    },
    {
      title: 'Crisis Resources',
      icon: LifeBuoy,
      onPress: () => navigation.navigate('CrisisResources'),
      description: 'Get help now',
    },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='light-content' backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCardWrapper}>
          <View style={styles.profileAccentBar} />
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <User size={32} color={THEME.avatarIcon} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>Anonymous User</Text>
              <Text style={styles.profileSubtext}>
                A space that heals, not hurts
              </Text>
            </View>
          </View>
        </View>

        {/* Theme Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.themeToggleWrapper}>
            <View style={styles.themeAccentBar} />
            <TouchableOpacity
              onPress={toggleTheme}
              style={styles.themeToggle}
              activeOpacity={0.8}
            >
              <View style={styles.themeIconContainer}>
                {isDarkMode ? (
                  <Moon size={22} color={THEME.primary} />
                ) : (
                  <Sun size={22} color={THEME.primary} />
                )}
              </View>
              <View style={styles.themeTextContainer}>
                <Text style={styles.themeText}>
                  {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                </Text>
                <Text style={styles.themeSubtext}>
                  {isDarkMode ? 'Using dark theme' : 'Using light theme'}
                </Text>
              </View>
              <View
                style={[
                  styles.toggle,
                  { backgroundColor: isDarkMode ? THEME.primary : THEME.border },
                ]}
              >
                <View
                  style={[styles.toggleDot, isDarkMode && styles.toggleDotActive]}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Space</Text>
          {menuItems.map((item, index) => (
            <View key={index} style={styles.menuItemWrapper}>
              <View style={styles.menuAccentBar} />
              <TouchableOpacity
                onPress={item.onPress}
                style={styles.menuItem}
                activeOpacity={0.8}
              >
                <View style={styles.menuIconContainer}>
                  <item.icon size={22} color={THEME.text} />
                </View>
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuText}>{item.title}</Text>
                  <Text style={styles.menuDescription}>{item.description}</Text>
                </View>
                <ChevronRight size={20} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <View style={styles.logoutWrapper}>
            <View style={styles.logoutAccentBar} />
            <TouchableOpacity
              onPress={handleLogoutPress}
              style={styles.logoutButton}
              activeOpacity={0.8}
            >
              <LogOut size={22} color={THEME.primary} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Anonixx</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <View style={styles.dividerSmall} />
          <Text style={styles.appTagline}>A space that heals, not hurts</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: THEME.primary,
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },
  // Profile Card
  profileCardWrapper: {
    position: 'relative',
    margin: 16,
    marginBottom: 24,
  },
  profileAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    zIndex: 1,
  },
  profileCard: {
    backgroundColor: THEME.surface,
    padding: 20,
    paddingLeft: 26,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 4,
  },
  profileSubtext: {
    fontSize: 14,
    color: THEME.textSecondary,
    fontStyle: 'italic',
  },
  // Sections
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  // Theme Toggle
  themeToggleWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  themeAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  themeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  themeTextContainer: {
    flex: 1,
  },
  themeText: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.text,
    marginBottom: 2,
  },
  themeSubtext: {
    fontSize: 13,
    color: THEME.textSecondary,
  },
  toggle: {
    width: 54,
    height: 30,
    borderRadius: 15,
    padding: 3,
    justifyContent: 'center',
  },
  toggleDot: {
    width: 24,
    height: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleDotActive: {
    alignSelf: 'flex-end',
  },
  // Menu Items
  menuItemWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  menuAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuText: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.text,
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 13,
    color: THEME.textSecondary,
  },
  // Logout
  logoutWrapper: {
    position: 'relative',
  },
  logoutAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface,
    padding: 18,
    paddingLeft: 22,
    borderRadius: 16,
    gap: 10,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 99, 74, 0.2)',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.primary,
  },
  // App Info
  appInfo: {
    padding: 32,
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
  },
  appVersion: {
    fontSize: 13,
    color: THEME.textSecondary,
  },
  dividerSmall: {
    width: 40,
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 8,
  },
  appTagline: {
    fontSize: 13,
    fontStyle: 'italic',
    color: THEME.textSecondary,
  },
})
