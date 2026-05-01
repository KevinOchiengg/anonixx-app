/**
 * ThemeContext.jsx
 *
 * Provides the active theme palette to any component that needs
 * to read colours at runtime (e.g. conditional dark/light styles).
 *
 * The app is dark-first. Light mode exists but is not yet exposed in the UI.
 * All static StyleSheets should import from utils/theme.js directly — this
 * context is only needed for values that change at runtime.
 */
import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../utils/theme';

const ThemeContext = createContext();

// Dark theme — the Anonixx design system
export const darkTheme = T;

// Light theme — placeholder for future use
export const lightTheme = {
  background:    '#f5f5f7',
  surface:       '#ffffff',
  surfaceAlt:    '#ebebf0',
  surfaceDark:   '#e0e0e8',
  inputBg:       'rgba(0,0,0,0.04)',

  text:          '#0b0f18',
  textSecondary: '#4a4f62',
  textSec:       '#4a4f62',
  textSub:       '#4a4f62',
  textMuted:     '#9A9AA3',
  textMute:      '#9A9AA3',
  inactive:      '#b0b0bb',

  primary:       '#FF634A',
  primaryDim:    'rgba(255,99,74,0.10)',
  primaryTint:   'rgba(255,99,74,0.08)',
  primaryBorder: 'rgba(255,99,74,0.25)',
  primaryGlow:   'rgba(255,99,74,0.18)',

  border:        'rgba(0,0,0,0.08)',
  borderStrong:  'rgba(0,0,0,0.14)',

  success:       '#4CAF50',
  successDim:    'rgba(76,175,80,0.10)',
  successBorder: 'rgba(76,175,80,0.25)',
  open:          '#4CAF50',
  openDim:       'rgba(76,175,80,0.12)',
  openBorder:    'rgba(76,175,80,0.25)',
  online:        '#4CAF50',

  warn:          '#FB923C',
  warning:       '#FB923C',
  warnDim:       'rgba(251,146,60,0.10)',
  warningDim:    'rgba(251,146,60,0.10)',
  warningBorder: 'rgba(251,146,60,0.30)',

  danger:    '#ef4444',
  error:     '#ef4444',
  dangerDim: 'rgba(239,68,68,0.10)',

  live:    '#FF634A',
  liveDim: 'rgba(255,99,74,0.15)',

  gold:       '#fbbf24',
  goldDim:    'rgba(251,191,36,0.12)',
  goldBg:     'rgba(251,191,36,0.10)',
  goldBorder: 'rgba(251,191,36,0.35)',

  tier2:       '#B36BFF',
  tier2Dim:    'rgba(179,107,255,0.10)',
  tier2Border: 'rgba(179,107,255,0.40)',
  purple:      '#a855f7',

  drop:       '#A78BFA',
  dropDim:    'rgba(167,139,250,0.12)',
  dropBorder: 'rgba(167,139,250,0.25)',

  mpesa:       '#00A651',
  mpesaDim:    'rgba(0,166,81,0.10)',
  mpesaBorder: 'rgba(0,166,81,0.30)',
  stripe:      '#635BFF',
  stripeDim:   'rgba(99,91,255,0.10)',

  myBubble:    '#FF634A',
  theirBubble: '#e8e8f0',

  avatarBg:   '#e8e8f0',
  avatarIcon: '#9A9AA3',

  bg:       '#f5f5f7',
  inactive: '#b0b0bb',
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true); // default: dark
  const [isLoading, setIsLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('theme');
        if (saved !== null) setIsDarkMode(saved !== 'light');
      } catch {}
      finally { setIsLoading(false); }
    })();
  }, []);

  const toggleTheme = async () => {
    try {
      const next = !isDarkMode;
      setIsDarkMode(next);
      await AsyncStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {}
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
