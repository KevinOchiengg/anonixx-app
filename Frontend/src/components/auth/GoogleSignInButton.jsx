import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Check, User, X } from 'lucide-react-native';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../../store/slices/authSlice';
import { setBalance } from '../../store/slices/coinsSlice';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';
import { API_BASE_URL, GOOGLE_WEB_CLIENT_ID } from '../../config/api';
import { THEME } from '../../utils/theme';
import { rs, rf, rp, SPACING, FONT, RADIUS, ICON, INPUT_HEIGHT, BUTTON_HEIGHT, HIT_SLOP } from '../../utils/responsive';
import { ANONYMOUS_NAME_RE, ANONYMOUS_NAME_HINT, normalizeNameSpaces } from '../../utils/anonymousName';

// Native module; missing in Expo Go, where the button just hides.
let Google = null;
try { Google = require('@react-native-google-signin/google-signin'); } catch { Google = null; }

let configured = false;
function ensureConfigured() {
  if (configured || !Google) return;
  Google.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  configured = true;
}

export const GOOGLE_AVAILABLE = !!(Google && GOOGLE_WEB_CLIENT_ID);

const GENDER_OPTIONS = [
  { id: 'male',              label: 'Male',              symbol: '♂' },
  { id: 'female',            label: 'Female',            symbol: '♀' },
  { id: 'nonbinary',         label: 'Non-binary',        symbol: '⚧' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say', symbol: '—' },
];

async function postGoogle(body) {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/google`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Google sign-in failed. Try again.');
  return data;
}

const GoogleMark = () => (
  <Svg width={rs(18)} height={rs(18)} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

/**
 * "Continue with Google". Existing accounts go straight in; a new person gets one
 * short step (anonymous name, gender, 18+ tick) since Google doesn't share their age.
 * Their Google name and photo are never used. `onDone(isNew)` handles navigation.
 */
export default function GoogleSignInButton({ label = 'Continue with Google', referralCode = '', onDone }) {
  const dispatch = useDispatch();
  const { login: authContextLogin } = useAuth();
  const { showToast } = useToast();

  const [busy, setBusy]   = useState(false);
  const [hold, setHold]   = useState(null);   // { token, email } while a new person finishes
  const [name, setName]   = useState('');
  const [gender, setGender] = useState(null);
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState('');

  const finish = useCallback(async (session) => {
    const user = session.user;
    await authContextLogin(session.access_token, user);
    dispatch(setCredentials({ user, token: session.access_token }));
    if (user?.coin_balance != null) dispatch(setBalance(user.coin_balance));
    showToast(session.is_new
      ? { type: 'success', title: 'Account created!', message: 'Welcome to Anonixx 🌑' }
      : { type: 'success', message: 'Welcome back 👋' });
    setHold(null);
    onDone?.(!!session.is_new);
  }, [authContextLogin, dispatch, showToast, onDone]);

  const start = useCallback(async () => {
    if (busy) return;
    ensureConfigured();
    setBusy(true);
    try {
      await Google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Always show the account chooser, so "use a different account" works.
      await Google.GoogleSignin.signOut().catch(() => {});
      const res = await Google.GoogleSignin.signIn();
      if (!Google.isSuccessResponse(res)) return;   // they backed out
      const token = res.data?.idToken;
      if (!token) throw new Error('Google sign-in failed. Try again.');
      const r = await postGoogle({ id_token: token });
      if (r.needs_profile) {
        setName(''); setGender(null); setAdult(false); setError('');
        setHold({ token, email: r.email });
      } else {
        await finish(r);
      }
    } catch (err) {
      if (Google?.isErrorWithCode?.(err)) {
        const c = Google.statusCodes;
        if (err.code === c.SIGN_IN_CANCELLED || err.code === c.IN_PROGRESS) return;
        if (err.code === c.PLAY_SERVICES_NOT_AVAILABLE) {
          showToast({ type: 'error', message: 'Google Play services is needed for Google sign-in.' });
          return;
        }
      }
      const msg = err?.message || '';
      showToast({
        type: 'error',
        message: /network|fetch/i.test(msg) ? 'Check your internet and try again.' : msg || 'Google sign-in failed. Try again.',
      });
    } finally {
      setBusy(false);
    }
  }, [busy, finish, showToast]);

  const create = useCallback(async () => {
    const chosen = name.trim();
    if (chosen && (chosen.length < 3 || !ANONYMOUS_NAME_RE.test(chosen))) {
      setError(`That name won't work. ${ANONYMOUS_NAME_HINT}`);
      return;
    }
    if (!adult) { setError("Confirm you're 18 or older."); return; }
    setError('');
    setBusy(true);
    try {
      const r = await postGoogle({
        id_token:        hold.token,
        adult_confirmed: true,
        signup_source:   { platform: Platform.OS },
        ...(chosen ? { username: chosen } : {}),
        ...(gender ? { gender } : {}),
        ...(referralCode.trim() ? { referral_code: referralCode.trim().toUpperCase() } : {}),
      });
      await finish(r);
    } catch (err) {
      const msg = err?.message || '';
      if (/already taken/i.test(msg)) setError('That name is taken. Try a different one.');
      else if (/expired|failed/i.test(msg)) { setHold(null); showToast({ type: 'error', message: 'That took a while. Tap Continue with Google again.' }); }
      else setError(/network|fetch/i.test(msg) ? 'Check your internet and try again.' : msg || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [name, adult, gender, hold, referralCode, finish, showToast]);

  if (!GOOGLE_AVAILABLE) return null;

  return (
    <>
      <TouchableOpacity
        onPress={start}
        disabled={busy}
        style={[styles.btn, busy && !hold && styles.btnBusy]}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {busy && !hold ? <ActivityIndicator color={THEME.text} size="small" /> : (
          <>
            <GoogleMark />
            <Text style={styles.btnText}>{label}</Text>
          </>
        )}
      </TouchableOpacity>

      <Modal visible={!!hold} transparent animationType="slide" onRequestClose={() => !busy && setHold(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.title}>One last thing</Text>
              <TouchableOpacity onPress={() => !busy && setHold(null)} hitSlop={HIT_SLOP} accessibilityLabel="Close">
                <X size={rs(20)} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.sub}>
                Signing up as {hold?.email}. Your Google name and photo are never shown.
              </Text>

              <Text style={styles.label}>Anonymous name <Text style={styles.labelOptional}>(optional)</Text></Text>
              <View style={styles.inputRow}>
                <User size={ICON.md} color={THEME.textSecondary} strokeWidth={2} style={{ marginRight: rp(10) }} />
                <TextInput
                  value={name}
                  onChangeText={(v) => { setName(normalizeNameSpaces(v).slice(0, 30)); if (error) setError(''); }}
                  placeholder="what should we call you?"
                  placeholderTextColor={THEME.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
              <Text style={styles.hint}>What everyone sees you as. Skip it and we'll make one.</Text>

              <Text style={[styles.label, { marginTop: SPACING.md }]}>Gender <Text style={styles.labelOptional}>(optional)</Text></Text>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((opt) => {
                  const on = gender === opt.id;
                  return (
                    <TouchableOpacity key={opt.id} onPress={() => setGender(on ? null : opt.id)} style={[styles.chip, on && styles.chipOn]} activeOpacity={0.8}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.symbol}{'  '}{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={() => { setAdult((v) => !v); if (error) setError(''); }}
                style={styles.adultRow}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: adult }}
              >
                <View style={[styles.adultBox, adult && styles.adultBoxOn]}>
                  {adult ? <Check size={rs(14)} color="#fff" strokeWidth={2.5} /> : null}
                </View>
                <Text style={styles.adultText}>I'm 18 or older and I agree to the Terms of Service and Privacy Policy.</Text>
              </TouchableOpacity>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                onPress={create}
                disabled={busy || !adult}
                style={[styles.submit, (busy || !adult) && styles.submitOff]}
                activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Create Account</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: rp(10),
    backgroundColor: THEME.inputBg, borderWidth: 1.5, borderColor: THEME.borderStrong,
  },
  btnBusy:  { opacity: 0.6 },
  btnText:  { color: THEME.text, fontSize: FONT.md, fontWeight: '700', fontFamily: 'DMSans-Bold' },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    maxHeight: '88%', backgroundColor: THEME.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, paddingBottom: SPACING.xl,
    borderWidth: 1, borderColor: THEME.border,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  title:     { fontSize: FONT.xl, fontFamily: 'PlayfairDisplay-Bold', color: THEME.text },
  sub:       { fontSize: rf(13), fontFamily: 'DMSans-Regular', color: THEME.textSecondary, lineHeight: rf(19), marginBottom: SPACING.lg },

  label:         { fontSize: rf(11), fontWeight: '700', fontFamily: 'DMSans-Bold', color: THEME.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: rs(1) },
  labelOptional: { fontWeight: '400', fontFamily: 'DMSans-Regular', textTransform: 'none', letterSpacing: 0, opacity: 0.7 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME.inputBg, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: THEME.border,
    paddingHorizontal: rp(14), height: INPUT_HEIGHT,
  },
  input: { flex: 1, fontSize: FONT.md, fontFamily: 'DMSans-Regular', color: THEME.text, height: INPUT_HEIGHT },
  hint:  { color: THEME.textMuted, fontSize: rf(11), fontFamily: 'DMSans-Regular', marginTop: SPACING.xs, marginLeft: rp(4) },

  genderRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: rp(8) },
  chip: {
    paddingHorizontal: rp(14), paddingVertical: rp(8), borderRadius: RADIUS.full,
    backgroundColor: THEME.inputBg, borderWidth: 1, borderColor: THEME.border,
  },
  chipOn:     { backgroundColor: THEME.primaryDim, borderColor: THEME.primaryBorder },
  chipText:   { fontSize: rf(13), color: THEME.textSecondary, fontWeight: '500' },
  chipTextOn: { color: THEME.primary, fontWeight: '700' },

  adultRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: rp(10), marginTop: SPACING.lg },
  adultBox:   { width: rs(22), height: rs(22), borderRadius: rs(6), borderWidth: 1.5, borderColor: THEME.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: rp(1) },
  adultBoxOn: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  adultText:  { flex: 1, fontSize: rf(13), fontFamily: 'DMSans-Regular', color: THEME.textSecondary, lineHeight: rf(19) },

  error:      { color: THEME.error, fontSize: rf(12), fontFamily: 'DMSans-SemiBold', marginTop: SPACING.md },
  submit:     { height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.primary, marginTop: SPACING.lg },
  submitOff:  { opacity: 0.55 },
  submitText: { color: '#fff', fontSize: FONT.lg, fontWeight: '700', fontFamily: 'DMSans-Bold' },
});
