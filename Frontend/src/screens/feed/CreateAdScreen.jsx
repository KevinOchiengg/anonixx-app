/**
 * CreateAdScreen.jsx
 *
 * Buy an ad slot in the main feed — priced by how long it runs (see
 * POST /ads in the backend). Non-admins pay coins up front and wait for a
 * human to approve before it reaches the whole feed's audience; admins get
 * a free "house" ad that goes live immediately.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const AD_COINS_PER_HOUR = 5;

export default function CreateAdScreen({ navigation }) {
  const { showToast } = useToast();

  const [title, setTitle]         = useState('');
  const [linkUrl, setLinkUrl]     = useState('');
  const [hours, setHours]         = useState('24');
  const [mediaUri, setMediaUri]   = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = useCallback(async (json = false) => {
    const token = await AsyncStorage.getItem('token');
    return {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }, []);

  const handlePickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ type: 'warning', message: 'Gallery access is needed.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled) return;
    setMediaUri(result.assets[0].uri);
  }, [showToast]);

  const cost = (parseInt(hours, 10) || 0) * AD_COINS_PER_HOUR;

  const handleSubmit = useCallback(async () => {
    const durationHours = parseInt(hours, 10);
    if (!title.trim() || !linkUrl.trim() || !durationHours) {
      showToast({ type: 'warning', message: 'Fill in a title, link, and duration.' });
      return;
    }
    setSubmitting(true);
    try {
      let uploadedUrl = null;
      if (mediaUri) {
        const ext = mediaUri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
        const form = new FormData();
        form.append('file', { uri: mediaUri, name: `feed_ad.${ext}`, type: 'image/jpeg' });
        const uploadRes = await fetch(`${API_BASE_URL}/api/v1/upload/image`, {
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
          link_url: linkUrl.trim(),
          media_url: uploadedUrl,
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
  }, [title, linkUrl, hours, mediaUri, authHeaders, showToast, navigation]);

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

          <Text style={s.label}>Link</Text>
          <TextInput
            value={linkUrl}
            onChangeText={setLinkUrl}
            placeholder="https://… or anonixx://drop/…"
            placeholderTextColor={T.textMuted}
            style={s.input}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={s.label}>Duration (hours)</Text>
          <TextInput
            value={hours}
            onChangeText={(v) => setHours(v.replace(/[^0-9]/g, ''))}
            placeholder="24"
            placeholderTextColor={T.textMuted}
            style={s.input}
            keyboardType="number-pad"
          />

          <TouchableOpacity style={s.mediaPickBtn} onPress={handlePickMedia} activeOpacity={0.85}>
            {mediaUri ? (
              <Image source={{ uri: mediaUri }} style={s.mediaPreview} />
            ) : (
              <>
                <ImageIcon size={rs(18)} color={T.textMuted} />
                <Text style={s.mediaPickText}>Attach an image (optional)</Text>
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

  mediaPickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rp(8),
    backgroundColor: T.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border,
    borderStyle: 'dashed', paddingVertical: rp(16), marginTop: SPACING.md, overflow: 'hidden',
  },
  mediaPickText: { fontSize: FONT.sm, color: T.textMuted },
  mediaPreview: { width: '100%', height: rs(140), borderRadius: RADIUS.sm },

  costText: { fontSize: FONT.sm, fontWeight: '700', color: T.text, textAlign: 'center', marginTop: SPACING.lg },

  submitBtn: {
    marginTop: SPACING.md, backgroundColor: T.primary, borderRadius: RADIUS.md,
    paddingVertical: rp(14), alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { fontSize: FONT.md, fontWeight: '700', color: '#fff' },
});
