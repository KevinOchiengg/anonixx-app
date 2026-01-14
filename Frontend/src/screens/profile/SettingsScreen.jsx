import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
  StatusBar,
} from 'react-native'
import { useSelector, useDispatch } from 'react-redux'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  User,
  Bell,
  Shield,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
  Globe,
  Lock,
  Trash2,
  Mail,
  Smartphone,
} from 'lucide-react-native'
import { logout } from '../../store/slices/authSlice'
import { useTheme } from '../../context/ThemeContext'

export default function SettingsScreen({ navigation }) {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const { theme, isDarkMode, toggleTheme } = useTheme()
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  // ==========================================
  // Logout Handler
  // ==========================================
  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔵 Starting logout process...')

              // 1. Clear all tokens from AsyncStorage
              await AsyncStorage.multiRemove([
                'token',
                'authToken',
                'refreshToken',
              ])
              console.log('✅ Tokens cleared from AsyncStorage')

              // 2. Dispatch logout action to Redux
              dispatch(logout())
              console.log('✅ Redux state cleared')

              // 3. Show success message
              Alert.alert(
                'Logged Out',
                'You have been successfully logged out.'
              )

              // 4. Navigate to login screen and reset navigation stack
              setTimeout(() => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                })
              }, 500)

              console.log('✅ Logout complete')
            } catch (error) {
              console.error('❌ Logout error:', error)
              Alert.alert('Error', 'Failed to logout. Please try again.')
            }
          },
        },
      ],
      { cancelable: true }
    )
  }

  // ==========================================
  // Delete Account Handler
  // ==========================================
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔵 Starting account deletion...')
              const token = await AsyncStorage.getItem('token')

              const response = await fetch(
                'http://192.168.100.22:8000/api/v1/auth/delete-account',
                {
                  method: 'DELETE',
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              )

              if (!response.ok) {
                const data = await response.json()
                throw new Error(data.detail || 'Failed to delete account')
              }

              console.log('✅ Account deleted from server')

              // Clear all tokens
              await AsyncStorage.multiRemove([
                'token',
                'authToken',
                'refreshToken',
              ])
              console.log('✅ Tokens cleared')

              // Dispatch logout
              dispatch(logout())
              console.log('✅ User logged out')

              Alert.alert(
                'Account Deleted',
                'Your account has been permanently deleted.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      navigation.reset({
                        index: 0,
                        routes: [{ name: 'Login' }],
                      })
                    },
                  },
                ]
              )
            } catch (error) {
              console.error('❌ Delete account error:', error)
              Alert.alert(
                'Error',
                error.message || 'Failed to delete account. Please try again.'
              )
            }
          },
        },
      ]
    )
  }

  // ==========================================
  // Setting Item Component
  // ==========================================
  const SettingItem = ({
    icon: Icon,
    title,
    subtitle,
    onPress,
    showChevron = true,
    toggle,
    value,
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.settingItem, { borderBottomColor: theme.border }]}
      activeOpacity={0.7}
    >
      <View style={styles.settingItemLeft}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: theme.primaryLight },
          ]}
        >
          <Icon size={20} color={theme.primary} />
        </View>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color: theme.text }]}>
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[styles.settingSubtitle, { color: theme.textSecondary }]}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {toggle ? (
        <View style={styles.settingItemRight}>
          <TouchableOpacity
            onPress={onPress}
            style={[
              styles.toggle,
              { backgroundColor: value ? theme.accent : theme.border },
            ]}
          >
            <View style={[styles.toggleDot, value && styles.toggleDotActive]} />
          </TouchableOpacity>
        </View>
      ) : showChevron ? (
        <View style={styles.settingItemRight}>
          <ChevronRight size={20} color={theme.textSecondary} />
        </View>
      ) : null}
    </TouchableOpacity>
  )

  // ==========================================
  // Section Header Component
  // ==========================================
  const SectionHeader = ({ title }) => (
    <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
      {title}
    </Text>
  )

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Settings
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View
          style={[
            styles.profileSection,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>
              {user?.username?.charAt(0).toUpperCase() || '👤'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.text }]}>
              {user?.username || 'User'}
            </Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
              {user?.email || 'user@example.com'}
            </Text>
            <View
              style={[
                styles.coinBadge,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Text style={[styles.coinText, { color: theme.primary }]}>
                💰 {user?.coin_balance || 0} Coins
              </Text>
            </View>
          </View>
        </View>

        {/* Account Settings */}
        <SectionHeader title='ACCOUNT' />
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <SettingItem
            icon={User}
            title='Edit Profile'
            subtitle='Update your profile information'
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingItem
            icon={Mail}
            title='Email'
            subtitle={user?.email || 'No email set'}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingItem
            icon={Lock}
            title='Change Password'
            subtitle='Update your password'
            onPress={() => navigation.navigate('ChangePassword')}
          />
        </View>

        {/* Preferences */}
        <SectionHeader title='PREFERENCES' />
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <SettingItem
            icon={Bell}
            title='Notifications'
            subtitle='Push notifications and alerts'
            toggle
            value={notificationsEnabled}
            onPress={() => setNotificationsEnabled(!notificationsEnabled)}
          />
          <SettingItem
            icon={isDarkMode ? Moon : Sun}
            title='Dark Mode'
            subtitle={isDarkMode ? 'Dark theme enabled' : 'Light theme enabled'}
            toggle
            value={isDarkMode}
            onPress={toggleTheme}
          />
          <SettingItem
            icon={Globe}
            title='Language'
            subtitle='English (US)'
            onPress={() =>
              Alert.alert(
                'Coming Soon',
                'Language selection will be available soon.'
              )
            }
          />
        </View>

        {/* Privacy & Security */}
        <SectionHeader title='PRIVACY & SECURITY' />
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <SettingItem
            icon={Shield}
            title='Privacy Settings'
            subtitle='Control who can see your content'
            onPress={() =>
              Alert.alert(
                'Coming Soon',
                'Privacy settings will be available soon.'
              )
            }
          />
          <SettingItem
            icon={Lock}
            title='Blocked Users'
            subtitle='Manage blocked accounts'
            onPress={() =>
              Alert.alert(
                'Coming Soon',
                'Block management will be available soon.'
              )
            }
          />
          <SettingItem
            icon={Smartphone}
            title='Active Sessions'
            subtitle='Manage your logged-in devices'
            onPress={() =>
              Alert.alert(
                'Coming Soon',
                'Session management will be available soon.'
              )
            }
          />
        </View>

        {/* Support */}
        <SectionHeader title='SUPPORT' />
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <SettingItem
            icon={HelpCircle}
            title='Help Center'
            subtitle='Get help and support'
            onPress={() =>
              Alert.alert(
                'Help Center',
                'Visit our help center at help.echo.com'
              )
            }
          />
          <SettingItem
            icon={Info}
            title='About'
            subtitle='App version 1.0.0'
            onPress={() =>
              Alert.alert(
                'Echo',
                'Version 1.0.0\n\nA safe space for mental health support.'
              )
            }
          />
        </View>

        {/* Danger Zone */}
        <SectionHeader title='DANGER ZONE' />
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <TouchableOpacity
            onPress={handleDeleteAccount}
            style={styles.dangerItem}
            activeOpacity={0.7}
          >
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconContainer, styles.dangerIconContainer]}>
                <Trash2 size={20} color={theme.error} />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingTitle, { color: theme.error }]}>
                  Delete Account
                </Text>
                <Text
                  style={[
                    styles.settingSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  Permanently delete your account
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>
            Logout
          </Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Made with 💜 by Echo Team
          </Text>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            © 2026 Echo. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ==========================================
// Styles
// ==========================================
const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
    },
    scrollView: {
      flex: 1,
    },
    profileSection: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 20,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 16,
      borderWidth: 1,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    avatarText: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#ffffff',
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    profileEmail: {
      fontSize: 14,
      marginBottom: 8,
    },
    coinBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      alignSelf: 'flex-start',
    },
    coinText: {
      fontSize: 14,
      fontWeight: '600',
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      marginLeft: 16,
      marginTop: 24,
      marginBottom: 8,
      letterSpacing: 1,
    },
    section: {
      marginHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      overflow: 'hidden',
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
    },
    settingItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    dangerIconContainer: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    settingTextContainer: {
      flex: 1,
    },
    settingTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 2,
    },
    settingSubtitle: {
      fontSize: 13,
    },
    settingItemRight: {
      marginLeft: 12,
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
    dangerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 16,
      marginTop: 24,
      padding: 16,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#ef4444',
    },
    logoutText: {
      fontSize: 16,
      fontWeight: '700',
      marginLeft: 8,
    },
    footer: {
      alignItems: 'center',
      paddingVertical: 32,
      paddingHorizontal: 16,
    },
    footerText: {
      fontSize: 12,
      marginBottom: 4,
    },
  })
