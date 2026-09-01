/**
 * ChatProfileSetupScreen.jsx
 *
 * One-time (then editable) setup for the per-poster themed chat surface:
 * background color, font style, profile picture, and a media gallery
 * (max 3 items) — all of it only ever visible to someone who has actually
 * unlocked one of this user's drops (enforced server-side).
 *
 * Reached from the palette icon in MessagesScreen's header — the Messages
 * tab itself always opens straight to the conversation list, never gates
 * on this being configured first.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator,
} from 'react-native';
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
import { WELCOME_SOUND_OPTIONS, WELCOME_SOUND_MAP } from '../../config/sounds';
import { BACKGROUND_PATTERNS, DEFAULT_BACKGROUND_PATTERN } from '../../config/patterns';
import { CHAT_FONT_OPTIONS, DEFAULT_CHAT_FONT } from '../../config/fonts';

function extOf(uri) {
  return uri.split('?')[0].split('.').pop()?.toLowerCase() || '';
}

export default function ChatProfileSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

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
  const [purchasedSlots, setPurchasedSlots]   = useState(0);
  const [buyingSlots, setBuyingSlots]         = useState(false);

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
            setPurchasedSlots(data.purchased_slots || 0);
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
      mediaTypes: 'images', quality: 0.85, allowsEditing: true, aspect: [1, 1],
    });
    if (result.canceled) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const form = new FormData();
      const ext = extOf(asset.uri) || 'jpg';
      const mimeType = ext === 'gif' ? 'image/gif' : 'image/jpeg';
      form.append('file', { uri: asset.uri, name: `profile_${Date.now()}.${ext}`, type: mimeType });
      const res = await fetch(`${API_BASE_URL}/api/v1/upload/image`, {
        method: 'POST',
        headers: await authHeaders(),
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setProfilePictureUrl(data.url);
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
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: `gallery_${mediaType}_${Date.now()}.${ext}`,
        type: isVideo ? 'video/mp4' : isGif ? 'image/gif' : 'image/jpeg',
      });
      const res = await fetch(`${API_BASE_URL}/api/v1/upload/${isVideo ? 'video' : 'image'}`, {
        method: 'POST',
        headers: await authHeaders(),
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Upload failed (${res.status})`);
      }
      const uploadData = await res.json();

      const addRes = await fetch(`${API_BASE_URL}/api/v1/chat-profile/media`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          media_url: uploadData.url,
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
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast({ type: 'success', message: 'Your room, your rules. Saved.' });
      navigation.replace ? navigation.replace('MessagesMain') : navigation.navigate('MessagesMain');
    } catch {
      showToast({ type: 'error', message: 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }, [backgroundPattern, fontStyle, profilePictureUrl, welcomeSound, callMode, authHeaders, showToast, navigation]);

  // Buys slots immediately (real coins spent) rather than waiting for the
  // main Save button, so the balance change and new cap are confirmed on
  // the spot instead of silently bundled into an unrelated save.
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
        setPurchasedSlots(data.purchased_slots);
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
      <DropScreenHeader title="Your Chat Interface" navigation={navigation} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + rp(100) }]}>
        <Text style={styles.intro}>
          This is what people see once they unlock a chat with you — decorate it however fits your vibe.
        </Text>

        {/* Profile picture — pulled from your account photo by default;
            tap to set a different one just for chat. Falls back to your
            first initial if you haven't set a photo anywhere. */}
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

        {/* Background pattern */}
        <Text style={styles.sectionLabel}>Background</Text>
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
        <Text style={styles.sectionLabel}>Font</Text>
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

        {/* Welcome sound — plays once for a first-time unlocker */}
        <Text style={styles.sectionLabel}>Welcome sound</Text>
        <Text style={styles.sectionHint}>
          Plays once when someone unlocks a chat with you for the first time.
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
          Anyone who's unlocked a chat with you can video call you, one at a time or as a group room.
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

        {/* Gallery — stacked vertically, one under another, the same way
            they'll land as pre-shared media in the room itself. */}
        <Text style={styles.sectionLabel}>Media gallery ({gallery.length}/3)</Text>
        <Text style={styles.sectionHint}>
          Shown as a swipeable welcome to whoever unlocks your chat for the first time — image, video, or gif.
          Entertains them if you're not online yet.
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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + rp(12) }]}>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: T.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content:  { padding: SPACING.md, gap: rp(4) },

  intro: {
    fontFamily: 'DMSans-Italic',
    fontSize:   FONT.sm,
    color:      T.textSec,
    lineHeight: rf(20),
    marginBottom: SPACING.md,
  },
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
