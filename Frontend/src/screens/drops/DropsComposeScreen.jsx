/** Compose a drop: type on the live card; extras (type, media, tag, location, voice, poll,
 * sharing) open from the icon row below it. The card itself is <DropCardRenderer />. */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch,
  ActivityIndicator, Dimensions, Keyboard, KeyboardAvoidingView,
  Platform, ScrollView, Animated, Modal, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useDispatch } from 'react-redux';
import {
  ChevronLeft, Images, BarChart2, Mic, AlertTriangle, X,
  MapPin, UserPlus, Sparkles, Share2, Shuffle, Send, Film, Rocket, Flame, Feather, Music,
} from 'lucide-react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useAudioPlayer } from 'expo-audio';
import VideoEditorModal from '../../components/compose/VideoEditorModal';
import { defaultEdit, isMeaningful, withoutEmptyText } from '../../utils/videoEdit';
import { streamEnabled, uploadToStream, queueDrop, STREAM_DIRECT_MAX_BYTES } from '../../utils/streamVideo';
import { countryHeader } from '../../utils/country';
import TagUserSection from '../../components/drops/TagUserSection';
import LocationField from '../../components/drops/LocationField';
import TopicPicker from '../../components/drops/TopicPicker';
import GuidedConfession, { GUIDED_SAVE_KEY } from '../../components/drops/GuidedConfession';
import { TAG_GROUPS, TOP_TAGS } from '../../config/adminTags';

import {
  rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP,
} from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone, fetchBalance } from '../../store/slices/coinsSlice';
import { uploadToR2 } from '../../utils/upload';

import DropCardRenderer, {
  CARD_INTENTS, CARD_INTENT_LIST, CardPattern, DROP_THEMES, CARD_FONT_LIST, CARD_FONT_STYLES, DEFAULT_CARD_FONT,
} from '../../components/drops/DropCardRenderer';
import T from '../../utils/theme';

const SCREEN_W = Dimensions.get('window').width;

// The toolbar uses the card theme's dark gradient stop, so it reads as the card's footer.
const TOOLBAR_BG = DROP_THEMES['desire'].bgTo;
const CARD_W   = SCREEN_W - SPACING.md * 2;
const MAX_CHARS = 500;

// Any video length can be picked; over 3 minutes the editor starts cut to 3:00.

// Admin "Spotlight" extras — same options as the website's Post Studio.
const PROMO_HOURS = [[6, '6 hours'], [24, '1 day'], [72, '3 days'], [168, '7 days']];
// Search keywords — same rules as Post Studio and the server (drops.py):
// lowercase, no '#', 30 chars, deduped, 10 max.
const MAX_TAGS = 10;
const cleanTag = (t) => t.trim().replace(/^#/, '').split(' ').filter(Boolean).join(' ').toLowerCase().slice(0, 30);
const atHour = (daysAhead, hour) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
};
// Quick "post later" picks instead of a full date picker — evenings are when the feed is busiest.
const schedulePresets = () => {
  const now = Date.now();
  const tonight = atHour(0, 21);
  return [
    ['In 1 hour', new Date(now + 3600e3)],
    ['In 3 hours', new Date(now + 3 * 3600e3)],
    tonight.getTime() > now + 15 * 60e3 ? ['Tonight 9pm', tonight] : ['Tomorrow 9pm', atHour(1, 21)],
    ['Tomorrow 8pm', atHour(1, 20)],
  ];
};
const whenLabel = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

const DRAFT_KEY = 'anonixx.drops.draft.v1';
const TOOLBAR_HINT_KEY = 'anonixx.drops.toolbarHint.seen';

// Must match DROP_POST_COST in Backend/app/api/v1/drops.py — hookups only,
// regular confessions post free.
const POST_COST = 3;

const DEFAULT_INTENT = 'skeleton-in-the-closet';
const HINT_MAX = 16;

// ─── Placeholder lines per confession type (never inserted into the text). Shuffle cycles them.
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

// ─── Words that suggest a raw confession: we check the user means it, without judging.
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

// ─── Confession type tile: a mini version of the real card look.
const INTENT_TILE = rs(64);

// Seed from the tile's id, so its pattern stays fixed.
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

// ─── Toolbar icon with a label; a dot shows when it's set.
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

// ─── Hookups use the guided flow (GuidedConfession.jsx); this screen is for regular confessions.
function KindChooser({ onPick, onBack }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} hitSlop={HIT_SLOP}>
          <ChevronLeft size={rs(24)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Drop</Text>
        <View style={{ width: rs(24) }} />
      </View>
      <View style={s.kindWrap}>
        <Text style={s.kindTitle}>What are you dropping tonight?</Text>
        <Text style={s.kindLead}>Either way, nobody sees who you are.</Text>
        <TouchableOpacity style={s.kindCard} activeOpacity={0.85} onPress={() => onPick('hookup')}>
          <View style={s.kindIcon}><Flame size={rs(20)} color={T.primary} /></View>
          <View style={{ flex: 1, gap: rp(4) }}>
            <Text style={s.kindCardTitle}>Hookup</Text>
            <Text style={s.kindCardSub}>Say who you are and who you want. If someone wants you back, they ask to link up.</Text>
            <View style={s.kindTags}>
              <Text style={s.kindTag}>18+</Text>
              <Text style={s.kindTag}>{POST_COST} coins</Text>
              <Text style={s.kindTag}>Link up on</Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={s.kindCard} activeOpacity={0.85} onPress={() => onPick('confession')}>
          <View style={s.kindIcon}><Feather size={rs(20)} color={T.primary} /></View>
          <View style={{ flex: 1, gap: rp(4) }}>
            <Text style={s.kindCardTitle}>Confession</Text>
            <Text style={s.kindCardSub}>The thing you can't say out loud. Read, felt, never traced back to you.</Text>
            <View style={s.kindTags}>
              <Text style={s.kindTag}>Free</Text>
              <Text style={s.kindTag}>Text, photo, video or voice</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Main screen ───────────────────────────────────────────────
export default function DropsComposeScreen({ navigation, route }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = !!user?.is_admin;

  // Fresh balance so the cost line below isn't showing stale/zero numbers —
  // same per-screen pattern used by PostUnlockScreen/MarketItemScreen.
  useEffect(() => {
    dispatch(fetchBalance());
  }, [dispatch]);

  // Guests go to Login.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        navigation.navigate('AuthNav', { screen: 'Login' });
      }
    }, [isAuthenticated, navigation])
  );

  // ── Pre-filled text and source post when opened from a feed card.
  const initialText      = route?.params?.initialText      || '';
  const inspiredByPostId = route?.params?.inspiredByPostId || null;

  // ── Core state ────────────────────────────────────────────────
  const [format,   setFormat]   = useState('text');    // text | image | video | voice
  const [text,     setText]     = useState(initialText);
  const [cardIntent, setCardIntent] = useState(DEFAULT_INTENT);
  const [kind, setKind] = useState(null); // null (choosing) | 'hookup' | 'confession'
  // One theme for every drop. Sharing to socials is the toggle below.
  const theme = 'desire';
  // Mood tag follows the confession type.
  const moodTag = CARD_INTENTS[cardIntent]?.moodTag || 'longing';
  // Which placeholder line is showing (random start, shuffle moves on).
  const [promptIndex, setPromptIndex] = useState(() => Math.floor(Math.random() * 4));
  const [mediaUri, setMediaUri] = useState(null);
  const [mediaKind, setMediaKind] = useState(null); // 'image' | 'video' — set from the picked asset
  // Extra photos; with mediaUri they become the drop's `images`.
  const [extraImageUris, setExtraImageUris] = useState([]);
  const [loading,  setLoading]  = useState(false);

  // ── Video editing (admin) — trim window, text overlays, cover frame ──
  const [videoMeta, setVideoMeta] = useState(null);   // { duration (s), size (bytes), landscape }
  const [videoEdit, setVideoEdit] = useState(null);
  const [coverAt, setCoverAt] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // ── Spotlight (admin) — a track over the post, pin/boost, publish later ──
  const [sounds, setSounds] = useState([]);
  const [soundId, setSoundId] = useState('');
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [hearingId, setHearingId] = useState('');
  const [promo, setPromo] = useState('');            // '' | 'pin' | 'boost'
  const [promoHours, setPromoHours] = useState(24);
  const [publishAt, setPublishAt] = useState(null);  // ISO string, or null for now
  const [tags, setTags] = useState([]);              // search keywords
  const [tagDraft, setTagDraft] = useState('');
  const [tagGroup, setTagGroup] = useState(null);    // open picker group, null = collapsed
  const soundPlayer = useAudioPlayer(null);

  // ── Tag a specific user (optional — drop still hits marketplace) ─
  const [taggedUser, setTaggedUser] = useState(null);

  // ── Share to Anonixx socials: on by default (opt out).
  const [publisherOptIn, setPublisherOptIn] = useState(true);

  // ── Location (country/county from lists, the rest free text) and font style.
  const [locationCountry, setLocationCountry] = useState('');
  const [locationCounty, setLocationCounty] = useState('');
  const [locationSubCounty, setLocationSubCounty] = useState('');
  const [locationEstate, setLocationEstate] = useState('');
  const [storyTopics, setStoryTopics] = useState([]);   // author's moods/topics (confessions only)
  const [fontStyle, setFontStyle] = useState(DEFAULT_CARD_FONT); // an id from CARD_FONT_LIST
  const fontIdx = Math.max(0, CARD_FONT_LIST.findIndex((f) => f.id === fontStyle));
  const nextFont = useCallback(() => {
    setFontStyle(CARD_FONT_LIST[(fontIdx + 1) % CARD_FONT_LIST.length].id);
  }, [fontIdx]);

  // ── Intensity + one-word hint (section 11) ────────────────────
  const [intensity, setIntensity] = useState('heavy');
  const [hint,      setHint]      = useState('');   // single word, shown only when a user is tagged

  // ── A saved draft is offered back (continue or discard), never restored silently.
  const [showUnsentBanner, setShowUnsentBanner] = useState(false);

  // ── Which bottom sheet is open — null | 'intent' | 'tag' | 'location' | 'more' ──
  const [activeSheet, setActiveSheet] = useState(null);
  const closeSheet = useCallback(() => setActiveSheet(null), []);

  // ── One-time hint pointing at the toolbar.
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

  // New placeholder line when the confession type changes.
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
              if (typeof d.cardIntent === 'string' && d.cardIntent !== 'the-exchange' && CARD_INTENT_LIST.some(c => c.id === d.cardIntent)) setCardIntent(d.cardIntent);
              if (typeof d.intensity=== 'string') setIntensity(d.intensity);
              if (typeof d.hint     === 'string') setHint(d.hint);
              if (typeof d.fontStyle === 'string' && CARD_FONT_STYLES[d.fontStyle]) setFontStyle(d.fontStyle);
              if (typeof d.publisherOptIn === 'boolean') setPublisherOptIn(d.publisherOptIn);
              if (d.taggedUser && typeof d.taggedUser === 'object') setTaggedUser(d.taggedUser);
              if (d.location && typeof d.location === 'object') {
                setLocationCountry(d.location.country || '');
                setLocationCounty(d.location.county || '');
                setLocationSubCounty(d.location.subCounty || '');
                setLocationEstate(d.location.estate || '');
              }
              // Only surface the unsent banner if the restored draft has substance,
              // and skip the kind chooser: they were writing a confession.
              if (hasContent) { setShowUnsentBanner(true); setKind((k) => k || 'confession'); }
            }
          } catch { /* corrupt draft — ignore */ }
        }
        // No confession in progress but a hookup half-done: reopen the guided flow.
        if (!draftRaw || !JSON.parse(draftRaw)?.text?.trim()) {
          const guided = await AsyncStorage.getItem(GUIDED_SAVE_KEY);
          if (guided && JSON.parse(guided)?.started) setKind((k) => k || 'hookup');
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
        text, format, cardIntent, intensity, hint, fontStyle, publisherOptIn, taggedUser,
        location: { country: locationCountry, county: locationCounty, subCounty: locationSubCounty, estate: locationEstate },
      })).catch(() => {});
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [text, format, cardIntent, intensity, hint, fontStyle, publisherOptIn, taggedUser,
      locationCountry, locationCounty, locationSubCounty, locationEstate]);

  // ── Edge detection ────────────────────────────────────────────
  const edge = useMemo(() => detectEdge(text), [text]);

  // ── Format change. Voice and Poll open their own screens; media is kept.
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

  // ── Media: one or more photos (shown as slides) or a single video.
  const handlePickMedia = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ type: 'warning', message: 'Gallery access is needed.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        legacy: true,   // Android: pick straight from Gallery / Files, not the Google Photos picker
        mediaTypes:           ['images', 'videos'],
        quality:              0.85,
        allowsEditing:        false,
        allowsMultipleSelection: true,
        selectionLimit:       9,
      });
      if (result.canceled) return;

      if (result.assets.length === 1) {
        const asset = result.assets[0];
        const kind = asset.type === 'video' ? 'video' : 'image';
        setMediaUri(asset.uri);
        setMediaKind(kind);
        setExtraImageUris([]);
        if (kind === 'video') {
          // Any length is fine: the editor opens on it, cut to its first 3:00 if longer.
          const duration = (asset.duration || 0) / 1000;
          setVideoMeta({ duration, size: asset.fileSize || 0, landscape: (asset.width || 0) > (asset.height || 0) * 1.05 });
          setVideoEdit(duration ? defaultEdit(duration) : null);
          setCoverAt(null);
          if (duration) setEditorOpen(true);
        } else {
          setVideoMeta(null);
          setVideoEdit(null);
        }
        return;
      }

      // Several picked: keep the photos, drop any videos.
      const photoUris = result.assets.filter((a) => a.type !== 'video').map((a) => a.uri).slice(0, 9);
      if (photoUris.length < 2) {
        showToast({ type: 'warning', message: 'Pick at least 2 photos for a multi-photo drop.' });
        return;
      }
      setMediaUri(photoUris[0]);
      setMediaKind('image');
      setExtraImageUris(photoUris.slice(1));
    } catch {
      showToast({ type: 'error', message: 'Could not open gallery.' });
    }
  }, [showToast]);

  const handleClearMedia = useCallback(() => {
    setMediaUri(null);
    setMediaKind(null);
    setExtraImageUris([]);
    setVideoMeta(null);
    setVideoEdit(null);
    setCoverAt(null);
  }, []);

  // ── Spotlight sheet: load the Sounds library the first time it opens ──
  useEffect(() => {
    if ((activeSheet !== 'spotlight' && activeSheet !== 'sound') || sounds.length) return;
    fetch(`${API_BASE_URL}/api/v1/sounds`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.sounds) setSounds(d.sounds); })
      .catch(() => {});
  }, [activeSheet, sounds.length]);
  useEffect(() => { if (activeSheet !== 'spotlight' && activeSheet !== 'sound' && hearingId) { soundPlayer.pause(); setHearingId(''); } }, [activeSheet]);

  const hear = useCallback((snd) => {
    if (hearingId === snd.id) { soundPlayer.pause(); setHearingId(''); return; }
    soundPlayer.replace({ uri: snd.url });
    soundPlayer.play();
    setHearingId(snd.id);
  }, [hearingId, soundPlayer]);

  const handleRemoveExtraImage = useCallback((uri) => {
    setExtraImageUris((prev) => prev.filter((u) => u !== uri));
  }, []);

  // ── Keywords (admin) — tap a pick to add it, tap again to remove ──
  const addTags = useCallback((raw) => {
    const parts = raw.split(',').map(cleanTag).filter(Boolean);
    if (parts.length) {
      setTags((l) => {
        const next = [...l];
        for (const t of parts) if (!next.includes(t) && next.length < MAX_TAGS) next.push(t);
        return next;
      });
    }
    setTagDraft('');
  }, []);
  const toggleTag = useCallback((t) => {
    setTags((l) => (l.includes(t) ? l.filter((x) => x !== t)
      : l.length < MAX_TAGS ? [...l, t] : l));
  }, []);
  const tagChip = (t) => {
    const on = tags.includes(t);
    return (
      <SpotChip key={t} label={on ? `✓ ${t}` : `+ ${t}`} on={on}
        disabled={!on && tags.length >= MAX_TAGS} onPress={() => toggleTag(t)} />
    );
  };

  // ── Discard draft ─────────────────────────────────────────────
  const handleDiscardDraft = useCallback(async () => {
    setText('');
    setTags([]); setTagDraft(''); setTagGroup(null);
    setMediaUri(null);
    setHint('');
    setTaggedUser(null);
    setLocationCountry(''); setLocationCounty(''); setLocationSubCounty(''); setLocationEstate('');
    setShowUnsentBanner(false);
    try { await AsyncStorage.removeItem(DRAFT_KEY); } catch {}
    showToast({ type: 'info', message: 'Unsent layer cleared.' });
  }, [showToast]);

  // ── Continue unsent draft — dismisses the banner only ─────────
  const handleContinueDraft = useCallback(() => {
    setShowUnsentBanner(false);
  }, []);

  // ── Sharing toggle. Voice drops confirm on a separate screen first.
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

      // Upload the media to R2 before posting.
      let uploadedMediaUrl = null;
      let uploadedImageUrls = null;
      const isVideo = mediaKind === 'video' && !!mediaUri;
      const edit = withoutEmptyText(videoEdit);

      // Cover first (quick): the chosen frame, or the clip's first frame.
      let coverUrl = null;
      if (isAdmin && isVideo && videoMeta?.duration) {
        try {
          const ms = Math.round((coverAt ?? edit?.start ?? 0) * 1000);
          const { uri: shot } = await VideoThumbnails.getThumbnailAsync(mediaUri, { time: ms, quality: 0.8 });
          coverUrl = await uploadToR2(shot, 'image', 'image/jpeg');
        } catch { /* no cover: the feed falls back to the video itself */ }
      }

      // Stream (when switched on, and within its 200 MB single-upload limit) cuts and
      // watermarks the video for real; otherwise it goes to R2 with smart trim as before.
      let streamUid = null;
      if (isAdmin && isVideo && await streamEnabled()
          && (!videoMeta?.size || videoMeta.size <= STREAM_DIRECT_MAX_BYTES)) {
        streamUid = await uploadToStream(mediaUri);
      } else if (mediaKind && mediaUri) {
        const mime = isVideo ? (Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4') : 'image/jpeg';
        uploadedMediaUrl = await uploadToR2(mediaUri, mediaKind, mime);

        if (!isVideo && extraImageUris.length) {
          const rest = await Promise.all(
            extraImageUris.map((uri) => uploadToR2(uri, 'image', 'image/jpeg'))
          );
          uploadedImageUrls = [uploadedMediaUrl, ...rest];
        }
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
        kind,
        theme,
        intent:     cardIntent,
        mood_tag:   moodTag,
        intensity,
        ...(kind !== 'hookup' && storyTopics.length ? { topics: storyTopics } : {}),
        // Hint only makes sense when a specific user is tagged.
        ...(taggedUser && hintClean ? { recognition_hint: hintClean } : {}),
        // Tag a specific user AND still hit marketplace.
        ...(taggedUser ? { target_user_id: taggedUser.id } : {}),
        // Tri-state server-side: explicit false is the only way to opt out.
        publisher_opt_in: !!publisherOptIn,
        ...(uploadedImageUrls
          ? { images: uploadedImageUrls }
          : streamUid
            ? { media_type: 'video', ...(edit?.overlays.length ? { video_edit: edit } : {}) }
            : (mediaKind && mediaUri ? {
                media_type: mediaKind,
                media_url: uploadedMediaUrl,
                ...(isVideo && isMeaningful(edit, videoMeta?.duration || 0) ? { video_edit: edit } : {}),
              } : {})),
        ...(coverUrl ? { cover_url: coverUrl } : {}),
        // Spotlight (admin only; the server ignores these from anyone else)
        ...(soundId && format !== 'voice' ? { sound_id: soundId, ...(isAdmin ? { sound_mute_original: isVideo && muteOriginal } : {}) } : {}),
        ...(isAdmin && promo ? { promo_kind: promo, promo_hours: promoHours } : {}),
        ...(isAdmin && tags.length ? { tags } : {}),
        // Link back to the feed post that inspired this drop, if any.
        ...(inspiredByPostId ? { inspired_by_post_id: inspiredByPostId } : {}),
        ...(locationCountry.trim() ? { location_country: locationCountry.trim() } : {}),
        ...(locationCounty.trim() ? { location_county: locationCounty.trim() } : {}),
        ...(locationSubCounty.trim() ? { location_sub_county: locationSubCounty.trim() } : {}),
        ...(locationEstate.trim() ? { location_estate: locationEstate.trim() } : {}),
        font_style: fontStyle,
      };

      // A Stream video, or anything an admin schedules, goes through the scheduled
      // queue: the server publishes it when the clip is ready / at the chosen time.
      const later = isAdmin && publishAt && new Date(publishAt).getTime() > Date.now() + 60e3 ? publishAt : null;
      if (streamUid || later) {
        await queueDrop(body, {
          publishAt: later,
          stream: streamUid ? { uid: streamUid, start: edit?.start ?? 0, end: edit?.end ?? null } : null,
        });
        await AsyncStorage.removeItem(DRAFT_KEY);
        setText('');
        setTags([]); setTagDraft('');
        Keyboard.dismiss();
        showToast({
          type: 'success',
          title: later ? 'Queued.' : 'Almost out there.',
          message: later
            ? `Goes live ${whenLabel(later)}.`
            : 'Your video is being cut and watermarked. It posts itself in a minute or two.',
        });
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/drops`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...countryHeader(),   // tags the drop with where its author is, for local-first feeds
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

      // The server queues eligible drops for socials automatically.

      // Clear draft
      await AsyncStorage.removeItem(DRAFT_KEY);
      setText('');
      setTags([]); setTagDraft('');

      Keyboard.dismiss();
      showToast({
        type: 'success',
        title: 'Dropped.',
        message: 'The quiet just got louder.',
      });
      dispatch(awardMilestone('first_drop'));

      // Back to the feed, where the new drop appears.
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
    format, text, mediaUri, mediaKind, extraImageUris, theme, cardIntent, moodTag,
    kind, intensity, hint, taggedUser, publisherOptIn,
    locationCountry, locationCounty, locationSubCounty, locationEstate, fontStyle, storyTopics,
    isAdmin, videoEdit, videoMeta, coverAt, soundId, muteOriginal, promo, promoHours, publishAt, tags,
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
  if (!kind) {
    return <KindChooser onPick={setKind} onBack={() => navigation.goBack()} />;
  }
  if (kind === 'hookup') {
    return <GuidedConfession navigation={navigation} onBack={() => setKind(null)} />;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
            <ChevronLeft size={rs(24)} color={T.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setKind(null)} hitSlop={HIT_SLOP}>
            <Text style={s.kindSwitch}>Confession · change</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('WhatsAppSend', { text })}
            hitSlop={HIT_SLOP}
          >
            <Send size={rs(20)} color={T.text} />
          </TouchableOpacity>
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

          {/* Guiding line; fades once they start typing. */}
          {!text && (
            <Text style={s.composeGuide}>
              Say what you can't say out loud — nobody will know it's you.
            </Text>
          )}

          {/* One-time toolbar hint; any tap dismisses it. */}
          {showToolbarHint && (
            <TouchableOpacity style={s.hintBubble} onPress={dismissToolbarHint} activeOpacity={0.85}>
              <Text style={s.hintBubbleText}>
                Tap an icon on the card below to add a photo, set your mood, tag someone & more.
              </Text>
              <X size={rs(12)} color={T.textMute} />
            </TouchableOpacity>
          )}

          {/* Type straight into the card; the toolbar is attached below it as one card. */}
          <Animated.View style={[s.cardWrap, { opacity: fade }]}>
            <DropCardRenderer
              confession={text}
              moodTag={moodTag}
              theme={theme}
              // The compose card keeps one look; posted drops show their type's colours in the feed.
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
              // Square bottom corners: the toolbar sits flush below.
              flushBottom
            />

            {/* Shuffle the placeholder line (only while empty). */}
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

            {/* Toolbar: one labelled icon per extra; a dot marks what's set. */}
            <View style={s.toolbar}>
            {isAdmin && (
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
            )}

            {isAdmin && mediaKind === 'video' && !!videoEdit && (
            <ToolIcon
              active={isMeaningful(videoEdit, videoMeta?.duration || 0) || coverAt != null}
              onPress={() => { dismissToolbarHint(); setEditorOpen(true); }}
              label="Edit"
              a11yLabel="Trim the video, add text on it, pick its cover"
            >
              <Film size={rs(18)} color={T.primary} />
            </ToolIcon>
            )}

            {isAdmin && (
            <ToolIcon
              active={!!soundId || !!promo || !!publishAt || tags.length > 0}
              onPress={() => { dismissToolbarHint(); setActiveSheet('spotlight'); }}
              label="Boost"
              a11yLabel="Spotlight — search keywords, sound, pin or boost, post later"
            >
              <Rocket size={rs(18)} color={soundId || promo || publishAt || tags.length ? T.primary : T.textMute} />
            </ToolIcon>
            )}

            {!isAdmin && (
            <ToolIcon
              active={!!soundId}
              onPress={() => { dismissToolbarHint(); setActiveSheet('sound'); }}
              label="Sound"
              a11yLabel="Add a sound that plays behind your confession"
            >
              <Music size={rs(18)} color={soundId ? T.primary : T.textMute} />
            </ToolIcon>
            )}

            {/* Font for text drops: each tap moves to the next one, shown live on the card. */}
            {!mediaUri && (
            <ToolIcon
              active={fontStyle !== DEFAULT_CARD_FONT}
              onPress={() => { dismissToolbarHint(); nextFont(); }}
              label={CARD_FONT_LIST[fontIdx].label}
              a11yLabel="Change the font of your confession"
            >
              <Text style={[s.fontGlyph, { fontFamily: CARD_FONT_STYLES[fontStyle].fontFamily }]}>Aa</Text>
            </ToolIcon>
            )}

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

            {kind !== 'hookup' && (
            <ToolIcon
              active={storyTopics.length > 0}
              onPress={() => { dismissToolbarHint(); setActiveSheet('feeling'); }}
              label={storyTopics.length ? `Feeling · ${storyTopics.length}` : 'Feeling'}
              a11yLabel="Mood and topic — helps people find it in Stories"
            >
              <Feather size={rs(18)} color={storyTopics.length ? T.primary : T.textMute} />
            </ToolIcon>
            )}

            <ToolIcon
              active={!!locationSummary}
              onPress={() => { dismissToolbarHint(); setActiveSheet('location'); }}
              label="Place"
              a11yLabel="Location — nearby people find it faster"
            >
              <MapPin size={rs(18)} color={locationSummary ? T.primary : T.textMute} />
            </ToolIcon>

            {isAdmin && (
            <ToolIcon
              onPress={() => { dismissToolbarHint(); handleFormatChange('voice'); }}
              label="Voice"
              a11yLabel="Record a voice drop instead"
            >
              <Mic size={rs(18)} color={T.textMute} />
            </ToolIcon>
            )}

            {/* Polls are official-only (also enforced server-side). */}
            {isAdmin && (
              <ToolIcon
                onPress={() => { dismissToolbarHint(); handleFormatChange('poll'); }}
                label="Poll"
                a11yLabel="Make this a poll instead"
              >
                <BarChart2 size={rs(18)} color={T.textMute} />
              </ToolIcon>
            )}

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

          {/* Extra photos, each removable. */}
          {extraImageUris.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.extraImagesStrip}
              contentContainerStyle={s.extraImagesStripContent}
            >
              {extraImageUris.map((uri) => (
                <View key={uri} style={s.extraImageTile}>
                  <Image source={{ uri }} style={s.extraImageThumb} />
                  <TouchableOpacity
                    style={s.extraImageRemove}
                    onPress={() => handleRemoveExtraImage(uri)}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.85}
                  >
                    <X size={rs(10)} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={s.extraImagesCount}>{extraImageUris.length + 1} photos</Text>
            </ScrollView>
          )}

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
              <Text style={s.dropBtnText}>Drop it  ↗</Text>
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
            {CARD_INTENT_LIST.filter((def) => def.id !== 'the-exchange').map((def) => (
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

        {/* ── Mood / topic sheet ── */}
        <OptionSheet visible={activeSheet === 'feeling'} title="Mood and topic" onClose={closeSheet}>
          <TopicPicker value={storyTopics} onChange={setStoryTopics} />
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

        {/* ── Sound sheet (users) — the same Sounds library admins pick from in Spotlight ── */}
        {!isAdmin && (
        <OptionSheet visible={activeSheet === 'sound'} title="Sound" onClose={closeSheet}>
          <Text style={s.sectionSubLabel}>Set the mood. It plays softly behind your words.</Text>
          {sounds.length ? (
            <View style={s.spotChips}>
              <SpotChip label="No sound" on={!soundId} onPress={() => setSoundId('')} />
              {sounds.map((snd) => (
                <View key={snd.id} style={s.spotSoundRow}>
                  <SpotChip label={snd.title} on={soundId === snd.id} onPress={() => setSoundId(snd.id)} />
                  <TouchableOpacity onPress={() => hear(snd)} hitSlop={HIT_SLOP}>
                    <Text style={s.spotListen}>{hearingId === snd.id ? 'stop' : 'listen'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.spotHint}>No sounds yet. Check back soon.</Text>
          )}
        </OptionSheet>
        )}

        {/* ── Spotlight sheet (admin) — same extras as the website's Post Studio ── */}
        {isAdmin && (
        <OptionSheet visible={activeSheet === 'spotlight'} title="Spotlight" onClose={closeSheet}>
          <Text style={s.sectionSubLabel}>Extras that make a drop stop the scroll and travel further.</Text>

          {/* Keywords search matches on (same picks as the website). */}
          <Text style={s.spotLabel}>Search keywords <Text style={s.spotCount}>{tags.length}/{MAX_TAGS}</Text></Text>
          {tags.length > 0 && (
            <View style={s.spotChips}>
              {tags.map((t) => (
                <TouchableOpacity key={t} onPress={() => toggleTag(t)} activeOpacity={0.8}
                  style={[s.spotChip, s.spotChipOn, s.kwSel]} accessibilityLabel={`Remove ${t}`}>
                  <Text style={[s.spotChipText, s.spotChipTextOn]} numberOfLines={1}>#{t}</Text>
                  <X size={rs(12)} color="#fff" />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {tags.length < MAX_TAGS && (
            <TextInput
              style={s.kwInput}
              value={tagDraft}
              maxLength={30}
              placeholder={tags.length ? 'Type another, then return' : 'Type a keyword, then return'}
              placeholderTextColor={T.textMute}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              blurOnSubmit={false}
              onChangeText={(v) => (v.includes(',') ? addTags(v) : setTagDraft(v))}
              onSubmitEditing={() => addTags(tagDraft)}
              onBlur={() => addTags(tagDraft)}
            />
          )}
          <Text style={s.kwHead}>Quick picks</Text>
          <View style={s.spotChips}>{TOP_TAGS.map(tagChip)}</View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.kwTabs}>
            {TAG_GROUPS.map((g) => {
              const n = g.tags.filter((t) => tags.includes(t)).length;
              const open = tagGroup === g.name;
              return (
                <TouchableOpacity key={g.name} onPress={() => setTagGroup(open ? null : g.name)} activeOpacity={0.8}
                  style={[s.kwTab, open && s.kwTabOn]}>
                  <Text style={[s.kwTabText, open && s.kwTabTextOn]}>{g.name}{n ? ` · ${n}` : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!!tagGroup && (
            <View style={s.spotChips}>{(TAG_GROUPS.find((g) => g.name === tagGroup)?.tags || []).map(tagChip)}</View>
          )}
          <Text style={s.spotHint}>
            {tags.length >= MAX_TAGS ? "That's the max. Remove one to add another."
              : 'What people would type in search to find this drop.'}
          </Text>

          <Text style={s.spotLabel}>Sound</Text>
          {sounds.length ? (
            <View style={s.spotChips}>
              <SpotChip label="No sound" on={!soundId} onPress={() => setSoundId('')} />
              {sounds.map((snd) => (
                <View key={snd.id} style={s.spotSoundRow}>
                  <SpotChip label={snd.title} on={soundId === snd.id} onPress={() => setSoundId(snd.id)} />
                  <TouchableOpacity onPress={() => hear(snd)} hitSlop={HIT_SLOP}>
                    <Text style={s.spotListen}>{hearingId === snd.id ? 'stop' : 'listen'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.spotHint}>No sounds yet. Add some on the website's admin Sounds page.</Text>
          )}
          {!!soundId && mediaKind === 'video' && (
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleRowLabel}>Replace the video's own audio</Text>
                <Text style={s.toggleRowSub}>Off = the track plays over it</Text>
              </View>
              <Switch
                value={muteOriginal}
                onValueChange={setMuteOriginal}
                trackColor={{ false: T.surfaceAlt, true: T.primary }}
                thumbColor={muteOriginal ? '#fff' : T.textMute}
                ios_backgroundColor={T.surfaceAlt}
              />
            </View>
          )}

          <Text style={s.spotLabel}>Pin or boost</Text>
          <View style={s.spotChips}>
            <SpotChip label="Off" on={!promo} onPress={() => setPromo('')} />
            <SpotChip label="Pin to top" on={promo === 'pin'} onPress={() => setPromo('pin')} />
            <SpotChip label="Boost" on={promo === 'boost'} onPress={() => setPromo('boost')} />
          </View>
          {!!promo && (
            <View style={s.spotChips}>
              {PROMO_HOURS.map(([h, l]) => <SpotChip key={h} label={`for ${l}`} on={promoHours === h} onPress={() => setPromoHours(h)} />)}
            </View>
          )}
          <Text style={s.spotHint}>
            {promo === 'pin' ? 'First thing everyone sees when they open the feed.'
              : promo === 'boost' ? "Shown near the top of everyone's feed."
              : 'Shows in the feed like any new drop.'}
          </Text>

          <Text style={s.spotLabel}>When</Text>
          <View style={s.spotChips}>
            <SpotChip label="Now" on={!publishAt} onPress={() => setPublishAt(null)} />
            {schedulePresets().map(([label, d]) => (
              <SpotChip
                key={label}
                label={label}
                on={!!publishAt && Math.abs(new Date(publishAt).getTime() - d.getTime()) < 5 * 60e3}
                onPress={() => setPublishAt(d.toISOString())}
              />
            ))}
          </View>
          {!!publishAt && (
            <Text style={s.spotHint}>
              Goes live {whenLabel(publishAt)}.{promo ? ' The pin/boost clock starts when it does.' : ''} Manage queued drops on the website's Post Studio.
            </Text>
          )}
        </OptionSheet>
        )}

        {isAdmin && mediaKind === 'video' && (
          <VideoEditorModal
            visible={editorOpen}
            uri={mediaUri}
            duration={videoMeta?.duration || 0}
            landscape={!!videoMeta?.landscape}
            value={videoEdit}
            cover={coverAt}
            onClose={() => setEditorOpen(false)}
            onDone={({ edit, coverAt: c }) => { setVideoEdit(edit); setCoverAt(c); setEditorOpen(false); }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const SpotChip = ({ label, on, onPress, disabled }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8} style={[s.spotChip, on && s.spotChipOn, disabled && s.spotChipOff]}>
    <Text style={[s.spotChipText, on && s.spotChipTextOn]} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

// ─── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  spotLabel: { fontSize: FONT.sm, fontWeight: '800', color: T.text, marginTop: rp(14), marginBottom: rp(8) },
  spotChips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8), marginBottom: rp(8) },
  spotChip: { paddingHorizontal: rp(12), paddingVertical: rp(7), borderRadius: RADIUS.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', maxWidth: rs(220) },
  spotChipOn: { backgroundColor: T.primary, borderColor: T.primary },
  spotChipText: { fontSize: rf(13), fontWeight: '700', color: T.text },
  spotChipTextOn: { color: '#fff' },
  spotSoundRow: { flexDirection: 'row', alignItems: 'center', gap: rp(6) },
  spotListen: { fontSize: rf(12), fontWeight: '700', color: T.primary },
  spotHint: { fontSize: rf(12), color: T.textSecondary, lineHeight: rf(18) },
  spotChipOff: { opacity: 0.4 },
  spotCount: { fontSize: rf(12), fontWeight: '700', color: T.textSecondary },
  kwSel: { flexDirection: 'row', alignItems: 'center', gap: rp(4) },
  kwInput: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: RADIUS.md, paddingHorizontal: rp(12), paddingVertical: rp(8), fontSize: rf(14), color: T.text, marginBottom: rp(10) },
  kwHead: { fontSize: rf(12), fontWeight: '700', color: T.textSecondary, marginBottom: rp(6) },
  kwTabs: { gap: rp(6), paddingBottom: rp(8) },
  kwTab: { paddingHorizontal: rp(11), paddingVertical: rp(6), borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: T.surfaceAlt },
  kwTabOn: { borderColor: T.primary },
  kwTabText: { fontSize: rf(12.5), fontWeight: '700', color: T.textSecondary },
  kwTabTextOn: { color: T.text },
  kindWrap: { flex: 1, padding: rp(20), gap: rp(14), justifyContent: 'center' },
  kindTitle: { fontSize: FONT.xl || FONT.lg, fontWeight: '800', color: T.text },
  kindLead: { fontSize: FONT.sm, color: T.textSecondary, marginBottom: rp(6) },
  kindCard: {
    flexDirection: 'row', gap: rp(14), alignItems: 'flex-start',
    borderWidth: 1, borderColor: T.borderStrong, backgroundColor: T.surface,
    borderRadius: RADIUS.lg, padding: rp(18),
  },
  kindIcon: {
    width: rs(40), height: rs(40), borderRadius: rs(20), alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.primaryDim, borderWidth: 1, borderColor: T.primaryBorder,
  },
  kindCardTitle: { fontSize: FONT.md, fontWeight: '800', color: T.text },
  kindCardSub: { fontSize: FONT.sm, color: T.textSecondary, lineHeight: rs(20) },
  kindTags: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6), marginTop: rp(4) },
  kindTag: {
    fontSize: rf(11), fontWeight: '700', color: T.primary, overflow: 'hidden',
    backgroundColor: T.primaryTint, borderRadius: rs(10), paddingHorizontal: rp(8), paddingVertical: rp(3),
  },
  kindSwitch: { fontSize: FONT.sm, fontWeight: '700', color: T.text },
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

  // Card + toolbar share one rounded, clipped container, so the toolbar reads as the card's footer.
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

  // Extra photos strip (multi-photo pick)
  extraImagesStrip: { marginBottom: SPACING.sm },
  extraImagesStripContent: { gap: rp(8), alignItems: 'center', paddingVertical: rp(2) },
  extraImageTile: { position: 'relative', width: rs(52), height: rs(52) },
  extraImageThumb: { width: '100%', height: '100%', borderRadius: RADIUS.sm },
  extraImageRemove: {
    position: 'absolute', top: rp(-5), right: rp(-5),
    width: rs(18), height: rs(18), borderRadius: rs(9),
    backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center',
  },
  extraImagesCount: {
    fontFamily: 'DMSans-Regular', fontSize: rf(11), color: T.textMute, marginLeft: rp(4),
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

  // Toolbar: one labelled icon per extra (clipped by cardWrap).
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
  fontGlyph: { fontSize: rf(15), color: T.primary },
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
