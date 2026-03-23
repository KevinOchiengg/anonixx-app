/**
 * ReferralScreen.jsx
 * Invite friends, earn 30 coins per referral.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  Animated,
  FlatList,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import {
  ArrowLeft,
  Check,
  Coins,
  Copy,
  Gift,
  Share2,
  Users,
  Zap,
} from 'lucide-react-native';
import { useDispatch, useSelector } from 'react-redux';

import { fetchReferralCode, fetchReferralStats } from '../../store/slices/coinsSlice';
import { useToast } from '../../components/ui/Toast';
import { HIT_SLOP, BUTTON_HEIGHT, rf, rp, rs, SCREEN } from '../../utils/responsive';

// ─── Static perks list ────────────────────────────────────────
const PERKS = [
  { id: '1', icon: Coins, color: '#fbbf24', title: '+30 coins per friend',    sub: 'Credited the moment they complete onboarding.' },
  { id: '2', icon: Gift,  color: '#a855f7', title: 'Your friend gets +10',    sub: 'They start with an extra coins boost — on you.' },
  { id: '3', icon: Zap,   color: '#FF634A', title: 'Up to 20 refs/month',      sub: 'That\'s 600 free coins. Every single month.' },
  { id: '4', icon: Users, color: '#22c55e', title: 'Bring your circle',       sub: 'The people you trust deserve a safe space too.' },
];

const THEME = {
  bg:         '#0b0f18',
  surface:    '#151924',
  surfaceAlt: '#1a1f2e',
  border:     'rgba(255,255,255,0.07)',
  text:       '#EAEAF0',
  textSub:    '#9A9AA3',
  gold:       '#fbbf24',
  goldBg:     'rgba(251,191,36,0.08)',
  goldBorder: 'rgba(251,191,36,0.2)',
  primary:    '#FF634A',
  purple:     '#a855f7',
};

// ─── Perk card ────────────────────────────────────────────────
const PerkCard = React.memo(({ item, index }) => {
  const slideX  = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideX,  {
        toValue: 0, useNativeDriver: true,
        tension: 60, friction: 10,
        delay: index * 80,
      }),
      Animated.timing(opacity, {
        toValue: 1, duration: 300, useNativeDriver: true,
        delay: index * 80,
      }),
    ]).start();
  }, []);

  const Icon = item.icon;
  return (
    <Animated.View style={[pStyles.card, { transform: [{ translateX: slideX }], opacity }]}>
      <View style={[pStyles.iconWrap, { backgroundColor: item.color + '22' }]}>
        <Icon size={rs(20)} color={item.color} />
      </View>
      <View style={pStyles.textWrap}>
        <Text style={pStyles.title}>{item.title}</Text>
        <Text style={pStyles.sub}>{item.sub}</Text>
      </View>
    </Animated.View>
  );
});

const pStyles = StyleSheet.create({
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    gap:             rs(14),
  },
  iconWrap: {
    width:          rs(42),
    height:         rs(42),
    borderRadius:   rs(13),
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  textWrap: { flex: 1 },
  title:    { color: THEME.text,    fontSize: rf(14), fontWeight: '700' },
  sub:      { color: THEME.textSub, fontSize: rf(12), marginTop: rp(2), lineHeight: rf(18) },
});

// ─── Screen ───────────────────────────────────────────────────
export default function ReferralScreen({ navigation }) {
  const dispatch      = useDispatch();
  const { showToast } = useToast();

  const {
    referralCode,
    shareLink,
    totalReferred,
    referralCoinsEarned,
    loading,
  } = useSelector((state) => state.coins);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const copiedAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    dispatch(fetchReferralCode());
    dispatch(fetchReferralStats());
    Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  // ─── Copy ────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!referralCode) return;
    try {
      await Clipboard.setStringAsync(shareLink ?? referralCode);
      showToast({ type: 'success', title: 'Link copied!', message: 'Share it and watch the coins roll in.' });
      Animated.sequence([
        Animated.timing(copiedAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(1200),
        Animated.timing(copiedAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } catch {
      showToast({ type: 'error', message: 'Could not copy link.' });
    }
  }, [referralCode, shareLink, showToast, copiedAnim]);

  // ─── Share ───────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!shareLink) return;
    try {
      await Share.share({
        message: `Join me on Anonixx — the space where you can be real, stay anonymous, and actually feel heard.\n\nUse my link: ${shareLink}`,
        url:     shareLink,
        title:   'Join Anonixx',
      });
    } catch {
      showToast({ type: 'error', message: 'Could not open share sheet.' });
    }
  }, [shareLink, showToast]);

  const copyIconColor = copiedAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.textSub, '#22c55e'],
  });

  const statsData = useMemo(() => [
    { id: 'refs',   label: 'Friends referred', value: totalReferred,       color: THEME.purple },
    { id: 'coins',  label: 'Coins earned',      value: referralCoinsEarned, color: THEME.gold },
  ], [totalReferred, referralCoinsEarned]);

  const headerOpacity    = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const headerTranslateY = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] });

  // FlatList section data
  const sections = useMemo(() => [
    { type: 'header'  },
    { type: 'code'    },
    { type: 'stats'   },
    { type: 'perks_header' },
    ...PERKS.map((p, i) => ({ type: 'perk', perk: p, index: i })),
  ], []);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'header') {
      return (
        <Animated.View style={[sStyles.heroWrap, { opacity: headerOpacity, transform: [{ translateY: headerTranslateY }] }]}>
          <Text style={sStyles.heroEmoji}>🔗</Text>
          <Text style={sStyles.heroTitle}>Give a little,{'\n'}earn a lot.</Text>
          <Text style={sStyles.heroSub}>
            Every friend you bring in earns you <Text style={sStyles.heroHighlight}>30 coins</Text>.
            They get 10 as a welcome boost. That's two people winning.
          </Text>
        </Animated.View>
      );
    }

    if (item.type === 'code') {
      return (
        <View style={sStyles.codeSection}>
          <Text style={sStyles.codeLabel}>YOUR REFERRAL LINK</Text>
          <View style={sStyles.codeCard}>
            <LinearGradient
              colors={['#1a1530', '#12101e']}
              style={sStyles.codeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={sStyles.codeText} selectable>
                {loading && !referralCode ? 'Generating…' : (referralCode ?? '—')}
              </Text>

              <TouchableOpacity
                onPress={handleCopy}
                hitSlop={HIT_SLOP}
                activeOpacity={0.7}
                style={sStyles.copyBtn}
              >
                <Animated.View>
                  {copiedAnim.__getValue() > 0.5 ? (
                    <Check size={rs(18)} color="#22c55e" />
                  ) : (
                    <Copy size={rs(18)} color={THEME.textSub} />
                  )}
                </Animated.View>
              </TouchableOpacity>
            </LinearGradient>
          </View>

          <TouchableOpacity
            onPress={handleShare}
            activeOpacity={0.88}
            hitSlop={HIT_SLOP}
            style={sStyles.shareBtn}
          >
            <LinearGradient
              colors={[THEME.primary, '#e8432a']}
              style={sStyles.shareBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Share2 size={rs(17)} color="#fff" />
              <Text style={sStyles.shareBtnText}>Share your link</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.type === 'stats') {
      return (
        <View style={sStyles.statsRow}>
          {statsData.map((s) => (
            <View key={s.id} style={sStyles.statCard}>
              <Text style={[sStyles.statValue, { color: s.color }]}>
                {s.value.toLocaleString()}
              </Text>
              <Text style={sStyles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      );
    }

    if (item.type === 'perks_header') {
      return (
        <View style={sStyles.perksHeader}>
          <Text style={sStyles.perksTitle}>How it works</Text>
        </View>
      );
    }

    if (item.type === 'perk') {
      return (
        <View style={sStyles.perkWrap}>
          <PerkCard item={item.perk} index={item.index} />
        </View>
      );
    }

    return null;
  }, [
    headerOpacity, headerTranslateY, referralCode, loading,
    handleCopy, handleShare, statsData, copiedAnim,
  ]);

  const keyExtractor = useCallback((item) => item.type + (item.perk?.id ?? ''), []);

  return (
    <SafeAreaView style={sStyles.container} edges={['top', 'bottom']}>
      {/* Navbar */}
      <View style={sStyles.navbar}>
        {navigation?.canGoBack?.() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={HIT_SLOP}
            style={sStyles.backBtn}
            activeOpacity={0.7}
          >
            <ArrowLeft size={rs(20)} color={THEME.text} />
          </TouchableOpacity>
        ) : <View style={sStyles.backBtn} />}
        <Text style={sStyles.navTitle}>Refer & Earn</Text>
        <View style={sStyles.backBtn} />
      </View>

      <FlatList
        data={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={sStyles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </SafeAreaView>
  );
}

const sStyles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: THEME.bg },
  navbar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: rp(16),
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  navTitle: {
    color:      THEME.text,
    fontSize:   rf(17),
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  backBtn: {
    width:  rs(36),
    height: rs(36),
    alignItems:     'center',
    justifyContent: 'center',
  },
  listContent: { paddingBottom: rp(40) },

  // Hero
  heroWrap: {
    paddingHorizontal: rp(24),
    paddingTop:        rp(28),
    paddingBottom:     rp(20),
    alignItems:        'center',
  },
  heroEmoji: { fontSize: rf(44), marginBottom: rp(12) },
  heroTitle: {
    color:      THEME.text,
    fontSize:   rf(28),
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign:  'center',
    lineHeight: rf(36),
    marginBottom: rp(12),
  },
  heroSub: {
    color:     THEME.textSub,
    fontSize:  rf(14),
    textAlign: 'center',
    lineHeight: rf(22),
  },
  heroHighlight: {
    color:      THEME.gold,
    fontWeight: '700',
  },

  // Code
  codeSection:       { paddingHorizontal: rp(20), paddingBottom: rp(20) },
  codeLabel: {
    color:         THEME.textSub,
    fontSize:      rf(11),
    fontWeight:    '700',
    letterSpacing: 1.2,
    marginBottom:  rp(10),
  },
  codeCard: {
    borderRadius:  rs(14),
    overflow:      'hidden',
    borderWidth:   1,
    borderColor:   THEME.goldBorder,
    marginBottom:  rp(14),
  },
  codeGradient: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: rp(18),
    paddingVertical:   rp(16),
  },
  codeText: {
    flex:       1,
    color:      THEME.gold,
    fontSize:   rf(18),
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily:    Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyBtn: {
    width:          rs(36),
    height:         rs(36),
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   rs(10),
    backgroundColor: THEME.surfaceAlt,
  },
  shareBtn:     {},
  shareBtnGrad: {
    height:         BUTTON_HEIGHT,
    borderRadius:   rs(14),
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rs(8),
  },
  shareBtnText: {
    color:      '#fff',
    fontSize:   rf(15),
    fontWeight: '700',
  },

  // Stats
  statsRow: {
    flexDirection:   'row',
    marginHorizontal: rp(20),
    gap:              rs(12),
    marginBottom:     rp(24),
  },
  statCard: {
    flex:            1,
    backgroundColor: THEME.surface,
    borderRadius:    rs(14),
    borderWidth:     1,
    borderColor:     THEME.border,
    alignItems:      'center',
    paddingVertical: rp(18),
  },
  statValue: {
    fontSize:   rf(28),
    fontWeight: '900',
    marginBottom: rp(4),
  },
  statLabel: {
    color:    THEME.textSub,
    fontSize: rf(12),
  },

  // Perks
  perksHeader: {
    paddingHorizontal: rp(20),
    paddingBottom:     rp(8),
  },
  perksTitle: {
    color:      THEME.text,
    fontSize:   rf(16),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  perkWrap: { paddingHorizontal: rp(20) },
});
