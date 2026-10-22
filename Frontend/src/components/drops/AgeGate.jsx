/**
 * AgeGate
 *
 * One-time 18+ confirmation, shown wherever the backend answers
 * age_verification_required (Rooms, posting a hookup, sending a link up).
 * Same DD / MM / YYYY entry as SignUpScreen; POST /users/me/verify-age.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';

import { T } from '../../utils/colorTokens';
import { rs, rp, SPACING, FONT, RADIUS, BUTTON_HEIGHT } from '../../utils/responsive';
import { API_BASE_URL } from '../../config/api';
import { updateUser } from '../../store/slices/authSlice';

export default function AgeGate({ onDone }) {
  const dispatch = useDispatch();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const complete = day && month && year.length === 4;

  const confirm = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/users/me/verify-age`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date_of_birth: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'Enter a valid date.');
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

  const field = (value, set, len, placeholder, width) => (
    <TextInput
      value={value}
      onChangeText={(v) => set(v.replace(/[^0-9]/g, '').slice(0, len))}
      placeholder={placeholder}
      placeholderTextColor={T.textMute}
      keyboardType="number-pad"
      maxLength={len}
      style={[s.input, { width }]}
    />
  );

  return (
    <View style={s.card}>
      <Text style={s.title}>Adults only past this point.</Text>
      <Text style={s.copy}>Confirm you're 18+ once and every Room opens. Your birthday stays private.</Text>
      <View style={s.row}>
        {field(day, setDay, 2, 'DD', rs(64))}
        {field(month, setMonth, 2, 'MM', rs(64))}
        {field(year, setYear, 4, 'YYYY', rs(92))}
      </View>
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
  row: { flexDirection: 'row', gap: rp(8) },
  input: {
    height: rs(46), borderRadius: RADIUS.md, backgroundColor: T.surfaceAlt,
    borderWidth: 1, borderColor: T.border, color: T.text, textAlign: 'center', fontSize: FONT.md,
  },
  error: { color: T.danger, fontSize: FONT.xs },
  btn: { height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
});
