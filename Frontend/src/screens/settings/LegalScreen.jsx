/**
 * LegalScreen — Terms of Service, Privacy Policy, Community Guidelines.
 * Navigate here with: navigation.navigate('Legal', { type: 'terms' | 'privacy' | 'guidelines' })
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import T from '../../utils/theme';

// ─── Document content (module-level, Rule 5) ──────────────────
const TERMS = {
  title: 'Terms of Service',
  updated: 'Last updated: April 2026',
  sections: [
    {
      heading: '1. Who We Are',
      body: 'Anonixx is an anonymous mental health support platform. We exist so you can say the unsayable — without your name attached. By using Anonixx, you agree to these terms.',
    },
    {
      heading: '2. Your Anonymous Identity',
      body: 'You are identified only by your anonymous name. We never publicly link your confession or activity to your real identity. However, you must not use anonymity to harm others.',
    },
    {
      heading: '3. What You Can Post',
      body: 'You may share personal struggles, feelings, stories, and support for others. All content must be genuine — no spam, no impersonation, no harassment.',
    },
    {
      heading: '4. What You Cannot Post',
      body: 'You may not post content that: threatens or targets individuals, promotes self-harm as a goal, contains hate speech based on identity, includes graphic violence without context, or violates any law in your jurisdiction.',
    },
    {
      heading: '5. Coins & Purchases',
      body: 'Coins are virtual currency used within Anonixx. They have no cash value and are non-refundable once spent. All purchases are final.',
    },
    {
      heading: '6. Content Ownership',
      body: 'You own what you post. By posting on Anonixx, you grant us a license to display your content within the app. We will never sell your confessions to third parties.',
    },
    {
      heading: '7. Enforcement',
      body: 'We reserve the right to remove content or suspend accounts that violate these terms. Decisions are made by our moderation team with context and care.',
    },
    {
      heading: '8. Crisis Disclaimer',
      body: 'Anonixx is a community platform, not a substitute for professional mental health care. If you are in crisis, please contact emergency services or a licensed professional immediately.',
    },
    {
      heading: '9. Changes',
      body: 'We may update these terms. Continued use of Anonixx after changes means you accept the new terms. Major changes will be notified in-app.',
    },
  ],
};

const PRIVACY = {
  title: 'Privacy Policy',
  updated: 'Last updated: April 2026',
  sections: [
    {
      heading: '1. What We Collect',
      body: 'We collect: your email (for account recovery), an anonymous name (chosen by you), device information (for push notifications), and content you post. We do not collect your real name or government ID.',
    },
    {
      heading: '2. How We Use It',
      body: 'Your data is used solely to operate Anonixx — to show your posts, enable chat, process payments, and send relevant notifications. We do not sell your data to advertisers.',
    },
    {
      heading: '3. Anonymity Architecture',
      body: 'Posts are linked to your anonymous identity, not your real identity. Your email is stored separately and is never displayed publicly or included in any post metadata.',
    },
    {
      heading: '4. Screenshot Detection',
      body: 'When enabled, the screenshot detection feature records that a screenshot event occurred on your content. No personal information about the taker is collected or revealed.',
    },
    {
      heading: '5. Coins & Payments',
      body: 'Payment processing is handled by Stripe, M-Pesa, or PayPal. We receive confirmation of payment but do not store full card or mobile money details on our servers.',
    },
    {
      heading: '6. Third-Party Services',
      body: 'We use Cloudinary for media storage, Agora for audio rooms, and Expo for push notifications. Each operates under their own privacy policies.',
    },
    {
      heading: '7. Data Retention',
      body: 'Your account data is retained while your account is active. Deleted posts are removed from our servers within 30 days. You may request full data deletion through the account deletion option in settings.',
    },
    {
      heading: '8. Your Rights',
      body: 'You have the right to access, correct, or delete your data. To exercise these rights, use the account deletion option in settings or contact support.',
    },
    {
      heading: '9. Contact',
      body: 'For privacy concerns, email privacy@anonixx.app. We respond within 72 hours.',
    },
  ],
};

const GUIDELINES = {
  title: 'Community Guidelines',
  updated: 'Last updated: April 2026',
  sections: [
    {
      heading: 'Feel First. See Later.',
      body: 'Anonixx exists for the weight you carry alone — the thing you can\'t say out loud, the feeling with no name. This is that place. Treat it accordingly.',
    },
    {
      heading: 'Confess, Don\'t Attack',
      body: 'A confession is about your truth. Directing pain at a specific person — even anonymously — crosses from expression into harm. Keep it about what you feel, not who wronged you.',
    },
    {
      heading: 'Hold Space for Others',
      body: 'When someone is vulnerable, respond with presence, not judgment. Comments that mock, minimize, or dismiss someone\'s pain will be removed.',
    },
    {
      heading: 'Safe Expressions of Darkness',
      body: 'You can talk about dark feelings — depression, suicidal ideation, rage, shame. What you cannot do is use the platform to plan harm or encourage others toward it.',
    },
    {
      heading: 'The Drops Marketplace',
      body: 'Revealing someone\'s identity in Drops uses real coins. Do not use that context to harm, expose, or target the person outside Anonixx.',
    },
    {
      heading: 'Circles: Audio Rooms',
      body: 'In live audio sessions, speak as you would in a group therapy setting — honestly, but without using air time to center or attack specific people.',
    },
    {
      heading: 'Spam and Inauthenticity',
      body: 'Fake confessions, bot activity, repetitive content designed to game the algorithm — none of it belongs here. Anonixx works because the confessions are real.',
    },
    {
      heading: 'Moderation',
      body: 'Our moderation team reviews flagged content with care. If you believe a decision was wrong, you can appeal through the report system.',
    },
    {
      heading: 'One Rule Above All',
      body: 'If you wouldn\'t want it done to you in your worst moment — don\'t do it here.',
    },
  ],
};

const CONTENT_MAP = { terms: TERMS, privacy: PRIVACY, guidelines: GUIDELINES };

// ─── Section row (Rule 6) ─────────────────────────────────────
const Section = React.memo(({ heading, body }) => (
  <View style={st.section}>
    <Text style={st.heading}>{heading}</Text>
    <Text style={st.body}>{body}</Text>
  </View>
));

// ─── Screen ───────────────────────────────────────────────────
export default function LegalScreen({ route, navigation }) {
  const { type = 'terms' } = route.params ?? {};
  const insets = useSafeAreaInsets();
  const doc    = CONTENT_MAP[type] ?? TERMS;

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rh(18))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay: 60, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={[st.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} hitSlop={HIT_SLOP}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{doc.title}</Text>
        <View style={st.backBtn} />
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.content, { paddingBottom: insets.bottom + rh(40) }]}
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
      >
        <Text style={st.updated}>{doc.updated}</Text>

        {doc.sections.map((s, i) => (
          <Section key={i} heading={s.heading} body={s.body} />
        ))}

        <View style={st.footer}>
          <Text style={st.footerText}>anonixx · your truth, no name required.</Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  backBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    rs(18),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text },
  content:     { paddingTop: SPACING.lg, paddingHorizontal: SPACING.md },
  updated: {
    fontSize:     rs(11),
    color:        T.textMuted,
    fontStyle:    'italic',
    marginBottom: SPACING.lg,
    textAlign:    'center',
  },
  section:  { marginBottom: SPACING.lg },
  heading:  {
    fontSize:     FONT.sm,
    fontWeight:   '800',
    color:        T.primary,
    marginBottom: rp(8),
    letterSpacing: 0.2,
  },
  body: {
    fontSize:     FONT.sm,
    color:        T.textSecondary,
    lineHeight:   rf(22),
    letterSpacing: 0.1,
  },
  footer:     { marginTop: SPACING.xl, alignItems: 'center' },
  footerText: {
    fontSize:  rs(11),
    color:     T.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
