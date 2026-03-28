import React from 'react'
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native'
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Globe,
  Heart,
} from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import StarryBackground from '../../components/common/StarryBackground';

export default function CrisisResourcesScreen({ navigation }) {
  const { theme } = useTheme()

  const resources = [
    {
      name: 'National Suicide Prevention Lifeline',
      phone: '988',
      description: '24/7 crisis support for those in distress',
      icon: 'phone',
    },
    {
      name: 'Crisis Text Line',
      phone: 'Text HOME to 741741',
      description: 'Free, 24/7 support via text message',
      icon: 'message',
    },
    {
      name: 'SAMHSA National Helpline',
      phone: '1-800-662-4357',
      description: 'Treatment referral and information service',
      icon: 'phone',
    },
    {
      name: 'Trevor Project (LGBTQ+ Youth)',
      phone: '1-866-488-7386',
      description: 'Crisis intervention for LGBTQ+ young people',
      icon: 'phone',
    },
    {
      name: 'Veterans Crisis Line',
      phone: '1-800-273-8255 (Press 1)',
      description: 'Support for veterans and their families',
      icon: 'phone',
    },
  ]

  const handleCall = (phone) => {
    const cleanPhone = phone.replace(/\D/g, '')
    Alert.alert('Call Support', `Call ${phone}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Call',
        onPress: () => Linking.openURL(`tel:${cleanPhone}`),
      },
    ])
  }

  const getIcon = (iconType) => {
    switch (iconType) {
      case 'phone':
        return <Phone size={24} color={theme.primary} />
      case 'message':
        return <MessageCircle size={24} color={theme.primary} />
      default:
        return <Globe size={24} color={theme.primary} />
    }
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StarryBackground />
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Crisis Resources
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Important Notice */}
        <View style={[styles.noticeCard, { backgroundColor: '#7A9D7E20' }]}>
          <Heart size={32} color='#7A9D7E' />
          <Text style={[styles.noticeTitle, { color: theme.text }]}>
            You're not alone
          </Text>
          <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
            If you're in crisis or need immediate help, please reach out to
            these professional resources. They're available 24/7 and want to
            help.
          </Text>
        </View>

        {/* Emergency */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Emergency
          </Text>
          <TouchableOpacity
            onPress={() => handleCall('911')}
            style={[styles.emergencyButton, { backgroundColor: '#B87B8F' }]}
          >
            <Phone size={24} color='#ffffff' />
            <View style={{ flex: 1 }}>
              <Text style={styles.emergencyTitle}>Call 911</Text>
              <Text style={styles.emergencySubtext}>For immediate danger</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Resources */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Support Hotlines
          </Text>

          {resources.map((resource, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleCall(resource.phone)}
              style={[styles.resourceCard, { backgroundColor: theme.card }]}
            >
              <View style={styles.resourceIcon}>{getIcon(resource.icon)}</View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resourceName, { color: theme.text }]}>
                  {resource.name}
                </Text>
                <Text style={[styles.resourcePhone, { color: theme.primary }]}>
                  {resource.phone}
                </Text>
                <Text
                  style={[styles.resourceDesc, { color: theme.textSecondary }]}
                >
                  {resource.description}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Online Resources */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Online Resources
          </Text>

          <TouchableOpacity
            onPress={() =>
              Linking.openURL('https://suicidepreventionlifeline.org')
            }
            style={[styles.linkCard, { backgroundColor: theme.card }]}
          >
            <Globe size={20} color={theme.primary} />
            <Text style={[styles.linkText, { color: theme.text }]}>
              suicidepreventionlifeline.org
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL('https://www.crisistextline.org')}
            style={[styles.linkCard, { backgroundColor: theme.card }]}
          >
            <Globe size={20} color={theme.primary} />
            <Text style={[styles.linkText, { color: theme.text }]}>
              crisistextline.org
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer Message */}
        <View style={styles.footerMessage}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            These resources are confidential and available 24/7. Reaching out is
            a sign of strength, not weakness.
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    scrollView: {
      flex: 1,
    },
    noticeCard: {
      margin: 16,
      padding: 24,
      borderRadius: 16,
      alignItems: 'center',
      gap: 12,
    },
    noticeTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    noticeText: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    section: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    emergencyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 20,
      borderRadius: 12,
      gap: 16,
    },
    emergencyTitle: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: 'bold',
    },
    emergencySubtext: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: 14,
    },
    resourceCard: {
      flexDirection: 'row',
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      gap: 12,
    },
    resourceIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(107, 127, 255, 0.1)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    resourceName: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
    },
    resourcePhone: {
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    resourceDesc: {
      fontSize: 13,
      lineHeight: 18,
    },
    linkCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      gap: 12,
    },
    linkText: {
      fontSize: 15,
      fontWeight: '500',
    },
    footerMessage: {
      padding: 24,
    },
    footerText: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  })
