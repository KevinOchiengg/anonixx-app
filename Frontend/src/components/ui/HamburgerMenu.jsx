/**
 * HamburgerMenu — full navigation + settings drawer.
 * All settings live here directly. No separate Settings screen needed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Linking, Modal, ScrollView, StyleSheet, Switch,
  Text, TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell, BookOpen, ChevronRight, Coins, Eye,
  FileText, Globe, Heart, HelpCircle, Lock,
  LogIn, LogOut, ShieldAlert, Smartphone,
  User, Users, Volume2, X, Zap,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT, HIT_SLOP, RADIUS, rf, rp, rs, SPACING } from '../../utils/responsive';
import { useAuth } from '../../context/AuthContext';
import { useLogout } from '../../hooks/useLogout';
import { useToast } from '../ui/Toast';

// ─── Theme ────────────────────────────────────────────────────
const T = {
  background:    '#0b0f18',
  surface:       '#151924',
  surfaceAlt:    '#1a1f2e',
  primary:       '#FF634A',
  primaryBorder: 'rgba(255,99,74,0.20)',
  text:          '#EAEAF0',
  textSecondary: '#9A9AA3',
  textMuted:     '#4a5068',
  border:        'rgba(255,255,255,0.06)',
  danger:        '#ef4444',
};

// ─── Row components (module-level, Rule 6) ────────────────────
const NavRow = React.memo(({ icon: Icon, label, value, onPress, danger }) => (
  <TouchableOpacity
    style={row.wrap}
    onPress={onPress}
    activeOpacity={0.75}
    hitSlop={HIT_SLOP}
  >
    <View style={[row.icon, danger && row.iconDanger]}>
      <Icon size={rs(15)} color={danger ? T.danger : T.text} strokeWidth={1.8} />
    </View>
    <Text style={[row.label, danger && row.labelDanger]}>{label}</Text>
    {value ? <Text style={row.value}>{value}</Text> : null}
    <ChevronRight size={rs(13)} color={danger ? T.danger : T.textMuted} />
  </TouchableOpacity>
));

const ToggleRow = React.memo(({ icon: Icon, label, value, onToggle, indent }) => (
  <View style={[row.wrap, indent && row.wrapIndent]}>
    {!indent
      ? <View style={row.icon}><Icon size={rs(15)} color={T.text} strokeWidth={1.8} /></View>
      : <View style={row.indentBar} />
    }
    <Text style={[row.label, { flex: 1 }]}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ false: T.surfaceAlt, true: T.primary }}
      thumbColor={value ? '#fff' : T.textMuted}
      ios_backgroundColor={T.surfaceAlt}
      style={row.switch}
    />
  </View>
));

const SectionHeader = React.memo(({ title }) => (
  <Text style={sec.header}>{title}</Text>
));

// ─── Main component ───────────────────────────────────────────
export default function HamburgerMenu({ visible, onClose, navigation }) {
  const insets              = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const { confirmLogout }   = useLogout(navigation);
  const { showToast }       = useToast();

  const slideAnim   = useRef(new Animated.Value(-320)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // ── Toggle states ──────────────────────────────────────────
  const [pushEnabled,      setPushEnabled]      = useState(true);
  const [notifyRequests,   setNotifyRequests]   = useState(true);
  const [notifyGroup,      setNotifyGroup]      = useState(false);
  const [screenshotDetect, setScreenshotDetect] = useState(false);
  const [haptics,          setHaptics]          = useState(true);
  const [inAppSounds,      setInAppSounds]      = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('pref_screenshot_detect').then(val => {
      if (val === 'true') setScreenshotDetect(true);
    }).catch(() => {});
  }, []);

  const handleScreenshotToggle = useCallback((v) => {
    setScreenshotDetect(v);
    AsyncStorage.setItem('pref_screenshot_detect', v ? 'true' : 'false').catch(() => {});
    if (v) {
      showToast({ type: 'info', title: 'Detection On', message: "You'll be alerted when someone screenshots your posts." });
    }
  }, [showToast]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim,   { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim,   { toValue: -320, duration: 200, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0,    duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const go = useCallback((route, params) => {
    onClose();
    setTimeout(() => navigation.navigate(route, params), 220);
  }, [onClose, navigation]);

  const handleLogout = useCallback(() => {
    onClose();
    setTimeout(() => confirmLogout(), 220);
  }, [onClose, confirmLogout]);

  const openLink = useCallback((url) => {
    Linking.openURL(url).catch(() => {
      showToast({ type: 'error', message: 'Could not open link.' });
    });
  }, [showToast]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.drawer,
          {
            paddingTop:    insets.top + rp(16),
            paddingBottom: insets.bottom + rp(16),
            transform:     [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <View>
            <Text style={styles.logo}>Settings</Text>
            <Text style={styles.tagline}>your truth, no name required.</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} style={styles.closeBtn}>
            <X size={rs(18)} color={T.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Scrollable body */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Account ── */}
          <SectionHeader title="Account" />
          <View style={sec.card}>
            <NavRow icon={User}  label="Edit Profile"    onPress={() => go('EditProfile')} />
            <View style={sec.div} />
            <NavRow icon={Lock}  label="Change Password" onPress={() => go('ChangePassword')} />
          </View>

          {/* ── Wallet ── */}
          <SectionHeader title="Wallet" />
          <View style={sec.card}>
            <NavRow icon={Coins} label="My Wallet"    onPress={() => go('Coins')} />
            <View style={sec.div} />
            <NavRow icon={Users} label="Refer & Earn" onPress={() => go('Referral')} />
          </View>

          {/* ── Content ── */}
          <SectionHeader title="Content" />
          <View style={sec.card}>
            <NavRow icon={Heart} label="Saved Posts" onPress={() => go('SavedPosts')} />
          </View>

          {/* ── Privacy & Safety ── */}
          <SectionHeader title="Privacy & Safety" />
          <View style={sec.card}>
            <NavRow icon={ShieldAlert} label="Block List"           onPress={() => {}} />
            <View style={sec.div} />
            <ToggleRow icon={Eye} label="Screenshot Detection" value={screenshotDetect} onToggle={handleScreenshotToggle} />
            <View style={sec.div} />
            <NavRow icon={User} label="Who Can Connect" value="Everyone" onPress={() => {}} />
            <View style={sec.div} />
            <NavRow icon={FileText} label="Report History" onPress={() => {}} />
          </View>

          {/* ── Notifications ── */}
          <SectionHeader title="Notifications" />
          <View style={sec.card}>
            <ToggleRow icon={Bell} label="Push Notifications" value={pushEnabled} onToggle={setPushEnabled} />
            <View style={sec.div} />
            <ToggleRow icon={Bell} label="Connection Requests" value={notifyRequests && pushEnabled} onToggle={v => pushEnabled && setNotifyRequests(v)} indent />
            <View style={sec.div} />
            <ToggleRow icon={Bell} label="Group Activity"      value={notifyGroup && pushEnabled}    onToggle={v => pushEnabled && setNotifyGroup(v)}    indent />
          </View>

          {/* ── Feed ── */}
          <SectionHeader title="Feed" />
          <View style={sec.card}>
            <NavRow    icon={Zap}      label="Video Autoplay"   value="Wi-Fi Only" onPress={() => {}} />
          </View>

          {/* ── Sound & Haptics ── */}
          <SectionHeader title="Sound & Haptics" />
          <View style={sec.card}>
            <ToggleRow icon={Smartphone} label="Haptic Feedback" value={haptics}     onToggle={setHaptics} />
            <View style={sec.div} />
            <ToggleRow icon={Volume2}    label="In-App Sounds"   value={inAppSounds} onToggle={setInAppSounds} />
          </View>

          {/* ── Language ── */}
          <SectionHeader title="Language" />
          <View style={sec.card}>
            <NavRow icon={Globe} label="App Language" value="English" onPress={() => {}} />
          </View>

          {/* ── About ── */}
          <SectionHeader title="About" />
          <View style={sec.card}>
            <View style={row.wrap}>
              <View style={row.icon}><HelpCircle size={rs(15)} color={T.text} strokeWidth={1.8} /></View>
              <Text style={[row.label, { flex: 1 }]}>Version</Text>
              <Text style={row.value}>1.0.0</Text>
            </View>
            <View style={sec.div} />
            <NavRow icon={FileText} label="Terms of Service"     onPress={() => go('Legal', { type: 'terms' })} />
            <View style={sec.div} />
            <NavRow icon={Lock}     label="Privacy Policy"       onPress={() => go('Legal', { type: 'privacy' })} />
            <View style={sec.div} />
            <NavRow icon={BookOpen} label="Community Guidelines" onPress={() => go('Legal', { type: 'guidelines' })} />
          </View>

          {/* ── Logout / Login ── */}
          {isAuthenticated ? (
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              hitSlop={HIT_SLOP}
              activeOpacity={0.8}
            >
              <LogOut size={rs(16)} color={T.danger} />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => { onClose(); setTimeout(() => navigation.navigate('AuthNav', { screen: 'Login' }), 220); }}
              hitSlop={HIT_SLOP}
              activeOpacity={0.8}
            >
              <LogIn size={rs(16)} color={T.primary} />
              <Text style={styles.loginText}>Log In</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.version}>anonixx v1.0.0</Text>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Row styles ───────────────────────────────────────────────
const row = StyleSheet.create({
  wrap: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   rp(10),
    paddingHorizontal: rp(12),
    gap:               rp(10),
  },
  wrapIndent: {
    paddingLeft: rp(20),
  },
  icon: {
    width:           rs(30),
    height:          rs(30),
    borderRadius:    rs(9),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  iconDanger: {
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  indentBar: {
    width:           rs(2),
    height:          rs(18),
    borderRadius:    rs(1),
    backgroundColor: T.border,
    marginLeft:      rp(4),
    marginRight:     rp(4),
    flexShrink:      0,
  },
  label: {
    fontSize:   FONT.sm,
    fontWeight: '500',
    color:      T.text,
  },
  labelDanger: { color: T.danger },
  value: {
    fontSize:   rs(11),
    color:      T.textMuted,
    marginRight: rp(2),
  },
  switch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
});

// ─── Section styles ───────────────────────────────────────────
const sec = StyleSheet.create({
  header: {
    fontSize:      rs(10),
    fontWeight:    '700',
    color:         T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: rp(0.7),
    marginTop:     rp(16),
    marginBottom:  rp(6),
    paddingLeft:   rp(4),
  },
  card: {
    backgroundColor: T.surfaceAlt,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     T.border,
    overflow:        'hidden',
  },
  div: {
    height:          1,
    backgroundColor: T.border,
    marginLeft:      rs(30) + rp(10) + rp(12),
  },
});

// ─── Drawer styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    position:        'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  drawer: {
    position:          'absolute',
    top: 0, left: 0, bottom: 0,
    width:             rs(300),
    backgroundColor:   T.surface,
    borderRightWidth:  1,
    borderRightColor:  T.border,
    shadowColor:       '#000',
    shadowOffset:      { width: rs(8), height: 0 },
    shadowOpacity:     0.5,
    shadowRadius:      rs(24),
    elevation:         20,
    paddingHorizontal: SPACING.md,
  },
  brand: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginBottom:   SPACING.sm,
  },
  logo: {
    fontSize:      rs(20),
    fontWeight:    '800',
    color:         T.primary,
    letterSpacing: -rp(0.5),
    marginBottom:  rp(2),
  },
  tagline: {
    fontSize:  rf(10),
    color:     T.textSecondary,
    fontStyle: 'italic',
  },
  closeBtn: {
    width:           rs(32),
    height:          rs(32),
    borderRadius:    rs(16),
    backgroundColor: T.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  divider: {
    height:          1,
    backgroundColor: T.border,
    marginBottom:    rp(4),
  },
  scrollContent: {
    paddingBottom: rp(16),
  },
  logoutBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               SPACING.sm,
    marginTop:         rp(20),
    paddingVertical:   rp(13),
    paddingHorizontal: rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       'rgba(239,68,68,0.25)',
    backgroundColor:   'rgba(239,68,68,0.06)',
  },
  logoutText: {
    fontSize:   FONT.sm,
    fontWeight: '700',
    color:      T.danger,
  },
  loginBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               SPACING.sm,
    marginTop:         rp(20),
    paddingVertical:   rp(13),
    paddingHorizontal: rp(12),
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       T.primaryBorder,
    backgroundColor:   'rgba(255,99,74,0.06)',
  },
  loginText: {
    fontSize:   FONT.sm,
    fontWeight: '700',
    color:      T.primary,
  },
  version: {
    fontSize:   rf(10),
    color:      T.textMuted,
    textAlign:  'center',
    marginTop:  rp(16),
    fontStyle:  'italic',
  },
});
