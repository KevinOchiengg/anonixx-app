import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { livesApi } from '../../utils/lives';
import { RADIUS, rf, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

/** Where a host's weekly earnings are sent. Shown before the first live and on the earnings screen. */
export default function PayoutForm({ initial, onSaved }) {
  const [name, setName] = useState(initial?.legal_name || '');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState(initial?.mpesa_phone ? `0${initial.mpesa_phone.slice(3)}` : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = name.trim().length >= 3 && idNumber.trim().length >= 5 && phone.trim().length >= 9;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await livesApi.savePayoutProfile({ legal_name: name.trim(), id_number: idNumber.trim(), mpesa_phone: phone.trim() });
      onSaved(r.profile);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.note}>Your earnings are sent here every week. Only Anonixx sees these details; viewers never do.</Text>
      <Text style={s.label}>Full name (as on your ID)</Text>
      <TextInput style={s.input} value={name} onChangeText={setName} maxLength={80} autoComplete="name" placeholderTextColor={T.textMuted} />
      <Text style={s.label}>ID number</Text>
      <TextInput style={s.input} value={idNumber} onChangeText={setIdNumber} maxLength={20} keyboardType="number-pad"
        placeholder={initial ? `Ends in ${initial.id_number_last4}` : undefined} placeholderTextColor={T.textMuted} />
      <Text style={s.label}>M-Pesa number</Text>
      <TextInput style={s.input} value={phone} onChangeText={setPhone} maxLength={15} keyboardType="phone-pad" placeholder="0712 345 678" placeholderTextColor={T.textMuted} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={[s.btn, (!ready || busy) && { opacity: 0.5 }]} onPress={save} disabled={!ready || busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Save payout details</Text>}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: rp(8) },
  note: { fontFamily: 'DMSans-Regular', fontSize: rf(13), color: T.textSecondary, marginBottom: rp(6) },
  label: { fontFamily: 'DMSans-SemiBold', fontSize: rf(13), color: T.text, marginTop: rp(4) },
  input: {
    fontFamily: 'DMSans-Regular', fontSize: rf(15), color: T.text, backgroundColor: T.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, paddingHorizontal: rp(14), paddingVertical: rp(12),
  },
  error: { fontFamily: 'DMSans-Regular', fontSize: rf(13), color: T.danger || '#EF4444' },
  btn: { marginTop: rp(10), height: rs(50), borderRadius: 999, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: '#fff' },
});
