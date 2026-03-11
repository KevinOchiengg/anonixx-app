/**
 * ShareCardScreen
 * Create a confession card, preview it beautifully, then share anywhere.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Share, Animated, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Clock, Flame, Share2, Users, Zap,
  Moon, Heart, Compass, Smile, Sparkles,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';

const { width } = Dimensions.get('window');

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
};

const CATEGORIES = [
  { id: 'love',       label: 'Love',       emoji: '💔', color: '#FF6B8A' },
  { id: 'fun',        label: 'Fun',        emoji: '😈', color: '#FFB347' },
  { id: 'adventure',  label: 'Adventure',  emoji: '🌍', color: '#47B8FF' },
  { id: 'friendship', label: 'Friendship', emoji: '🤝', color: '#47FFB8' },
  { id: 'spicy',      label: 'Spicy',      emoji: '🌶️', color: '#FF4747' },
];

const PROMPTS = [
  "I need someone to take me out tonight",
  "I need a husband",
  "I need a travel partner",
  "I need a gym partner who won't judge me",
  "I need someone to watch movies with",
  "I need a business partner with vision",
  "I need someone who texts back",
  "I need a 4th for our trip to Nairobi",
  "Two of us looking for an adventure",
];

const getCategoryColor = (id) =>
  CATEGORIES.find(c => c.id === id)?.color || THEME.primary;

const getCategoryEmoji = (id) =>
  CATEGORIES.find(c => c.id === id)?.emoji || '✨';

export default function ShareCardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [confession, setConfession] = useState('');
  const [category, setCategory] = useState('love');
  const [isGroup, setIsGroup] = useState(false);
  const [groupSize, setGroupSize] = useState(2);
  const [loading, setLoading] = useState(false);
  const [createdDrop, setCreatedDrop] = useState(null);

  const cardScale = useRef(new Animated.Value(1)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  const catColor = getCategoryColor(category);
  const catEmoji = getCategoryEmoji(category);
  const charCount = confession.length;
  const maxChars = 280;

  const animateCard = () => {
    Animated.sequence([
      Animated.timing(cardScale, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  const handlePrompt = (prompt) => {
    setConfession(prompt);
    animateCard();
  };

  const handleCreate = async () => {
    if (!confession.trim()) {
      Alert.alert('Say something', 'Your confession card needs a message.');
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          confession: confession.trim(),
          category,
          is_group: isGroup,
          group_size: isGroup ? groupSize : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedDrop(data);
        Animated.spring(successAnim, { toValue: 1, friction: 6, useNativeDriver: true }).start();
      } else {
        Alert.alert('Error', data.detail || 'Failed to create card');
      }
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!createdDrop) return;
    try {
      await Share.share({
        message: createdDrop.share_text,
        title: 'Anonixx Drop',
      });
    } catch (e) {}
  };

  const handleReset = () => {
    setCreatedDrop(null);
    setConfession('');
    successAnim.setValue(0);
  };

  // ── Success state ──────────────────────────────────────────
  if (createdDrop) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleReset} style={styles.backBtn}>
            <ArrowLeft size={22} color={THEME.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Card is Live 🔥</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.successContent} showsVerticalScrollIndicator={false}>
          {/* Live card preview */}
          <Animated.View style={[styles.liveCard, {
            borderColor: catColor,
            transform: [{ scale: cardScale }],
          }]}>
            {createdDrop.is_night_mode && (
              <View style={styles.nightBadge}>
                <Moon size={12} color="#fff" />
                <Text style={styles.nightBadgeText}>Night Drop</Text>
              </View>
            )}
            <View style={styles.cardCategoryRow}>
              <Text style={styles.cardEmoji}>{catEmoji}</Text>
              <Text style={[styles.cardCategory, { color: catColor }]}>
                {CATEGORIES.find(c => c.id === category)?.label}
              </Text>
              {isGroup && (
                <View style={[styles.groupBadge, { backgroundColor: `${catColor}22` }]}>
                  <Users size={12} color={catColor} />
                  <Text style={[styles.groupBadgeText, { color: catColor }]}>Group · {groupSize}</Text>
                </View>
              )}
            </View>

            <Text style={styles.cardConfession}>"{createdDrop.confession || confession}"</Text>

            <View style={styles.cardFooter}>
              <View style={styles.cardTimerRow}>
                <Clock size={13} color={THEME.textSecondary} />
                <Text style={styles.cardTimer}>{createdDrop.time_left}</Text>
              </View>
              <View style={[styles.unlockBadge, { backgroundColor: `${catColor}22`, borderColor: `${catColor}44` }]}>
                <Zap size={12} color={catColor} />
                <Text style={[styles.unlockText, { color: catColor }]}>
                  ${createdDrop.price} to connect
                </Text>
              </View>
            </View>

            <Text style={styles.cardBrand}>anonixx</Text>
          </Animated.View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>0</Text>
              <Text style={styles.statLabel}>unlocks</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>0</Text>
              <Text style={styles.statLabel}>reactions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>0</Text>
              <Text style={styles.statLabel}>admirers</Text>
            </View>
          </View>

          {/* Share instructions */}
          <View style={styles.instructionCard}>
            <Text style={styles.instructionTitle}>Share your card anywhere</Text>
            <View style={styles.platformList}>
              {['WhatsApp', 'Instagram', 'TikTok', 'Facebook', 'Twitter'].map(p => (
                <View key={p} style={styles.platformTag}>
                  <Text style={styles.platformText}>{p}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.instructionSub}>
              Anyone who taps your link lands on Anonixx. They pay ${createdDrop.price} to connect with you anonymously.
            </Text>
          </View>

          {/* Actions */}
          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: catColor }]} onPress={handleShare}>
            <Share2 size={20} color="#fff" />
            <Text style={styles.shareBtnText}>Share My Card</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.newCardBtn} onPress={handleReset}>
            <Text style={styles.newCardBtnText}>Create Another Card</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.inboxBtn}
            onPress={() => navigation.navigate('DropsInbox')}
          >
            <Text style={styles.inboxBtnText}>Go to Drops Inbox</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Create state ───────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create a Drop</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Live card preview */}
        <Animated.View style={[styles.liveCard, {
          borderColor: catColor,
          transform: [{ scale: cardScale }],
        }]}>
          <View style={styles.cardCategoryRow}>
            <Text style={styles.cardEmoji}>{catEmoji}</Text>
            <Text style={[styles.cardCategory, { color: catColor }]}>
              {CATEGORIES.find(c => c.id === category)?.label}
            </Text>
            {isGroup && (
              <View style={[styles.groupBadge, { backgroundColor: `${catColor}22` }]}>
                <Users size={12} color={catColor} />
                <Text style={[styles.groupBadgeText, { color: catColor }]}>Group · {groupSize}</Text>
              </View>
            )}
          </View>

          <Text style={[styles.cardConfession, !confession && styles.cardPlaceholder]}>
            "{confession || 'your confession appears here...'}"
          </Text>

          <View style={styles.cardFooter}>
            <View style={styles.cardTimerRow}>
              <Clock size={13} color={THEME.textSecondary} />
              <Text style={styles.cardTimer}>24h · expires</Text>
            </View>
            <View style={[styles.unlockBadge, { backgroundColor: `${catColor}22`, borderColor: `${catColor}44` }]}>
              <Zap size={12} color={catColor} />
              <Text style={[styles.unlockText, { color: catColor }]}>
                ${isGroup ? '3' : '2'} to connect
              </Text>
            </View>
          </View>
          <Text style={styles.cardBrand}>anonixx</Text>
        </Animated.View>

        {/* Category picker */}
        <Text style={styles.label}>Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContent}
        >
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryChip,
                category === cat.id && { backgroundColor: `${cat.color}22`, borderColor: cat.color },
              ]}
              onPress={() => { setCategory(cat.id); animateCard(); }}
            >
              <Text style={styles.categoryChipEmoji}>{cat.emoji}</Text>
              <Text style={[
                styles.categoryChipText,
                category === cat.id && { color: cat.color },
              ]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Confession input */}
        <Text style={styles.label}>Your confession</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={confession}
            onChangeText={(t) => { setConfession(t); animateCard(); }}
            placeholder="I need someone to..."
            placeholderTextColor={THEME.textSecondary}
            multiline
            maxLength={maxChars}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, charCount > maxChars * 0.85 && { color: THEME.primary }]}>
            {charCount}/{maxChars}
          </Text>
        </View>

        {/* Prompts */}
        <Text style={styles.label}>Need inspiration?</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.promptScroll}
          contentContainerStyle={styles.promptContent}
        >
          {PROMPTS.map((p, i) => (
            <TouchableOpacity
              key={i}
              style={styles.promptChip}
              onPress={() => handlePrompt(p)}
            >
              <Text style={styles.promptText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Group toggle */}
        <View style={styles.groupRow}>
          <View style={styles.groupLeft}>
            <Users size={18} color={isGroup ? catColor : THEME.textSecondary} />
            <View>
              <Text style={[styles.groupTitle, isGroup && { color: catColor }]}>Group Drop</Text>
              <Text style={styles.groupSub}>Looking for multiple people? ($3 unlock)</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.toggle, isGroup && { backgroundColor: catColor }]}
            onPress={() => setIsGroup(v => !v)}
          >
            <View style={[styles.toggleThumb, isGroup && styles.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        {isGroup && (
          <View style={styles.groupSizeRow}>
            <Text style={styles.groupSizeLabel}>Group size:</Text>
            {[2, 3, 4, 5, 6].map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.sizeChip, groupSize === n && { backgroundColor: catColor }]}
                onPress={() => setGroupSize(n)}
              >
                <Text style={[styles.sizeChipText, groupSize === n && { color: '#fff' }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Night mode info */}
        <View style={styles.nightInfo}>
          <Moon size={14} color='#9B8BFF' />
          <Text style={styles.nightInfoText}>
            Cards created between 10pm–3am get a special Night Drop badge 🌙
          </Text>
        </View>

        {/* Create button */}
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: catColor }, (!confession.trim() || loading) && { opacity: 0.5 }]}
          onPress={handleCreate}
          disabled={!confession.trim() || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Flame size={20} color="#fff" />
                <Text style={styles.createBtnText}>Drop It</Text>
              </>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: THEME.surface,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: THEME.text },

  content: { padding: 20 },
  successContent: { padding: 20 },

  // Live card preview
  liveCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20, padding: 24,
    borderWidth: 1.5,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  cardCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardEmoji: { fontSize: 20 },
  cardCategory: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  groupBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  groupBadgeText: { fontSize: 11, fontWeight: '600' },
  cardConfession: {
    fontSize: 18, lineHeight: 28, color: THEME.text,
    fontStyle: 'italic', marginBottom: 18, letterSpacing: 0.2,
  },
  cardPlaceholder: { color: THEME.textSecondary },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardTimer: { fontSize: 12, color: THEME.textSecondary },
  unlockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  unlockText: { fontSize: 12, fontWeight: '700' },
  cardBrand: {
    fontSize: 11, color: THEME.textSecondary, opacity: 0.5,
    textAlign: 'right', marginTop: 14, letterSpacing: 2,
    textTransform: 'uppercase',
  },
  nightBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(155,139,255,0.15)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 12,
  },
  nightBadgeText: { fontSize: 11, color: '#9B8BFF', fontWeight: '600' },

  label: { fontSize: 13, fontWeight: '600', color: THEME.textSecondary, marginBottom: 10, letterSpacing: 0.5 },

  // Category
  categoryScroll: { marginBottom: 24 },
  categoryContent: { gap: 8, paddingRight: 16 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14,
    backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border,
  },
  categoryChipEmoji: { fontSize: 16 },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: THEME.textSecondary },

  // Input
  inputWrapper: {
    backgroundColor: THEME.surface, borderRadius: 16,
    borderWidth: 1, borderColor: THEME.border,
    padding: 16, marginBottom: 24, minHeight: 100,
  },
  input: { fontSize: 16, color: THEME.text, lineHeight: 24, minHeight: 80 },
  charCount: { fontSize: 12, color: THEME.textSecondary, textAlign: 'right', marginTop: 8 },

  // Prompts
  promptScroll: { marginBottom: 24 },
  promptContent: { gap: 8, paddingRight: 16 },
  promptChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    backgroundColor: THEME.surfaceAlt, borderWidth: 1, borderColor: THEME.border,
    maxWidth: 220,
  },
  promptText: { fontSize: 13, color: THEME.textSecondary, lineHeight: 18 },

  // Group
  groupRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: THEME.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: THEME.border, marginBottom: 12,
  },
  groupLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  groupTitle: { fontSize: 15, fontWeight: '600', color: THEME.text },
  groupSub: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  toggle: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: THEME.border, justifyContent: 'center', padding: 3,
  },
  toggleThumb: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: THEME.textSecondary,
  },
  toggleThumbOn: { alignSelf: 'flex-end', backgroundColor: '#fff' },
  groupSizeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 20, paddingLeft: 4,
  },
  groupSizeLabel: { fontSize: 13, color: THEME.textSecondary, marginRight: 4 },
  sizeChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border,
    alignItems: 'center', justifyContent: 'center',
  },
  sizeChipText: { fontSize: 14, fontWeight: '600', color: THEME.textSecondary },

  // Night info
  nightInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(155,139,255,0.08)', borderRadius: 12,
    padding: 12, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(155,139,255,0.15)',
  },
  nightInfoText: { fontSize: 13, color: 'rgba(155,139,255,0.9)', flex: 1, lineHeight: 18 },

  // Create button
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 17, borderRadius: 18,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
  },
  createBtnText: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  // Success
  statsRow: {
    flexDirection: 'row', backgroundColor: THEME.surface,
    borderRadius: 16, padding: 20, marginBottom: 20,
    borderWidth: 1, borderColor: THEME.border,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: THEME.text },
  statLabel: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: THEME.border },

  instructionCard: {
    backgroundColor: THEME.surface, borderRadius: 16, padding: 18,
    marginBottom: 20, borderWidth: 1, borderColor: THEME.border,
  },
  instructionTitle: { fontSize: 15, fontWeight: '700', color: THEME.text, marginBottom: 12 },
  platformList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  platformTag: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
    backgroundColor: THEME.surfaceAlt, borderWidth: 1, borderColor: THEME.border,
  },
  platformText: { fontSize: 12, fontWeight: '600', color: THEME.textSecondary },
  instructionSub: { fontSize: 13, color: THEME.textSecondary, lineHeight: 20 },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 17, borderRadius: 18, marginBottom: 12,
  },
  shareBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  newCardBtn: {
    paddingVertical: 15, borderRadius: 18, alignItems: 'center',
    backgroundColor: THEME.surface, borderWidth: 1, borderColor: THEME.border, marginBottom: 10,
  },
  newCardBtnText: { fontSize: 15, fontWeight: '600', color: THEME.text },
  inboxBtn: {
    paddingVertical: 15, borderRadius: 18, alignItems: 'center', marginBottom: 8,
  },
  inboxBtnText: { fontSize: 14, color: THEME.textSecondary, fontWeight: '500' },
});
