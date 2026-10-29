/** "Your Room" studio. Tabs: My Room, Knocks, Inside, Appearance, Privacy. Accepts { tab }. */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator, TextInput, Switch, Alert,
} from 'react-native';
import { useSelector } from 'react-redux';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Trash2, Volume2, Video, Users, User, Plus } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import ChatBackground from '../../components/chat/ChatBackground';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { uploadViaBackend } from '../../utils/upload';
import { WELCOME_SOUND_OPTIONS, WELCOME_SOUND_MAP } from '../../config/sounds';
import { BACKGROUND_PATTERNS, DEFAULT_BACKGROUND_PATTERN } from '../../config/patterns';
import { CHAT_FONT_OPTIONS, DEFAULT_CHAT_FONT } from '../../config/fonts';
import { intentLabel } from '../../config/linkup';
import {
  DEFAULT_ROOM_THEME, GALLERY_VISIBILITY, MAX_INTRO, MAX_WELCOME, ROOM_STATUSES, roomThemeById,
} from '../../config/roomThemes';
import RoomThemePicker, { RoomMini } from '../../components/rooms/RoomThemePicker';
import KnockClues from '../../components/rooms/KnockClues';

// What a Knock on this Room must carry (Backend chat_profile.py DOOR_RULES).
const DOOR_RULES = [
  { id: 'line_peek', label: 'A line + a peek', hint: 'They write a line and show something: from their Room, a photo or video, or a voice note.' },
  { id: 'line', label: 'A line is enough', hint: 'Just a line about themselves. Fewer clues, more knocks.' },
  { id: 'voice', label: 'A voice note', hint: '5 to 15 seconds of their voice. A strong clue without a face.' },
];

// Where the Room shows in Discover (Backend chat_profile.py LISTINGS). Default "limited".
const LISTINGS = [
  { id: 'discoverable', label: 'Show my Room in Near', hint: 'People browsing your area can find your Room, even when you have no post up.' },
  { id: 'limited', label: 'Only through my posts', hint: "People reach your Room from your posts. It isn't listed on its own." },
  { id: 'private', label: 'Keep me out of Near', hint: "Your posts still show in the feed, but you won't appear in Near." },
];

const TABS = [
  ['room', 'My Room'], ['knocks', 'Knocks'], ['inside', 'Inside'], ['appearance', 'Appearance'], ['privacy', 'Privacy'],
];
const REPORT_REASONS = [
  ['abuse', 'Harassment or abuse'], ['explicit', 'Sexually explicit or unwanted'], ['doxxing', 'Shares private info'],
  ['spam', 'Spam or scam'], ['other', 'Something else'],
];

function extOf(uri) {
  return uri.split('?')[0].split('.').pop()?.toLowerCase() || '';
}

export default function ChatProfileSetupScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const me = useSelector((state) => state.auth.user?.id);
  const [tab, setTab] = useState(route?.params?.tab || 'room');

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);

  const [backgroundPattern, setBackgroundPattern] = useState(DEFAULT_BACKGROUND_PATTERN);
  const [fontStyle, setFontStyle]             = useState(DEFAULT_CHAT_FONT);
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [anonymousName, setAnonymousName]     = useState('');
  const [gallery, setGallery]                 = useState([]);
  const [welcomeSound, setWelcomeSound]       = useState('soft-chime');
  const [callMode, setCallMode]               = useState('solo');
  const [maxGuests, setMaxGuests]             = useState(1);
  const [buyingSlots, setBuyingSlots]         = useState(false);
  const [roomTheme, setRoomTheme]             = useState(DEFAULT_ROOM_THEME);
  const [intro, setIntro]                     = useState('');
  const [welcomeMessage, setWelcomeMessage]   = useState('');
  const [roomStatus, setRoomStatus]           = useState('');
  const [galleryVisibility, setGalleryVisibility] = useState('window');
  const [knocksOpen, setKnocksOpen]           = useState(true);
  // A break's length, picked when knocks go off this visit (null = keep what the server has).
  const [breakHours, setBreakHours]           = useState(null);
  const [breakUntil, setBreakUntil]           = useState(null);
  const [doorRule, setDoorRule]               = useState('line_peek');
  const [listing, setListing]                 = useState('limited');
  const [knocks, setKnocks]                   = useState(null);
  const [inside, setInside]                   = useState(null);
  const [personBusy, setPersonBusy]           = useState(null);

  const authHeaders = useCallback(async (json = false) => {
    const token = await AsyncStorage.getItem('token');
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/me`, {
          headers: await authHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setBackgroundPattern(data.background_pattern || DEFAULT_BACKGROUND_PATTERN);
            setFontStyle(data.font_style || DEFAULT_CHAT_FONT);
            setProfilePictureUrl(data.profile_picture_url || null);
            setAnonymousName(data.anonymous_name || '');
            setGallery(data.gallery || []);
            setWelcomeSound(data.welcome_sound || 'soft-chime');
            setCallMode(data.call_mode || 'solo');
            setMaxGuests(data.max_guests || 1);
            setRoomTheme(data.room_theme || DEFAULT_ROOM_THEME);
            setIntro(data.intro || '');
            setWelcomeMessage(data.welcome_message || '');
            setRoomStatus(data.room_status || '');
            setGalleryVisibility(data.gallery_visibility || 'window');
            setKnocksOpen(data.knocks_open !== false);
            setBreakUntil(data.break_until || null);
            setBreakHours(null);
            setDoorRule(data.door_rule || 'line_peek');
            setListing(data.listing || 'limited');
          }
        }
      } catch {
        /* offline — start fresh, save will retry */
      } finally {
        setLoading(false);
      }
    })();
  }, [authHeaders]);

  const handlePickProfilePicture = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      legacy: true,   // Android: pick straight from Gallery / Files, not the Google Photos picker
      mediaTypes: 'images', quality: 0.85, allowsEditing: true, aspect: [1, 1],
    });
    if (result.canceled) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = extOf(asset.uri) || 'jpg';
      const mimeType = ext === 'gif' ? 'image/gif' : 'image/jpeg';
      const url = await uploadViaBackend(asset.uri, 'image', mimeType);
      setProfilePictureUrl(url);
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not upload picture. Check your connection.' });
    } finally {
      setUploading(false);
    }
  }, [authHeaders, showToast]);

  const handleAddGalleryMedia = useCallback(async () => {
    if (gallery.length >= 3) {
      showToast({ type: 'info', message: 'Gallery is capped at 3 items — delete one first.' });
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      legacy: true,   // Android: pick straight from Gallery / Files, not the Google Photos picker
      mediaTypes: ['images', 'videos'], quality: 0.85, videoMaxDuration: 90,
    });
    if (result.canceled) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const ext = extOf(asset.uri) || (isVideo ? 'mp4' : 'jpg');
      const isGif = !isVideo && ext === 'gif';
      const mediaType = isVideo ? 'video' : isGif ? 'gif' : 'image';
      const mimeType = isVideo ? 'video/mp4' : isGif ? 'image/gif' : 'image/jpeg';
      const mediaUrl = await uploadViaBackend(asset.uri, isVideo ? 'video' : 'image', mimeType);

      const addRes = await fetch(`${API_BASE_URL}/api/v1/chat-profile/media`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          media_url: mediaUrl,
          media_type: mediaType,
          duration_seconds: asset.duration ? asset.duration / 1000 : undefined,
        }),
      });
      if (!addRes.ok) {
        const err = await addRes.json().catch(() => ({}));
        throw new Error(err?.detail || 'Could not save media.');
      }
      const profile = await addRes.json();
      setGallery(profile.gallery || []);
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not add media. Check your connection.' });
    } finally {
      setUploading(false);
    }
  }, [gallery.length, authHeaders, showToast]);

  const handleDeleteGalleryItem = useCallback(async (index) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/media/${index}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      if (res.ok) {
        const profile = await res.json();
        setGallery(profile.gallery || []);
      }
    } catch {
      showToast({ type: 'error', message: 'Could not remove media.' });
    }
  }, [authHeaders, showToast]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/me`, {
        method: 'PUT',
        headers: await authHeaders(true),
        body: JSON.stringify({
          background_pattern: backgroundPattern,
          font_style: fontStyle,
          profile_picture_url: profilePictureUrl,
          welcome_sound: welcomeSound,
          call_mode: callMode,
          intro,
          welcome_message: welcomeMessage,
          room_status: roomStatus,
          gallery_visibility: galleryVisibility,
          knocks_open: knocksOpen,
          ...(!knocksOpen && breakHours !== null ? { break_hours: breakHours } : {}),
          door_rule: doorRule,
          listing,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not save. Try again.');
      showToast({ type: 'success', message: 'Saved. Your Room is ready for visitors.' });
    } catch (e) {
      showToast({ type: 'error', message: e?.message || 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }, [backgroundPattern, fontStyle, profilePictureUrl, welcomeSound, callMode, intro, welcomeMessage, roomStatus,
      galleryVisibility, knocksOpen, breakHours, doorRule, listing, authHeaders, showToast]);

  // Applies straight away (the picker has its own Apply / Cancel).
  const handleApplyTheme = useCallback(async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/me`, {
      method: 'PUT', headers: await authHeaders(true), body: JSON.stringify({ room_theme: id }),
    });
    if (!res.ok) { showToast({ type: 'error', message: 'Could not save the theme. Try again.' }); return; }
    setRoomTheme(id);
    showToast({ type: 'success', message: `${roomThemeById(id).name} applied. Visitors see it now.` });
  }, [authHeaders, showToast]);

  const loadPeople = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const [k, c] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/unlock-requests/incoming`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/api/v1/drops/connections`, { headers }).then((r) => r.json()),
      ]);
      setKnocks(k.requests || []);
      // One row per person inside, their latest thread first.
      const seen = new Set();
      setInside((c.connections || []).filter((x) => x.is_sender && !seen.has(x.other_user_id) && seen.add(x.other_user_id)));
    } catch {
      setKnocks((v) => v || []);
      setInside((v) => v || []);
    }
  }, [authHeaders]);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  const post = useCallback(async (path, body) => {
    const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method: 'POST', headers: await authHeaders(!!body), ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong.');
    return data;
  }, [authHeaders]);

  const handleKnock = useCallback(async (k, letIn) => {
    setPersonBusy(k.id);
    try {
      if (letIn) {
        const d = await post(`/unlock-requests/${k.id}/accept`);
        showToast({ type: 'success', message: `${k.requester_anonymous_name || 'They'} are inside now.` });
        if (d.connection_id) navigation.navigate('DropChat', { connectionId: d.connection_id });
      } else {
        await post(`/unlock-requests/${k.id}/decline`);
        showToast({ type: 'info', message: "Declined. They weren't charged." });
      }
      await loadPeople();
    } catch (e) {
      showToast({ type: 'warning', message: e.message });
    } finally {
      setPersonBusy(null);
    }
  }, [post, loadPeople, navigation, showToast]);

  const handleRemove = useCallback((c) => {
    Alert.alert(`Remove ${c.other_anonymous_name}?`, "The conversation closes for both of you. They'd have to knock again to come back.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setPersonBusy(c.id);
        try {
          await post(`/drops/connections/${c.id}/remove`);
          showToast({ type: 'info', message: `${c.other_anonymous_name} is out of your Room.` });
          await loadPeople();
        } catch (e) { showToast({ type: 'error', message: e.message }); } finally { setPersonBusy(null); }
      } },
    ]);
  }, [post, loadPeople, showToast]);

  const handleBlock = useCallback((c) => {
    Alert.alert(`Block ${c.other_anonymous_name}?`, "They're removed from your Room and can't knock again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => {
        setPersonBusy(c.id);
        try {
          await post(`/users/${c.other_user_id}/block`);
          await post(`/drops/connections/${c.id}/remove`).catch(() => {});
          showToast({ type: 'info', message: 'Blocked.' });
          await loadPeople();
        } catch (e) { showToast({ type: 'error', message: e.message }); } finally { setPersonBusy(null); }
      } },
    ]);
  }, [post, loadPeople, showToast]);

  const handleReport = useCallback((c) => {
    Alert.alert(`Report ${c.other_anonymous_name}`, 'What happened?', [
      ...REPORT_REASONS.map(([k, label]) => ({ text: label, onPress: async () => {
        try {
          await post(`/users/${c.other_user_id}/report`, { reason: k });
          showToast({ type: 'success', message: 'Report received. Thank you.' });
        } catch (e) { showToast({ type: 'error', message: e.message }); }
      } })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [post, showToast]);

  // Buys call slots right away (separate from Save).
  const handleBuySlots = useCallback(async (addSlots) => {
    setBuyingSlots(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/call-capacity`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ add_slots: addSlots }),
      });
      const data = await res.json();
      if (res.ok) {
        setMaxGuests(data.max_guests);
        showToast({ type: 'success', message: `Room size is now ${data.max_guests} guests — ${data.coins_spent} coins spent.` });
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: data.detail || 'Not enough coins.' });
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not buy slots.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not buy slots. Try again.' });
    } finally {
      setBuyingSlots(false);
    }
  }, [authHeaders, showToast]);

  const handlePreviewSound = useCallback(async (soundId) => {
    setWelcomeSound(soundId);
    const asset = WELCOME_SOUND_MAP[soundId];
    if (!asset) return; // no bundled file yet — silent, selection still saves fine
    try {
      const { createAudioPlayer } = await import('expo-audio');
      const player = createAudioPlayer(asset);
      player.play();
    } catch {
      /* playback unavailable — selection itself still works */
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator color={T.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <DropScreenHeader title="Your Room" navigation={navigation} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsIn}>
        {TABS.map(([k, label]) => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{label}</Text>
            {k === 'knocks' && knocks?.length ? <View style={styles.badge}><Text style={styles.badgeText}>{knocks.length}</Text></View> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + rp(100) }]}>
        {tab === 'room' && (
          <>
        <View style={styles.heroCard}>
          <RoomMini theme={roomTheme} name={anonymousName} big />
          <View style={{ flex: 1, gap: rp(6) }}>
            <Text style={styles.heroTitle}>{roomThemeById(roomTheme).room}</Text>
            <Text style={styles.heroText}>Your private space. Visitors peek through the window, knock, and you decide who comes in.</Text>
            {me ? (
              <TouchableOpacity style={styles.pill} onPress={() => navigation.navigate('Room', { userId: me })}>
                <Text style={styles.pillText}>See it as a visitor</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Room picture: your account photo by default, or set one just for the Room. */}
        <Text style={styles.sectionLabel}>Profile picture</Text>
        <TouchableOpacity onPress={handlePickProfilePicture} activeOpacity={0.85} style={styles.avatarWrap}>
          {profilePictureUrl ? (
            <Image source={{ uri: profilePictureUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitialText}>
                {anonymousName?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Camera size={rs(12)} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>Tap to change</Text>

        <Text style={styles.sectionLabel}>About you</Text>
        <TextInput
          style={styles.input}
          value={intro}
          onChangeText={(v) => setIntro(v.slice(0, MAX_INTRO))}
          placeholder="A line that makes them curious…"
          placeholderTextColor={T.textMute}
          multiline
        />
        <Text style={styles.sectionHint}>{intro.length}/{MAX_INTRO} · everyone peeking sees this. No numbers or handles.</Text>

        <Text style={styles.sectionLabel}>Status</Text>
        <View style={styles.chipRow}>
          {[{ id: '', label: 'None' }, ...ROOM_STATUSES].map((st) => (
            <TouchableOpacity key={st.id || 'none'} onPress={() => setRoomStatus(st.id)} style={[styles.chip, roomStatus === st.id && styles.chipActive]} hitSlop={HIT_SLOP}>
              <Text style={[styles.chipText, roomStatus === st.id && styles.chipTextActive]}>{st.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Welcome message</Text>
        <TextInput
          style={[styles.input, { minHeight: rs(84) }]}
          value={welcomeMessage}
          onChangeText={(v) => setWelcomeMessage(v.slice(0, MAX_WELCOME))}
          placeholder="What they read the moment you let them in…"
          placeholderTextColor={T.textMute}
          multiline
        />
        <Text style={styles.sectionHint}>{welcomeMessage.length}/{MAX_WELCOME} · only people you let in see this.</Text>
          </>
        )}

        {tab === 'appearance' && (
          <>
        <Text style={styles.sectionLabel}>Room theme</Text>
        <RoomThemePicker saved={roomTheme} name={anonymousName} onApply={handleApplyTheme} />

        {/* Background pattern */}
        <Text style={styles.sectionLabel}>Chat background</Text>
        <Text style={styles.sectionHint}>Behind your conversations once someone is inside.</Text>
        <View style={styles.swatchRow}>
          {BACKGROUND_PATTERNS.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setBackgroundPattern(p.id)}
              activeOpacity={0.85}
            >
              <ChatBackground
                pattern={p.id}
                style={[styles.patternSwatch, backgroundPattern === p.id && styles.patternSwatchActive]}
              />
              <Text style={styles.patternLabel}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Font */}
        <Text style={styles.sectionLabel}>Name and intro font</Text>
        <View style={styles.chipRow}>
          {CHAT_FONT_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFontStyle(f.id)}
              style={[styles.fontChip, fontStyle === f.id && styles.chipActive]}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.fontChipPreview, { fontFamily: f.fontFamily }, fontStyle === f.id && styles.chipTextActive]}>Aa</Text>
              <Text style={[styles.chipText, fontStyle === f.id && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

          </>
        )}

        {tab === 'room' && (
          <>
        {/* Welcome sound — plays once for someone you've just let in */}
        <Text style={styles.sectionLabel}>Welcome sound</Text>
        <Text style={styles.sectionHint}>
          Plays once when someone you let in opens your Room for the first time.
        </Text>
        <View style={styles.chipRow}>
          {WELCOME_SOUND_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              onPress={() => handlePreviewSound(opt.id)}
              style={[styles.chip, welcomeSound === opt.id && styles.chipActive]}
              hitSlop={HIT_SLOP}
            >
              {opt.id !== 'silence' && (
                <Volume2 size={rs(12)} color={welcomeSound === opt.id ? T.primary : T.textMute} />
              )}
              <Text style={[styles.chipText, welcomeSound === opt.id && styles.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Video calls */}
        <Text style={styles.sectionLabel}>Video calls</Text>
        <Text style={styles.sectionHint}>
          Anyone inside your Room can video call you, one at a time or as a group room.
        </Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            onPress={() => setCallMode('solo')}
            style={[styles.chip, callMode === 'solo' && styles.chipActive]}
            hitSlop={HIT_SLOP}
          >
            <User size={rs(12)} color={callMode === 'solo' ? T.primary : T.textMute} />
            <Text style={[styles.chipText, callMode === 'solo' && styles.chipTextActive]}>One guest at a time</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCallMode('multi')}
            style={[styles.chip, callMode === 'multi' && styles.chipActive]}
            hitSlop={HIT_SLOP}
          >
            <Users size={rs(12)} color={callMode === 'multi' ? T.primary : T.textMute} />
            <Text style={[styles.chipText, callMode === 'multi' && styles.chipTextActive]}>Group room</Text>
          </TouchableOpacity>
        </View>

        {callMode === 'multi' && (
          <View style={styles.capacityCard}>
            <View style={styles.capacityRow}>
              <Video size={rs(14)} color={T.primary} />
              <Text style={styles.capacityText}>
                Room holds <Text style={{ fontWeight: '700', color: T.text }}>{maxGuests}</Text> guests at once
              </Text>
            </View>
            {maxGuests < 12 ? (
              <View style={styles.buySlotsRow}>
                <TouchableOpacity
                  style={styles.buySlotsBtn}
                  onPress={() => handleBuySlots(Math.min(2, 12 - maxGuests))}
                  disabled={buyingSlots}
                  hitSlop={HIT_SLOP}
                >
                  {buyingSlots ? <ActivityIndicator size="small" color={T.primary} /> : (
                    <>
                      <Plus size={rs(12)} color={T.primary} />
                      <Text style={styles.buySlotsText}>{Math.min(2, 12 - maxGuests)} guests — {Math.min(2, 12 - maxGuests) * 25} coins</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.capacityMaxedText}>Room is at its largest size.</Text>
            )}
          </View>
        )}

        {/* Gallery, in the order visitors will see it. */}
        <Text style={styles.sectionLabel}>On the walls ({gallery.length}/3)</Text>
        <Text style={styles.sectionHint}>
          Photos, GIFs or short videos. Who sees them is set in Privacy.
        </Text>
        <View style={styles.galleryRow}>
          {gallery.map((item, idx) => (
            <View key={idx} style={styles.galleryItem}>
              <Image source={{ uri: item.media_url }} style={styles.galleryThumb} />
              {item.media_type === 'video' && (
                <View style={styles.galleryBadge}><Text style={styles.galleryBadgeIcon}>▶</Text></View>
              )}
              {item.media_type === 'gif' && <Text style={styles.galleryBadgeText}>GIF</Text>}
              <TouchableOpacity
                style={styles.galleryDelete}
                onPress={() => handleDeleteGalleryItem(idx)}
                hitSlop={HIT_SLOP}
              >
                <Trash2 size={rs(14)} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {gallery.length < 3 && (
            <TouchableOpacity
              style={styles.galleryAdd}
              onPress={handleAddGalleryMedia}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading ? <ActivityIndicator color={T.primary} /> : (
                <>
                  <Camera size={rs(20)} color={T.textMute} />
                  <Text style={styles.galleryAddText}>Add a shared media</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
          </>
        )}

        {tab === 'knocks' && (
          knocks === null ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(30) }} /> : (
            <>
              <Text style={styles.info}>Knocking is free for them. Let someone in and their coins move automatically. Decline and nothing happens.</Text>
              {knocks.length === 0 ? <Text style={styles.empty}>No one's at the door. Post something and watch the knocks come in.</Text> : null}
              {knocks.map((k) => (
                <View key={k.id} style={styles.person}>
                  <View style={styles.personAva}>
                    {k.requester_avatar_url ? <Image source={{ uri: k.requester_avatar_url }} style={styles.personImg} /> : <Text style={styles.personInitial}>{(k.requester_anonymous_name || 'A')[0].toUpperCase()}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.personName} numberOfLines={1}>{k.requester_anonymous_name || 'Anonymous'}</Text>
                    <Text style={styles.personSub} numberOfLines={2}>
                      {k.pitch ? `“${k.pitch}”` : 'Just knocked'}{k.intents?.length ? ` · ${k.intents.map(intentLabel).join(', ')}` : ''}
                    </Text>
                    {/* Videos open full size in the Knocks inbox. */}
                    <KnockClues item={k} onOpenMedia={() => navigation.navigate('UnlockRequestsScreen')} />
                    <View style={styles.personActs}>
                      <TouchableOpacity style={styles.actBtn} onPress={() => navigation.navigate('Room', { userId: k.requester_id })}><Text style={styles.actText}>Peek</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.actBtn} disabled={personBusy === k.id} onPress={() => handleKnock(k, false)}><Text style={styles.actText}>Decline</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.actBtn, styles.actPrimary]} disabled={personBusy === k.id} onPress={() => handleKnock(k, true)}>
                        {personBusy === k.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.actText, { color: '#fff' }]}>Let In</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )
        )}

        {tab === 'inside' && (
          inside === null ? <ActivityIndicator color={T.primary} style={{ marginTop: rp(30) }} /> : (
            <>
              <Text style={styles.info}>People you've let in. Remove closes the conversation; they'd have to knock again. Block also stops them knocking.</Text>
              {inside.length === 0 ? <Text style={styles.empty}>Nobody's inside yet. When you let someone in, they show up here.</Text> : null}
              {inside.map((c) => (
                <View key={c.id} style={styles.person}>
                  <View style={styles.personAva}>
                    {c.other_avatar_url ? <Image source={{ uri: c.other_avatar_url }} style={styles.personImg} /> : <Text style={styles.personInitial}>{(c.other_anonymous_name || 'A')[0].toUpperCase()}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.personName} numberOfLines={1}>{c.other_anonymous_name || 'Anonymous'}</Text>
                    <Text style={styles.personSub} numberOfLines={1}>{c.last_message || 'No messages yet'}</Text>
                    <View style={styles.personActs}>
                      <TouchableOpacity style={styles.actBtn} onPress={() => navigation.navigate('DropChat', { connectionId: c.id })}><Text style={styles.actText}>Chat</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.actBtn} disabled={personBusy === c.id} onPress={() => handleRemove(c)}><Text style={styles.actText}>Remove</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.actBtn} onPress={() => handleReport(c)}><Text style={styles.actText}>Report</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.actBtn} disabled={personBusy === c.id} onPress={() => handleBlock(c)}><Text style={[styles.actText, { color: T.danger }]}>Block</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )
        )}

        {tab === 'privacy' && (
          <>
            <Text style={styles.sectionLabel}>Who sees your photos</Text>
            {GALLERY_VISIBILITY.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.option, galleryVisibility === v.id && styles.optionOn]}
                onPress={() => setGalleryVisibility(v.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: galleryVisibility === v.id }}
              >
                <View style={[styles.radio, galleryVisibility === v.id && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{v.label}</Text>
                  <Text style={styles.optionHint}>{v.hint}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <Text style={styles.sectionLabel}>Your door</Text>
            <View style={styles.option}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Taking knocks</Text>
                <Text style={styles.optionHint}>
                  {knocksOpen
                    ? 'Anyone 18+ who finds your post can knock.'
                    : breakUntil && breakHours === null
                      ? `Taking a break until ${new Date(breakUntil).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. People already inside stay inside.`
                      : 'Taking a break. Nobody new can knock. People already inside stay inside.'}
                </Text>
              </View>
              <Switch
                value={knocksOpen}
                onValueChange={(v) => { setKnocksOpen(v); setBreakHours(v ? null : 12); }}
                trackColor={{ false: T.surfaceAlt, true: T.gold }}
                thumbColor="#fff"
                accessibilityLabel="Taking knocks"
              />
            </View>
            {!knocksOpen && breakHours !== null && [[12, 'For tonight', 'Back on in 12 hours'], [72, 'For 3 days', 'Back on by itself'], [168, 'For a week', 'Back on by itself'], [0, 'Until I switch it back', 'Stays off']].map(([h, label, hint]) => (
              <TouchableOpacity
                key={h}
                style={[styles.option, breakHours === h && styles.optionOn]}
                onPress={() => setBreakHours(h)}
                accessibilityRole="radio"
                accessibilityState={{ checked: breakHours === h }}
              >
                <View style={[styles.radio, breakHours === h && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{label}</Text>
                  <Text style={styles.optionHint}>{hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.info}>Open or on a break is about knocks only. Nobody sees when you're online.</Text>
            <Text style={styles.sectionLabel}>What a knock must include</Text>
            {DOOR_RULES.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.option, doorRule === r.id && styles.optionOn]}
                onPress={() => setDoorRule(r.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: doorRule === r.id }}
              >
                <View style={[styles.radio, doorRule === r.id && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{r.label}</Text>
                  <Text style={styles.optionHint}>{r.hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.info}>Photos and videos on a knock arrive blurred until you tap them, and disappear if you decline.</Text>
            <Text style={styles.sectionLabel}>Where people find your Room</Text>
            {LISTINGS.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.option, listing === r.id && styles.optionOn]}
                onPress={() => setListing(r.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: listing === r.id }}
              >
                <View style={[styles.radio, listing === r.id && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{r.label}</Text>
                  <Text style={styles.optionHint}>{r.hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.info}>
              Near shows your area (county and country), never your exact spot. Open or taking a break is about knocks, not whether you're online. People you block can't see your Room or knock on it.
            </Text>
          </>
        )}
      </ScrollView>

      {(tab === 'room' || tab === 'appearance' || tab === 'privacy') && (
      <View style={[styles.footer, { paddingBottom: insets.bottom + rp(12) }]}>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
        </TouchableOpacity>
      </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content:  { padding: SPACING.md, gap: rp(4) },

  tabs: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: T.border },
  tabsIn: { paddingHorizontal: SPACING.md, paddingVertical: rp(10), gap: rp(6) },
  tab: { flexDirection: 'row', alignItems: 'center', gap: rp(6), height: rs(34), paddingHorizontal: rp(14), borderRadius: 999, borderWidth: 1, borderColor: T.border },
  tabOn: { borderColor: T.gold, backgroundColor: 'rgba(251,191,36,0.08)' },
  tabText: { fontFamily: 'DMSans-Bold', fontSize: rf(13), color: T.textSec },
  tabTextOn: { color: T.text },
  badge: { minWidth: rs(18), height: rs(18), borderRadius: rs(9), paddingHorizontal: rp(5), backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: rf(11), fontWeight: '800' },

  heroCard: { flexDirection: 'row', alignItems: 'center', gap: rp(14), padding: rp(12), borderRadius: RADIUS.lg, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, marginBottom: rp(4) },
  heroTitle: { fontFamily: 'PlayfairDisplay-Italic', fontSize: rf(19), color: T.text },
  heroText: { fontSize: rf(12), color: T.textSec, lineHeight: rf(17) },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: T.borderStrong, borderRadius: 999, paddingHorizontal: rp(12), paddingVertical: rp(6) },
  pillText: { color: T.text, fontSize: rf(12), fontWeight: '700' },

  input: {
    backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border, borderRadius: RADIUS.md,
    paddingHorizontal: rp(14), paddingVertical: rp(12), color: T.text, fontSize: FONT.md,
    fontFamily: 'DMSans-Regular', minHeight: rs(56), textAlignVertical: 'top',
  },
  info: { fontSize: FONT.sm, color: T.textSec, lineHeight: FONT.sm * 1.5, backgroundColor: T.surface, borderRadius: RADIUS.md, padding: rp(12), marginVertical: rp(8) },
  empty: { fontSize: FONT.sm, color: T.textSec, textAlign: 'center', marginTop: rp(24) },
  person: { flexDirection: 'row', gap: rp(12), paddingVertical: rp(12), borderBottomWidth: 1, borderBottomColor: T.border },
  personAva: { width: rs(46), height: rs(46), borderRadius: rs(23), overflow: 'hidden', backgroundColor: T.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: T.goldBorder },
  personImg: { width: '100%', height: '100%' },
  personInitial: { color: T.text, fontWeight: '800', fontSize: FONT.md },
  personName: { color: T.text, fontWeight: '700', fontSize: FONT.md },
  personSub: { color: T.textSec, fontSize: rf(12), marginTop: rp(2) },
  personActs: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(6), marginTop: rp(8) },
  actBtn: { height: rs(32), paddingHorizontal: rp(12), borderRadius: rs(10), borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  actPrimary: { backgroundColor: T.primary, borderColor: T.primary },
  actText: { color: T.text, fontSize: rf(12), fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: rp(12), padding: rp(14), borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, marginBottom: rp(8) },
  optionOn: { borderColor: T.gold, backgroundColor: 'rgba(251,191,36,0.06)' },
  radio: { width: rs(18), height: rs(18), borderRadius: rs(9), borderWidth: 2, borderColor: T.borderStrong },
  radioOn: { borderColor: T.gold, backgroundColor: T.gold },
  optionTitle: { color: T.text, fontSize: FONT.sm, fontWeight: '700' },
  optionHint: { color: T.textSec, fontSize: rf(12), lineHeight: rf(17), marginTop: rp(2) },
  sectionLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop:     SPACING.md,
    marginBottom:  rp(10),
  },
  sectionHint: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(11),
    color:      T.textMute,
    marginBottom: rp(10),
  },

  avatarWrap: { alignSelf: 'flex-start', position: 'relative' },
  avatar: {
    width:  rs(80),
    height: rs(80),
    borderRadius: rs(40),
  },
  avatarPlaceholder: {
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     T.border,
  },
  avatarInitialText: { fontSize: rf(28), fontWeight: '700', color: T.primary },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: rs(24), height: rs(24), borderRadius: rs(12),
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.background,
  },
  avatarHint: {
    fontFamily: 'DMSans-Italic', fontSize: rf(11), color: T.textMute,
    marginTop: rp(6),
  },

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(12) },
  patternSwatch: {
    width:  rs(52),
    height: rs(52),
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  patternSwatchActive: { borderColor: T.primary },
  patternLabel: {
    fontFamily: 'DMSans-Regular',
    fontSize:   rf(10),
    color:      T.textMute,
    textAlign:  'center',
    marginTop:  rp(4),
    width:      rs(52),
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               rp(6),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(9),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   T.surfaceAlt,
  },
  fontChip: {
    alignItems:        'center',
    gap:               rp(4),
    paddingHorizontal: rp(14),
    paddingVertical:   rp(9),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    backgroundColor:   T.surfaceAlt,
    minWidth:          rs(64),
  },
  fontChipPreview: { fontSize: rf(18), color: T.text },
  chipActive: { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  chipText:   { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.textSec },
  chipTextActive: { color: T.primary, fontFamily: 'DMSans-Bold' },

  capacityCard: {
    backgroundColor: T.surfaceAlt, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    padding: rp(14), marginTop: rp(4), marginBottom: rp(10), gap: rp(10),
  },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  capacityText: { fontSize: FONT.sm, color: T.textSec },
  buySlotsRow: { flexDirection: 'row' },
  buySlotsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: rp(6),
    backgroundColor: T.primaryDim, borderRadius: RADIUS.full, borderWidth: 1, borderColor: T.primaryBorder,
    paddingHorizontal: rp(14), paddingVertical: rp(8),
  },
  buySlotsText: { fontSize: rf(12), fontWeight: '700', color: T.primary },
  capacityMaxedText: { fontSize: rf(11), color: T.textMute, fontStyle: 'italic' },

  galleryRow: { gap: rp(12) },
  galleryItem: {
    width:  '100%',
    height: rs(180),
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.border,
  },
  galleryThumb: { width: '100%', height: '100%' },
  galleryBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  galleryBadgeIcon: { color: '#fff', fontSize: rf(30) },
  galleryBadgeText: {
    position: 'absolute', bottom: rp(8), left: rp(8),
    backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
    fontSize: rf(10), fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: rp(6), paddingVertical: rp(3), borderRadius: rs(5),
  },
  galleryDelete: {
    position: 'absolute', top: rp(8), right: rp(8),
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: rs(14), width: rs(28), height: rs(28),
    alignItems: 'center', justifyContent: 'center',
  },
  galleryAdd: {
    width: '100%',
    height: rs(56),
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap: rp(8),
    borderRadius: RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    borderStyle:     'dashed',
  },
  galleryAddText: { fontSize: rf(12), fontWeight: '600', color: T.textMute },

  footer: {
    paddingHorizontal: SPACING.md,
    paddingTop: rp(12),
    borderTopWidth: 1,
    borderTopColor: T.border,
    backgroundColor: T.background,
  },
  saveBtn: {
    height: BUTTON_HEIGHT,
    borderRadius: RADIUS.md,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: 'DMSans-Bold',
    fontSize: FONT.md,
    color: '#fff',
    letterSpacing: 0.4,
  },
});
