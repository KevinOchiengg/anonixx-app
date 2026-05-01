/**
 * ChangePasswordScreen — lock it down.
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, ScrollView, StatusBar, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config/api';
import { useToast } from '../../components/ui/Toast';
import { rs, rf, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import T from '../../utils/theme';

// ─── PasswordField ────────────────────────────────────────────
const PasswordField = React.memo(({ label, hint, value, onChange, show, onToggle, inputRef, onSubmit }) => (
  <View style={field.group}>
    <Text style={field.label}>{label}</Text>
    <View style={field.row}>
      <Lock size={rs(16)} color={T.textMuted} style={field.icon} />
      <TextInput
        ref={inputRef}
        style={field.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={T.textMuted}
        placeholder="••••••••"
        returnKeyType={onSubmit ? 'done' : 'next'}
        onSubmitEditing={onSubmit}
        selectionColor={T.primary}
      />
      <TouchableOpacity onPress={onToggle} hitSlop={HIT_SLOP} style={field.eye}>
        {show
          ? <EyeOff size={rs(18)} color={T.textSecondary} />
          : <Eye    size={rs(18)} color={T.textSecondary} />
        }
      </TouchableOpacity>
    </View>
    {hint ? <Text style={field.hint}>{hint}</Text> : null}
  </View>
));

// ─── Screen ───────────────────────────────────────────────────
export default function ChangePasswordScreen({ navigation }) {
  const { showToast } = useToast();

  const [current,        setCurrent]        = useState('');
  const [next,           setNext]           = useState('');
  const [confirm,        setConfirm]        = useState('');
  const [loading,        setLoading]        = useState(false);
  const [showCurrent,    setShowCurrent]    = useState(false);
  const [showNext,       setShowNext]       = useState(false);
  const [showConfirm,    setShowConfirm]    = useState(false);

  const nextRef    = useRef(null);
  const confirmRef = useRef(null);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(rs(24))).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay: 60, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const toggleCurrent = useCallback(() => setShowCurrent(v => !v), []);
  const toggleNext    = useCallback(() => setShowNext(v => !v), []);
  const toggleConfirm = useCallback(() => setShowConfirm(v => !v), []);

  const handleSubmit = useCallback(async () => {
    if (!current || !next || !confirm) {
      showToast({ type: 'warning', message: 'Fill in all three fields.' });
      return;
    }
    if (next.length < 8) {
      showToast({ type: 'warning', message: 'New password needs at least 8 characters.' });
      return;
    }
    if (next !== confirm) {
      showToast({ type: 'warning', message: 'New passwords don\'t match.' });
      return;
    }
    if (current === next) {
      showToast({ type: 'warning', message: 'New password must be different from your current one.' });
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res   = await fetch(`${API_BASE_URL}/api/v1/auth/change-password`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not change password.');

      showToast({ type: 'success', title: 'Done.', message: 'Your password has been updated.' });
      navigation.goBack();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }, [current, next, confirm, showToast, navigation]);

  const canSubmit = current.length > 0 && next.length >= 8 && confirm.length > 0 && !loading;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={T.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP}>
          <ArrowLeft size={rs(22)} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{ width: rs(22) }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* Info banner */}
            <View style={styles.banner}>
              <ShieldCheck size={rs(18)} color={T.primary} />
              <Text style={styles.bannerText}>
                your identity stays anonymous — this only secures your account access.
              </Text>
            </View>

            {/* Fields */}
            <View style={styles.form}>
              <PasswordField
                label="Current password"
                value={current}
                onChange={setCurrent}
                show={showCurrent}
                onToggle={toggleCurrent}
                onSubmit={() => nextRef.current?.focus()}
              />
              <PasswordField
                label="New password"
                hint="at least 8 characters"
                value={next}
                onChange={setNext}
                show={showNext}
                onToggle={toggleNext}
                inputRef={nextRef}
                onSubmit={() => confirmRef.current?.focus()}
              />
              <PasswordField
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                show={showConfirm}
                onToggle={toggleConfirm}
                inputRef={confirmRef}
                onSubmit={handleSubmit}
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.btn, !canSubmit && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnText}>Update Password</Text>
              }
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Field Styles ─────────────────────────────────────────────
const field = StyleSheet.create({
  group: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize:     FONT.sm,
    fontWeight:   '600',
    color:        T.textSecondary,
    marginBottom: rp(8),
    fontFamily:   'DMSans-SemiBold',
    letterSpacing: 0.2,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   T.inputBg,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.border,
    paddingHorizontal: rp(14),
    height:            rs(52),
  },
  icon: {
    marginRight: rp(10),
  },
  input: {
    flex:       1,
    height:     rs(52),
    color:      T.text,
    fontSize:   rf(15),
    fontFamily: 'DMSans-Regular',
  },
  eye: {
    paddingLeft: rp(10),
  },
  hint: {
    fontSize:   FONT.xs,
    color:      T.textMuted,
    marginTop:  rp(5),
    marginLeft: rp(2),
    fontFamily: 'DMSans-Regular',
  },
});

// ─── Screen Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: T.background,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTitle: {
    fontSize:      FONT.md,
    fontWeight:    '600',
    color:         T.text,
    letterSpacing: 0.3,
    fontFamily:    'DMSans-SemiBold',
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop:        SPACING.lg,
    paddingBottom:     SPACING.xl,
  },
  banner: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               rp(10),
    backgroundColor:   T.primaryDim,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       'rgba(255,99,74,0.2)',
    padding:           rp(14),
    marginBottom:      SPACING.lg,
  },
  bannerText: {
    flex:       1,
    fontSize:   FONT.sm,
    color:      T.textSecondary,
    lineHeight: rf(20),
    fontFamily: 'DMSans-Regular',
  },
  form: {
    marginBottom: SPACING.lg,
  },
  btn: {
    backgroundColor: T.primary,
    borderRadius:    RADIUS.md,
    height:          BUTTON_HEIGHT,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     T.primary,
    shadowOffset:    { width: 0, height: rs(4) },
    shadowOpacity:   0.35,
    shadowRadius:    rs(12),
    elevation:       6,
  },
  btnDisabled: {
    opacity: 0.38,
  },
  btnText: {
    fontSize:      FONT.md,
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: 0.4,
    fontFamily:    'DMSans-Bold',
  },
});
