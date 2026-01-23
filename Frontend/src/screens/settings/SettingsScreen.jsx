import React from 'react'
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
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
      color: '#6B7FFF',
    },
    {
      title: 'Your Impact',
      icon: TrendingUp,
      onPress: () => navigation.navigate('ImpactDashboard'),
      color: '#7A9D7E',
    },
    {
      title: 'Saved Posts',
      icon: Heart,
      onPress: () => navigation.navigate('SavedPosts'),
      color: '#FFB366',
    },
    {
      title: 'Connections',
      icon: MessageCircle,
      onPress: () => navigation.navigate('Connections'),
      color: '#4A6FA5',
    },
    {
      title: 'Sunday Reflection',
      icon: Calendar,
      onPress: () => navigation.navigate('SundayReflection'),
      color: '#B87B8F',
    },
    {
      title: 'Crisis Resources',
      icon: LifeBuoy,
      onPress: () => navigation.navigate('CrisisResources'),
      color: '#8F7E6B',
    },
  ]

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Settings
        </Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* ✅ NEW: Theme Toggle */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={toggleTheme}
            style={[styles.themeToggle, { backgroundColor: theme.card }]}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: isDarkMode ? '#FFB36620' : '#6B7FFF20' },
              ]}
            >
              {isDarkMode ? (
                <Moon size={20} color='#FFB366' />
              ) : (
                <Sun size={20} color='#6B7FFF' />
              )}
            </View>
            <View style={styles.themeTextContainer}>
              <Text style={[styles.menuText, { color: theme.text }]}>
                {isDarkMode ? 'Dark Mode' : 'Light Mode'}
              </Text>
              <Text
                style={[styles.themeSubtext, { color: theme.textSecondary }]}
              >
                {isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              </Text>
            </View>
            <View
              style={[
                styles.toggle,
                { backgroundColor: isDarkMode ? theme.primary : theme.border },
              ]}
            >
              <View
                style={[styles.toggleDot, isDarkMode && styles.toggleDotActive]}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              style={[styles.menuItem, { backgroundColor: theme.card }]}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${item.color}20` },
                ]}
              >
                <item.icon size={20} color={item.color} />
              </View>
              <Text style={[styles.menuText, { color: theme.text }]}>
                {item.title}
              </Text>
              <ChevronRight size={20} color={theme.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={handleLogoutPress}
            style={[styles.logoutButton, { backgroundColor: theme.card }]}
            activeOpacity={0.7}
          >
            <LogOut size={20} color='#B87B8F' />
            <Text style={[styles.logoutText, { color: '#B87B8F' }]}>
              Logout
            </Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={[styles.appName, { color: theme.textSecondary }]}>
            Anonixx
          </Text>
          <Text style={[styles.appVersion, { color: theme.textTertiary }]}>
            Version 1.0.0
          </Text>
          <Text style={[styles.appTagline, { color: theme.textTertiary }]}>
            A space that heals, not hurts
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
    },
    scrollView: {
      flex: 1,
    },
    section: {
      padding: 16,
    },
    // ✅ NEW: Theme toggle styles
    themeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      gap: 12,
    },
    themeTextContainer: {
      flex: 1,
    },
    themeSubtext: {
      fontSize: 12,
      marginTop: 2,
    },
    toggle: {
      width: 50,
      height: 28,
      borderRadius: 14,
      padding: 2,
      justifyContent: 'center',
    },
    toggleDot: {
      width: 24,
      height: 24,
      backgroundColor: '#ffffff',
      borderRadius: 12,
    },
    toggleDotActive: {
      alignSelf: 'flex-end',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      marginBottom: 8,
      gap: 12,
    },
    iconContainer: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 12,
      gap: 8,
    },
    logoutText: {
      fontSize: 16,
      fontWeight: '600',
    },
    appInfo: {
      padding: 24,
      alignItems: 'center',
      gap: 4,
    },
    appName: {
      fontSize: 16,
      fontWeight: '600',
    },
    appVersion: {
      fontSize: 12,
    },
    appTagline: {
      fontSize: 12,
      fontStyle: 'italic',
      marginTop: 4,
    },
  })
