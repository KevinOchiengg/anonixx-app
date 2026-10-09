import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Lock } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { useToast } from '../../components/ui/Toast';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { logout as logoutAction } from '../../store/slices/authSlice';
import { FONT, HIT_SLOP, RADIUS, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

export default function DeleteAccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { logout: authContextLogout } = useAuth();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/users/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not delete your account.');
      }
      await dispatch(logoutAction());
      await authContextLogout();
      await AsyncStorage.multiRemove(['token', 'user']);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      showToast({ type: 'success', message: 'Your account has been deleted.' });
    } catch (e) {
      showToast({ type: 'error', message: e.message || 'Could not delete your account.' });
      setBusy(false);
    }
  }, [password, dispatch, authContextLogout, navigation, showToast]);

  const confirm = useCallback(() => {
    Alert.alert('Delete forever?', 'Your account, posts, chats and saved items are erased. This cannot be undone.', [
      { text: 'Keep my account', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  }, [run]);

  return (
    <KeyboardAvoidingView style={[s.safe, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.back}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={s.title}>Delete account</Text>
        <View style={s.back} />
      </View>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.lead}>This permanently erases your account, your posts, your chats and your saved items.</Text>
        <Text style={s.note}>Unused coins and any active subscription are lost and are not refunded. If you have a payment problem, contact support first.</Text>
        <View style={s.field}>
          <Lock size={rs(16)} color={T.textMuted} />
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter your password to confirm"
            placeholderTextColor={T.textMuted}
            selectionColor={T.primary}
          />
        </View>
        <TouchableOpacity style={[s.btn, (!password || busy) && { opacity: 0.45 }]} disabled={!password || busy} onPress={confirm}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Delete my account</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: rp(16) },
  back: { width: rs(32) },
  title: { fontSize: FONT.lg, fontWeight: '700', color: T.text },
  body: { padding: rp(20), gap: rp(16) },
  lead: { fontSize: FONT.md, color: T.text, lineHeight: rs(22) },
  note: { fontSize: FONT.sm, color: T.textSecondary, lineHeight: rs(20) },
  field: { flexDirection: 'row', alignItems: 'center', gap: rp(10), borderWidth: 1, borderColor: T.border, borderRadius: RADIUS.lg, paddingHorizontal: rp(14), backgroundColor: T.surface },
  input: { flex: 1, paddingVertical: rp(14), color: T.text, fontSize: FONT.md },
  btn: { backgroundColor: T.danger || '#b91c1c', borderRadius: RADIUS.lg, paddingVertical: rp(15), alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: FONT.md },
});
