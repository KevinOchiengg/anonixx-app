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
} from 'lucide-react-native'
import { useLogout } from '../../hooks/useLogout'

const { height, width } = Dimensions.get('window')

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.05)',
  avatarBg: '#3a3f50',
  avatarIcon: '#5a5f70',
}

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
  const { confirmLogout } = useLogout(navigation)

  const menuItems = [
    { title: 'Profile', icon: User, onPress: () => navigation.navigate('EditProfile'), description: 'Manage your account' },
    { title: 'Your Impact', icon: TrendingUp, onPress: () => navigation.navigate('ImpactDashboard'), description: 'See your contribution' },
    { title: 'Saved Posts', icon: Heart, onPress: () => navigation.navigate('SavedPosts'), description: 'Your collection' },
    { title: 'Connections', icon: MessageCircle, onPress: () => navigation.navigate('Connections'), description: 'Your conversations' },
    { title: 'Sunday Reflection', icon: Calendar, onPress: () => navigation.navigate('SundayReflection'), description: 'Weekly mindfulness' },
    { title: 'Crisis Resources', icon: LifeBuoy, onPress: () => navigation.navigate('CrisisResources'), description: 'Get help now' },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <User size={32} color={THEME.avatarIcon} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Anonymous User</Text>
            <Text style={styles.profileSubtext}>A space that heals, not hurts</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Space</Text>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
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
          ))}
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={confirmLogout}
            style={styles.logoutButton}
            activeOpacity={0.8}
          >
            <LogOut size={22} color={THEME.primary} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: THEME.background },
  header: { paddingHorizontal: 20, paddingVertical: 20, zIndex: 10 },
  headerTitle: { fontSize: 32, fontWeight: '800', color: THEME.primary, letterSpacing: -0.5 },
  scrollView: { flex: 1 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    margin: 16,
    marginBottom: 24,
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  profileAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 20, fontWeight: '700', color: THEME.text, marginBottom: 4 },
  profileSubtext: { fontSize: 14, color: THEME.textSecondary, fontStyle: 'italic' },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: THEME.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME.surface,
    padding: 18, borderRadius: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  menuIconContainer: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: THEME.avatarBg,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  menuTextContainer: { flex: 1 },
  menuText: { fontSize: 16, fontWeight: '600', color: THEME.text, marginBottom: 2 },
  menuDescription: { fontSize: 13, color: THEME.textSecondary },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: THEME.surface, padding: 18, borderRadius: 16, gap: 10,
    shadowColor: THEME.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 4,
    borderWidth: 1, borderColor: 'rgba(255, 99, 74, 0.2)',
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: THEME.primary },
  appInfo: { padding: 32, alignItems: 'center', gap: 6, marginBottom: 20 },
  appName: { fontSize: 18, fontWeight: '700', color: THEME.text },
  appVersion: { fontSize: 13, color: THEME.textSecondary },
  dividerSmall: { width: 40, height: 1, backgroundColor: THEME.border, marginVertical: 8 },
  appTagline: { fontSize: 13, fontStyle: 'italic', color: THEME.textSecondary },
})
