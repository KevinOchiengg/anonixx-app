/**
 * CreateAdScreen.jsx
 *
 * Buy an ad slot in the main feed — priced by how long it runs (see
 * POST /ads in the backend). Non-admins pay coins up front and wait for a
 * human to approve before it reaches the whole feed's audience; admins get
 * a free "house" ad that goes live immediately.
 *
 * The ad always points at one of the creator's own active Drops — tapping
 * it in the feed takes a viewer straight into the existing unlock flow for
 * that Drop, which is what actually lands them in the creator's chat
 * interface. No raw-URL field for regular users; if they have no active
 * Drop yet, they're sent to create one first.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowLeft, Image as ImageIcon, Video as VideoIcon, Sticker, Music, Check, FileText,
} from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const AD_COINS_PER_HOUR = 5;

const MEDIA_TABS = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: VideoIcon },
  { id: 'gif',   label: 'GIF',   icon: Sticker },
  { id: 'audio', label: 'Audio', icon: Music },
];

export default function CreateAdScreen({ navigation }) {
  const { showToast } = useToast();

  const [title, setTitle]         = useState('');
  const [hours, setHours]         = useState('24');
  const [mediaType, setMediaType] = useState('image');
  const [mediaUri, setMediaUri]   = useState(null);
  const [mediaName, setMediaName] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [drops, setDrops]         = useState(null);   // null = loading
  const [selectedDropId, setSelectedDropId] = useState(null);

  const authHeaders = useCallback(async (json = false) => {
    const token = await AsyncStorage.getItem('token');
    return {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/ads/my-drops`, { headers: await authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setDrops(data.drops || []);
          if (data.drops?.length) setSelectedDropId(data.drops[0].id);
        } else {
          setDrops([]);
        }
      } catch {
        setDrops([]);
      }
    })();
  }, [authHeaders]);

  // Switching tabs clears whatever was picked under the old type — a video
  // file left over while on the Image tab would silently upload wrong.
  const handleSelectMediaType = useCallback((id) => {
    setMediaType(id);
    setMediaUri(null);
    setMediaName(null);
  }, []);

  const handlePickVisualMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaType === 'video' ? ['videos'] : ['images'],
      quality: 0.85,
    });
    if (result.canceled) return;
    setMediaUri(result.assets[0].uri);
    setMediaName(null);
  }, [mediaType, showToast]);

  const handlePickAudio = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;
    setMediaUri(asset.uri);
    setMediaName(asset.name);
  }, []);

  const cost = (parseInt(hours, 10) || 0) * AD_COINS_PER_HOUR;

  const handleSubmit = useCallback(async () => {
    const durationHours = parseInt(hours, 10);
    if (!title.trim() || !selectedDropId || !durationHours) {
      showToast({ type: 'warning', message: 'Add a title, pick a Drop to link to, and a duration.' });
      return;
    }
    setSubmitting(true);
    try {
      let uploadedUrl = null;
      if (mediaUri) {
        const ext = mediaUri.split('?')[0].split('.').pop()?.toLowerCase()
          || (mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'm4a' : 'jpg');
        const mimeByType = {
          image: 'image/jpeg', gif: 'image/gif', video: 'video/mp4', audio: 'audio/mpeg',
        };
        const uploadEndpoint = mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio' : 'image';
        const form = new FormData();
        form.append('file', { uri: mediaUri, name: `feed_ad.${ext}`, type: mimeByType[mediaType] });
        const uploadRes = await fetch(`${API_BASE_URL}/api/v1/upload/${uploadEndpoint}`, {
          method: 'POST', headers: await authHeaders(), body: form,
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        uploadedUrl = (await uploadRes.json()).url;
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/ads`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          title: title.trim(),
          drop_id: selectedDropId,
          media_url: uploadedUrl,
          media_type: mediaType,
          duration_hours: durationHours,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast({ type: 'success', message: data.message || 'Ad submitted.' });
        navigation.goBack();
      } else if (res.status === 402) {
        showToast({ type: 'warning', message: data.detail || 'Not enough coins.' });
        navigation.navigate('Coins');
      } else {
        showToast({ type: 'error', message: data.detail || 'Could not submit ad.' });
      }
    } catch {
      showToast({ type: 'error', message: 'Could not submit ad. Try again.' });
    } finally {
      setSubmitting(false);
    }
  }, [title, selectedDropId, hours, mediaUri, mediaType, authHeaders, showToast, navigation]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.headerBtn}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Advertise</Text>
        <View style={s.headerBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.hint}>
            {AD_COINS_PER_HOUR} coins per hour it runs. Submissions go to a human for review before
            they reach the main feed — rejected ads are refunded in full.
          </Text>

          <Text style={s.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What are you promoting?"
            placeholderTextColor={T.textMuted}
            style={s.input}
            maxLength={80}
          />

          <Text style={s.label}>Links to</Text>
          {drops === null ? (
            <ActivityIndicator color={T.primary} style={{ marginVertical: rp(12) }} />
          ) : drops.length === 0 ? (
            <View style={s.emptyDrops}>
              <Text style={s.emptyDropsText}>
                You need an active Drop to advertise — this is what people land on when they tap your ad.
              </Text>
              <TouchableOpacity
                style={s.emptyDropsBtn}
                onPress={() => navigation.navigate('DropsCompose')}
                activeOpacity={0.85}
              >
                <Text style={s.emptyDropsBtnText}>Create a Drop</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.dropList}>
              {drops.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[s.dropRow, selectedDropId === d.id && s.dropRowActive]}
                  onPress={() => setSelectedDropId(d.id)}
                  activeOpacity={0.8}
                >
                  <View style={[s.dropCheck, selectedDropId === d.id && s.dropCheckActive]}>
                    {selectedDropId === d.id && <Check size={rs(11)} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text style={s.dropRowText} numberOfLines={2}>
                    {d.confession || '[media drop]'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={s.label}>Duration (hours)</Text>
          <TextInput
            value={hours}
            onChangeText={(v) => setHours(v.replace(/[^0-9]/g, ''))}
            placeholder="24"
            placeholderTextColor={T.textMuted}
            style={s.input}
            keyboardType="number-pad"
          />

          <Text style={s.label}>Ad media (optional)</Text>
          <View style={s.mediaTabsRow}>
            {MEDIA_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = mediaType === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => handleSelectMediaType(tab.id)}
                  style={[s.mediaTab, active && s.mediaTabActive]}
                  activeOpacity={0.85}
                >
                  <Icon size={rs(14)} color={active ? T.primary : T.textMuted} />
                  <Text style={[s.mediaTabText, active && s.mediaTabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={s.mediaPickBtn}
            onPress={mediaType === 'audio' ? handlePickAudio : handlePickVisualMedia}
            activeOpacity={0.85}
          >
            {mediaType === 'audio' && mediaUri ? (
              <View style={s.audioPicked}>
                <FileText size={rs(18)} color={T.primary} />
                <Text style={s.audioPickedText} numberOfLines={1}>{mediaName || 'Audio file selected'}</Text>
              </View>
            ) : mediaUri ? (
              <Image source={{ uri: mediaUri }} style={s.mediaPreview} />
            ) : (
              <>
                <ImageIcon size={rs(18)} color={T.textMuted} />
                <Text style={s.mediaPickText}>
                  {mediaType === 'audio' ? 'Attach an audio file' : `Attach ${mediaType === 'gif' ? 'a gif' : `a ${mediaType}`}`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={s.costText}>Cost: {cost} coins for {hours || 0}h</Text>

          <TouchableOpacity
            style={s.submitBtn}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.88}
          >
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>Submit ad</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: rp(12),
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerBtn: { padding: rp(4), width: rs(28) },
  headerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text, fontFamily: 'PlayfairDisplay-Bold' },

  content: { padding: SPACING.md, gap: rp(4), paddingBottom: rs(60) },
  hint: { fontSize: FONT.xs, color: T.textSecondary, lineHeight: rf(18), marginBottom: SPACING.md },

  label: { fontSize: FONT.xs, fontWeight: '700', color: T.textSecondary, marginTop: SPACING.sm, marginBottom: rp(6) },
  input: {
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: rp(14), paddingVertical: rp(12), color: T.text, fontSize: FONT.sm,
  },

  emptyDrops: {
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    padding: rp(16), gap: rp(10), alignItems: 'center',
  },
  emptyDropsText: { fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center', lineHeight: rf(19) },
  emptyDropsBtn: { backgroundColor: T.primary, borderRadius: RADIUS.md, paddingHorizontal: rp(18), paddingVertical: rp(10) },
  emptyDropsBtnText: { fontSize: FONT.sm, fontWeight: '700', color: '#fff' },

  dropList: { gap: rp(8) },
  dropRow: {
    flexDirection: 'row', alignItems: 'center', gap: rp(10),
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    padding: rp(12),
  },
  dropRowActive: { borderColor: T.primaryBorder, backgroundColor: T.primaryDim },
  dropCheck: {
    width: rs(20), height: rs(20), borderRadius: rs(10), borderWidth: 1.5, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dropCheckActive: { backgroundColor: T.primary, borderColor: T.primary },
  dropRowText: { flex: 1, fontSize: FONT.sm, color: T.text, fontStyle: 'italic' },

  mediaTabsRow: { flexDirection: 'row', gap: rp(8) },
  mediaTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(5),
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    paddingVertical: rp(10),
  },
  mediaTabActive: { backgroundColor: T.primaryDim, borderColor: T.primaryBorder },
  mediaTabText: { fontSize: rf(11), fontWeight: '600', color: T.textMuted },
  mediaTabTextActive: { color: T.primary },

  mediaPickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(8),
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    borderStyle: 'dashed', paddingVertical: rp(16), marginTop: SPACING.md, overflow: 'hidden',
  },
  mediaPickText: { fontSize: FONT.sm, color: T.textMuted },
  mediaPreview: { width: '100%', height: rs(140), borderRadius: RADIUS.sm },
  audioPicked: { flexDirection: 'row', alignItems: 'center', gap: rp(8), paddingHorizontal: rp(16) },
  audioPickedText: { fontSize: FONT.sm, color: T.text, flexShrink: 1 },

  costText: { fontSize: FONT.sm, fontWeight: '700', color: T.text, textAlign: 'center', marginTop: SPACING.lg },

  submitBtn: {
    marginTop: SPACING.md, backgroundColor: T.primary, borderRadius: RADIUS.md,
    paddingVertical: rp(14), alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { fontSize: FONT.md, fontWeight: '700', color: '#fff' },
});
