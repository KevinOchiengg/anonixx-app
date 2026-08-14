/**
 * ChatProfileSetupScreen.jsx
 *
 * One-time (then editable) setup for the per-poster themed chat surface:
 * background color, font style, stickers, profile picture, and a media
 * gallery (max 3 items) — all of it only ever visible to someone who has
 * actually unlocked one of this user's drops (enforced server-side).
 *
 * Reached by tapping the Messages tab before a profile exists
 * (TabNavigator.jsx), or manually from Settings to edit later.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Trash2, Volume2 } from 'lucide-react-native';

import { T } from '../../utils/colorTokens';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { WELCOME_SOUND_OPTIONS, WELCOME_SOUND_MAP } from '../../config/sounds';

const BG_COLORS = [
  '#151924', '#1a0f14', '#0f1a17', '#1a1420', '#20141a',
  '#141a20', '#241614', '#1a1a0f', '#100f1a', '#0b0f18',
];

const FONT_STYLES = [
  { id: 'classic',       label: 'Classic' },
  { id: 'sultry-script', label: 'Sultry' },
  { id: 'bold-tease',    label: 'Bold Tease' },
];

const STICKER_PACK = ['🔥', '😈', '💋', '🖤', '✨', '🌙', '⛓️', '🍒', '😏', '💦'];

export default function ChatProfileSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);

  const [backgroundColor, setBackgroundColor] = useState(BG_COLORS[0]);
  const [fontStyle, setFontStyle]             = useState('classic');
  const [stickers, setStickers]               = useState([]);
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [gallery, setGallery]                 = useState([]);
  const [welcomeSound, setWelcomeSound]       = useState('soft-chime');

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
            setBackgroundColor(data.background_color || BG_COLORS[0]);
            setFontStyle(data.font_style || 'classic');
            setStickers(data.stickers || []);
            setProfilePictureUrl(data.profile_picture_url || null);
            setGallery(data.gallery || []);
            setWelcomeSound(data.welcome_sound || 'soft-chime');
          }
        }
      } catch {
        /* offline — start fresh, save will retry */
      } finally {
        setLoading(false);
      }
    })();
  }, [authHeaders]);

  const toggleSticker = useCallback((sticker) => {
    setStickers((prev) => prev.includes(sticker)
      ? prev.filter((s) => s !== sticker)
      : prev.length >= 5 ? prev : [...prev, sticker]);
  }, []);

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
      const ext = asset.uri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
      form.append('file', { uri: asset.uri, name: `profile_${Date.now()}.${ext}`, type: 'image/jpeg' });
      const res = await fetch(`${API_BASE_URL}/api/v1/upload/image`, {
        method: 'POST',
        headers: await authHeaders(),
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setProfilePictureUrl(data.url);
    } catch {
      showToast({ type: 'error', message: 'Could not upload picture.' });
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
      const ext = asset.uri.split('?')[0].split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg');
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: `${isVideo ? 'gallery_vid' : 'gallery_img'}_${Date.now()}.${ext}`,
        type: isVideo ? 'video/mp4' : 'image/jpeg',
      });
      const res = await fetch(`${API_BASE_URL}/api/v1/upload/${isVideo ? 'video' : 'image'}`, {
        method: 'POST',
        headers: await authHeaders(),
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      const uploadData = await res.json();

      const addRes = await fetch(`${API_BASE_URL}/api/v1/chat-profile/media`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          media_url: uploadData.url,
          media_type: isVideo ? 'video' : 'image',
          duration_seconds: asset.duration ? asset.duration / 1000 : undefined,
        }),
      });
      if (!addRes.ok) throw new Error('Could not save media.');
      const profile = await addRes.json();
      setGallery(profile.gallery || []);
    } catch {
      showToast({ type: 'error', message: 'Could not add media.' });
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
          background_color: backgroundColor,
          font_style: fontStyle,
          stickers,
          profile_picture_url: profilePictureUrl,
          welcome_sound: welcomeSound,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast({ type: 'success', message: 'Chat interface saved.' });
      navigation.replace ? navigation.replace('MessagesMain') : navigation.navigate('MessagesMain');
    } catch {
      showToast({ type: 'error', message: 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }, [backgroundColor, fontStyle, stickers, profilePictureUrl, welcomeSound, authHeaders, showToast, navigation]);

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

        {/* Profile picture */}
        <Text style={styles.sectionLabel}>Profile picture</Text>
        <TouchableOpacity onPress={handlePickProfilePicture} activeOpacity={0.85} style={styles.avatarWrap}>
          {profilePictureUrl ? (
            <Image source={{ uri: profilePictureUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Camera size={rs(24)} color={T.textMute} />
            </View>
          )}
        </TouchableOpacity>

        {/* Background color */}
        <Text style={styles.sectionLabel}>Background color</Text>
        <View style={styles.swatchRow}>
          {BG_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setBackgroundColor(c)}
              style={[
                styles.swatch,
                { backgroundColor: c },
                backgroundColor === c && styles.swatchActive,
              ]}
            />
          ))}
        </View>

        {/* Font style */}
        <Text style={styles.sectionLabel}>Font style</Text>
        <View style={styles.chipRow}>
          {FONT_STYLES.map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFontStyle(f.id)}
              style={[styles.chip, fontStyle === f.id && styles.chipActive]}
              hitSlop={HIT_SLOP}
            >
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

        {/* Stickers */}
        <Text style={styles.sectionLabel}>Stickers (up to 5)</Text>
        <View style={styles.chipRow}>
          {STICKER_PACK.map((sticker) => (
            <TouchableOpacity
              key={sticker}
              onPress={() => toggleSticker(sticker)}
              style={[styles.stickerChip, stickers.includes(sticker) && styles.chipActive]}
              hitSlop={HIT_SLOP}
            >
              <Text style={styles.stickerText}>{sticker}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Gallery */}
        <Text style={styles.sectionLabel}>Media gallery ({gallery.length}/3)</Text>
        <Text style={styles.sectionHint}>
          Shown to whoever unlocks your chat — one auto-plays as a welcome. At least one can be a longer video.
        </Text>
        <View style={styles.galleryRow}>
          {gallery.map((item, idx) => (
            <View key={idx} style={styles.galleryItem}>
              <Image source={{ uri: item.media_url }} style={styles.galleryThumb} />
              {item.media_type === 'video' && <Text style={styles.galleryBadge}>▶</Text>}
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
              style={[styles.galleryItem, styles.galleryAdd]}
              onPress={handleAddGalleryMedia}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading ? <ActivityIndicator color={T.primary} /> : <Camera size={rs(22)} color={T.textMute} />}
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

  avatarWrap: { alignSelf: 'flex-start' },
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

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(10) },
  swatch: {
    width:  rs(36),
    height: rs(36),
    borderRadius: rs(18),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: T.primary },

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
  chipActive: { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  chipText:   { fontFamily: 'DMSans-Regular', fontSize: FONT.sm, color: T.textSec },
  chipTextActive: { color: T.primary, fontFamily: 'DMSans-Bold' },

  stickerChip: {
    width:  rs(44),
    height: rs(44),
    borderRadius: RADIUS.md,
    borderWidth:  1,
    borderColor:  T.border,
    backgroundColor: T.surfaceAlt,
    alignItems:     'center',
    justifyContent: 'center',
  },
  stickerText: { fontSize: rf(20) },

  galleryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(10) },
  galleryItem: {
    width:  rs(90),
    height: rs(90),
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: T.surfaceAlt,
  },
  galleryThumb: { width: '100%', height: '100%' },
  galleryBadge: {
    position: 'absolute', top: '40%', left: '42%',
    color: '#fff', fontSize: rf(18),
  },
  galleryDelete: {
    position: 'absolute', top: rp(4), right: rp(4),
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: rs(12), width: rs(24), height: rs(24),
    alignItems: 'center', justifyContent: 'center',
  },
  galleryAdd: {
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     T.border,
    borderStyle:     'dashed',
  },

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
