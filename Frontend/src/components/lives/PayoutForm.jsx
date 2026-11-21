import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { livesApi } from '../../utils/lives';
import { RADIUS, rf, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

const METHOD_LABEL = { mpesa: 'M-Pesa', paypal: 'PayPal', bank: 'Bank transfer' };
const METHOD_NOTE = {
  mpesa: 'Paid in KES to your Safaricom number.',
  paypal: 'Paid in USD to your PayPal account.',
  bank: 'Paid in USD to your bank account.',
};

function Field({ label, hint, ...props }) {
  return (
    <>
      <Text style={s.label}>{label}{hint ? <Text style={s.hint}>  {hint}</Text> : null}</Text>
      <TextInput style={s.input} placeholderTextColor={T.textMuted} {...props} />
    </>
  );
}

/** Where a host's weekly earnings are sent. Shown before the first live and on the earnings screen. */
export default function PayoutForm({ initial, onSaved }) {
  const [methods, setMethods] = useState(null);
  const [method, setMethod] = useState(initial?.method || 'paypal');
  const [name, setName] = useState(initial?.legal_name || '');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bankName, setBankName] = useState('');
  const [account, setAccount] = useState('');
  const [swift, setSwift] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    livesApi.payoutProfile()
      .then((r) => {
        setMethods(r.methods);
        if (!initial || !r.methods.includes(initial.method)) setMethod(r.methods[0]);
      })
      .catch(() => setMethods(['paypal', 'bank']));
  }, [initial]);

  const destinationReady = method === 'mpesa' ? phone.trim().length >= 9
    : method === 'paypal' ? email.includes('@')
      : bankName.trim().length >= 2 && account.trim().length >= 4;
  const ready = name.trim().length >= 3 && idNumber.trim().length >= 5 && destinationReady;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await livesApi.savePayoutProfile({
        legal_name: name.trim(), id_number: idNumber.trim(), method,
        ...(method === 'mpesa' ? { mpesa_phone: phone.trim() } : {}),
        ...(method === 'paypal' ? { paypal_email: email.trim() } : {}),
        ...(method === 'bank' ? { bank_name: bankName.trim(), account_number: account.trim(), swift_code: swift.trim() || undefined } : {}),
      });
      onSaved(r.profile);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!methods) return <ActivityIndicator color={T.primary} style={{ marginVertical: rp(20) }} />;

  return (
    <View style={s.wrap}>
      <Text style={s.note}>Your earnings are sent here every week. Only Anonixx sees these details; viewers never do.</Text>

      <Text style={s.label}>Get paid by</Text>
      <View style={s.chips}>
        {methods.map((m) => (
          <TouchableOpacity key={m} style={[s.chip, method === m && s.chipOn]} onPress={() => setMethod(m)} accessibilityState={{ selected: method === m }}>
            <Text style={[s.chipText, method === m && s.chipTextOn]}>{METHOD_LABEL[m]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.hint}>{METHOD_NOTE[method]}</Text>

      <Field label="Full name (as on your ID)" value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
      <Field label="ID or passport number" value={idNumber} onChangeText={setIdNumber} maxLength={20} autoCapitalize="characters"
        placeholder={initial ? `Ends in ${initial.id_number_last4}` : undefined} />

      {method === 'mpesa' && (
        <Field label="M-Pesa number" value={phone} onChangeText={setPhone} maxLength={15} keyboardType="phone-pad" placeholder="0712 345 678" />
      )}
      {method === 'paypal' && (
        <Field label="PayPal email" value={email} onChangeText={setEmail} maxLength={120} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
      )}
      {method === 'bank' && (
        <>
          <Field label="Bank name" value={bankName} onChangeText={setBankName} maxLength={80} />
          <Field label="Account number or IBAN" value={account} onChangeText={setAccount} maxLength={40} autoCapitalize="characters" />
          <Field label="SWIFT / BIC" hint="for international transfers" value={swift} onChangeText={setSwift} maxLength={11} autoCapitalize="characters" placeholder="e.g. EQBLKENA" />
        </>
      )}

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
  hint: { fontFamily: 'DMSans-Regular', fontSize: rf(12), color: T.textSecondary },
  input: {
    fontFamily: 'DMSans-Regular', fontSize: rf(15), color: T.text, backgroundColor: T.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: T.border, paddingHorizontal: rp(14), paddingVertical: rp(12),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  chip: { height: rs(40), paddingHorizontal: rp(16), borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, justifyContent: 'center' },
  chipOn: { borderColor: T.primary, backgroundColor: T.primaryDim },
  chipText: { fontFamily: 'DMSans-SemiBold', fontSize: rf(14), color: T.text },
  chipTextOn: { color: T.primary },
  error: { fontFamily: 'DMSans-Regular', fontSize: rf(13), color: T.danger },
  btn: { marginTop: rp(10), height: rs(50), borderRadius: 999, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: '#fff' },
});
