import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { registerConfirmHost } from '../../utils/confirm';
import { rf, rp, rs, RADIUS } from '../../utils/responsive';
import T from '../../utils/theme';

export default function ConfirmHost() {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const settle = useCallback((ok) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => registerConfirmHost((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise((resolve) => { resolver.current = resolve; });
  }), []);

  useEffect(() => {
    if (!options) return;
    scale.setValue(0.94);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [options, scale, opacity]);

  const cancel = () => settle(false);
  const danger = options?.tone === 'danger';

  return (
    <Modal visible={!!options} transparent animationType="fade" statusBarTranslucent onRequestClose={cancel}>
      <Pressable style={styles.backdrop} onPress={cancel} accessibilityLabel="Cancel">
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <Pressable accessibilityRole="alert">
            <Text style={styles.title}>{options?.title}</Text>
            {!!options?.message && <Text style={styles.message}>{options.message}</Text>}
            {!!options?.rows?.length && (
              <View style={styles.detail}>
                {options.rows.map((row) => (
                  <View key={row.label} style={styles.row}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={[styles.rowValue, row.highlight && styles.rowHighlight]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.btn} onPress={cancel} activeOpacity={0.8} accessibilityRole="button">
                <Text style={styles.btnText}>{options?.cancelLabel || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.primary, danger && styles.danger]}
                onPress={() => settle(true)}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={[styles.btnText, styles.primaryText]}>{options?.confirmLabel || 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: rp(16), backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    width: '100%', maxWidth: rs(360),
    paddingHorizontal: rp(20), paddingTop: rp(22), paddingBottom: rp(16),
    borderRadius: RADIUS.xl, backgroundColor: T.surface,
    borderWidth: 1, borderColor: T.border,
  },
  title: { fontFamily: 'DMSans-Bold', fontSize: rf(18), color: T.text, marginBottom: rp(6) },
  message: { fontFamily: 'DMSans-Regular', fontSize: rf(14), lineHeight: rf(21), color: T.textSecondary },
  detail: {
    marginTop: rp(14), padding: rp(12), gap: rp(8),
    borderRadius: RADIUS.md, backgroundColor: T.surfaceAlt,
    borderWidth: 1, borderColor: T.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontFamily: 'DMSans-Regular', fontSize: rf(14), color: T.textSecondary },
  rowValue: { fontFamily: 'DMSans-Bold', fontSize: rf(14), color: T.text },
  rowHighlight: { color: T.gold },
  actions: { flexDirection: 'row', gap: rp(10), marginTop: rp(18) },
  btn: {
    flex: 1, height: rs(46), borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border,
  },
  btnText: { fontFamily: 'DMSans-Bold', fontSize: rf(15), color: T.text },
  primary: { backgroundColor: T.primary, borderColor: 'transparent' },
  danger: { backgroundColor: '#EF4444' },
  primaryText: { color: '#fff' },
});
