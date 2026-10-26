/**
 * AgeGate
 *
 * One-time 18+ confirmation, shown wherever the backend answers
 * age_verification_required (Rooms, posting a hookup, sending a link up).
 * One tick, like signup's 18+ confirmation; POST /users/me/verify-age.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Check } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';

import { T } from '../../utils/colorTokens';
import { rs, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT } from '../../utils/responsive';
import { API_BASE_URL } from '../../config/api';
import { updateUser } from '../../store/slices/authSlice';

export default function AgeGate({ onDone }) {
  const dispatch = useDispatch();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const complete = agree;

  const confirm = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/users/me/verify-age`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ adult_confirmed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Try again.');
        return;
      }
      dispatch(updateUser({ age_verified: true }));
      onDone?.();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>Adults only past this point.</Text>
      <Text style={s.copy}>Confirm you're 18+ once and every Room opens.</Text>
      <TouchableOpacity style={s.row} onPress={() => setAgree((v) => !v)} activeOpacity={0.8} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}>
        <View style={[s.box, agree && s.boxOn]}>{agree ? <Check size={rs(14)} color="#fff" strokeWidth={3} /> : null}</View>
        <Text style={s.copy}>I'm 18 or older and I agree to the Terms.</Text>
      </TouchableOpacity>
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={[s.btn, !complete && { opacity: 0.5 }]} onPress={confirm} disabled={!complete || busy} activeOpacity={0.88}>
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>I'm 18+, let me in</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    width: '100%', padding: SPACING.lg, borderRadius: RADIUS.lg,
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.goldBorder, gap: rp(10),
  },
  title: { fontFamily: 'PlayfairDisplay-Italic', fontSize: FONT.lg, color: T.text },
  copy: { fontSize: FONT.sm, color: T.textSecondary, lineHeight: FONT.sm * 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: rp(10) },
  box: { width: rs(22), height: rs(22), borderRadius: rs(6), borderWidth: 1.5, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: T.primary, borderColor: T.primary },
  error: { color: T.danger, fontSize: FONT.xs },
  btn: { height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
});
