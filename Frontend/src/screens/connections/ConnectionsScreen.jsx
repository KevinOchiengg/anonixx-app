import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

import {
  MessageCircle,
  Users,
  Calendar,
  Send,
  UserPlus,
  ArrowRight,
  Info,
  ArrowLeft,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const { height, width } = Dimensions.get('window');

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

// Starry Background Component
const StarryBackground = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      top: Math.random() * height,
      left: Math.random() * width,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
    }));
  }, []);

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
  );
};

export default function ConnectionsScreen({ navigation }) {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();

  const [invitesLeft, setInvitesLeft] = useState(3);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      loadInvitesLeft();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadInvitesLeft = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/connections/weekly-invites-left`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setInvitesLeft(data.invites_left);
      }
    } catch (error) {
      console.error('Load invites error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auth prompt for non-authenticated users
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={THEME.background}
        />
        <StarryBackground />

        <View style={styles.authPrompt}>
          <View style={styles.authIconContainer}>
            <MessageCircle size={64} color={THEME.primary} />
          </View>
          <Text style={styles.authPromptTitle}>
            Sign up to make connections
          </Text>
          <Text style={styles.authPromptText}>
            Create an account to connect with others anonymously and build
            meaningful relationships
          </Text>

          <View style={styles.authButtonWrapper}>
            <View style={styles.authAccentBar} />
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Auth', { screen: 'Register' })
              }
              style={styles.authButton}
            >
              <UserPlus size={20} color="#ffffff" />
              <Text style={styles.authButtonText}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
            style={styles.authSecondaryButton}
          >
            <Text style={styles.authSecondaryButtonText}>
              Already have an account? Login
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={THEME.background}
        />
        <StarryBackground />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={THEME.primary} />
          <Text style={styles.loadingText}>Loading connections...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={THEME.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Connections</Text>
          <Text style={styles.headerSubtitle}>
            Anonymous, intentional relationships
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Weekly Invites Card */}
        <View style={styles.cardWrapper}>
          <View style={styles.cardAccentBar} />
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconContainer}>
                <Send size={24} color={THEME.primary} />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Weekly Invites</Text>
                <Text style={styles.cardSubtitle}>
                  {invitesLeft} of 3 left this week
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${(invitesLeft / 3) * 100}%` },
                  ]}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.cardDescription}>
              You can send {invitesLeft} more connection invites this week.
              Invites reset every Sunday.
            </Text>

            <TouchableOpacity
              style={[
                styles.cardButton,
                invitesLeft === 0 && styles.cardButtonDisabled,
              ]}
              onPress={() => navigation.navigate('SendInvite')}
              disabled={invitesLeft === 0}
            >
              <Text style={styles.cardButtonText}>
                {invitesLeft === 0
                  ? 'No Invites Left'
                  : 'Send Connection Invite'}
              </Text>
              {invitesLeft > 0 && <ArrowRight size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Connections Card */}
        <View style={styles.cardWrapper}>
          <View style={[styles.cardAccentBar, { opacity: 0.4 }]} />
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.cardIconContainer,
                  { backgroundColor: 'rgba(122, 157, 126, 0.15)' },
                ]}
              >
                <Users size={24} color="#7A9D7E" />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Active Connections</Text>
                <Text style={styles.cardSubtitle}>0 connections</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.emptyState}>
              <Users size={40} color={THEME.textSecondary} opacity={0.3} />
              <Text style={styles.emptyText}>
                No active connections yet. Send an invite to start building
                meaningful relationships.
              </Text>
            </View>
          </View>
        </View>

        {/* Pending Invites Card */}
        <View style={styles.cardWrapper}>
          <View style={[styles.cardAccentBar, { opacity: 0.4 }]} />
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.cardIconContainer,
                  { backgroundColor: 'rgba(184, 123, 143, 0.15)' },
                ]}
              >
                <Calendar size={24} color="#B87B8F" />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Pending Invites</Text>
                <Text style={styles.cardSubtitle}>0 pending</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.emptyState}>
              <Calendar size={40} color={THEME.textSecondary} opacity={0.3} />
              <Text style={styles.emptyText}>No pending invites</Text>
            </View>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoWrapper}>
          <View style={styles.infoAccentBar} />
          <View style={styles.infoSection}>
            <View style={styles.infoHeader}>
              <Info size={20} color={THEME.primary} />
              <Text style={styles.infoTitle}>How Connections Work</Text>
            </View>

            <View style={styles.infoItem}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Send up to 3 invites per week to people you resonate with
              </Text>
            </View>

            <View style={styles.infoItem}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Both people stay anonymous unless you choose to reveal yourself
              </Text>
            </View>

            <View style={styles.infoItem}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Build deeper relationships through ongoing conversations
              </Text>
            </View>

            <View style={styles.infoItem}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>
                Connections are about quality, not quantity
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: THEME.primary,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: THEME.textSecondary,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: THEME.textSecondary,
    marginTop: 16,
    fontStyle: 'italic',
  },
  // Auth Prompt
  authPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  authIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  authPromptTitle: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    color: THEME.text,
    marginBottom: 12,
  },
  authPromptText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    color: THEME.textSecondary,
    marginBottom: 32,
  },
  authButtonWrapper: {
    position: 'relative',
    width: '100%',
    marginBottom: 16,
  },
  authAccentBar: {
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
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: THEME.primary,
    paddingVertical: 18,
    paddingLeft: 22,
    borderRadius: 16,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  authButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  authSecondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  authSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textSecondary,
  },
  // Cards
  cardWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  cardAccentBar: {
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
  card: {
    backgroundColor: THEME.surface,
    padding: 20,
    paddingLeft: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 99, 74, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: THEME.textSecondary,
  },
  progressBarContainer: {
    marginBottom: 16,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(255, 99, 74, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.primary,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginBottom: 16,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: THEME.textSecondary,
    marginBottom: 16,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.primary,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cardButtonDisabled: {
    backgroundColor: THEME.textSecondary,
    opacity: 0.5,
  },
  cardButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: THEME.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  // Info Section
  infoWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 32,
  },
  infoAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    opacity: 0.4,
  },
  infoSection: {
    backgroundColor: THEME.surface,
    padding: 20,
    paddingLeft: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.primary,
    marginTop: 7,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: THEME.textSecondary,
  },
});

