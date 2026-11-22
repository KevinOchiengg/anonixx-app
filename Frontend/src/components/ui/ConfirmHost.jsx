import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ban, BellOff, Coins, DoorOpen, Flag, Info, LogOut, Radio, Rocket, Trash2, TriangleAlert,
} from 'lucide-react-native';
import { registerConfirmHost } from '../../utils/confirm';
import { rf, rp, rs } from '../../utils/responsive';
import T from '../../utils/theme';

const ICONS = {
  delete: Trash2,
  block: Ban,
  report: Flag,
  coins: Coins,
  boost: Rocket,
  live: Radio,
  leave: DoorOpen,
  logout: LogOut,
  mute: BellOff,
  warning: TriangleAlert,
  info: Info,
};

const TONES = {
  default: { accent: T.primary, soft: 'rgba(255,99,74,0.14)', ring: 'rgba(255,99,74,0.35)', grad: ['#FF7A5C', T.primary] },
  danger: { accent: '#FF4D4F', soft: 'rgba(255,77,79,0.16)', ring: 'rgba(255,77,79,0.35)', grad: ['#FF6B6B', '#E5383B'] },
};

export default function ConfirmHost() {
  const insets = useSafeAreaInsets();
  const [alert, setAlert] = useState(null);
  const current = useRef(null);
  const rise = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => registerConfirmHost((next) => {
    current.current?.buttons.find((b) => b.style === 'cancel')?.onPress?.();
    current.current = next;
    setAlert(next);
  }), []);

  useEffect(() => {
    if (!alert) return undefined;
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, friction: 9, tension: 80, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(pulse, {
      toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }));
    pulse.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [alert, rise, pulse]);

  const press = useCallback((button) => {
    current.current = null;
    setAlert(null);
    button?.onPress?.();
  }, []);

  const dismiss = useCallback(() => {
    if (!alert) return;
    const cancel = alert.buttons.find((b) => b.style === 'cancel');
    if (cancel) press(cancel);
    else if (alert.buttons.length === 1) press(alert.buttons[0]);
  }, [alert, press]);

  const tone = TONES[alert?.tone] || TONES.default;
  const Icon = ICONS[alert?.icon] || Info;
  const actions = alert?.buttons.filter((b) => b.style !== 'cancel') || [];
  const cancel = alert?.buttons.find((b) => b.style === 'cancel');
  const single = actions.length === 1;

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [rs(360), 0] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.3] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });

  return (
    <Modal visible={!!alert} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Close">
        <Animated.View style={[styles.sheet, { paddingBottom: rp(18) + insets.bottom, transform: [{ translateY }] }]}>
          <Pressable accessibilityRole="alert">
            <LinearGradient colors={[tone.soft, 'transparent']} style={styles.glow} pointerEvents="none" />
            <View style={styles.grip} />

            <View style={styles.orbWrap}>
              <Animated.View
                style={[styles.ring, { borderColor: tone.ring, opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
              />
              <View style={[styles.orb, { backgroundColor: tone.soft, borderColor: tone.ring }]}>
                <Icon size={rs(28)} color={tone.accent} strokeWidth={2} />
              </View>
            </View>

            <Text style={styles.title}>{alert?.title}</Text>
            {!!alert?.message && <Text style={styles.message}>{alert.message}</Text>}

            {!!alert?.rows?.length && (
              <View style={styles.detail}>
                {alert.rows.map((row) => (
                  <View key={row.label} style={styles.row}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={[styles.rowValue, row.highlight && styles.rowHighlight]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.actions}>
              {actions.map((b) => {
                const danger = b.style === 'destructive';
                if (single || danger) {
                  const colors = danger ? TONES.danger.grad : TONES.default.grad;
                  return (
                    <TouchableOpacity key={b.text} onPress={() => press(b)} activeOpacity={0.85} accessibilityRole="button">
                      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
                        <Text style={styles.primaryText}>{b.text}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={b.text}
                    onPress={() => press(b)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    style={styles.option}
                  >
                    <Text style={styles.optionText}>{b.text}</Text>
                  </TouchableOpacity>
                );
              })}
              {cancel && (
                <TouchableOpacity onPress={() => press(cancel)} activeOpacity={0.7} accessibilityRole="button" style={styles.ghost}>
                  <Text style={styles.ghostText}>{cancel.text || 'Cancel'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,7,12,0.72)' },
  sheet: {
    overflow: 'hidden',
    paddingHorizontal: rp(20), paddingTop: rp(12),
    borderTopLeftRadius: rs(28), borderTopRightRadius: rs(28),
    backgroundColor: T.surface,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.08)',
  },
  glow: { position: 'absolute', top: -rp(12), left: -rp(20), right: -rp(20), height: rs(180) },
  grip: {
    alignSelf: 'center', width: rs(40), height: rs(4), borderRadius: rs(2),
    backgroundColor: 'rgba(255,255,255,0.16)', marginBottom: rp(20),
  },
  orbWrap: { alignSelf: 'center', width: rs(64), height: rs(64), marginBottom: rp(16), alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: rs(80), height: rs(80), borderRadius: rs(40), borderWidth: 1 },
  orb: {
    width: rs(64), height: rs(64), borderRadius: rs(32), borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: 'DMSans-Bold', fontSize: rf(19), color: T.text, textAlign: 'center', marginBottom: rp(8),
  },
  message: {
    fontFamily: 'DMSans-Regular', fontSize: rf(14.5), lineHeight: rf(22), color: T.textSecondary,
    textAlign: 'center', paddingHorizontal: rp(8),
  },
  detail: {
    marginTop: rp(16), padding: rp(12), gap: rp(8), borderRadius: rs(16),
    backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: T.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.textSecondary },
  rowValue: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: T.text },
  rowHighlight: { color: T.gold },
  actions: { gap: rp(8), marginTop: rp(22) },
  primary: { height: rs(50), borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: '#fff' },
  option: {
    height: rs(50), borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border,
  },
  optionText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.text },
  ghost: { height: rs(46), alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.textSecondary },
});
