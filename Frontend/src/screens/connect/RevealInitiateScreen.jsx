import React, { useState } from 'react'
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { ArrowLeft, Sparkles, AlertCircle, Clock } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { initiateReveal } from '../../services/connectApi'

export default function RevealInitiateScreen({ route, navigation }) {
  const { connectionId } = route.params
  const { theme } = useTheme()
  const [loading, setLoading] = useState(false)

  const handleInitiate = async () => {
    Alert.alert(
      'This is a big moment',
      "Are you sure you're ready? There's a 24-hour cooling period where you can still change your mind.",
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Yes, Start Countdown',
          style: 'default',
          onPress: async () => {
            setLoading(true)
            try {
              const result = await initiateReveal(connectionId)

              Alert.alert(
                '⏳ 24-Hour Cooling Period',
                "Take this time to be sure. You can cancel anytime during the next 24 hours. After that, they'll be notified.",
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ],
              )
            } catch (error) {
              console.error('❌ Initiate reveal error:', error)
              Alert.alert('Error', error.message || 'Failed to initiate reveal')
            } finally {
              setLoading(false)
            }
          },
        },
      ],
    )
  }

  const styles = createStyles(theme)

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <StatusBar barStyle={theme.statusBar} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Reveal Identity
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View
            style={[styles.iconCircle, { backgroundColor: theme.primaryLight }]}
          >
            <Sparkles size={48} color={theme.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: theme.text }]}>
            Ready to reveal?
          </Text>
          <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
            This is the moment where anonymous becomes real.
          </Text>
        </View>

        {/* What they'll see */}
        <View
          style={[
            styles.infoBox,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.infoTitle, { color: theme.text }]}>
            They'll see:
          </Text>
          <View style={styles.infoList}>
            <Text style={[styles.infoItem, { color: theme.textSecondary }]}>
              • Your real name
            </Text>
            <Text style={[styles.infoItem, { color: theme.textSecondary }]}>
              • Your photo
            </Text>
            <Text style={[styles.infoItem, { color: theme.textSecondary }]}>
              • Your age
            </Text>
            <Text style={[styles.infoItem, { color: theme.textSecondary }]}>
              • Your city
            </Text>
          </View>
        </View>

        {/* How it works */}
        <View
          style={[
            styles.stepCard,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.stepHeader}>
            <Clock size={20} color={theme.primary} />
            <Text style={[styles.stepTitle, { color: theme.text }]}>
              How it works
            </Text>
          </View>

          <View style={styles.step}>
            <View
              style={[
                styles.stepNumber,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Text style={[styles.stepNumberText, { color: theme.primary }]}>
                1
              </Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepText, { color: theme.text }]}>
                24-hour cooling period begins
              </Text>
              <Text
                style={[styles.stepSubtext, { color: theme.textSecondary }]}
              >
                You can cancel anytime during this period
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View
              style={[
                styles.stepNumber,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Text style={[styles.stepNumberText, { color: theme.primary }]}>
                2
              </Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepText, { color: theme.text }]}>
                They get notified
              </Text>
              <Text
                style={[styles.stepSubtext, { color: theme.textSecondary }]}
              >
                They can accept or decline (it's their choice)
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View
              style={[
                styles.stepNumber,
                { backgroundColor: theme.primaryLight },
              ]}
            >
              <Text style={[styles.stepNumberText, { color: theme.primary }]}>
                3
              </Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={[styles.stepText, { color: theme.text }]}>
                If they accept
              </Text>
              <Text
                style={[styles.stepSubtext, { color: theme.textSecondary }]}
              >
                Your identity is revealed to them
              </Text>
            </View>
          </View>
        </View>

        {/* Warning */}
        <View
          style={[
            styles.warningBox,
            { backgroundColor: theme.card, borderColor: theme.warning },
          ]}
        >
          <AlertCircle size={20} color={theme.warning} />
          <Text style={[styles.warningText, { color: theme.text }]}>
            This moment can't be undone. Make sure you're ready.
          </Text>
        </View>

        {/* Reflection Questions */}
        <View
          style={[
            styles.reflectionBox,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Text style={[styles.reflectionTitle, { color: theme.text }]}>
            Before revealing, consider:
          </Text>
          <View style={styles.reflectionList}>
            <Text
              style={[styles.reflectionItem, { color: theme.textSecondary }]}
            >
              ✓ Have you shared your vulnerabilities?
            </Text>
            <Text
              style={[styles.reflectionItem, { color: theme.textSecondary }]}
            >
              ✓ Do you feel safe with this person?
            </Text>
            <Text
              style={[styles.reflectionItem, { color: theme.textSecondary }]}
            >
              ✓ Are you ready if they look different than imagined?
            </Text>
            <Text
              style={[styles.reflectionItem, { color: theme.textSecondary }]}
            >
              ✓ Is this about genuine connection, or loneliness?
            </Text>
          </View>
        </View>

        {/* Initiate Button */}
        <TouchableOpacity
          onPress={handleInitiate}
          disabled={loading}
          style={[
            styles.initiateButton,
            { backgroundColor: theme.primary },
            loading && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator size='small' color='#ffffff' />
          ) : (
            <>
              <Sparkles size={20} color='#ffffff' />
              <Text style={styles.initiateButtonText}>
                Start 24-Hour Countdown
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Not yet */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.notYetButton}
        >
          <Text style={[styles.notYetText, { color: theme.textSecondary }]}>
            I need more time
          </Text>
        </TouchableOpacity>
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
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    content: {
      flex: 1,
    },
    hero: {
      padding: 32,
      alignItems: 'center',
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    heroTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    heroSubtitle: {
      fontSize: 16,
      textAlign: 'center',
    },
    infoBox: {
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 12,
    },
    infoList: {
      gap: 8,
    },
    infoItem: {
      fontSize: 15,
      lineHeight: 22,
    },
    stepCard: {
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
    },
    stepHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 20,
    },
    stepTitle: {
      fontSize: 16,
      fontWeight: '700',
    },
    step: {
      flexDirection: 'row',
      marginBottom: 16,
    },
    stepNumber: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    stepNumberText: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    stepContent: {
      flex: 1,
    },
    stepText: {
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    stepSubtext: {
      fontSize: 13,
      lineHeight: 18,
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 16,
      borderRadius: 12,
      borderWidth: 2,
    },
    warningText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
    reflectionBox: {
      marginHorizontal: 16,
      marginBottom: 24,
      padding: 20,
      borderRadius: 16,
    },
    reflectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 12,
    },
    reflectionList: {
      gap: 8,
    },
    reflectionItem: {
      fontSize: 14,
      lineHeight: 20,
    },
    initiateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
      padding: 18,
      borderRadius: 12,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    initiateButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
    notYetButton: {
      padding: 16,
      alignItems: 'center',
      marginBottom: 32,
    },
    notYetText: {
      fontSize: 15,
      fontWeight: '600',
    },
  })
