/**
 * DropsPollScreen.jsx
 *
 * Poll compose screen — hands off from DropsComposeScreen exactly like
 * DropsRecordScreen (Voice) does: tapping "Poll" in the format row
 * navigates here with { theme, moodTag, category, text, target_user_id }
 * carried over, and this screen owns the rest of the flow, including the
 * actual POST /drops.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import { X } from 'lucide-react-native';

import { rs, rf, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { awardMilestone } from '../../store/slices/coinsSlice';
import { DROP_THEMES } from '../../components/drops/DropCardRenderer';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import T from '../../utils/theme';

export default function DropsPollScreen({ navigation, route }) {
  const { showToast } = useToast();
  const dispatch = useDispatch();

  const theme        = route?.params?.theme        || 'desire';
  const moodTag       = route?.params?.moodTag      || 'longing';
  const category      = route?.params?.category     || 'love';
  const confession    = route?.params?.text         || '';
  const targetUserId  = route?.params?.target_user_id || undefined;

  const themeObj = DROP_THEMES[theme] || DROP_THEMES['desire'];
  const isTier2  = themeObj.tier === 2;

  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions,  setPollOptions]  = useState(['', '']);
  const [publisherOptIn, setPublisherOptIn] = useState(true);
  const [sending, setSending] = useState(false);

  const updateOption = useCallback((idx, value) => {
    setPollOptions((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }, []);

  const removeOption = useCallback((idx) => {
    setPollOptions((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev));
  }, []);

  const canSend = pollQuestion.trim().length > 0
    && pollOptions.filter((o) => o.trim()).length >= 2;

  const handleSend = useCallback(async () => {
    if (!canSend) {
      showToast({ type: 'warning', message: 'Add a question and at least 2 options.' });
      return;
    }
    setSending(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const body = {
        category,
        confession: confession.trim() || undefined,
        theme,
        mood_tag:   moodTag,
        poll: {
          question: pollQuestion.trim(),
          options:  pollOptions.filter((o) => o.trim()).slice(0, 4),
        },
        // Publisher opt-in is forced off for Tier 2 (After Dark never leaves).
        publisher_opt_in: isTier2 ? false : !!publisherOptIn,
        ...(targetUserId ? { target_user_id: targetUserId } : {}),
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
        const err = await res.json().catch(() => ({}));
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
      showToast({
        type:    'success',
        title:   'Poll dropped.',
        message: 'The quiet just got louder.',
      });
      dispatch(awardMilestone('first_drop'));

      // Land back in the main feed — the poll shows up there as a genuine
      // post now (see create_drop's post-mirroring on the backend).
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err) {
      showToast({ type: 'error', message: err?.message || 'Could not post your poll. Try again.' });
    } finally {
      setSending(false);
    }
  }, [
    canSend, category, confession, theme, moodTag, pollQuestion, pollOptions,
    isTier2, publisherOptIn, targetUserId, dispatch, navigation, showToast,
  ]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <DropScreenHeader title="Poll" navigation={navigation} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!confession.trim() && (
            <View style={s.confessionQuote}>
              <Text style={s.confessionQuoteText} numberOfLines={4}>{confession.trim()}</Text>
            </View>
          )}

          <Text style={s.sectionLabel}>Ask a question</Text>
          <TextInput
            style={s.input}
            value={pollQuestion}
            onChangeText={setPollQuestion}
            placeholder="What do you want to know?"
            placeholderTextColor={T.textMute}
            maxLength={120}
            multiline
          />

          <Text style={s.sectionLabel}>Options</Text>
          {pollOptions.map((opt, idx) => (
            <View key={idx} style={s.optionRow}>
              <TextInput
                style={[s.input, s.optionInput]}
                value={opt}
                onChangeText={(v) => updateOption(idx, v)}
                placeholder={`Option ${idx + 1}`}
                placeholderTextColor={T.textMute}
                maxLength={60}
              />
              {pollOptions.length > 2 && (
                <TouchableOpacity onPress={() => removeOption(idx)} hitSlop={HIT_SLOP} style={s.optionRemove}>
                  <X size={rs(14)} color={T.textMute} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {pollOptions.length < 4 && (
            <TouchableOpacity
              onPress={() => setPollOptions((prev) => [...prev, ''])}
              activeOpacity={0.85}
              style={s.addOptionBtn}
            >
              <Text style={s.addOptionText}>+ Add option</Text>
            </TouchableOpacity>
          )}

          {isTier2 ? (
            <Text style={s.toggleRowLockedNote}>
              After Dark drops stay inside Anonixx. Never published, never shared.
            </Text>
          ) : (
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleRowLabel}>Share to Anonixx socials</Text>
                <Text style={s.toggleRowSub}>Anonymous — your identity never leaves Anonixx</Text>
              </View>
              <Switch
                value={publisherOptIn}
                onValueChange={setPublisherOptIn}
                trackColor={{ false: T.surfaceAlt, true: T.primary }}
                thumbColor={publisherOptIn ? '#fff' : T.textMute}
                ios_backgroundColor={T.surfaceAlt}
              />
            </View>
          )}

          <TouchableOpacity
            style={[s.sendBtn, (!canSend || sending) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend || sending}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.sendBtnText}>Drop it  ↗</Text>
            }
          </TouchableOpacity>

          <Text style={s.footerNote}>Your identity stays hidden. Always.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.background },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl },

  confessionQuote: {
    borderLeftWidth: 2,
    borderLeftColor: T.border,
    paddingLeft:     rp(12),
    marginBottom:    SPACING.md,
  },
  confessionQuoteText: {
    fontFamily:    'PlayfairDisplay-Italic',
    fontSize:      rf(14),
    color:         T.textSec,
    lineHeight:    rf(20),
  },

  sectionLabel: {
    fontFamily:    'DMSans-Bold',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom:  rp(10),
    marginTop:     SPACING.sm,
  },

  input: {
    fontFamily:      'DMSans-Regular',
    fontSize:        FONT.md,
    color:           T.text,
    backgroundColor: T.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    paddingHorizontal: rp(14),
    paddingVertical:   rp(12),
  },

  optionRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           rp(8),
    marginBottom:  rp(8),
  },
  optionInput: { flex: 1 },
  optionRemove: { padding: rp(6) },

  addOptionBtn: { marginBottom: SPACING.md },
  addOptionText: { color: T.primary, fontSize: rf(12), fontWeight: '600' },

  toggleRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   rp(10),
    paddingHorizontal: rp(2),
    marginBottom:      SPACING.md,
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
  toggleRowLockedNote: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textSec,
    letterSpacing: 0.3,
    lineHeight:    rf(18),
    marginBottom:  SPACING.md,
  },

  sendBtn: {
    height:           BUTTON_HEIGHT,
    borderRadius:     RADIUS.lg,
    backgroundColor:  T.primary,
    alignItems:       'center',
    justifyContent:   'center',
    marginTop:        SPACING.sm,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: {
    fontFamily:    'DMSans-Bold',
    fontSize:      FONT.md,
    color:         '#fff',
    letterSpacing: 0.3,
  },

  footerNote: {
    fontFamily:    'DMSans-Italic',
    fontSize:      rf(11),
    color:         T.textMute,
    textAlign:     'center',
    marginTop:     SPACING.md,
    letterSpacing: 0.5,
  },
});
