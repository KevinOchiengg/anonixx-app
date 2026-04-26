/**
 * DropsComposeScreen.jsx
 *
 * The new compose surface for Anonixx Drops.
 * Four formats, live card preview, theme picker, unsent draft layer,
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
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, Keyboard, KeyboardAvoidingView,
  Platform, ScrollView, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useDispatch } from 'react-redux';
import {
  ChevronLeft, Film, FileImage, Lock, Mic, Sparkles, Type,
  AlertTriangle, Trash2,
} from 'lucide-react-native';
import TagUserSection from '../../components/drops/TagUserSection';

import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';

import DropCardRenderer, {
  DROP_THEMES, TIER_1_THEMES, TIER_2_THEMES,
} from '../../components/drops/DropCardRenderer';

// ─── Theme ─────────────────────────────────────────────────────
const T = {
  background: '#0b0f18',
  surface:    '#151924',
  primary:    '#FF634A',
  text:       '#EAEAF0',
  textSec:    '#9A9AA3',
  textMute:   '#4a4f62',
  border:     'rgba(255,255,255,0.06)',
  warn:       '#FB923C',
  danger:     '#ef4444',
};

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = SCREEN_W - SPACING.md * 2;
const MAX_CHARS = 280;

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
  { id: 'image', label: 'Image', Icon: FileImage },
  { id: 'video', label: 'Video', Icon: Film      },
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

// ─── Mood tags ─────────────────────────────────────────────────
const MOOD_TAGS = [
  'longing', 'restless', 'tender', 'bitter', 'hopeful',
  'ashamed', 'dangerous', 'quiet', 'unsent', 'reckless',
];

// ─── Intensity (spec section 11) ───────────────────────────────
// How heavy the drop feels. Not a rating — a frame.
const INTENSITY_LEVELS = [
  { id: 'soft',        label: 'soft',        sub: 'a thought that slipped' },
  { id: 'heavy',       label: 'heavy',       sub: 'pressing on your chest' },
  { id: 'devastating', label: 'devastating', sub: "you can't hold it anymore" },
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

// ─── Theme picker ──────────────────────────────────────────────
const ThemeSwatch = React.memo(function ThemeSwatch({ themeId, theme, active, locked, onPress }) {
  return (
    <TouchableOpacity
      style={[s.swatch, active && s.swatchActive]}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.8}
    >
      <View style={[s.swatchFill, { backgroundColor: theme.bgTo }]}>
        <View style={[s.swatchAccent, { backgroundColor: theme.accent }]} />
        {locked && (
          <View style={s.swatchLock}>
            <Lock size={rs(11)} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[s.swatchLabel, active && { color: theme.accent }]} numberOfLines={1}>
        {theme.label}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Mood chip ─────────────────────────────────────────────────
const MoodChip = React.memo(function MoodChip({ tag, active, onPress }) {
  return (
    <TouchableOpacity
      style={[s.moodChip, active && s.moodChipActive]}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      <Text style={[s.moodChipText, active && s.moodChipTextActive]}>· {tag} ·</Text>
    </TouchableOpacity>
  );
});

// ─── Main screen ───────────────────────────────────────────────
export default function DropsComposeScreen({ navigation }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();

  // ── Core state ────────────────────────────────────────────────
  const [format,   setFormat]   = useState('text');    // text | image | video | voice
  const [text,     setText]     = useState('');
  const [theme,    setTheme]    = useState('cinematic-coral');
  const [moodTag,  setMoodTag]  = useState('longing');
  const [category, setCategory] = useState('love');
  const [teaseMode,setTeaseMode]= useState(false);
  const [mediaUri, setMediaUri] = useState(null);
  const [thumbUri, setThumbUri] = useState(null);
  const [loading,  setLoading]  = useState(false);

  // ── Tag a specific user (optional — drop still hits marketplace) ─
  const [taggedUser, setTaggedUser] = useState(null);

  // ── AI text refinement (text drops only) ─────────────────────────
  const [refineEnabled,     setRefineEnabled]     = useState(false);
  const [refinedText,       setRefinedText]       = useState('');
  const [showRefinePreview, setShowRefinePreview] = useState(false);
  const [refining,          setRefining]          = useState(false);

  // ── Publisher opt-in (section 16) — Tier 2 is never published ─
  const [publisherOptIn, setPublisherOptIn] = useState(false);

  // ── Intensity + one-word hint (section 11) ────────────────────
  const [intensity, setIntensity] = useState('heavy');
  const [hint,      setHint]      = useState('');   // single word, shown only when a user is tagged

  // ── Unsent-restoration banner (section 5) ─────────────────────
  // When a draft loads from storage we don't silently restore — we
  // surface it so the user chooses to continue or discard.
  const [showUnsentBanner, setShowUnsentBanner] = useState(false);

  // ── Delivery tension (section 6) ──────────────────────────────
  // Briefly pauses between "Drop it" and the actual POST so the
  // moment of sending feels intentional rather than reflexive.
  const [sending, setSending] = useState(false);

  // ── Tier-2 gate (18+ opt-in) ──────────────────────────────────
  // BACKEND: replace with real user.age_verified when available.
  const [tier2Unlocked, setTier2Unlocked] = useState(false);

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
              if (typeof d.theme    === 'string' && DROP_THEMES[d.theme]) setTheme(d.theme);
              if (typeof d.moodTag  === 'string') setMoodTag(d.moodTag);
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
        text, format, theme, moodTag, category, intensity, hint,
      })).catch(() => {});
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [text, format, theme, moodTag, category, intensity, hint]);

  // ── Edge detection ────────────────────────────────────────────
  const edge = useMemo(() => detectEdge(text), [text]);

  // ── Theme selection (gate Tier 2) ─────────────────────────────
  const handleSelectTheme = useCallback((themeId) => {
    const t = DROP_THEMES[themeId];
    if (!t) return;
    if (t.tier === 2 && !tier2Unlocked) {
      showToast({
        type: 'info',
        title: 'After Dark themes',
        message: '18+ only. Opt in from Settings when you\'re ready.',
      });
      return;
    }
    setTheme(themeId);
  }, [tier2Unlocked, showToast]);

  // ── Format change — clear media if switching away ─────────────
  const handleFormatChange = useCallback((f) => {
    setFormat(f);
    if (f !== 'image' && f !== 'video') {
      setMediaUri(null);
      setThumbUri(null);
    }
    if (f === 'voice') {
      navigation.navigate?.('DropsRecord', {
        theme, moodTag, category, text,
        target_user_id: taggedUser?.id || undefined,
      });
    }
  }, [navigation, theme, moodTag, text]);

  // ── Media pick (image / video) ────────────────────────────────
  const handlePickMedia = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Gallery access is needed.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    format === 'image' ? 'images' : 'videos',
        quality:       0.85,
        allowsEditing: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      if (format === 'video') {
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
          setThumbUri(uri);
        } catch { setThumbUri(null); }
      }
    } catch {
      showToast({ type: 'error', message: 'Could not open gallery.' });
    }
  }, [format, showToast]);

  const handleClearMedia = useCallback(() => {
    setMediaUri(null);
    setThumbUri(null);
  }, []);

  // ── Discard draft ─────────────────────────────────────────────
  const handleDiscardDraft = useCallback(async () => {
    setText('');
    setMoodTag('longing');
    setTeaseMode(false);
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

  // ── AI text refinement ────────────────────────────────────────
  // Calls POST /api/v1/drops/refine { text } → { refined_text }.
  // Shows a before/after preview; user picks which version to post.
  const handleRefineText = useCallback(async () => {
    if (!text.trim()) return;
    setRefining(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/drops/refine`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) throw new Error('Refinement unavailable right now.');
      const data = await res.json();
      if (!data?.refined_text) throw new Error('No refined text returned.');
      setRefinedText(data.refined_text);
      setShowRefinePreview(true);
    } catch (err) {
      showToast({ type: 'warning', message: err.message || 'Could not refine. Try again.' });
      setRefineEnabled(false);
    } finally {
      setRefining(false);
    }
  }, [text, showToast]);

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
    if ((format === 'image' || format === 'video') && !mediaUri) {
      showToast({ type: 'warning', message: `Pick ${format === 'image' ? 'an image' : 'a video'} first.` });
      return;
    }

    setLoading(true);
    // Delivery-tension pause (section 6) — a small intentional silence.
    setSending(true);
    await new Promise((r) => setTimeout(r, 1700));
    try {
      const token = await AsyncStorage.getItem('token');

      const themeObjLocal = DROP_THEMES[theme];
      const tier2 = themeObjLocal?.tier === 2;

      // Single-word hint — strip spaces, keep lowercase, cap at HINT_MAX.
      const hintClean = (hint || '')
        .trim()
        .split(/\s+/)[0]
        .slice(0, HINT_MAX)
        .toLowerCase();

      // Use refined text if user accepted the AI suggestion, otherwise raw.
      const confessionText = (refineEnabled && refinedText) ? refinedText : text.trim();

      const body = {
        category,
        confession: confessionText || undefined,
        theme,
        mood_tag:   moodTag,
        tease_mode: teaseMode,
        intensity,
        // Hint only makes sense when a specific user is tagged.
        ...(taggedUser && hintClean ? { recognition_hint: hintClean } : {}),
        // Tag a specific user AND still hit marketplace.
        ...(taggedUser ? { target_user_id: taggedUser.id } : {}),
        // Publisher opt-in is gated off for Tier 2 (after-dark is never published).
        publisher_opt_in: tier2 ? false : !!publisherOptIn,
        ...(format !== 'text' && mediaUri ? { media_type: format } : {}),
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

      // Anonixx Publisher (section 16): the create payload only stamps
      // the intent — the queue insert happens via the dedicated publish
      // endpoint so we get the double-consent audit trail. Failure here
      // is non-fatal: the drop still exists, the user just won't hit the
      // social queue this run. We toast soft so they know to retry.
      if (!tier2 && publisherOptIn) {
        try {
          const pubRes = await fetch(`${API_BASE_URL}/api/v1/drops/${id}/publish`, {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ confirmed: true }),
          });
          if (!pubRes.ok) {
            showToast({
              type:    'info',
              message: "Saved — but we couldn't queue it for social yet.",
            });
          }
        } catch {
          /* non-fatal */
        }
      }

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

      navigation.navigate?.('DropLanding', { dropId: id });
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
    limitHit, format, text, mediaUri, theme, moodTag, category, teaseMode,
    intensity, hint, taggedUser, refineEnabled, refinedText, publisherOptIn,
    dailyUsed, dailyLimit, fetchDailyLimit,
    dispatch, navigation, showToast,
  ]);

  // ── Derived ───────────────────────────────────────────────────
  const themeObj      = DROP_THEMES[theme];
  const canDrop       = format === 'text' ? !!text.trim() : !!mediaUri;
  const layoutMode    = (format === 'image' && mediaUri) ? 'split' : 'split';
  const cardMediaUri  = (format === 'image' || format === 'video') ? (thumbUri || mediaUri) : null;
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
          <TouchableOpacity
            onPress={() => navigation.navigate?.('DropsInbox')}
            hitSlop={HIT_SLOP}
          >
            <Text style={s.headerAction}>Inbox</Text>
          </TouchableOpacity>
        </View>

        {/* Daily limit strip (section 14) */}
        {limitHit ? (
          <View style={[s.limitStrip, s.limitStripHit]}>
            <View style={{ flex: 1 }}>
              <Text style={s.limitTitleHit}>You've said a lot today.</Text>
              <Text style={s.limitSubHit}>
                Come back tomorrow — or unlock unlimited.
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
                You almost said something to them…
              </Text>
              <Text style={s.unsentSub}>
                It's still here. Waiting.
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

          {/* Format selector */}
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

          {/* Live card preview */}
          <Animated.View style={[s.cardWrap, { opacity: fade }]}>
            <DropCardRenderer
              confession={text || 'your confession will live here — the quiet made visible.'}
              moodTag={moodTag}
              teaseMode={teaseMode}
              theme={theme}
              mediaUrl={cardMediaUri}
              layoutMode={layoutMode}
              cardWidth={CARD_W}
              seed={text || format}
            />
          </Animated.View>

          {/* Text input — only in text format */}
          {format === 'text' && (
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={text}
                onChangeText={setText}
                placeholder="say what you've been holding in…"
                placeholderTextColor={T.textMute}
                multiline
                maxLength={MAX_CHARS}
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect
              />
              <View style={s.inputMeta}>
                <TouchableOpacity
                  style={[s.teaseToggle, teaseMode && s.teaseToggleActive]}
                  onPress={() => setTeaseMode(v => !v)}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={[s.teaseToggleText, teaseMode && { color: T.primary }]}>
                    {teaseMode ? '◉  tease on — cut mid-thought' : '○  tease mode'}
                  </Text>
                </TouchableOpacity>
                <Text style={[s.remaining, { color: remColor }]}>{remaining}</Text>
              </View>
            </View>
          )}

          {/* Media picker — image / video */}
          {(format === 'image' || format === 'video') && (
            <View style={s.mediaSection}>
              {!mediaUri ? (
                <TouchableOpacity
                  style={s.pickBtn}
                  onPress={handlePickMedia}
                  activeOpacity={0.85}
                >
                  {format === 'image'
                    ? <FileImage size={rs(28)} color={T.primary} />
                    : <Film       size={rs(28)} color={T.primary} />
                  }
                  <Text style={s.pickBtnText}>
                    Tap to pick {format === 'image' ? 'an image' : 'a video'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={s.previewWrap}>
                  <Image source={{ uri: thumbUri || mediaUri }} style={s.preview} resizeMode="cover" />
                  <TouchableOpacity style={s.clearBtn} onPress={handleClearMedia} hitSlop={HIT_SLOP}>
                    <X size={rs(14)} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              <TextInput
                style={s.caption}
                value={text}
                onChangeText={setText}
                placeholder="add a caption (optional)…"
                placeholderTextColor={T.textMute}
                multiline
                maxLength={MAX_CHARS}
              />
            </View>
          )}

          {/* Dangerous edge warning — spec section 10 */}
          {edge && (
            <View style={s.edgeWarn}>
              <AlertTriangle size={rs(14)} color={T.warn} />
              <View style={{ flex: 1 }}>
                {edge === 'long' ? (
                  <Text style={s.edgeWarnText}>
                    Long confession. Cards read better when a thought breaks itself — consider tease mode.
                  </Text>
                ) : (
                  <>
                    <Text style={s.edgeWarnTitle}>
                      This could change something between you.
                    </Text>
                    <Text style={s.edgeWarnText}>
                      You can't undo this once it's sent.
                    </Text>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Theme picker */}
          <Text style={s.sectionLabel}>Theme</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.themeScroll}
            keyboardShouldPersistTaps="handled"
          >
            {TIER_1_THEMES.map((t) => (
              <ThemeSwatch
                key={t.id}
                themeId={t.id}
                theme={t}
                active={theme === t.id}
                locked={false}
                onPress={() => handleSelectTheme(t.id)}
              />
            ))}
            {TIER_2_THEMES.map((t) => (
              <ThemeSwatch
                key={t.id}
                themeId={t.id}
                theme={t}
                active={theme === t.id}
                locked={!tier2Unlocked}
                onPress={() => handleSelectTheme(t.id)}
              />
            ))}
          </ScrollView>

          {/* Mood picker */}
          <Text style={s.sectionLabel}>Mood</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.moodScroll}
            keyboardShouldPersistTaps="handled"
          >
            {MOOD_TAGS.map((tag) => (
              <MoodChip
                key={tag}
                tag={tag}
                active={moodTag === tag}
                onPress={() => setMoodTag(tag)}
              />
            ))}
          </ScrollView>

          {/* Category picker */}
          <Text style={s.sectionLabel}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.moodScroll}
            keyboardShouldPersistTaps="handled"
          >
            {CATEGORIES.map(({ id, label, emoji }) => (
              <MoodChip
                key={id}
                tag={`${emoji}  ${label}`}
                active={category === id}
                onPress={() => setCategory(id)}
              />
            ))}
          </ScrollView>

          {/* Intensity (section 11) */}
          <Text style={s.sectionLabel}>How heavy is it?</Text>
          <View style={s.intensityRow}>
            {INTENSITY_LEVELS.map(({ id, label, sub }) => {
              const active = intensity === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[s.intensityBtn, active && s.intensityBtnActive]}
                  onPress={() => setIntensity(id)}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={[s.intensityLabel, active && s.intensityLabelActive]}>
                    {label}
                  </Text>
                  <Text style={s.intensitySub}>{sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tag someone — optional, drop still hits marketplace too */}
          <TagUserSection
            taggedUser={taggedUser}
            onTag={setTaggedUser}
            onClear={() => setTaggedUser(null)}
          />

          {/* One-word hint — only when someone is tagged */}
          {!!taggedUser && (
            <View style={s.hintBox}>
              <Text style={s.hintTitle}>
                One word that points to you.
              </Text>
              <Text style={s.hintSub}>
                They might recognize it. Or they won't. That's the whole thing.
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

          {/* Anonixx Publisher opt-in (section 16) — Tier 2 is never published */}
          {themeObj?.tier !== 2 && (
            <View style={s.publisherBox}>
              <Text style={s.publisherQ}>
                Allow Anonixx to share this confession anonymously on our social pages?
              </Text>
              <View style={s.publisherRow}>
                <TouchableOpacity
                  style={[s.publisherBtn, publisherOptIn && s.publisherBtnYesActive]}
                  onPress={handlePublisherYes}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={[
                    s.publisherBtnText,
                    publisherOptIn && s.publisherBtnYesActiveText,
                  ]}>
                    {publisherOptIn ? 'Yes — confirmed' : 'Yes'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.publisherBtn, !publisherOptIn && s.publisherBtnNoActive]}
                  onPress={() => setPublisherOptIn(false)}
                  activeOpacity={0.85}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={[
                    s.publisherBtnText,
                    !publisherOptIn && s.publisherBtnNoActiveText,
                  ]}>
                    No — keep private
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={s.publisherNote}>
                Your identity never leaves Anonixx.
              </Text>
            </View>
          )}
          {themeObj?.tier === 2 && (
            <View style={s.publisherBox}>
              <Text style={s.publisherLocked}>
                After Dark drops stay inside Anonixx. Never published, never shared.
              </Text>
            </View>
          )}

          {/* AI text refinement — text drops only */}
          {format === 'text' && !!text.trim() && (
            <View style={s.refineBox}>
              <TouchableOpacity
                style={s.refineToggleRow}
                onPress={() => {
                  const next = !refineEnabled;
                  setRefineEnabled(next);
                  if (!next) { setRefinedText(''); setShowRefinePreview(false); }
                }}
                activeOpacity={0.8}
                hitSlop={HIT_SLOP}
              >
                <Sparkles size={rs(14)} color={refineEnabled ? T.primary : T.textMute} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.refineToggleLabel, refineEnabled && { color: T.primary }]}>
                    Polish my words
                  </Text>
                  <Text style={s.refineToggleSub}>
                    Let Anonixx refine the wording — your meaning stays intact
                  </Text>
                </View>
                <View style={[s.refineToggleDot, refineEnabled && s.refineToggleDotOn]} />
              </TouchableOpacity>

              {/* Preview the refined version */}
              {refineEnabled && !showRefinePreview && (
                <TouchableOpacity
                  style={s.refinePreviewBtn}
                  onPress={handleRefineText}
                  disabled={refining}
                  activeOpacity={0.85}
                >
                  {refining
                    ? <ActivityIndicator size="small" color={T.primary} />
                    : <Text style={s.refinePreviewBtnText}>Preview refined version</Text>
                  }
                </TouchableOpacity>
              )}

              {showRefinePreview && !!refinedText && (
                <View style={s.refinePreviewWrap}>
                  <Text style={s.refinePreviewLabel}>REFINED VERSION</Text>
                  <Text style={s.refinePreviewText}>"{refinedText}"</Text>
                  <View style={s.refinePreviewActions}>
                    <TouchableOpacity
                      style={[s.refineChoiceBtn, s.refineChoicePrimary]}
                      onPress={() => setShowRefinePreview(false)}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={s.refineChoicePrimaryText}>Use this ✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.refineChoiceBtn}
                      onPress={() => { setRefinedText(''); setShowRefinePreview(false); setRefineEnabled(false); }}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={s.refineChoiceGhostText}>Keep mine</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

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
                {limitHit ? 'Daily limit reached' : 'Drop it  ↗'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Delivery-tension sublabel (section 6) */}
          {sending && (
            <Text style={s.deliveryTension}>
              Anonixx is sealing something for them.
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
  headerAction: { fontSize: FONT.sm, color: T.primary, fontWeight: '600' },

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
    borderRadius:      RADIUS.lg,
    paddingHorizontal: rp(16),
    paddingVertical:   rp(14),
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

  // Text input
  inputWrap: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    padding:         rp(14),
    marginBottom:    SPACING.md,
  },
  input: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(17),
    color:         T.text,
    lineHeight:    rf(26),
    minHeight:     rs(80),
    letterSpacing: 0.3,
    paddingVertical: 0,
  },
  inputMeta: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginTop:      rp(8),
  },
  teaseToggle: {
    paddingVertical:   rp(4),
    paddingHorizontal: rp(6),
  },
  teaseToggleActive: {},
  teaseToggleText: {
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.3,
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
  caption: {
    fontFamily:      'DMSans-Regular',
    fontSize:        FONT.sm,
    color:           T.text,
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    padding:         rp(12),
    minHeight:       rs(56),
    textAlignVertical: 'top',
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
    paddingHorizontal: rp(12),
    paddingVertical:   rp(10),
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
    marginBottom:  rp(10),
    marginTop:     SPACING.sm,
  },

  // Theme picker
  themeScroll: {
    gap:            SPACING.sm,
    paddingRight:   SPACING.md,
    paddingVertical: rp(4),
    marginBottom:   SPACING.md,
  },
  swatch: {
    width:       rs(64),
    alignItems:  'center',
    gap:         rp(6),
  },
  swatchActive: {},
  swatchFill: {
    width:        rs(64),
    height:       rs(64),
    borderRadius: RADIUS.md,
    overflow:     'hidden',
    position:     'relative',
  },
  swatchAccent: {
    position:      'absolute',
    bottom:        rp(8),
    left:          rp(8),
    width:         rs(3),
    height:        rs(18),
    borderRadius:  rs(2),
    opacity:       0.9,
  },
  swatchLock: {
    ...StyleSheet.absoluteFillObject,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  swatchLabel: {
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.3,
  },

  // Mood picker
  moodScroll: {
    gap:             SPACING.sm,
    paddingRight:    SPACING.md,
    paddingVertical: rp(2),
    marginBottom:    SPACING.md,
  },
  moodChip: {
    paddingHorizontal: rp(14),
    paddingVertical:   rp(7),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'rgba(255,255,255,0.02)',
  },
  moodChipActive: {
    borderColor:     'rgba(255,99,74,0.4)',
    backgroundColor: 'rgba(255,99,74,0.08)',
  },
  moodChipText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 2,
  },
  moodChipTextActive: { color: T.primary },

  // Intensity (section 11)
  intensityRow: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginBottom:  SPACING.md,
  },
  intensityBtn: {
    flex:              1,
    paddingHorizontal: rp(10),
    paddingVertical:   rp(10),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   'transparent',
    alignItems:        'center',
  },
  intensityBtnActive: {
    borderColor:     'rgba(255,99,74,0.4)',
    backgroundColor: 'rgba(255,99,74,0.06)',
  },
  intensityLabel: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(14),
    color:         T.textSec,
    letterSpacing: 0.3,
  },
  intensityLabelActive: { color: T.primary },
  intensitySub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(10),
    color:         T.textMute,
    letterSpacing: 0.3,
    marginTop:     rp(4),
    textAlign:     'center',
  },

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

  // ─── AI Refine ─────────────────────────────────────────────────
  refineBox: {
    backgroundColor:   'rgba(255,255,255,0.02)',
    borderColor:       T.border,
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    marginBottom:      SPACING.md,
    gap:               rp(12),
  },
  refineToggleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(10),
  },
  refineToggleLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.3,
  },
  refineToggleSub: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.3,
    marginTop:     rp(2),
  },
  refineToggleDot: {
    width:           rs(18),
    height:          rs(10),
    borderRadius:    rs(5),
    backgroundColor: T.border,
  },
  refineToggleDotOn: {
    backgroundColor: T.primary,
  },
  refinePreviewBtn: {
    alignItems:        'center',
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.sm,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.3)',
    backgroundColor:   'rgba(255,99,74,0.06)',
  },
  refinePreviewBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.primary,
    letterSpacing: 0.5,
  },
  refinePreviewWrap: {
    gap: rp(8),
  },
  refinePreviewLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(9),
    color:         T.primary,
    letterSpacing: 2.5,
  },
  refinePreviewText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(15),
    color:         T.text,
    lineHeight:    rf(23),
    letterSpacing: 0.3,
  },
  refinePreviewActions: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginTop:     rp(4),
  },
  refineChoiceBtn: {
    paddingHorizontal: rp(16),
    paddingVertical:   rp(8),
    borderRadius:      RADIUS.full,
    borderWidth:       1,
    borderColor:       T.border,
  },
  refineChoicePrimary: {
    borderColor:     T.primary,
    backgroundColor: 'rgba(255,99,74,0.12)',
  },
  refineChoicePrimaryText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.sm,
    color:         T.primary,
    letterSpacing: 0.5,
  },
  refineChoiceGhostText: {
    fontFamily:    'DMSans-Regular',
    fontSize:      FONT.sm,
    color:         T.textSec,
    letterSpacing: 0.3,
  },
});
