/**
 * Toast.jsx
 * Reusable toast notification system for Anonixx
 *
 * Usage:
 *   import { useToast, ToastProvider } from '../components/ui/Toast';
 *
 *   // 1. Wrap your app root with <ToastProvider>
 *   // 2. In any component:
 *   const { showToast } = useToast();
 *   showToast({ type: 'success', message: 'Post created!' });
 *   showToast({ type: 'error', message: 'Something went wrong.' });
 *   showToast({ type: 'info', message: 'Loading your feed...' });
 *   showToast({ type: 'warning', message: 'Connection unstable.' });
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle,
  XCircle,
  Info,
  AlertTriangle,
  X,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

// ─── Theme ────────────────────────────────────────────────────
const THEME = {
  background: '#0b0f18',
  surface: '#151924',
  primary: '#FF634A',
  text: '#EAEAF0',
  textSecondary: '#9A9AA3',
};

const TOAST_CONFIG = {
  success: {
    icon: CheckCircle,
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.3)',
  },
  error: {
    icon: XCircle,
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.3)',
  },
  info: {
    icon: Info,
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)',
  },
  warning: {
    icon: AlertTriangle,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
  },
};

const DEFAULT_DURATION = 3500;

// ─── Context ──────────────────────────────────────────────────
const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

// ─── Single Toast Item ────────────────────────────────────────
const ToastItem = React.memo(({ toast, onDismiss }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const timerRef = useRef(null);

  const config = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;
  const Icon = config.icon;

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.92,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss(toast.id));
  }, [toast.id, onDismiss]);

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
    ]).start();

    // Auto dismiss
    timerRef.current = setTimeout(dismiss, toast.duration ?? DEFAULT_DURATION);
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
    >
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: config.color }]} />

      {/* Icon */}
      <View
        style={[styles.iconWrapper, { backgroundColor: config.color + '22' }]}
      >
        <Icon size={18} color={config.color} strokeWidth={2.2} />
      </View>

      {/* Text */}
      <View style={styles.textContainer}>
        {toast.title ? (
          <Text style={styles.toastTitle} numberOfLines={1}>
            {toast.title}
          </Text>
        ) : null}
        <Text style={styles.toastMessage} numberOfLines={2}>
          {toast.message}
        </Text>
      </View>

      {/* Dismiss */}
      <TouchableOpacity
        onPress={dismiss}
        style={styles.dismissButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <X size={14} color={THEME.textSecondary} strokeWidth={2.5} />
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Provider ─────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const showToast = useCallback(
    ({ type = 'info', title, message, duration }) => {
      if (!message) return;
      const id = ++counterRef.current;
      setToasts((prev) => {
        // Cap at 3 visible toasts — remove oldest if needed
        const next = prev.length >= 3 ? prev.slice(1) : prev;
        return [...next, { id, type, title, message, duration }];
      });
    },
    []
  );

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container — rendered above everything */}
      <View
        pointerEvents="box-none"
        style={[styles.container, { top: insets.top + 12 }]}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
    gap: 10,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingRight: 12,
    // Shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    marginRight: 12,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  iconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  toastMessage: {
    fontSize: 13,
    color: THEME.textSecondary,
    lineHeight: 18,
  },
  dismissButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
});
