/**
 * UnreadContext — bottom-nav badge counts (Messages, Circles, Profile).
 * Polls every 30 s while app is active; can be manually refreshed, and
 * refreshes immediately on unlock-request socket events for a snappier
 * Profile badge (messages/circles have no sockets — see socket.js).
 */
import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import { useSocket } from './SocketContext';

const EMPTY_COUNTS = { Messages: 0, Circles: 0, Profile: 0 };

const UnreadContext = createContext({ badgeCounts: EMPTY_COUNTS, refreshUnread: () => {} });

export function UnreadProvider({ children }) {
  const [badgeCounts, setBadgeCounts] = useState(EMPTY_COUNTS);
  const intervalRef = useRef(null);
  const { socketService } = useSocket();

  const fetchUnread = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) { setBadgeCounts(EMPTY_COUNTS); return; }

      const res = await fetch(`${API_BASE_URL}/api/v1/notifications/badge-counts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      setBadgeCounts({
        Messages: data.messages ?? 0,
        Circles:  data.circles ?? 0,
        Profile:  data.unlock_requests ?? 0,
      });
    } catch {
      // silent — badges just stay at their last known value
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

  // Unlock requests already push socket events — piggyback them for an
  // instant Profile-badge refresh instead of waiting for the next poll.
  useEffect(() => {
    const handleChange = () => fetchUnread();

    socketService.on?.('unlock_request_received',  handleChange);
    socketService.on?.('unlock_request_accepted',  handleChange);
    socketService.on?.('unlock_request_declined',  handleChange);
    socketService.on?.('unlock_request_cancelled', handleChange);

    return () => {
      socketService.off?.('unlock_request_received',  handleChange);
      socketService.off?.('unlock_request_accepted',  handleChange);
      socketService.off?.('unlock_request_declined',  handleChange);
      socketService.off?.('unlock_request_cancelled', handleChange);
    };
  }, [socketService, fetchUnread]);

  return (
    <UnreadContext.Provider value={{ badgeCounts, refreshUnread: fetchUnread }}>
      {children}
    </UnreadContext.Provider>
  );
}

export const useUnread = () => useContext(UnreadContext);
