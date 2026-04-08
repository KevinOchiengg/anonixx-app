import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config/api';

let Notifications = null;
try { Notifications = require('expo-notifications'); } catch { /* not available */ }

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// ── Push token registration ──────────────────────────────────
async function registerPushToken(token) {
  if (!Notifications) return;

  try {
    if (!Device.isDevice) return; // Skip on emulator

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('⚠️ Push notification permission denied');
      return;
    }

    const pushTokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = pushTokenData.data;

    console.log('📲 Expo push token:', pushToken);

    await fetch(`${API_BASE_URL}/api/v1/posts/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token: pushToken }),
    });

    console.log('✅ Push token registered with backend');
  } catch (e) {
    console.log('⚠️ Push token registration failed:', e);
  }
}

// ── Notification handler (foreground) ───────────────────────
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF634A',
    });
  }
}

// ── Provider ─────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const start = Date.now();
    try {
      const token = await AsyncStorage.getItem('token');
      const userData = await AsyncStorage.getItem('user');

      if (token && userData) {
        setIsAuthenticated(true);
        setUser(JSON.parse(userData));
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      // Guarantee at least 2.5 s for the dynamic splash to be meaningful
      const elapsed = Date.now() - start;
      if (elapsed < 2500) {
        await new Promise(r => setTimeout(r, 2500 - elapsed));
      }
      setLoading(false);
    }
  };

  const login = async (token, userData) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
    console.log('✅ User authenticated in context:', userData.username);

    // Register push token after login
    await registerPushToken(token);
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['token', 'user']);
    setIsAuthenticated(false);
    setUser(null);
    console.log('✅ User logged out from context');
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        loading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
