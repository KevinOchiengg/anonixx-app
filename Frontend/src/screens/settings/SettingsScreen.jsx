import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Linking, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Bell, BookOpen, ChevronRight, Database,
  Eye, FileText, Globe, HelpCircle, Lock, Moon,
  Monitor, ShieldAlert, Smartphone, User, Volume2, Zap, Trash2, Palette, Shield,
} from 'lucide-react-native';
import { rs, rf, rp, rh, SPACING, FONT, RADIUS, HIT_SLOP } from '../../utils/responsive';
import { useLogout } from '../../hooks/useLogout';
import { useToast } from '../../components/ui/Toast';
import { updateUser } from '../../store/slices/authSlice';
import { API_BASE_URL } from '../../config/api';
import T from '../../utils/theme';

const NavRow = React.memo(({ icon: Icon, iconColor, label, desc, value, onPress, danger }) => (
  <TouchableOpacity style={row.wrap} onPress={onPress} activeOpacity={0.75} hitSlop={HIT_SLOP}>
    <View style={[row.iconBox, danger && row.iconBoxDanger]}>
      <Icon size={rs(17)} color={danger ? T.danger : (iconColor || T.text)} strokeWidth={1.8} />
    </View>
    <View style={row.body}>
      <Text style={[row.label, danger && row.labelDanger]}>{label}</Text>
      {desc ? <Text style={row.desc}>{desc}</Text> : null}
    </View>
    {value ? <Text style={row.value}>{value}</Text> : null}
    <ChevronRight size={rs(15)} color={danger ? T.danger : T.textMuted} />
  </TouchableOpacity>
));

const ToggleRow = React.memo(({ icon: Icon, iconColor, label, desc, value, onToggle, indent }) => (
  <View style={[row.wrap, indent && row.indent]}>
    {!indent && (
      <View style={row.iconBox}>
        <Icon size={rs(17)} color={iconColor || T.text} strokeWidth={1.8} />
      </View>
    )}
    {indent && <View style={row.indentLine} />}
    <View style={row.body}>
      <Text style={row.label}>{label}</Text>
      {desc ? <Text style={row.desc}>{desc}</Text> : null}
    </View>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ false: T.surfaceAlt, true: T.primary }}
      thumbColor={value ? '#fff' : T.textMuted}
      ios_backgroundColor={T.surfaceAlt}
    />
  </View>
));

const Section = React.memo(({ title, children }) => (
  <View style={sec.wrap}>
    {title ? <Text style={sec.title}>{title}</Text> : null}
    <View style={sec.card}>{children}</View>
  </View>
));

export default function SettingsScreen({ navigation }) {
  const insets            = useSafeAreaInsets();
  const { confirmLogout } = useLogout(navigation);
  const { showToast }     = useToast();

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rh(18))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay: 60, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, delay: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const dispatch = useDispatch();
  const authUser = useSelector((state) => state.auth.user);

  const [pushEnabled,      setPushEnabled]      = useState(true);
  const [notifyRequests,   setNotifyRequests]   = useState(true);
  const [notifyGroup,      setNotifyGroup]      = useState(false);
  const [screenshotDetect, setScreenshotDetect] = useState(false);
  const [haptics,          setHaptics]          = useState(true);
  const [inAppSounds,      setInAppSounds]      = useState(true);

  // ── After Dark content opt-in (18+) ───────────────────────────
  const [showAgeVerify, setShowAgeVerify] = useState(false);
  const [verifyDob,     setVerifyDob]     = useState({ day: '', month: '', year: '' });
  const [verifying,     setVerifying]     = useState(false);

  // Persists a partial user patch to both Redux (for this session's
  // Redux-reading screens, e.g. DropsComposeScreen) and the AsyncStorage
  // 'user' blob AuthContext rehydrates from on cold start.
  const persistUserPatch = useCallback(async (patch) => {
    dispatch(updateUser(patch));
    try {
      const stored = await AsyncStorage.getItem('user');
      if (stored) {
        await AsyncStorage.setItem('user', JSON.stringify({ ...JSON.parse(stored), ...patch }));
      }
    } catch { /* best-effort */ }
  }, [dispatch]);

  const callOptIn = useCallback(async (optIn) => {
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/v1/users/me/explicit-content-optin`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ opt_in: optIn }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    await persistUserPatch({ explicit_content_opt_in: data.explicit_content_opt_in });
  }, [persistUserPatch]);

  const handleExplicitToggle = useCallback(async (value) => {
    if (value && !authUser?.age_verified) {
      // Pre-migration account with no DOB on file — confirm age first.
      setShowAgeVerify(true);
      return;
    }
    try {
      await callOptIn(value);
    } catch {
      showToast({ type: 'error', message: 'Could not update this. Try again.' });
    }
  }, [authUser, callOptIn, showToast]);

  const handleConfirmAge = useCallback(async () => {
    const day   = parseInt(verifyDob.day, 10);
    const month = parseInt(verifyDob.month, 10);
    const year  = parseInt(verifyDob.year, 10);
    if (!(day >= 1 && day <= 31) || !(month >= 1 && month <= 12) || !(year >= 1900 && year <= new Date().getFullYear())) {
      showToast({ type: 'warning', message: 'Enter a valid date of birth.' });
      return;
    }
    setVerifying(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const dob = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const res = await fetch(`${API_BASE_URL}/api/v1/users/me/verify-age`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ date_of_birth: dob }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || 'Verification failed');
      }
      await persistUserPatch({ age_verified: true });
      await callOptIn(true);
      setShowAgeVerify(false);
      showToast({ type: 'success', message: 'Age verified — After Dark content unlocked.' });
    } catch (err) {
      showToast({ type: 'error', title: 'Could not verify', message: err.message || 'Anonixx is for adults 18+.' });
    } finally {
      setVerifying(false);
    }
  }, [verifyDob, persistUserPatch, callOptIn, showToast]);

  const handleDeleteAccount = useCallback(() => {
    showToast({
      type:    'warning',
      title:   'Are you sure?',
      message: 'Contact support to permanently delete your account and all your data.',
    });
  }, [showToast]);

  const openLink = useCallback((url) => {
    Linking.openURL(url).catch(() => {
      showToast({ type: 'error', message: 'Could not open link.' });
    });
  }, [showToast]);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={HIT_SLOP}>
          <ArrowLeft size={rs(20)} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + rh(40) }]}
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
      >
        {/* ── Account ── */}
        <Section title="Account">
          <NavRow
            icon={User}
            label="Change Anonymous Name"
            desc="Update how others see you"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <View style={sec.divider} />
          <NavRow
            icon={Lock}
            label="Email & Password"
            desc="Manage login credentials"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <View style={sec.divider} />
          <NavRow
            icon={Palette}
            label="Chat Interface"
            desc="Background, font, stickers, gallery — shown once someone unlocks a chat with you"
            onPress={() => navigation.navigate('Main', {
              screen: 'Messages',
              params: { screen: 'ChatProfileSetup' },
            })}
          />
          <View style={sec.divider} />
          <NavRow
            icon={Trash2}
            label="Delete Account"
            desc="Permanently remove your data"
            onPress={handleDeleteAccount}
            danger
          />
        </Section>

        {/* ── Admin ── */}
        {authUser?.is_admin && (
          <Section title="Admin">
            <NavRow
              icon={Shield}
              label="Admin Panel"
              desc="Users, moderation, revenue"
              onPress={() => navigation.navigate('AdminDashboard')}
            />
          </Section>
        )}

        {/* ── Privacy & Safety ── */}
        <Section title="Privacy & Safety">
          <NavRow
            icon={ShieldAlert}
            label="Block List"
            desc="Manage blocked users"
            onPress={() => navigation.navigate('BlockList')}
          />
          <View style={sec.divider} />
          <ToggleRow
            icon={Eye}
            label="Screenshot Detection"
            desc="Alert when your posts are screenshotted"
            value={screenshotDetect}
            onToggle={setScreenshotDetect}
          />
          <View style={sec.divider} />
          <NavRow
            icon={User}
            label="Who Can Connect With Me"
            value="Everyone"
            onPress={() => {}}
          />
          <View style={sec.divider} />
          <NavRow
            icon={FileText}
            label="Report & Moderation History"
            desc="View your flagged content"
            onPress={() => navigation.navigate('ModerationHistory')}
          />
          <View style={sec.divider} />
          <ToggleRow
            icon={Moon}
            label="After Dark Content"
            desc="18+ explicit themes — separate from base account eligibility"
            value={!!authUser?.explicit_content_opt_in}
            onToggle={handleExplicitToggle}
          />
          {showAgeVerify && (
            <View style={ageVerify.wrap}>
              <Text style={ageVerify.title}>Confirm you're 18 or older</Text>
              <Text style={ageVerify.sub}>
                Your account was created before Anonixx required this — a one-time check.
              </Text>
              <View style={ageVerify.row}>
                <TextInput
                  style={ageVerify.input}
                  value={verifyDob.day}
                  onChangeText={(v) => setVerifyDob((p) => ({ ...p, day: v.replace(/[^0-9]/g, '').slice(0, 2) }))}
                  placeholder="DD"
                  placeholderTextColor={T.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={ageVerify.slash}>/</Text>
                <TextInput
                  style={ageVerify.input}
                  value={verifyDob.month}
                  onChangeText={(v) => setVerifyDob((p) => ({ ...p, month: v.replace(/[^0-9]/g, '').slice(0, 2) }))}
                  placeholder="MM"
                  placeholderTextColor={T.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={ageVerify.slash}>/</Text>
                <TextInput
                  style={[ageVerify.input, ageVerify.inputYear]}
                  value={verifyDob.year}
                  onChangeText={(v) => setVerifyDob((p) => ({ ...p, year: v.replace(/[^0-9]/g, '').slice(0, 4) }))}
                  placeholder="YYYY"
                  placeholderTextColor={T.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <View style={ageVerify.actions}>
                <TouchableOpacity onPress={() => setShowAgeVerify(false)} hitSlop={HIT_SLOP}>
                  <Text style={ageVerify.cancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={ageVerify.confirmBtn}
                  onPress={handleConfirmAge}
                  disabled={verifying}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={ageVerify.confirmText}>{verifying ? 'Checking…' : 'Confirm'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Section>

        {/* ── Notifications ── */}
        <Section title="Notifications">
          <ToggleRow
            icon={Bell}
            label="Push Notifications"
            desc="Master toggle for all alerts"
            value={pushEnabled}
            onToggle={setPushEnabled}
          />
          <View style={sec.divider} />
          <ToggleRow
            icon={Bell}
            label="Connection Requests"
            value={notifyRequests && pushEnabled}
            onToggle={v => pushEnabled && setNotifyRequests(v)}
            indent
          />
          <View style={sec.divider} />
          <ToggleRow
            icon={Bell}
            label="Group Activity"
            value={notifyGroup && pushEnabled}
            onToggle={v => pushEnabled && setNotifyGroup(v)}
            indent
          />
        </Section>

        {/* ── Feed Preferences ── */}
        <Section title="Feed Preferences">
          <NavRow
            icon={Zap}
            label="Video Autoplay"
            value="Wi-Fi Only"
            onPress={() => {}}
          />
        </Section>

        {/* ── Language ── */}
        <Section title="Language">
          <NavRow
            icon={Globe}
            label="App Language"
            value="English"
            onPress={() => {}}
          />
        </Section>

        {/* ── Sound & Haptics ── */}
        <Section title="Sound & Haptics">
          <ToggleRow
            icon={Smartphone}
            label="Haptic Feedback"
            desc="Vibration on interactions"
            value={haptics}
            onToggle={setHaptics}
          />
          <View style={sec.divider} />
          <ToggleRow
            icon={Volume2}
            label="In-App Sounds"
            desc="UI sound effects"
            value={inAppSounds}
            onToggle={setInAppSounds}
          />
        </Section>

        {/* ── Data & Storage ── */}
        <Section title="Data & Storage">
          <NavRow
            icon={Database}
            label="Download Management"
            onPress={() => {}}
          />
        </Section>

        {/* ── Display ── */}
        <Section title="Display">
          <NavRow
            icon={Monitor}
            label="Font Size"
            value="Medium"
            onPress={() => {}}
          />
        </Section>

        {/* ── About ── */}
        <Section title="About">
          <View style={row.wrap}>
            <View style={row.iconBox}>
              <HelpCircle size={rs(17)} color={T.text} strokeWidth={1.8} />
            </View>
            <View style={row.body}>
              <Text style={row.label}>Version</Text>
            </View>
            <Text style={row.value}>1.0.0</Text>
          </View>
          <View style={sec.divider} />
          <NavRow
            icon={FileText}
            label="Terms of Service"
            onPress={() => navigation.navigate('Legal', { type: 'terms' })}
          />
          <View style={sec.divider} />
          <NavRow
            icon={Lock}
            label="Privacy Policy"
            onPress={() => navigation.navigate('Legal', { type: 'privacy' })}
          />
          <View style={sec.divider} />
          <NavRow
            icon={BookOpen}
            label="Community Guidelines"
            onPress={() => navigation.navigate('Legal', { type: 'guidelines' })}
          />
        </Section>

        {/* ── Logout ── */}
        <View style={styles.logoutWrap}>
          <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout} activeOpacity={0.85}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <Text style={styles.footer}>anonixx · your truth, no name required.</Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   rp(13),
    paddingHorizontal: SPACING.md,
    gap:               SPACING.sm,
  },
  indent: { paddingLeft: rp(20) },
  indentLine: {
    width:           rs(2),
    height:          rs(24),
    borderRadius:    rs(1),
    backgroundColor: T.border,
    marginRight:     SPACING.xs,
  },
  iconBox: {
    width:           rs(34),
    height:          rs(34),
    borderRadius:    rs(10),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  iconBoxDanger:  { backgroundColor: 'rgba(239,68,68,0.10)' },
  body:           { flex: 1, gap: rp(2) },
  label:          { fontSize: FONT.sm, fontWeight: '600', color: T.text },
  labelDanger:    { color: T.danger },
  desc:           { fontSize: rs(12), color: T.textSecondary },
  value:          { fontSize: FONT.xs, color: T.textSecondary, fontWeight: '500', marginRight: rp(4) },
});

const sec = StyleSheet.create({
  wrap:    { marginBottom: SPACING.md, paddingHorizontal: SPACING.md },
  title: {
    fontSize:      rs(11),
    fontWeight:    '700',
    color:         T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: rp(0.9),
    marginBottom:  rp(8),
    paddingLeft:   rp(4),
  },
  card: {
    backgroundColor: T.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
  },
  divider: {
    height:          1,
    backgroundColor: T.border,
    marginLeft:      rs(34) + SPACING.sm + SPACING.md,
  },
});

const ageVerify = StyleSheet.create({
  wrap: {
    padding:          rp(14),
    borderTopWidth:   1,
    borderTopColor:   T.border,
    backgroundColor:  T.surfaceAlt,
  },
  title: { fontSize: FONT.sm, fontWeight: '700', color: T.text },
  sub:   { fontSize: rf(11), color: T.textSecondary, marginTop: rp(4), lineHeight: rf(16) },
  row:   { flexDirection: 'row', alignItems: 'center', marginTop: rp(12) },
  input: {
    fontSize: FONT.md, color: T.text, textAlign: 'center', width: rs(40),
    backgroundColor: T.inputBg, borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: T.border, paddingVertical: rp(8),
  },
  inputYear: { width: rs(64) },
  slash:     { color: T.textSecondary, fontSize: FONT.md, marginHorizontal: rp(6) },
  actions:   { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: rp(14), gap: SPACING.md },
  cancel:    { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '600' },
  confirmBtn: {
    backgroundColor: T.primary, borderRadius: RADIUS.md,
    paddingHorizontal: rp(16), paddingVertical: rp(9),
  },
  confirmText: { color: '#fff', fontSize: FONT.sm, fontWeight: '700' },
});

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: T.background },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   rp(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width:           rs(36),
    height:          rs(36),
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    rs(18),
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerTitle: { fontSize: FONT.md, fontWeight: '700', color: T.text },
  content:     { paddingTop: SPACING.lg },
  logoutWrap: {
    paddingHorizontal: SPACING.md,
    alignItems:        'center',
    gap:               SPACING.md,
    marginTop:         SPACING.sm,
  },
  logoutBtn: {
    width:           '100%',
    paddingVertical: rp(14),
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     'rgba(239,68,68,0.30)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    alignItems:      'center',
  },
  logoutText: { fontSize: FONT.md, fontWeight: '700', color: T.danger, letterSpacing: rp(0.3) },
  footer:     { fontSize: rs(11), color: T.textMuted, textAlign: 'center', fontStyle: 'italic' },
});
