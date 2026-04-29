import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';

const LOGO = require('../../../assets/logo.png');
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { login } from '../../store/slices/authSlice';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import {
  rs, rf, rp, rh, SPACING, FONT, RADIUS,
  ICON, INPUT_HEIGHT, BUTTON_HEIGHT, SCREEN, HIT_SLOP,
} from '../../utils/responsive';
import { Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react-native';

const THEME = {
  background:    '#0b0f18',
  surface:       '#151924',
  primary:       '#FF634A',
  primaryDim:    'rgba(255, 99, 74, 0.15)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  border:        'rgba(255,255,255,0.06)',
  inputBg:       'rgba(255,255,255,0.04)',
};

const STARS = Array.from({ length: 40 }, (_, i) => ({
  id:      i,
  top:     Math.random() * SCREEN.height,
  left:    Math.random() * SCREEN.width,
  size:    Math.random() * rs(2.5) + rs(0.5),
  opacity: Math.random() * 0.5 + 0.1,
}));

const StarryBackground = React.memo(() => (
  <>
    {STARS.map((s) => (
      <View
        key={s.id}
        style={{
          position:        'absolute',
          backgroundColor: THEME.primary,
          borderRadius:    s.size,
          top: s.top, left: s.left,
          width: s.size, height: s.size,
          opacity: s.opacity,
        }}
      />
    ))}
  </>
));

const GlowOrb = React.memo(() => <View style={styles.glowOrb} />);

const EMAIL_REGEX         = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH    = 254;
const MAX_PASSWORD_LENGTH = 128;

export default function LoginScreen({ navigation }) {
  const dispatch                    = useDispatch();
  const { login: authContextLogin } = useAuth();
  const { showToast }               = useToast();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [focused,  setFocused]  = useState('');

  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(rh(32))).current;
  const passwordRef = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, delay: 200, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const validateEmail = useCallback((val) => {
    const t = val.trim();
    if (!t)                          return 'Email is required';
    if (!EMAIL_REGEX.test(t))        return 'Enter a valid email address';
    if (t.length > MAX_EMAIL_LENGTH) return 'Email is too long';
    return '';
  }, []);

  const handleEmailChange    = useCallback((val) => {
    setEmail(val.slice(0, MAX_EMAIL_LENGTH));
  }, []);

  const handlePasswordChange = useCallback((val) => {
    setPassword(val.slice(0, MAX_PASSWORD_LENGTH));
  }, []);

  const handleLogin = useCallback(async () => {
    const trimmedEmail = email.trim();
    const err = validateEmail(trimmedEmail);
    if (err) {
      showToast({ type: 'error', message: err });
      return;
    }
    if (!password) {
      showToast({ type: 'error', message: 'Password is required.' });
      return;
    }

    setLoading(true);
    try {
      const result = await dispatch(login({
        email:    trimmedEmail.toLowerCase(),
        password,
      })).unwrap();

      if (!result.access_token) {
        showToast({ type: 'error', message: 'No token received. Please try again.' });
        return;
      }

      await authContextLogin(result.access_token, result.user);
      showToast({ type: 'success', message: 'Welcome back 👋' });

      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }, 600);

    } catch (error) {
      const msg = error?.detail || error?.message || '';
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('invalid')) {
        showToast({ type: 'error', message: 'Incorrect email or password.' });
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        showToast({ type: 'error', message: 'Check your internet and try again.' });
      } else {
        showToast({ type: 'error', message: msg || 'Something went wrong. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, validateEmail, dispatch, authContextLogin, showToast, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <StarryBackground />
      <GlowOrb />

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <Animated.View style={[styles.content, {
          opacity:   fadeAnim,
          transform: [{ translateY: slideAnim }],
        }]}>

          {/* Logo */}
          <Image source={LOGO} style={styles.logoImage} resizeMode="contain" />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Your confessions are waiting for you.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={[
                styles.inputRow,
                focused === 'email' && styles.inputRowFocused,
              ]}>
                <Mail
                  size={ICON.md}
                  color={THEME.textSecondary}
                  strokeWidth={2}
                  style={styles.fieldIcon}
                />
                <TextInput
                  value={email}
                  onChangeText={handleEmailChange}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused('')}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="your@email.com"
                  placeholderTextColor={THEME.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="next"
                  textContentType="emailAddress"
                  style={styles.input}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[
                styles.inputRow,
                focused === 'password' && styles.inputRowFocused,
              ]}>
                <Lock
                  size={ICON.md}
                  color={THEME.textSecondary}
                  strokeWidth={2}
                  style={styles.fieldIcon}
                />
                <TextInput
                  ref={passwordRef}
                  value={password}
                  onChangeText={handlePasswordChange}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused('')}
                  onSubmitEditing={handleLogin}
                  placeholder="Enter your password"
                  placeholderTextColor={THEME.textSecondary}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  returnKeyType="done"
                  textContentType="password"
                  style={styles.input}
                />
                <Pressable
                  onPress={() => setShowPass((p) => !p)}
                  hitSlop={HIT_SLOP}
                  style={styles.eyeButton}
                >
                  {showPass
                    ? <EyeOff size={ICON.md} color={THEME.textSecondary} strokeWidth={2} />
                    : <Eye    size={ICON.md} color={THEME.textSecondary} strokeWidth={2} />
                  }
                </Pressable>
              </View>
            </View>

            {/* Forgot password */}
            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotBtn}
              hitSlop={HIT_SLOP}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotText}>forgot password?</Text>
            </TouchableOpacity>

            {/* Login button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.loginBtnText}>Sign In</Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Sign up */}
            <TouchableOpacity
              onPress={() => navigation.navigate('SignUp')}
              style={styles.signupBtn}
              activeOpacity={0.75}
              hitSlop={HIT_SLOP}
            >
              <Text style={styles.signupText}>
                New here?{'  '}
                <Text style={styles.signupTextBold}>Create an account</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerNote}>Anonymous. Safe. Yours.</Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },

  glowOrb: {
    position:        'absolute',
    width:           rs(320),
    height:          rs(320),
    borderRadius:    rs(160),
    backgroundColor: THEME.primary,
    opacity:         0.06,
    bottom:          rh(-60),
    alignSelf:       'center',
  },

  kav:     { flex: 1 },
  content: {
    flex:              1,
    paddingHorizontal: SPACING.lg,
    justifyContent:    'center',
    paddingBottom:     SPACING.lg,
  },

  logoImage: {
    width:        200,
    height:       54,
    alignSelf:    'center',
    marginBottom: SPACING.xxl,
  },

  header:   { marginBottom: SPACING.xl },
  title: {
    fontSize:      FONT.hero,
    fontWeight:    '800',
    color:         THEME.text,
    letterSpacing: rs(-1),
    marginBottom:  SPACING.sm,
    lineHeight:    FONT.hero * 1.15,
  },
  subtitle: { fontSize: FONT.md, color: THEME.textSecondary, lineHeight: FONT.md * 1.6 },

  form:       { width: '100%' },
  fieldGroup: { marginBottom: SPACING.md },
  label: {
    fontSize:      rf(11),
    fontWeight:    '700',
    color:         THEME.textSecondary,
    marginBottom:  SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: rs(1),
  },

  inputRow: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   THEME.inputBg,
    borderRadius:      RADIUS.lg,
    borderWidth:       1.5,
    borderColor:       THEME.border,
    paddingHorizontal: rp(14),
    height:            INPUT_HEIGHT,
  },
  inputRowFocused: {
    borderColor:     'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  fieldIcon:  { marginRight: rp(10) },
  input: {
    flex:     1,
    fontSize: FONT.md,
    color:    THEME.text,
    height:   INPUT_HEIGHT,
  },
  eyeButton: { padding: rp(4), marginLeft: rp(6) },

  loginBtn: {
    height:          BUTTON_HEIGHT,
    borderRadius:    RADIUS.lg,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: THEME.primary,
    marginTop:       SPACING.sm,
    shadowColor:     THEME.primary,
    shadowOffset:    { width: 0, height: rh(8) },
    shadowOpacity:   0.45,
    shadowRadius:    rs(20),
    elevation:       10,
  },
  loginBtnDisabled: { opacity: 0.55, shadowOpacity: 0 },
  loginBtnText:     { color: '#fff', fontSize: FONT.lg, fontWeight: '700', letterSpacing: rs(0.3) },

  divider: {
    flexDirection:  'row',
    alignItems:     'center',
    marginVertical: SPACING.lg,
    gap:            SPACING.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: THEME.border },
  dividerText: { fontSize: FONT.sm, color: THEME.textSecondary },

  forgotBtn:  { alignSelf: 'flex-end', paddingVertical: rp(6), marginBottom: SPACING.xs },
  forgotText: { fontSize: FONT.sm, color: THEME.textSecondary, fontWeight: '500' },

  signupBtn:      { alignItems: 'center', paddingVertical: rp(4) },
  signupText:     { fontSize: FONT.md, color: THEME.textSecondary },
  signupTextBold: { fontWeight: '700', color: THEME.primary },

  footerNote: {
    textAlign:     'center',
    marginTop:     SPACING.xxl,
    fontSize:      rf(11),
    color:         THEME.textSecondary,
    opacity:       0.5,
    letterSpacing: rs(1),
  },
});
