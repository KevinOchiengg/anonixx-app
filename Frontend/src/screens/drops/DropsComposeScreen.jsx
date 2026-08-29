/**
 * DropsComposeScreen.jsx
 *
 * The new compose surface for Anonixx Drops.
 * Three formats (Text / Media / Voice) + an independent Poll toggle,
 * live card preview, confession-type picker, unsent draft layer,
 * daily-limit counter, dangerous-edge warning.
 *
 * Drops are rendered via <DropCardRenderer /> — this screen is only state,
 * composition and gating. All visual identity lives in the renderer.
 *
 * Backend-facing stubs are noted with // BACKEND: — safe to keep client-side
 * until those endpoints exist.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch,
  ActivityIndicator, Dimensions, Keyboard, KeyboardAvoidingView,
  Platform, ScrollView, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useDispatch } from 'react-redux';
import {
  ChevronLeft, ChevronDown, Images, BarChart2, Mic, Tag, Type,
  AlertTriangle, Trash2, X,
} from 'lucide-react-native';
import TagUserSection from '../../components/drops/TagUserSection';
import LocationField from '../../components/drops/LocationField';

import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';

import DropCardRenderer, {
  CARD_INTENTS, CARD_INTENT_LIST,
} from '../../components/drops/DropCardRenderer';
import T from '../../utils/theme';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = SCREEN_W - SPACING.md * 2;
const MAX_CHARS = 500;

// ─── Daily limit ────────────────────────────────────────────────
// Free tier defaults to 3/day; the server is the source of truth and can
// grant unlimited (premium). AsyncStorage is a same-day fallback so the
// counter doesn't reset to zero when the network blips between drops.
const DAILY_LIMIT = 3;
const DRAFT_KEY   = 'anonixx.drops.draft.v1';
const LIMIT_KEY   = 'anonixx.drops.daily.v1';

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ─── Formats ───────────────────────────────────────────────────
const FORMATS = [
  { id: 'text',  label: 'Text',  Icon: Type      },
  { id: 'media', label: 'Media', Icon: Images    },
  { id: 'poll',  label: 'Poll',  Icon: BarChart2 },
  { id: 'voice', label: 'Voice', Icon: Mic       },
];

// ─── Categories ────────────────────────────────────────────────
// These map 1:1 to the backend `category` field on a Drop.
const CATEGORIES = [
  { id: 'love',                    label: 'Love',                  emoji: '❤️'  },
  { id: 'fun',                     label: 'Fun',                   emoji: '✨'  },
  { id: 'friendship',              label: 'Friendship',            emoji: '🤝' },
  { id: 'adventure',               label: 'Adventure',             emoji: '🌍' },
  { id: 'spicy',                   label: 'Spicy',                 emoji: '🌶️' },
  { id: 'carrying this alone',     label: 'Carrying this alone',   emoji: '🌑' },
  { id: 'starting over',           label: 'Starting over',         emoji: '🌱' },
  { id: 'need stability',          label: 'Need stability',        emoji: '⚓' },
  { id: 'open to connection',      label: 'Open to connection',    emoji: '🤲' },
  { id: 'just need to be heard',   label: 'Just need to be heard', emoji: '🌙' },
];

const HINT_MAX = 16;

// ─── Dangerous edge — words that indicate the drop is raw ───────
// When a confession hits one of these, we prompt the user — not to stop them,
// but to make sure they mean it. Copy is intentionally non-judgmental.
const EDGE_TRIGGERS = [
  /\bkill\b/i, /\bsuicide\b/i, /\bend it\b/i, /\bhate (myself|him|her|them)\b/i,
  /\bcheat(?:ed|ing)?\b/i, /\baffair\b/i, /\bleave (him|her|them)\b/i,
];

const detectEdge = (text) => {
  if (!text || text.length < 20) return null;
  for (const re of EDGE_TRIGGERS) if (re.test(text)) return true;
  if (text.length > 200) return 'long';
  return null;
};

// ─── Format chips ──────────────────────────────────────────────
const FormatChip = React.memo(function FormatChip({ id, label, Icon, active, onPress }) {
  return (
    <TouchableOpacity
      style={[s.formatChip, active && s.formatChipActive]}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      <Icon size={rs(14)} color={active ? T.primary : T.textMute} />
      <Text style={[s.formatChipText, active && s.formatChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
});

// ─── Confession type picker ──────────────────────────────────────
// The headline choice — this is what decides how the card looks (colors +
// background pattern in DropCardRenderer), so it gets real visual weight
// here, not a tiny swatch. Each tile previews its own palette so picking
// one is a "does this look like me" decision, not a label lookup.
const IntentCard = React.memo(function IntentCard({ def, active, onPress }) {
  return (
    <TouchableOpacity
      style={s.intentCard}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      <View style={[s.intentCardFill, {
        backgroundColor: def.bgTo,
        borderColor: active ? def.accent + '66' : 'transparent',
      }]}>
        <Text style={s.intentCardEmoji}>{def.emoji}</Text>
        <View style={[s.intentCardAccent, { backgroundColor: def.accent }]} />
      </View>
      <Text style={[s.intentCardLabel, active && { color: def.accent }]}>
        {def.label}
      </Text>
      <Text style={s.intentCardSub}>{def.sub}</Text>
    </TouchableOpacity>
  );
});

// ─── Main screen ───────────────────────────────────────────────
export default function DropsComposeScreen({ navigation, route }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const { isAuthenticated } = useAuth();

  // Guests get sent straight to Login the moment they land here — composing
  // a drop is a deliberate action, not a passive browse, so this checks on
  // focus rather than waiting for a button press. Login has its own "Sign
  // Up" link for anyone who doesn't have an account yet.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        navigation.navigate('AuthNav', { screen: 'Login' });
      }
    }, [isAuthenticated, navigation])
  );

  // ── Inspired-by handoff (from feed Drop button) ──────────────
  // When a user taps the "drop" button on a feed confession card and
  // escalates to "add media", we land here pre-filled with their seed
  // text and a link back to the originating post.
  const initialText      = route?.params?.initialText      || '';
  const inspiredByPostId = route?.params?.inspiredByPostId || null;

  // ── Core state ────────────────────────────────────────────────
  const [format,   setFormat]   = useState('text');    // text | image | video | voice
  const [text,     setText]     = useState(initialText);
  const [cardIntent, setCardIntent] = useState('general');
  // After Dark / Tier-2 themes have been removed — every drop uses the
  // single remaining theme. External social publishing is gated purely by
  // the "Share to Anonixx socials" toggle below, not by confession type.
  const theme = 'desire';
  // Mood tag (the "· longing ·" line on the card) is derived the same way —
  // each confession type has its own emotional register, so the tag should
  // shift with it instead of sitting on one word regardless of what's picked.
  const moodTag = CARD_INTENTS[cardIntent]?.moodTag || 'longing';
  const [category, setCategory] = useState('love');
  const [mediaUri, setMediaUri] = useState(null);
  const [thumbUri, setThumbUri] = useState(null);
  const [mediaKind, setMediaKind] = useState(null); // 'image' | 'video' — set from the picked asset
  const [loading,  setLoading]  = useState(false);

  // ── Tag a specific user (optional — drop still hits marketplace) ─
  const [taggedUser, setTaggedUser] = useState(null);

  // ── Publisher opt-in (section 16) — Tier 2 is never published ─
  // Default ON: eligible drops auto-post to Anonixx's social pages to help
  // the poster get noticed. This is an opt-OUT toggle, not opt-in.
  const [publisherOptIn, setPublisherOptIn] = useState(true);

  // ── Feed-as-drops upgrade: location, font style ───────────────
  // Poll now lives on its own screen (DropsPollScreen), same pattern as Voice.
  // Structured location — country/county picked from a real list (Kenya's
  // 47 counties, the app's primary market), sub-county/estate stay freeform
  // since no reliable exhaustive dataset exists at that granularity.
  const [locationCountry, setLocationCountry] = useState('');
  const [locationCounty, setLocationCounty] = useState('');
  const [locationSubCounty, setLocationSubCounty] = useState('');
  const [locationEstate, setLocationEstate] = useState('');
  const [fontStyle, setFontStyle] = useState('bold-tease'); // classic | sultry-script | bold-tease

  // ── Intensity + one-word hint (section 11) ────────────────────
  const [intensity, setIntensity] = useState('heavy');
  const [hint,      setHint]      = useState('');   // single word, shown only when a user is tagged

  // ── Unsent-restoration banner (section 5) ─────────────────────
  // When a draft loads from storage we don't silently restore — we
  // surface it so the user chooses to continue or discard.
  const [showUnsentBanner, setShowUnsentBanner] = useState(false);

  // ── Progressive disclosure — collapsed by default so the compose
  // screen reads as "write + drop", not a settings form ────────────
  const [tagSectionOpen, setTagSectionOpen] = useState(false);

  // ── Delivery tension (section 6) ──────────────────────────────
  // Briefly pauses between "Drop it" and the actual POST so the
  // moment of sending feels intentional rather than reflexive.
  const [sending, setSending] = useState(false);

  // ── Daily limit ───────────────────────────────────────────────
  // Server is authoritative; local count is a same-day fallback.
  const [dailyUsed,  setDailyUsed]  = useState(0);
  const [dailyLimit, setDailyLimit] = useState(DAILY_LIMIT); // server-reported
  const [unlimited,  setUnlimited]  = useState(false);        // premium flag
  const dropsLeft = unlimited ? Infinity : Math.max(0, dailyLimit - dailyUsed);
  const limitHit  = !unlimited && dailyUsed >= dailyLimit;

  // ── Entrance animation ────────────────────────────────────────
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1, duration: 320, useNativeDriver: true,
    }).start();
  }, [fade]);

  // ── Fetch server-side daily limit ─────────────────────────────
  // Authoritative over local storage — includes the unlimited flag for
  // premium users and the resets_at for future copy tweaks.
  const fetchDailyLimit = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/drops/daily-limit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === 'object') {
        if (typeof data.unlimited === 'boolean') setUnlimited(data.unlimited);
        if (typeof data.limit     === 'number')  setDailyLimit(data.limit);
        if (typeof data.used      === 'number')  setDailyUsed(data.used);
      }
    } catch {
      /* offline — fall back to local count */
    }
  }, []);

  // Refresh whenever the screen focuses (e.g. user drops, navigates away,
  // comes back — we don't want a stale counter).
  useEffect(() => {
    const unsub = navigation.addListener?.('focus', fetchDailyLimit);
    fetchDailyLimit();
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [navigation, fetchDailyLimit]);

  // ── Load draft + limit on mount ───────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [draftRaw, limitRaw] = await Promise.all([
          AsyncStorage.getItem(DRAFT_KEY),
          AsyncStorage.getItem(LIMIT_KEY),
        ]);

        if (draftRaw) {
          try {
            const d = JSON.parse(draftRaw);
            if (d && typeof d === 'object') {
              const hasContent =
                (typeof d.text === 'string' && d.text.trim().length > 0);
              if (typeof d.text     === 'string') setText(d.text);
              if (typeof d.format   === 'string') setFormat(d.format);
              if (typeof d.cardIntent === 'string' && CARD_INTENT_LIST.some(c => c.id === d.cardIntent)) setCardIntent(d.cardIntent);
              if (typeof d.category === 'string' && CATEGORIES.some(c => c.id === d.category)) setCategory(d.category);
              if (typeof d.intensity=== 'string') setIntensity(d.intensity);
              if (typeof d.hint     === 'string') setHint(d.hint);
              // Only surface the unsent banner if the restored draft has substance.
              if (hasContent) setShowUnsentBanner(true);
            }
          } catch { /* corrupt draft — ignore */ }
        }

        if (limitRaw) {
          try {
            const l = JSON.parse(limitRaw);
            if (l && l.date === todayKey()) setDailyUsed(l.count || 0);
          } catch { /* ignore */ }
        }
      } catch { /* storage unavailable — ignore */ }
    })();
  }, []);

  // ── Autosave draft on change (throttled) ──────────────────────
  const saveTimer = useRef(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({
        text, format, cardIntent, category, intensity, hint,
      })).catch(() => {});
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [text, format, cardIntent, category, intensity, hint]);

  // ── Edge detection ────────────────────────────────────────────
  const edge = useMemo(() => detectEdge(text), [text]);

  // ── Format change — clear media if switching away. Voice and Poll
  // both hand off to their own dedicated screen, same pattern for both ─
  const handleFormatChange = useCallback((f) => {
    setFormat(f);
    if (f !== 'media') {
      setMediaUri(null);
      setThumbUri(null);
      setMediaKind(null);
    }
    if (f === 'voice') {
      navigation.navigate?.('DropsRecord', {
        theme, moodTag, category, text,
        target_user_id: taggedUser?.id || undefined,
      });
    }
    if (f === 'poll') {
      navigation.navigate?.('DropsPoll', {
        theme, moodTag, category, text,
        target_user_id: taggedUser?.id || undefined,
      });
    }
  }, [navigation, theme, moodTag, category, text, taggedUser]);

  // ── Media pick — one picker, either photos or videos ──────────
  const handlePickMedia = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Gallery access is needed.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    ['images', 'videos'],
        quality:       0.85,
        allowsEditing: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const kind = asset.type === 'video' ? 'video' : 'image';
      setMediaUri(asset.uri);
      setMediaKind(kind);
      if (kind === 'video') {
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
          setThumbUri(uri);
        } catch { setThumbUri(null); }
      } else {
        setThumbUri(null);
      }
    } catch {
      showToast({ type: 'error', message: 'Could not open gallery.' });
    }
  }, [showToast]);

  const handleClearMedia = useCallback(() => {
    setMediaUri(null);
    setThumbUri(null);
    setMediaKind(null);
  }, []);

  // ── Discard draft ─────────────────────────────────────────────
  const handleDiscardDraft = useCallback(async () => {
    setText('');
    setMediaUri(null);
    setThumbUri(null);
    setShowUnsentBanner(false);
    try { await AsyncStorage.removeItem(DRAFT_KEY); } catch {}
    showToast({ type: 'info', message: 'Unsent layer cleared.' });
  }, [showToast]);

  // ── Continue unsent draft — dismisses the banner only ─────────
  const handleContinueDraft = useCallback(() => {
    setShowUnsentBanner(false);
  }, []);

  // ── Publisher toggle ──────────────────────────────────────────
  // For voice drops turning ON publishing, route through the double-
  // consent screen (section 16). For text/image/video, the single
  // inline toggle is enough until the user taps Drop.
  const handlePublisherYes = useCallback(() => {
    if (format === 'voice') {
      navigation.navigate?.('DropsPublish', {
        format,
        theme,
        preview: text,
        onConfirmed: (ok) => setPublisherOptIn(!!ok),
      });
      return;
    }
    setPublisherOptIn(true);
  }, [format, theme, text, navigation]);

  // ── Submit drop (client-side stub — posts to /drops) ───────────
  const handleDrop = useCallback(async () => {
    if (limitHit) {
      showToast({
        type: 'warning',
        title: 'Daily limit reached',
        message: 'Come back tomorrow. The quiet helps.',
      });
      return;
    }

    if (format === 'text' && !text.trim()) {
      showToast({ type: 'warning', message: 'Write your confession first.' });
      return;
    }
    if (format === 'media' && !mediaUri) {
      showToast({ type: 'warning', message: 'Pick a photo or video first.' });
      return;
    }

    setLoading(true);
    // Delivery-tension pause (section 6) — a small intentional silence.
    setSending(true);
    await new Promise((r) => setTimeout(r, 1700));
    try {
      const token = await AsyncStorage.getItem('token');

      // Single-word hint — strip spaces, keep lowercase, cap at HINT_MAX.
      const hintClean = (hint || '')
        .trim()
        .split(/\s+/)[0]
        .slice(0, HINT_MAX)
        .toLowerCase();

      const confessionText = text.trim();

      const body = {
        category,
        confession: confessionText || undefined,
        theme,
        intent:     cardIntent,
        mood_tag:   moodTag,
        intensity,
        // Hint only makes sense when a specific user is tagged.
        ...(taggedUser && hintClean ? { recognition_hint: hintClean } : {}),
        // Tag a specific user AND still hit marketplace.
        ...(taggedUser ? { target_user_id: taggedUser.id } : {}),
        // Tri-state server-side: explicit false is the only way to opt out.
        publisher_opt_in: !!publisherOptIn,
        ...(mediaKind && mediaUri ? { media_type: mediaKind } : {}),
        // Link back to the feed post that inspired this drop, if any.
        ...(inspiredByPostId ? { inspired_by_post_id: inspiredByPostId } : {}),
        ...(locationCountry.trim() ? { location_country: locationCountry.trim() } : {}),
        ...(locationCounty.trim() ? { location_county: locationCounty.trim() } : {}),
        ...(locationSubCounty.trim() ? { location_sub_county: locationSubCounty.trim() } : {}),
        ...(locationEstate.trim() ? { location_estate: locationEstate.trim() } : {}),
        font_style: fontStyle,
      };

      const res = await fetch(`${API_BASE_URL}/api/v1/drops`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        // Server-enforced daily cap — sync local state and bail cleanly.
        const err = await res.json().catch(() => ({}));
        setDailyUsed(dailyLimit);  // force limitHit true
        showToast({
          type:    'warning',
          title:   'Daily limit reached',
          message: err?.detail || 'Come back tomorrow. The quiet helps.',
        });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      const id   = data?.id;
      if (!id) throw new Error('No drop ID returned.');

      // Anonixx Publisher (section 16): eligible drops (Tier-1, not tagged
      // to a specific user, publisher_opt_in !== false) are now auto-queued
      // for social by the server at creation time — no follow-up call
      // needed. POST /drops/{id}/publish still exists as a manual re-trigger
      // for drops that skipped auto-queue (e.g. tagged drops).

      // Increment local daily count immediately for snappy UI, then
      // re-sync from the server (authoritative — handles unlimited).
      const nextCount = dailyUsed + 1;
      setDailyUsed(nextCount);
      await AsyncStorage.setItem(LIMIT_KEY, JSON.stringify({
        date: todayKey(), count: nextCount,
      }));
      fetchDailyLimit();

      // Clear draft
      await AsyncStorage.removeItem(DRAFT_KEY);
      setText('');

      Keyboard.dismiss();
      showToast({
        type: 'success',
        title: 'Dropped.',
        message: 'The quiet just got louder.',
      });
      dispatch(awardMilestone('first_drop'));

      // Land back in the main feed, not the individual drop page — the
      // drop now shows up there as a genuine confession post (see
      // create_drop's post-mirroring on the backend), so that's where the
      // reaction should happen, not on a standalone landing screen.
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err) {
      showToast({
        type: 'error',
        message: err?.message || 'Could not drop it. Try again.',
      });
    } finally {
      setSending(false);
      setLoading(false);
    }
  }, [
    limitHit, format, text, mediaUri, mediaKind, theme, cardIntent, moodTag, category,
    intensity, hint, taggedUser,
    publisherOptIn, dailyUsed, dailyLimit, fetchDailyLimit,
    locationCountry, locationCounty, locationSubCounty, locationEstate, fontStyle,
    dispatch, navigation, showToast,
  ]);

  // ── Derived ───────────────────────────────────────────────────
  const canDrop       = format === 'text' ? !!text.trim() : !!mediaUri;
  const layoutMode    = 'split';
  const cardMediaUri  = format === 'media' ? (thumbUri || mediaUri) : null;
  const remaining     = MAX_CHARS - text.length;
  const remColor      = remaining <= 20
    ? (remaining <= 0 ? T.danger : T.warn) : T.textMute;
  const hasDraft      = text.length > 0 || !!mediaUri;

  // ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
            <ChevronLeft size={rs(24)} color={T.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Drop</Text>
          {/* Balances the back-chevron so the title stays centered */}
          <View style={{ width: rs(24) }} />
        </View>

        {/* Daily limit strip (section 14) */}
        {limitHit ? (
          <View style={[s.limitStrip, s.limitStripHit]}>
            <View style={{ flex: 1 }}>
              <Text style={s.limitTitleHit}>You've sent enough for one day.</Text>
              <Text style={s.limitSubHit}>
                Come back tomorrow — or go unlimited and keep sending.
              </Text>
            </View>
            <TouchableOpacity
              style={s.upgradeBtn}
              onPress={() => navigation.navigate?.('Premium')}
              activeOpacity={0.85}
              hitSlop={HIT_SLOP}
            >
              <Text style={s.upgradeBtnText}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.limitStrip}>
            <Text style={s.limitText}>
              {unlimited
                ? 'Unlimited drops — premium.'
                : `${dropsLeft} of ${dailyLimit} drops left today`}
            </Text>
            {hasDraft && (
              <TouchableOpacity onPress={handleDiscardDraft} hitSlop={HIT_SLOP}>
                <Trash2 size={rs(14)} color={T.textMute} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Unsent restoration banner (section 5) */}
          {showUnsentBanner && (
            <View style={s.unsentBanner}>
              <Text style={s.unsentTitle}>
                You almost sent this to them…
              </Text>
              <Text style={s.unsentSub}>
                Still here. Still waiting to be sent.
              </Text>
              <View style={s.unsentActions}>
                <TouchableOpacity
                  style={[s.unsentBtn, s.unsentBtnPrimary]}
                  onPress={handleContinueDraft}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <Text style={s.unsentBtnPrimaryText}>Continue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.unsentBtn}
                  onPress={handleDiscardDraft}
                  hitSlop={HIT_SLOP}
                  activeOpacity={0.85}
                >
                  <Text style={s.unsentBtnText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Format selector — Text / Media / Poll / Voice. Poll hands off
              to its own screen exactly like Voice does — building a poll
              isn't a quick inline toggle, it's its own compose step. */}
          <Animated.View style={[s.formatRow, { opacity: fade }]}>
            {FORMATS.map(({ id, label, Icon }) => (
              <FormatChip
                key={id}
                id={id}
                label={label}
                Icon={Icon}
                active={format === id}
                onPress={() => handleFormatChange(id)}
              />
            ))}
          </Animated.View>

          {/* Confession type — the headline choice. Picked before the card
              preview so the preview below always reflects it live: pick
              your audience, then watch the card become yours as you type. */}
          <Text style={s.sectionLabel}>Confession Type</Text>
          <Text style={s.sectionSubLabel}>
            Who is this for? It shapes how your card looks — colors, pattern, everything.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.intentScroll}
            contentContainerStyle={s.intentRow}
          >
            {CARD_INTENT_LIST.map((def) => (
              <IntentCard
                key={def.id}
                def={def}
                active={cardIntent === def.id}
                onPress={() => setCardIntent(def.id)}
              />
            ))}
          </ScrollView>

          {/* Live card preview — type directly into the card itself,
              no separate input box duplicating what it shows. */}
          <Animated.View style={[s.cardWrap, { opacity: fade }]}>
            <DropCardRenderer
              confession={text}
              moodTag={moodTag}
              theme={theme}
              intent={cardIntent}
              mediaUrl={cardMediaUri}
              layoutMode={layoutMode}
              cardWidth={CARD_W}
              seed={text || format}
              editable
              onChangeText={setText}
              placeholder={format === 'text'
                ? "say exactly what you want them to know…"
                : "say what this doesn't show…"}
              maxLength={MAX_CHARS}
              fontStyle={fontStyle}
            />
          </Animated.View>

          {/* Character count, text format only */}
          {format === 'text' && (
            <View style={s.cardMetaRow}>
              <Text style={[s.remaining, { color: remColor }]}>{remaining}</Text>
            </View>
          )}

          {/* Media picker — one picker, photo or video, caption is typed
              on the card above */}
          {format === 'media' && (
            <View style={s.mediaSection}>
              {!mediaUri ? (
                <TouchableOpacity
                  style={s.pickBtn}
                  onPress={handlePickMedia}
                  activeOpacity={0.85}
                >
                  <Images size={rs(28)} color={T.primary} />
                  <Text style={s.pickBtnText}>Tap to pick a photo or video</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.previewWrap}>
                  <Image source={{ uri: thumbUri || mediaUri }} style={s.preview} resizeMode="cover" />
                  <TouchableOpacity style={s.clearBtn} onPress={handleClearMedia} hitSlop={HIT_SLOP}>
                    <X size={rs(14)} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}


          {/* Dangerous edge warning — spec section 10 */}
          {edge && (
            <View style={s.edgeWarn}>
              <AlertTriangle size={rs(14)} color={T.warn} />
              <View style={{ flex: 1 }}>
                {edge === 'long' ? (
                  <Text style={s.edgeWarnText}>
                    That's a lot to send at once. Shorter confessions hit harder.
                  </Text>
                ) : (
                  <>
                    <Text style={s.edgeWarnTitle}>
                      This could change everything between you two.
                    </Text>
                    <Text style={s.edgeWarnText}>
                      No taking it back once it's sent.
                    </Text>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Tag someone — optional, drop still hits marketplace too.
              Collapsed by default: tagging a specific person is the
              exception, not the rule — most drops just go to the
              marketplace, so the search widget shouldn't be forced on
              every single compose session. */}
          <TouchableOpacity
            style={s.collapsibleTrigger}
            onPress={() => setTagSectionOpen((v) => !v)}
            activeOpacity={0.85}
            hitSlop={HIT_SLOP}
          >
            <Tag size={rs(13)} color={taggedUser ? T.primary : T.textMute} />
            <Text style={[s.collapsibleTriggerLabel, taggedUser && { color: T.primary }]}>
              {taggedUser
                ? `Tagged ${taggedUser.username || taggedUser.anonymous_name}`
                : 'Tag someone (optional)'}
            </Text>
            {!taggedUser && (
              <ChevronDown
                size={rs(15)}
                color={T.textMute}
                style={tagSectionOpen ? s.chevronOpen : null}
              />
            )}
          </TouchableOpacity>
          {(tagSectionOpen || taggedUser) && (
            <TagUserSection
              taggedUser={taggedUser}
              onTag={setTaggedUser}
              onClear={() => setTaggedUser(null)}
            />
          )}

          {/* One-word hint — only when someone is tagged */}
          {!!taggedUser && (
            <View style={s.hintBox}>
              <Text style={s.hintTitle}>
                One word only they'd catch.
              </Text>
              <Text style={s.hintSub}>
                They might pick up on it. Or not. That's the fun of it.
              </Text>
              <TextInput
                style={s.hintInput}
                value={hint}
                onChangeText={(v) => setHint(v.split(/\s+/)[0].slice(0, HINT_MAX))}
                placeholder="e.g. rain, august, friday…"
                placeholderTextColor={T.textMute}
                maxLength={HINT_MAX}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="done"
              />
              <Text style={s.hintCount}>{HINT_MAX - hint.length} left</Text>
            </View>
          )}

          {/* Anonixx Publisher opt-in (section 16) — the only gate on
              external social publishing. Compact single toggle row instead
              of a paragraph + two buttons — it's a binary decision, doesn't
              need a full explainer every time. */}
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleRowLabel}>Share to Anonixx socials</Text>
              <Text style={s.toggleRowSub}>Anonymous — your identity never leaves Anonixx</Text>
            </View>
            <Switch
              value={publisherOptIn}
              onValueChange={(v) => (v ? handlePublisherYes() : setPublisherOptIn(false))}
              trackColor={{ false: T.surfaceAlt, true: T.primary }}
              thumbColor={publisherOptIn ? '#fff' : T.textMute}
              ios_backgroundColor={T.surfaceAlt}
            />
          </View>

          {/* Location — structured (country → county → sub-county → estate),
              helps interested people know you're reachable and powers the
              location filter in Search. Everything here is optional. */}
          <Text style={s.sectionLabel}>Where are you? (optional)</Text>
          <View style={{ marginBottom: SPACING.md }}>
            <LocationField
              country={locationCountry}
              county={locationCounty}
              subCounty={locationSubCounty}
              estate={locationEstate}
              onChangeCountry={setLocationCountry}
              onChangeCounty={setLocationCounty}
              onChangeSubCounty={setLocationSubCounty}
              onChangeEstate={setLocationEstate}
            />
          </View>

          {/* Drop button */}
          <TouchableOpacity
            style={[s.dropBtn, (!canDrop || loading || limitHit || sending) && s.dropBtnDisabled]}
            onPress={handleDrop}
            disabled={!canDrop || loading || limitHit || sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <View style={{ alignItems: 'center' }}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={s.dropBtnPauseText}>
                  Your Drop is being prepared…
                </Text>
              </View>
            ) : loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.dropBtnText}>
                {limitHit ? 'That\'s enough sending for today' : 'Send it  ↗'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Delivery-tension sublabel (section 6) */}
          {sending && (
            <Text style={s.deliveryTension}>
              Anonixx is sending this straight to them.
            </Text>
          )}

          <Text style={s.footerNote}>
            Your identity stays hidden. Always.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle:  {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.5,
  },

  limitStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(8),
    backgroundColor:   'rgba(255,255,255,0.02)',
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  limitStripHit: { backgroundColor: 'rgba(251,146,60,0.06)' },
  limitText:     { fontSize: rf(11), color: T.textSec, letterSpacing: 0.3, flex: 1 },
  limitTitleHit: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(13),
    color:         T.warn,
    letterSpacing: 0.3,
  },
  limitSubHit: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.3,
    marginTop:     rp(2),
  },
  upgradeBtn: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    backgroundColor:   T.primary,
    marginLeft:        SPACING.sm,
  },
  upgradeBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         '#fff',
    letterSpacing: 0.5,
  },

  // Unsent restoration banner (section 5)
  unsentBanner: {
    backgroundColor:   'rgba(255,99,74,0.06)',
    borderColor:       'rgba(255,99,74,0.25)',
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    marginBottom:      SPACING.md,
  },
  unsentTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(16),
    color:         T.text,
    letterSpacing: 0.3,
    lineHeight:    rf(24),
  },
  unsentSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(12),
    color:         T.textSec,
    letterSpacing: 0.3,
    marginTop:     rp(4),
  },
  unsentActions: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginTop:     rp(12),
  },
  unsentBtn: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
  },
  unsentBtnPrimary: {
    borderColor:     T.primary,
    backgroundColor: 'rgba(255,99,74,0.12)',
  },
  unsentBtnPrimaryText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(12),
    color:         T.primary,
    letterSpacing: 0.5,
  },
  unsentBtnText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(12),
    color:         T.textSec,
    letterSpacing: 0.5,
  },

  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.md,
    paddingBottom:     SPACING.xl,
  },

  // Format selector
  formatRow: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginBottom:  SPACING.md,
  },
  formatChip: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               rp(5),
    paddingVertical:   rp(9),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'transparent',
  },
  formatChipActive:     { borderColor: T.primary, backgroundColor: 'rgba(255,99,74,0.08)' },
  formatChipText:       { fontSize: FONT.sm, color: T.textMute, fontWeight: '500' },
  formatChipTextActive: { color: T.primary, fontWeight: '700' },

  // Card preview
  cardWrap: {
    alignItems:   'center',
    marginBottom: SPACING.md,
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: rs(12) },
    shadowOpacity:0.4,
    shadowRadius: rs(28),
    elevation:    10,
  },

  // Text meta row — sits under the card now that typing happens on it directly
  cardMetaRow: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    alignItems:     'center',
    marginBottom:   SPACING.md,
  },
  remaining: { fontSize: rf(12), fontWeight: '600' },

  // Media picker
  mediaSection: { gap: SPACING.sm, marginBottom: SPACING.md },
  pickBtn: {
    height:          rs(160),
    borderRadius:    RADIUS.lg,
    borderWidth:     1.5,
    borderStyle:     'dashed',
    borderColor:     'rgba(255,99,74,0.25)',
    backgroundColor: 'rgba(255,99,74,0.04)',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SPACING.xs,
  },
  pickBtnText: { fontSize: FONT.sm, color: T.text, fontWeight: '600' },

  previewWrap: {
    position:     'relative',
    borderRadius: RADIUS.lg,
    overflow:     'hidden',
    height:       rs(180),
  },
  preview: { width: '100%', height: '100%' },
  clearBtn: {
    position:        'absolute',
    top:             rp(8), right: rp(8),
    width:           rs(26), height: rs(26),
    borderRadius:    rs(13),
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  // Edge warning
  edgeWarn: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               rp(8),
    backgroundColor:   'rgba(251,146,60,0.08)',
    borderColor:       'rgba(251,146,60,0.25)',
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    marginBottom:      SPACING.md,
  },
  edgeWarnTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(13),
    color:         T.warn,
    letterSpacing: 0.3,
    lineHeight:    rf(20),
  },
  edgeWarnText: {
    flex:       1,
    fontFamily: 'DMSans-Italic',
    fontSize:   rf(12),
    color:      T.warn,
    lineHeight: rf(18),
    marginTop:  rp(2),
  },

  // Section label
  sectionLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom:  rp(6),
    marginTop:     SPACING.md,
  },
  sectionSubLabel: {
    fontFamily:   'DMSans-Italic',
    fontSize:     rf(12),
    color:        T.textMute,
    marginTop:    rp(2),
    marginBottom: SPACING.md,
    lineHeight:   rf(17),
  },

  // Confession type picker — small swatch + free-floating caption below it,
  // same shape as the old theme-swatch picker (no card border boxing the
  // text in — just the little color/pattern square, then plain text).
  intentScroll: { marginHorizontal: -SPACING.md, marginBottom: SPACING.lg },
  intentRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(4),
    gap:               SPACING.sm,
  },
  intentCard: {
    width:       rs(96),
    alignItems:  'center',
  },
  intentCardFill: {
    width:              rs(64),
    height:             rs(64),
    borderRadius:       RADIUS.md,
    borderWidth:        1.5,
    alignItems:        'center',
    justifyContent:    'center',
    position:          'relative',
    overflow:          'hidden',
  },
  intentCardEmoji: { fontSize: rf(20) },
  intentCardAccent: {
    position:     'absolute',
    bottom:       rp(6),
    left:         rp(6),
    width:        rs(14),
    height:       rs(3),
    borderRadius: rs(2),
    opacity:      0.9,
  },
  intentCardLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10.5),
    color:         T.text,
    textAlign:     'center',
    marginTop:     rp(6),
  },
  intentCardSub: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(9),
    color:         T.textMute,
    lineHeight:    rf(12),
    textAlign:     'center',
    marginTop:     rp(2),
  },

  // Customize accordion (theme/mood/category/intensity/location/font/poll)
  // Shared flat toggle-row pattern — used by the Customize trigger and
  // the Tag-someone trigger, so both collapsible rows read as one system.
  collapsibleTrigger: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(8),
    paddingVertical:   rp(12),
    paddingHorizontal: rp(2),
    marginBottom:      SPACING.sm,
  },
  collapsibleTriggerLabel: {
    flex:          1,
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.text,
    letterSpacing: 0.3,
  },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  // One-word hint (section 11)
  hintBox: {
    backgroundColor:   'rgba(255,99,74,0.04)',
    borderColor:       'rgba(255,99,74,0.18)',
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    marginBottom:      SPACING.md,
  },
  hintTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(15),
    color:         T.text,
    letterSpacing: 0.3,
    lineHeight:    rf(22),
  },
  hintSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.3,
    marginTop:     rp(4),
  },
  hintInput: {
    fontFamily:      'DMSans-Regular',
    fontSize:        rf(15),
    color:           T.text,
    backgroundColor: T.surface,
    borderRadius:    RADIUS.sm,
    borderWidth:     1,
    borderColor:     T.border,
    paddingHorizontal: rp(12),
    paddingVertical:   rp(10),
    marginTop:       rp(10),
    letterSpacing:   0.5,
  },
  hintCount: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.3,
    marginTop:     rp(6),
    textAlign:     'right',
  },

  // Audience
  audienceRow: { gap: SPACING.sm, marginBottom: SPACING.lg },
  audienceBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(10),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'transparent',
  },
  audienceBtnActive: {
    borderColor:     'rgba(255,99,74,0.4)',
    backgroundColor: 'rgba(255,99,74,0.06)',
  },
  audienceLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.textSec,
    marginBottom:  rp(2),
  },
  audienceLabelActive: { color: T.primary },
  audienceDesc: {
    fontFamily: 'DMSans-Italic',
    fontSize:   rf(11),
    color:      T.textMute,
  },

  // Drop button
  dropBtn: {
    height:          BUTTON_HEIGHT,
    borderRadius:    RADIUS.md,
    backgroundColor: T.primary,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.45,
    shadowRadius:    rs(14),
    elevation:       6,
  },
  dropBtnDisabled: { opacity: 0.38 },
  dropBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.5,
  },
  dropBtnPauseText: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         'rgba(255,255,255,0.9)',
    letterSpacing: 1,
    marginTop:     rp(6),
  },
  deliveryTension: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(12),
    color:         T.primary,
    textAlign:     'center',
    marginTop:     SPACING.sm,
    letterSpacing: 0.5,
    opacity:       0.9,
  },

  // Publisher opt-in (section 16)
  publisherBox: {
    backgroundColor:   'rgba(255,255,255,0.02)',
    borderColor:       T.border,
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    marginBottom:      SPACING.md,
  },
  publisherQ: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(12),
    color:         T.text,
    letterSpacing: 0.3,
    lineHeight:    rf(18),
    marginBottom:  rp(10),
  },
  publisherRow: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    flexWrap:      'wrap',
  },
  publisherBtn: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'transparent',
  },
  publisherBtnYesActive: {
    borderColor:     T.primary,
    backgroundColor: 'rgba(255,99,74,0.12)',
  },
  publisherBtnNoActive: {
    borderColor:     'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  publisherBtnText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.5,
  },
  publisherBtnYesActiveText: { color: T.primary, fontFamily: 'DMSans-Bold' },
  publisherBtnNoActiveText:  { color: T.text,    fontFamily: 'DMSans-Bold' },
  publisherNote: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.3,
    marginTop:     rp(8),
  },
  publisherLocked: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.3,
    lineHeight:    rf(18),
  },

  // Compact toggle row — publisher opt-in
  toggleRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   rp(10),
    paddingHorizontal: rp(2),
    marginBottom:      SPACING.sm,
    gap:               SPACING.sm,
  },
  toggleRowLabel: {
    fontFamily:    'DMSans-SemiBold',
    fontSize:      FONT.sm,
    color:         T.text,
    letterSpacing: 0.2,
  },
  toggleRowSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.2,
    marginTop:     rp(2),
  },

  footerNote: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    textAlign:     'center',
    marginTop:     SPACING.md,
    letterSpacing: 0.5,
  },

  // ─── Section optional label ────────────────────────────────────
  sectionOptional: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.8,
    textTransform: 'none',
  },
  tagSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.3,
    lineHeight:    rf(17),
    marginBottom:  rp(10),
  },

  // ─── Tag someone / user search ─────────────────────────────────
  userSearchWrap: {
    marginBottom: SPACING.md,
    zIndex:       50,
  },
  userSearchRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(8),
    backgroundColor:   T.surface,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    paddingHorizontal: rp(12),
    paddingVertical:   rp(10),
  },
  userSearchInput: {
    flex:            1,
    fontFamily:      'DMSans-Regular',
    fontSize:        FONT.md,
    color:           T.text,
    paddingVertical: 0,
  },
  userResultsList: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    marginTop:       rp(4),
    overflow:        'hidden',
    maxHeight:       rs(220),
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.3,
    shadowRadius:    rs(10),
    elevation:       10,
  },
  userResultItem: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(10),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  userResultAvatar: {
    width:           rs(34),
    height:          rs(34),
    borderRadius:    rs(17),
    backgroundColor: 'rgba(255,99,74,0.12)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  userResultInitial: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: T.primary },
  userResultName:    { fontFamily: 'DMSans-Bold',    fontSize: FONT.sm, color: T.text },
  userResultAnon:    { fontFamily: 'DMSans-Italic',  fontSize: rf(11), color: T.textMute, marginTop: rp(1) },
  userNoResults: {
    fontFamily:    'DMSans-Italic',
    fontSize:      FONT.sm,
    color:         T.textMute,
    paddingVertical: rp(8),
    paddingHorizontal: rp(2),
  },
  tagConfirm: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(8),
    marginTop:         rp(8),
    backgroundColor:   'rgba(255,99,74,0.06)',
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.2)',
    paddingHorizontal: rp(12),
    paddingVertical:   rp(10),
  },
  tagConfirmText: {
    flex:       1,
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(12),
    color:      T.textSec,
    lineHeight: rf(18),
  },

});
