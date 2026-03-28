/**
 * VibeScoreScreen
 * Your vibe score, tier, admirer count, confession streak, and event breakdown.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Eye, Flame, Heart, Star, Zap,
  TrendingUp, Award, Calendar,
} from 'lucide-react-native';
import { API_BASE_URL } from '../../config/api';

const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  surfaceAlt: '#1a1f2e',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
  border: 'rgba(255,255,255,0.06)',
};

const TIERS = [
  { name: 'Fresh',      emoji: '🌱', color: '#47FFB8', min: 0,   max: 49  },
  { name: 'Awakening',  emoji: '✨', color: '#FFD700', min: 50,  max: 99  },
  { name: 'Rising',     emoji: '🌙', color: '#9B8BFF', min: 100, max: 199 },
  { name: 'Electric',   emoji: '⚡', color: '#47B8FF', min: 200, max: 499 },
  { name: 'Legendary',  emoji: '🔥', color: '#FF634A', min: 500, max: 999 },
];

const getTier = (score) =>
  TIERS.slice().reverse().find(t => score >= t.min) || TIERS[0];

const getProgress = (score) => {
  const tier = getTier(score);
  const nextTier = TIERS[TIERS.indexOf(tier) + 1];
  if (!nextTier) return 1;
  return (score - tier.min) / (nextTier.min - tier.min);
};

const EVENT_LABELS = {
  card_created:       { label: 'Cards created',     icon: Flame,     pts: '+2 pts each' },
  card_unlocked:      { label: 'Cards unlocked',    icon: Zap,       pts: '+5 pts each' },
  reaction_received:  { label: 'Reactions received',icon: Heart,     pts: '+1 pt each'  },
  reveal_completed:   { label: 'Reveals completed', icon: Eye,       pts: '+3 pts each' },
  streak_day:         { label: 'Streak days',        icon: Calendar,  pts: '+2 pts each' },
};

export default function VibeScoreScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const scoreAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/vibe-score`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        const tier = getTier(json.score);
        const progress = getProgress(json.score);

        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(progressAnim, { toValue: progress, duration: 1000, delay: 300, useNativeDriver: false }),
        ]).start();
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={THEME.primary} size="large" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={22} color={THEME.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Vibe Score</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <Star size={40} color={THEME.textSecondary} strokeWidth={1.5} />
          <Text style={styles.errorTitle}>No score yet</Text>
          <Text style={styles.errorSub}>Start creating drops to build your vibe score.</Text>
          <TouchableOpacity
            style={styles.createDropBtn}
            onPress={() => navigation.navigate('ShareCard')}
          >
            <Flame size={18} color="#fff" />
            <Text style={styles.createDropBtnText}>Create your first Drop</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const tier = getTier(data.score);
  const nextTier = TIERS[TIERS.indexOf(tier) + 1];
  const ptsToNext = nextTier ? nextTier.min - data.score : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vibe Score</Text>
        <View style={{ width: 40 }} />
      </View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Tier hero */}
        <View style={[styles.heroCard, { borderColor: `${tier.color}40` }]}>
          <Text style={styles.tierEmoji}>{tier.emoji}</Text>
          <Text style={[styles.tierName, { color: tier.color }]}>{tier.name}</Text>
          <Text style={[styles.score, { color: tier.color }]}>{data.score}</Text>
          <Text style={styles.scoreLabel}>vibe points</Text>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View style={[
              styles.progressFill,
              {
                backgroundColor: tier.color,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              }
            ]} />
          </View>

          {nextTier ? (
            <Text style={styles.progressLabel}>
              {ptsToNext} pts to{' '}
              <Text style={{ color: nextTier.color }}>
                {nextTier.emoji} {nextTier.name}
              </Text>
            </Text>
          ) : (
            <Text style={[styles.progressLabel, { color: tier.color }]}>
              Maximum tier reached 🏆
            </Text>
          )}
        </View>

        {/* Tier roadmap */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tier Journey</Text>
          <View style={styles.tierRoadmap}>
            {TIERS.map((t, i) => {
              const reached = data.score >= t.min;
              const isCurrent = t.name === tier.name;
              return (
                <View key={t.name} style={styles.tierStep}>
                  <View style={[
                    styles.tierDot,
                    { backgroundColor: reached ? t.color : THEME.surfaceAlt },
                    isCurrent && { width: 16, height: 16, borderRadius: 8 },
                  ]} />
                  {i < TIERS.length - 1 && (
                    <View style={[styles.tierLine, reached && TIERS[i + 1] && data.score >= TIERS[i + 1].min && { backgroundColor: TIERS[i + 1].color }]} />
                  )}
                  <Text style={[styles.tierStepEmoji]}>{t.emoji}</Text>
                  <Text style={[styles.tierStepName, isCurrent && { color: t.color, fontWeight: '700' }]}>
                    {t.name}
                  </Text>
                  <Text style={styles.tierStepMin}>{t.min}+</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderColor: 'rgba(255,107,138,0.3)' }]}>
            <Eye size={22} color="#FF6B8A" />
            <Text style={[styles.statBig, { color: '#FF6B8A' }]}>{data.admirer_count}</Text>
            <Text style={styles.statCardLabel}>Admirers</Text>
            <Text style={styles.statCardSub}>viewed your drops</Text>
          </View>
          <View style={[styles.statCard, { borderColor: 'rgba(255,183,71,0.3)' }]}>
            <Flame size={22} color="#FFB347" />
            <Text style={[styles.statBig, { color: '#FFB347' }]}>{data.confession_streak}</Text>
            <Text style={styles.statCardLabel}>Day Streak</Text>
            <Text style={styles.statCardSub}>longest: {data.longest_streak}</Text>
          </View>
        </View>

        {/* Event breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How you earned it</Text>
          <View style={styles.eventList}>
            {Object.entries(EVENT_LABELS).map(([key, meta]) => {
              const count = data.events?.[key] || 0;
              const IconComp = meta.icon;
              if (count === 0) return null;
              return (
                <View key={key} style={styles.eventRow}>
                  <View style={styles.eventLeft}>
                    <IconComp size={18} color={THEME.primary} />
                    <View>
                      <Text style={styles.eventLabel}>{meta.label}</Text>
                      <Text style={styles.eventPts}>{meta.pts}</Text>
                    </View>
                  </View>
                  <Text style={styles.eventCount}>{count}×</Text>
                </View>
              );
            })}
            {Object.values(data.events || {}).every(v => v === 0) && (
              <Text style={styles.noEvents}>Start creating drops to earn points!</Text>
            )}
          </View>
        </View>

        {/* How to earn */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How to earn points</Text>
          <View style={styles.earnList}>
            {Object.entries(EVENT_LABELS).map(([key, meta]) => {
              const IconComp = meta.icon;
              return (
                <View key={key} style={styles.earnRow}>
                  <IconComp size={16} color={THEME.textSecondary} />
                  <Text style={styles.earnLabel}>{meta.label}</Text>
                  <Text style={[styles.earnPts, { color: THEME.primary }]}>{meta.pts}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={styles.createDropBtn}
          onPress={() => navigation.navigate('ShareCard')}
        >
          <Flame size={18} color="#fff" />
          <Text style={styles.createDropBtnText}>Create a Drop to earn points</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  errorTitle: { fontSize: 17, fontWeight: '700', color: THEME.text, marginTop: 8 },
  errorSub: { fontSize: 14, color: THEME.textSecondary, textAlign: 'center', lineHeight: 21 },
  content: { padding: 20, gap: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.surface,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: THEME.text },

  // Hero
  heroCard: {
    backgroundColor: THEME.surface, borderRadius: 24, padding: 28,
    alignItems: 'center', borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  tierEmoji: { fontSize: 52, marginBottom: 8 },
  tierName: { fontSize: 15, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  score: { fontSize: 64, fontWeight: '900', lineHeight: 72 },
  scoreLabel: { fontSize: 14, color: THEME.textSecondary, marginBottom: 24 },
  progressTrack: {
    width: '100%', height: 6, backgroundColor: THEME.surfaceAlt,
    borderRadius: 3, marginBottom: 10, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 13, color: THEME.textSecondary },

  // Tier roadmap
  tierRoadmap: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  tierStep: { alignItems: 'center', flex: 1, position: 'relative' },
  tierDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 8 },
  tierLine: {
    position: 'absolute', top: 6, left: '50%', right: '-50%',
    height: 2, backgroundColor: THEME.border,
  },
  tierStepEmoji: { fontSize: 18, marginBottom: 4 },
  tierStepName: { fontSize: 10, color: THEME.textSecondary, textAlign: 'center' },
  tierStepMin: { fontSize: 10, color: THEME.textSecondary, opacity: 0.5, marginTop: 2 },

  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: THEME.surface, borderRadius: 18, padding: 18,
    alignItems: 'center', gap: 6, borderWidth: 1,
  },
  statBig: { fontSize: 32, fontWeight: '900' },
  statCardLabel: { fontSize: 14, fontWeight: '700', color: THEME.text },
  statCardSub: { fontSize: 11, color: THEME.textSecondary, textAlign: 'center' },

  // Section
  section: { gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: THEME.text },

  // Event breakdown
  eventList: {
    backgroundColor: THEME.surface, borderRadius: 18,
    borderWidth: 1, borderColor: THEME.border, overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  eventLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventLabel: { fontSize: 14, fontWeight: '600', color: THEME.text },
  eventPts: { fontSize: 12, color: THEME.textSecondary, marginTop: 2 },
  eventCount: { fontSize: 16, fontWeight: '800', color: THEME.primary },
  noEvents: { fontSize: 14, color: THEME.textSecondary, padding: 20, textAlign: 'center' },

  // Earn list
  earnList: {
    backgroundColor: THEME.surface, borderRadius: 18,
    borderWidth: 1, borderColor: THEME.border, overflow: 'hidden',
  },
  earnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  earnLabel: { flex: 1, fontSize: 13, color: THEME.textSecondary },
  earnPts: { fontSize: 13, fontWeight: '700' },

  createDropBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: THEME.primary, borderRadius: 18, paddingVertical: 16,
  },
  createDropBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
