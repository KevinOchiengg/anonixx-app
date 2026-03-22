/**
 * UnreadContext — tracks total unread message count across all chats.
 * Polls every 30 s while app is active; can be manually refreshed.
 */
import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

const UnreadContext = createContext({ unreadCount: 0, refreshUnread: () => {} });

export function UnreadProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef(null);

  const fetchUnread = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) { setUnreadCount(0); return; }

      const res  = await fetch(`${API_BASE_URL}/api/v1/connect/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const total = (data.chats || []).reduce((sum, c) => sum + (c.unread_count || 0), 0);
      setUnreadCount(total);
    } catch {
      // silent — network errors should not surface here
    }
  }, []);

  // Poll every 30 s while app is foregrounded
  useEffect(() => {
    fetchUnread();
    intervalRef.current = setInterval(fetchUnread, 30_000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchUnread();
        intervalRef.current = setInterval(fetchUnread, 30_000);
      } else {
        clearInterval(intervalRef.current);
      }
    });

    return () => {
      clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [fetchUnread]);

  return (
    <UnreadContext.Provider value={{ unreadCount, refreshUnread: fetchUnread }}>
      {children}
    </UnreadContext.Provider>
  );
}

export const useUnread = () => useContext(UnreadContext);
