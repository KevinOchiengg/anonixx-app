
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { Dimensions } from 'react-native';

const { height } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
  avatarBg: '#1e2330',
};

// Avatar emoji map — matches what's used on the feed
const AVATAR_MAP = {
  ghost: '👻',
  shadow: '🌑',
  flame: '🔥',
  void: '🕳️',
  storm: '⛈️',
  smoke: '💨',
  eclipse: '🌘',
  shard: '🔷',
  moth: '🦋',
  raven: '🐦‍⬛',
};

export default function AnonProfileSheet({
  visible,
  anonymousName,
  onClose,
  navigation,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const slideAnim = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Swipe down to close
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) slideAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) {
          closeSheet();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible && anonymousName) {
      openSheet();
      loadProfile();
    } else if (!visible) {
      slideAnim.setValue(height);
      backdropOpacity.setValue(0);
    }
  }, [visible, anonymousName]);

  const openSheet = () => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 10,
        tension: 60,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSheet = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(
        `${API_BASE_URL}/api/v1/connect/profile/${encodeURIComponent(anonymousName)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load profile');
      setProfile(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    toastOpacity.setValue(1);
    setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 2000);
  };

  const handleConnect = async () => {
    if (!profile || connectLoading) return;

    // Already chatting — open chat
    if (profile.connect_status === 'chatting' && profile.chat_id) {
      closeSheet();
      setTimeout(() => {
        navigation?.navigate('Chat', {
          chatId: profile.chat_id,
          otherName: anonymousName,
        });
      }, 300);
      return;
    }

    if (profile.connect_status === 'pending') return;

    setConnectLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/connect/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ to_anonymous_name: anonymousName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send request');

      setProfile((p) => ({ ...p, connect_status: 'pending' }));
      showToast('Request sent');
    } catch (e) {
      showToast(e.message);
    } finally {
      setConnectLoading(false);
    }
  };

  const connectButtonLabel = () => {
    if (!profile) return 'Connect';
    if (connectLoading) return '...';
    switch (profile.connect_status) {
      case 'pending':
        return 'Pending...';
      case 'chatting':
        return 'Open Chat';
      default:
        return 'Connect';
    }
  };

  const connectButtonDisabled = () => {
    return profile?.connect_status === 'pending' || connectLoading;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={closeSheet}
        />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Drag handle */}
        <View style={styles.handleArea} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={THEME.primary} size="large" />
          </View>
        )}

        {error && !loading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadProfile}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {profile && !loading && (
          <View style={styles.content}>
            {/* Avatar */}
            <View
              style={[
                styles.avatarCircle,
                {
                  backgroundColor: profile.avatar_color + '22',
                  borderColor: profile.avatar_color + '55',
                },
              ]}
            >
              <Text style={styles.avatarEmoji}>
                {AVATAR_MAP[profile.avatar] || '👤'}
              </Text>
              {/* Aura glow */}
              <View
                style={[
                  styles.avatarGlow,
                  { backgroundColor: profile.avatar_color + '18' },
                ]}
              />
            </View>

            {/* Name */}
            <Text style={styles.name}>{profile.anonymous_name}</Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.confession_count}</Text>
                <Text style={styles.statLabel}>confessions</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.join_date}</Text>
                <Text style={styles.statLabel}>member since</Text>
              </View>
            </View>

            {/* Vibe tags */}
            {profile.vibe_tags?.length > 0 && (
              <View style={styles.vibesRow}>
                {profile.vibe_tags.map((tag) => (
                  <View key={tag} style={styles.vibeTag}>
                    <Text style={styles.vibeTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Connect button */}
            <TouchableOpacity
              style={[
                styles.connectBtn,
                connectButtonDisabled() && styles.connectBtnDisabled,
                profile.connect_status === 'chatting' &&
                  styles.connectBtnChatting,
              ]}
              onPress={handleConnect}
              disabled={connectButtonDisabled()}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.connectBtnText,
                  connectButtonDisabled() && styles.connectBtnTextDisabled,
                ]}
              >
                {connectButtonLabel()}
              </Text>
            </TouchableOpacity>

            {/* Subtle note */}
            <Text style={styles.privacyNote}>
              They won't know who you are until you both agree to reveal.
            </Text>
          </View>
        )}

        {/* Toast */}
        {toastMsg && (
          <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </Animated.View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 360,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
  },
  errorText: {
    color: THEME.textSecondary,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.primary,
  },
  retryText: {
    color: THEME.primary,
    fontSize: 13,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 14,
    position: 'relative',
  },
  avatarEmoji: {
    fontSize: 36,
  },
  avatarGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    top: -8,
    left: -8,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: THEME.text,
    letterSpacing: 0.3,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: THEME.surfaceAlt,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    gap: 24,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  statItem: {
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.text,
  },
  statLabel: {
    fontSize: 11,
    color: THEME.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: THEME.border,
  },
  vibesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  vibeTag: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: THEME.avatarBg,
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.25)',
  },
  vibeTagText: {
    color: THEME.primary,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  connectBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  connectBtnDisabled: {
    backgroundColor: THEME.avatarBg,
    shadowOpacity: 0,
    elevation: 0,
  },
  connectBtnChatting: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: THEME.primary,
  },
  connectBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  connectBtnTextDisabled: {
    color: THEME.textSecondary,
  },
  privacyNote: {
    color: THEME.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
    fontStyle: 'italic',
  },
  toast: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,99,74,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,99,74,0.3)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: {
    color: THEME.primary,
    fontSize: 13,
    fontWeight: '600',
  },
});
