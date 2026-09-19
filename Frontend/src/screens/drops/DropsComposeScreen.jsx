/**
 * DropsComposeScreen.jsx
 *
 * The compose surface for Anonixx Drops.
 * Text is typed directly on the live card. Everything else — confession
 * type, media, tagging, location, voice, poll, publisher sharing — lives
 * behind a single row of icons under the card. Tapping one opens a small
 * bottom sheet for that one thing, then gets out of the way; nothing sits
 * permanently expanded on the page. The goal is that the screen always
 * reads as "write, then Drop" — every option is one tap away, but none
 * of them are in the way until asked for.
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
  Platform, ScrollView, Animated, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useDispatch, useSelector } from 'react-redux';
import {
  ChevronLeft, Images, BarChart2, Mic, AlertTriangle, X,
  MapPin, UserPlus, Sparkles, Share2, Shuffle,
} from 'lucide-react-native';
import TagUserSection from '../../components/drops/TagUserSection';
import LocationField from '../../components/drops/LocationField';

import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone, fetchBalance } from '../../store/slices/coinsSlice';
import { uploadToR2 } from '../../utils/upload';

import DropCardRenderer, {
  CARD_INTENTS, CARD_INTENT_LIST, CardPattern, DROP_THEMES,
} from '../../components/drops/DropCardRenderer';
import T from '../../utils/theme';

const SCREEN_W = Dimensions.get('window').width;

// The compose card always renders in the 'desire' theme (see `theme`
// below) — the toolbar merged onto its bottom edge uses that same theme's
// darker gradient stop as its own background instead of the generic app
// surface color, so it reads as the card's own footer rather than a
// mismatched panel bolted underneath it.
const TOOLBAR_BG = DROP_THEMES['desire'].bgTo;
const CARD_W   = SCREEN_W - SPACING.md * 2;
const MAX_CHARS = 500;

// Short confessional clips, not long-form video — a duration cap keeps
// storage/bandwidth costs sane and sidesteps needing a real on-device
// trim (no server-side cutting once media lives on R2, not Cloudinary).
const MAX_VIDEO_SECONDS = 60;

const DRAFT_KEY = 'anonixx.drops.draft.v1';
const TOOLBAR_HINT_KEY = 'anonixx.drops.toolbarHint.seen';

// Must match DROP_POST_COST in Backend/app/api/v1/drops.py
const POST_COST = 10;

const DEFAULT_INTENT = 'skeleton-in-the-closet';
const HINT_MAX = 16;

// ─── Per-intent opening lines ────────────────────────────────────
// These only ever appear as the card's placeholder — the same mechanism
// "Ask and you shall be given" already used, just written to match each
// intent's own register instead of one generic line. Never inserted into
// the text itself: they vanish the instant someone types, nothing about
// a finished drop shows it started from a prompt, and the dangerous-edge
// detector / coin-cost check / everything else runs on whatever the user
// actually wrote, same as always. A shuffle button (top-right of the
// card, visible only while the field is empty) cycles to another line
// for the current intent so repeat visits don't always see the same one.
const INTENT_PROMPTS = {
  'meet-me': [
    'I keep hoping the right person reads this—',
    "If you're out there and tired of games too—",
    'I want someone who actually stays. Here\'s why—',
    'Nobody\'s asked what I really want in a long time—',
  ],
  'skeleton-in-the-closet': [
    'I\'ve never told anyone this—',
    'Something I\'ve been carrying alone—',
    'If you knew this about me—',
    'The thing I think about at 3am—',
  ],
  'just-tonight': [
    'Tonight I don\'t want to think, I just want—',
    'No names, no promises, just—',
    'I\'m free tonight and I want—',
    'Something impulsive I can\'t stop thinking about—',
  ],
  'the-exchange': [
    'Looking for someone discreet who\'s open to—',
    'I can make it worth your while—',
    'What I\'m offering, and what I need in return—',
    'Discreet arrangement, no complications—',
  ],
};
const FALLBACK_PLACEHOLDER = 'Ask and you shall be given';

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

// ─── Confession type tile — used inside the "Confession Type" sheet.
// Each tile renders the intent's *actual* gradient and background texture
// in miniature, so picking one is a "does this look like me" decision
// against the real thing — not an icon standing in for it. ─────────
const INTENT_TILE = rs(64);

// Stable per-intent seed — the card seeds its texture off the confession
// text, but a tile has no text, so it hashes its own id instead. Keeps each
// tile's pattern fixed rather than reshuffling on every render.
const intentSeed = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
};

const IntentCard = React.memo(function IntentCard({ def, active, onPress }) {
  return (
    <TouchableOpacity
      style={s.intentCard}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={[def.bgFrom, def.bgTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.intentCardFill, {
          borderColor: active ? def.accent + '66' : 'transparent',
        }]}
      >
        <CardPattern
          type={def.pattern}
          width={INTENT_TILE}
          height={INTENT_TILE}
          color={def.accent}
          seed={intentSeed(def.id)}
        />
      </LinearGradient>
      <Text style={[s.intentCardLabel, active && { color: def.accent }]}>
        {def.label}
      </Text>
      {!!def.sublabel && (
        <Text style={s.intentCardSubLabel}>{def.sublabel}</Text>
      )}
    </TouchableOpacity>
  );
});

// ─── Toolbar icon — the row under the card. A small dot marks anything
// that's actually set, so state never gets silently buried behind an icon. ─
// A bare icon reads fine to someone who already knows the app — it reads
// like a guess to everyone else. The label under each one is what makes
// the row understandable on first look, no trial-and-error required.
const ToolIcon = React.memo(function ToolIcon({ children, active, onPress, label, a11yLabel }) {
  return (
    <TouchableOpacity
      style={s.toolIcon}
      onPress={onPress}
      hitSlop={HIT_SLOP}
      activeOpacity={0.7}
      accessibilityLabel={a11yLabel || label}
    >
      <View style={s.toolIconGlyph}>
        {children}
        {active && <View style={s.toolIconDot} />}
      </View>
      <Text style={s.toolIconLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
});

// ─── One shared bottom sheet — swaps its content by `sheet` id instead of
// mounting four separate modals. Slides up, taps outside close it. ────────
function OptionSheet({ visible, title, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheetContainer, { paddingBottom: insets.bottom + SPACING.md }]}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP}>
              <X size={rs(20)} color={T.textMute} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ───────────────────────────────────────────────
export default function DropsComposeScreen({ navigation, route }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const { isAuthenticated } = useAuth();
  const coinBalance = useSelector((state) => state.coins.balance);

  // Fresh balance so the cost line below isn't showing stale/zero numbers —
  // same per-screen pattern used by PostUnlockScreen/MarketItemScreen.
  useEffect(() => {
    dispatch(fetchBalance());
  }, [dispatch]);

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
  const [cardIntent, setCardIntent] = useState(DEFAULT_INTENT);
  // After Dark / Tier-2 themes have been removed — every drop uses the
  // single remaining theme. External social publishing is gated purely by
  // the "Share to Anonixx socials" toggle below, not by confession type.
  const theme = 'desire';
  // Mood tag (the "· longing ·" line on the card) is derived the same way —
  // each confession type has its own emotional register, so the tag should
  // shift with it instead of sitting on one word regardless of what's picked.
  const moodTag = CARD_INTENTS[cardIntent]?.moodTag || 'longing';
  // Which opening line from INTENT_PROMPTS[cardIntent] is showing —
  // starts random per intent so two people opening compose don't see the
  // exact same line every time, and cycles forward on shuffle-tap.
  const [promptIndex, setPromptIndex] = useState(() => Math.floor(Math.random() * 4));
  const [mediaUri, setMediaUri] = useState(null);
  const [mediaKind, setMediaKind] = useState(null); // 'image' | 'video' — set from the picked asset
  const [loading,  setLoading]  = useState(false);

  // ── Tag a specific user (optional — drop still hits marketplace) ─
  const [taggedUser, setTaggedUser] = useState(null);

  // ── Publisher opt-in (section 16) ─────────────────────────────
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

  // ── Which bottom sheet is open — null | 'intent' | 'tag' | 'location' | 'more' ──
  const [activeSheet, setActiveSheet] = useState(null);
  const closeSheet = useCallback(() => setActiveSheet(null), []);

  // ── One-time toolbar hint — the icon row has no explainer text on the
  // page itself, so first-time visitors get a single dismissible line
  // pointing at it instead. Shown once ever, then never again. ─────────
  const [showToolbarHint, setShowToolbarHint] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(TOOLBAR_HINT_KEY);
        if (!seen) setShowToolbarHint(true);
      } catch { /* storage unavailable — just skip the hint */ }
    })();
  }, []);
  const dismissToolbarHint = useCallback(() => {
    setShowToolbarHint(false);
    AsyncStorage.setItem(TOOLBAR_HINT_KEY, '1').catch(() => {});
  }, []);

  // Fresh opening line whenever the confession type changes, so switching
  // intents doesn't leave an index pointing at a line from a differently-
  // toned prompt list.
  useEffect(() => {
    setPromptIndex(Math.floor(Math.random() * 4));
  }, [cardIntent]);

  const handleShufflePrompt = useCallback(() => {
    setPromptIndex((i) => i + 1);
  }, []);

  // ── Entrance animation ────────────────────────────────────────
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1, duration: 320, useNativeDriver: true,
    }).start();
  }, [fade]);

  // ── Load draft on mount ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const draftRaw = await AsyncStorage.getItem(DRAFT_KEY);

        if (draftRaw) {
          try {
            const d = JSON.parse(draftRaw);
            if (d && typeof d === 'object') {
              const hasContent =
                (typeof d.text === 'string' && d.text.trim().length > 0);
              if (typeof d.text     === 'string') setText(d.text);
              if (typeof d.format   === 'string') setFormat(d.format);
              if (typeof d.cardIntent === 'string' && CARD_INTENT_LIST.some(c => c.id === d.cardIntent)) setCardIntent(d.cardIntent);
              if (typeof d.intensity=== 'string') setIntensity(d.intensity);
              if (typeof d.hint     === 'string') setHint(d.hint);
              // Only surface the unsent banner if the restored draft has substance.
              if (hasContent) setShowUnsentBanner(true);
            }
          } catch { /* corrupt draft — ignore */ }
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
        text, format, cardIntent, intensity, hint,
      })).catch(() => {});
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [text, format, cardIntent, intensity, hint]);

  // ── Edge detection ────────────────────────────────────────────
  const edge = useMemo(() => detectEdge(text), [text]);

  // ── Format change — media is independent of format now, so it's never
  // cleared here. Voice and Poll both hand off to their own dedicated
  // screen, same pattern for both ─
  const handleFormatChange = useCallback((f) => {
    setFormat(f);
    if (f === 'voice') {
      navigation.navigate?.('DropsRecord', {
        theme, cardIntent, moodTag, text,
        target_user_id: taggedUser?.id || undefined,
      });
    }
    if (f === 'poll') {
      navigation.navigate?.('DropsPoll', {
        theme, cardIntent, moodTag, text,
        target_user_id: taggedUser?.id || undefined,
      });
    }
  }, [navigation, theme, moodTag, text, taggedUser]);

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
      // Library picks aren't length-limited by the OS the way camera
      // recording is (ImagePicker's videoMaxDuration only constrains
      // launchCameraAsync) — so an existing long video has to be rejected
      // here, after the fact, instead of prevented at pick time.
      if (kind === 'video' && (asset.duration || 0) / 1000 > MAX_VIDEO_SECONDS) {
        showToast({ type: 'warning', message: `Videos must be ${MAX_VIDEO_SECONDS}s or shorter.` });
        return;
      }
      setMediaUri(asset.uri);
      setMediaKind(kind);
    } catch {
      showToast({ type: 'error', message: 'Could not open gallery.' });
    }
  }, [showToast]);

  const handleClearMedia = useCallback(() => {
    setMediaUri(null);
    setMediaKind(null);
  }, []);

  // ── Discard draft ─────────────────────────────────────────────
  const handleDiscardDraft = useCallback(async () => {
    setText('');
    setMediaUri(null);
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
    if (!text.trim() && !mediaUri) {
      showToast({ type: 'warning', message: 'Write something or add a photo first.' });
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');

      // Upload the picked photo/video to R2 first — without this,
      // media_url never reaches the server and the drop silently posts
      // as text-only.
      let uploadedMediaUrl = null;
      if (mediaKind && mediaUri) {
        const isVideo = mediaKind === 'video';
        const mime = isVideo ? (Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4') : 'image/jpeg';
        uploadedMediaUrl = await uploadToR2(mediaUri, mediaKind, mime);
      }

      // Single-word hint — strip spaces, keep lowercase, cap at HINT_MAX.
      const hintClean = (hint || '')
        .trim()
        .split(/\s+/)[0]
        .slice(0, HINT_MAX)
        .toLowerCase();

      const confessionText = text.trim();

      const body = {
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
        ...(mediaKind && mediaUri ? { media_type: mediaKind, media_url: uploadedMediaUrl } : {}),
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

      if (res.status === 402) {
        const err = await res.json().catch(() => ({}));
        showToast({
          type:    'warning',
          title:   'Not enough coins',
          message: err?.detail || `Posting a drop costs ${POST_COST} coins.`,
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
      setLoading(false);
    }
  }, [
    format, text, mediaUri, mediaKind, theme, cardIntent, moodTag,
    intensity, hint, taggedUser, publisherOptIn,
    locationCountry, locationCounty, locationSubCounty, locationEstate, fontStyle,
    dispatch, navigation, showToast,
  ]);

  // ── Derived ───────────────────────────────────────────────────
  const canDrop       = !!text.trim() || !!mediaUri;
  const layoutMode    = 'split';
  const remaining     = MAX_CHARS - text.length;
  const remColor      = remaining <= 20
    ? (remaining <= 0 ? T.danger : T.warn) : T.textMute;
  const locationSummary = [locationEstate, locationSubCounty, locationCounty, locationCountry]
    .map((v) => v.trim()).find(Boolean) || null;
  const intentPrompts = INTENT_PROMPTS[cardIntent] || null;
  const placeholder = intentPrompts ? intentPrompts[promptIndex % intentPrompts.length] : FALLBACK_PLACEHOLDER;

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

        {/* Cost — shown up front, not just on the send button, so nobody
            writes a whole confession before discovering they can't afford
            to send it (that used to only surface as a 402 error on tap). */}
        <View style={s.costStrip}>
          <Text style={s.costStripText}>{POST_COST} coins to send</Text>
          <View style={s.costStripRight}>
            <Text style={[s.costStripBalance, coinBalance < POST_COST && s.costStripBalanceLow]}>
              Balance: {coinBalance}
            </Text>
            {coinBalance < POST_COST && (
              <TouchableOpacity onPress={() => navigation.navigate('Coins')} hitSlop={HIT_SLOP}>
                <Text style={s.costStripLink}>Top up</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

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

          {/* Guiding line above the card — tells a first-time (or just
              blank-page-staring) user what's expected before they start
              typing. Fades out once they've actually started writing, so
              it doesn't linger as clutter once the card speaks for itself. */}
          {!text && (
            <Text style={s.composeGuide}>
              Say what you can't say out loud — nobody will know it's you.
            </Text>
          )}

          {/* One-time hint — the icon row is part of the card itself now,
              with no explainer text of its own, so first-time visitors get
              pointed at it once. Taps anywhere on it (or on any icon below)
              dismiss it for good. */}
          {showToolbarHint && (
            <TouchableOpacity style={s.hintBubble} onPress={dismissToolbarHint} activeOpacity={0.85}>
              <Text style={s.hintBubbleText}>
                Tap an icon on the card below to add a photo, set your mood, tag someone & more.
              </Text>
              <X size={rs(12)} color={T.textMute} />
            </TouchableOpacity>
          )}

          {/* Live card preview — type directly into the card itself, no
              separate input box duplicating what it shows. The toolbar
              is attached flush to the bottom, inside the same rounded,
              clipped container, so the whole thing reads as one card —
              confession zone on top, controls zone on the bottom — not a
              card with a separate floating button-bar underneath it. */}
          <Animated.View style={[s.cardWrap, { opacity: fade }]}>
            <DropCardRenderer
              confession={text}
              moodTag={moodTag}
              theme={theme}
              // Compose card intentionally ignores cardIntent for its own
              // look — picking a theme tags the drop (colors/search) but
              // shouldn't make the typing surface jump palettes underneath
              // you. `theme` above ('desire') is the one constant look;
              // the feed still renders each posted drop in its real
              // intent colors via DropCard/DropCardRenderer elsewhere.
              intent={null}
              mediaUrl={mediaUri}
              mediaType={mediaKind || 'image'}
              layoutMode={layoutMode}
              cardWidth={CARD_W}
              seed={text || format}
              editable
              onChangeText={setText}
              placeholder={placeholder}
              maxLength={MAX_CHARS}
              fontStyle={fontStyle}
              // The toolbar sits flush against this card's bottom edge
              // inside the same clipped container — square its bottom
              // corners so there's no gap/seam between the two.
              flushBottom
            />

            {/* Shuffle to another opening line — only while the card is
                still showing its placeholder (matches the same !text
                condition the placeholder itself renders under), so it
                disappears the moment someone starts writing their own
                words instead of sitting there as leftover chrome. */}
            {!text && !!intentPrompts && (
              <TouchableOpacity
                style={s.shuffleBtn}
                onPress={handleShufflePrompt}
                hitSlop={HIT_SLOP}
                activeOpacity={0.75}
                accessibilityLabel="Try another opening line"
              >
                <Shuffle size={rs(14)} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
            )}

            {/* Toolbar — every optional extra lives here as one labeled
                icon each. A dot marks anything already set. This replaces
                the old always-open Format row, Confession Type section,
                Details accordion and Location chip — same features, one
                row, now built into the card instead of floating below it. */}
            <View style={s.toolbar}>
            <ToolIcon
              active={!!mediaUri}
              onPress={() => { dismissToolbarHint(); mediaUri ? handleClearMedia() : handlePickMedia(); }}
              label={mediaUri ? 'Remove' : 'Photo'}
              a11yLabel={mediaUri ? 'Remove media' : 'Add photo or video'}
            >
              {mediaUri
                ? <X size={rs(18)} color={T.primary} />
                : <Images size={rs(18)} color={T.textMute} />}
            </ToolIcon>

            <ToolIcon
              onPress={() => { dismissToolbarHint(); setActiveSheet('intent'); }}
              label="Mood"
              a11yLabel="Confession type — sets the card's color and category"
            >
              <Sparkles size={rs(18)} color={CARD_INTENTS[cardIntent]?.accent || T.primary} />
            </ToolIcon>

            <ToolIcon
              active={!!taggedUser}
              onPress={() => { dismissToolbarHint(); setActiveSheet('tag'); }}
              label="Tag"
              a11yLabel="Tag someone — they get it anonymously too"
            >
              <UserPlus size={rs(18)} color={taggedUser ? T.primary : T.textMute} />
            </ToolIcon>

            <ToolIcon
              active={!!locationSummary}
              onPress={() => { dismissToolbarHint(); setActiveSheet('location'); }}
              label="Place"
              a11yLabel="Location — nearby people find it faster"
            >
              <MapPin size={rs(18)} color={locationSummary ? T.primary : T.textMute} />
            </ToolIcon>

            <ToolIcon
              onPress={() => { dismissToolbarHint(); handleFormatChange('voice'); }}
              label="Voice"
              a11yLabel="Record a voice drop instead"
            >
              <Mic size={rs(18)} color={T.textMute} />
            </ToolIcon>

            <ToolIcon
              onPress={() => { dismissToolbarHint(); handleFormatChange('poll'); }}
              label="Poll"
              a11yLabel="Make this a poll instead"
            >
              <BarChart2 size={rs(18)} color={T.textMute} />
            </ToolIcon>

            <ToolIcon
              active={!publisherOptIn}
              onPress={() => { dismissToolbarHint(); setActiveSheet('more'); }}
              label="Share"
              a11yLabel="Share to Anonixx socials — on by default, anonymous"
            >
              <Share2 size={rs(18)} color={T.textMute} />
            </ToolIcon>
            </View>
          </Animated.View>

          {/* Character count, text format only */}
          {format === 'text' && (
            <View style={s.cardMetaRow}>
              <Text style={[s.remaining, { color: remColor }]}>{remaining}</Text>
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

          {/* Drop button */}
          <TouchableOpacity
            style={[s.dropBtn, (!canDrop || loading) && s.dropBtnDisabled]}
            onPress={handleDrop}
            disabled={!canDrop || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.dropBtnText}>Drop it — {POST_COST} coins  ↗</Text>
            )}
          </TouchableOpacity>

          <Text style={s.footerNote}>
            Your identity stays hidden. Always.
          </Text>
        </ScrollView>

        {/* ── Confession Type sheet ── */}
        <OptionSheet visible={activeSheet === 'intent'} title="Confession Type" onClose={closeSheet}>
          <Text style={s.sectionSubLabel}>
            You want it. They want it. Drop it, get found.
          </Text>
          <View style={s.intentGrid}>
            {CARD_INTENT_LIST.map((def) => (
              <IntentCard
                key={def.id}
                def={def}
                active={cardIntent === def.id}
                onPress={() => { setCardIntent(def.id); closeSheet(); }}
              />
            ))}
          </View>
        </OptionSheet>

        {/* ── Tag someone sheet ── */}
        <OptionSheet visible={activeSheet === 'tag'} title="Tag Someone" onClose={closeSheet}>
          <TagUserSection
            taggedUser={taggedUser}
            onTag={setTaggedUser}
            onClear={() => setTaggedUser(null)}
          />
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
        </OptionSheet>

        {/* ── Location sheet ── */}
        <OptionSheet visible={activeSheet === 'location'} title="Location" onClose={closeSheet}>
          <Text style={s.sectionSubLabel}>
            Nearby people find your drop faster. Totally optional.
          </Text>
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
        </OptionSheet>

        {/* ── Share sheet — publisher opt-in only, for now ── */}
        <OptionSheet visible={activeSheet === 'more'} title="Share to Socials" onClose={closeSheet}>
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
        </OptionSheet>
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

  // Cost strip — persistent, not just on the send button
  costStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(8),
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  costStripText: {
    fontFamily:    'DMSans-SemiBold',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.3,
  },
  costStripRight: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  costStripBalance: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(11),
    color:         T.textMute,
    letterSpacing: 0.2,
  },
  costStripBalanceLow: { color: T.warn, fontFamily: 'DMSans-Bold' },
  costStripLink: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.primary,
    letterSpacing: 0.3,
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

  // Guiding line above the card
  composeGuide: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(14),
    color:         T.textSec,
    lineHeight:    rf(20),
    letterSpacing: 0.2,
    marginBottom:  SPACING.sm,
  },

  // Card preview — the toolbar renders as its second child (see JSX), and
  // this container's own rounded corners + overflow:hidden are what make
  // the icon row read as the card's own footer instead of a separate box
  // floating under it. No alignItems override: default 'stretch' means
  // the toolbar fills the exact same width as the card above it.
  cardWrap: {
    borderRadius: rs(16),
    overflow:     'hidden',
    marginBottom: SPACING.md,
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: rs(12) },
    shadowOpacity:0.4,
    shadowRadius: rs(28),
    elevation:    10,
  },
  shuffleBtn: {
    position:        'absolute',
    top:             rp(12),
    right:           rp(12),
    width:           rs(32),
    height:          rs(32),
    borderRadius:    rs(16),
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Text meta row — sits under the card now that typing happens on it directly
  cardMetaRow: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    alignItems:     'center',
    marginBottom:   SPACING.sm,
  },
  remaining: { fontSize: rf(12), fontWeight: '600' },

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

  // One-time toolbar hint bubble
  hintBubble: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    gap:               rp(8),
    backgroundColor:   'rgba(255,99,74,0.06)',
    borderColor:       'rgba(255,99,74,0.2)',
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(12),
    paddingVertical:   rp(9),
    marginBottom:      rp(8),
  },
  hintBubbleText: {
    flex:          1,
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    lineHeight:    rf(16),
  },

  // Toolbar — one labeled icon per optional extra
  // No border/radius of its own — cardWrap's overflow:hidden + shared
  // radius does the clipping, so this reads as the card's own footer.
  toolbar: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    justifyContent:    'space-between',
    paddingHorizontal: rp(4),
    paddingVertical:   rp(8),
    backgroundColor:   TOOLBAR_BG,
  },
  toolIcon: {
    width:          rs(46),
    alignItems:     'center',
    justifyContent: 'center',
    gap:            rp(3),
    paddingVertical: rp(2),
  },
  toolIconGlyph: {
    width:          rs(36),
    height:         rs(36),
    borderRadius:   rs(18),
    alignItems:     'center',
    justifyContent: 'center',
  },
  toolIconDot: {
    position:        'absolute',
    top:              rs(1),
    right:            rs(3),
    width:            rs(7),
    height:           rs(7),
    borderRadius:     rs(3.5),
    backgroundColor:  T.primary,
    borderWidth:      1.5,
    borderColor:      TOOLBAR_BG,
  },
  toolIconLabel: {
    fontFamily:    'DMSans-Regular',
    fontSize:      rf(9.5),
    color:         T.textMute,
    letterSpacing: 0.2,
  },

  // Section sub-label (used inside sheets)
  sectionSubLabel: {
    fontFamily:   'DMSans-Italic',
    fontSize:     rf(12),
    color:        T.textMute,
    marginBottom: SPACING.md,
    lineHeight:   rf(17),
  },

  // Confession type grid — inside the sheet, wraps instead of scrolling
  intentGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           SPACING.sm,
    paddingBottom: SPACING.md,
  },
  intentCard: {
    width:       rs(90),
    alignItems:  'center',
  },
  intentCardFill: {
    width:              INTENT_TILE,
    height:             INTENT_TILE,
    borderRadius:       RADIUS.md,
    borderWidth:        1.5,
    alignItems:        'center',
    justifyContent:    'center',
    position:          'relative',
    overflow:          'hidden',
  },
  intentCardSubLabel: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(8.5),
    color:         T.textMute,
    textAlign:     'center',
    marginTop:     rp(2),
    lineHeight:    rf(11),
  },
  intentCardLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(10.5),
    color:         T.text,
    textAlign:     'center',
    marginTop:     rp(6),
  },

  // One-word hint (section 11)
  hintBox: {
    backgroundColor:   'rgba(255,99,74,0.04)',
    borderColor:       'rgba(255,99,74,0.18)',
    borderWidth:       1,
    borderRadius:      RADIUS.md,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
    marginTop:         SPACING.md,
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

  // Compact toggle row — publisher opt-in (inside the "More" sheet)
  toggleRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   rp(10),
    paddingHorizontal: rp(2),
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

  // ── Bottom sheet chrome ──────────────────────────────────────
  sheetBackdrop: {
    position:        'absolute',
    top:             0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    marginTop:            'auto',
    backgroundColor:      T.background,
    borderTopLeftRadius:  RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal:    SPACING.md,
    paddingTop:           SPACING.md,
    maxHeight:            '85%',
    borderWidth:          1,
    borderColor:          T.border,
    borderBottomWidth:    0,
  },
  sheetHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    marginBottom:      SPACING.md,
  },
  sheetTitle: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      FONT.lg,
    color:         T.text,
    letterSpacing: 0.3,
  },
});
