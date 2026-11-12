/** Bottom-nav badge counts. Polls every 30s, and refreshes on message, knock and call socket events.
 * The Rooms badge counts everything waiting there: unread messages, knocks and missed calls. */
import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import { useSocket } from './SocketContext';

const EMPTY_COUNTS = { Messages: 0, Requests: 0 };

const UnreadContext = createContext({ badgeCounts: EMPTY_COUNTS, refreshUnread: () => {} });

export function UnreadProvider({ children }) {
  const [badgeCounts, setBadgeCounts] = useState(EMPTY_COUNTS);
  const intervalRef = useRef(null);
  const { socketService } = useSocket();

  const fetchUnread = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) { setBadgeCounts(EMPTY_COUNTS); return; }

      const seen = await AsyncStorage.getItem('rooms_calls_seen_at');   // set by the Calls tab
      const qs = seen ? `?calls_seen=${encodeURIComponent(seen)}` : '';
      const res = await fetch(`${API_BASE_URL}/api/v1/notifications/badge-counts${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      setBadgeCounts({
        Messages: data.rooms ?? data.messages ?? 0,
        Requests: data.unlock_requests ?? 0,
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

  // Knocks, messages and calls push socket events: refresh the badges right away instead of
  // waiting for the next poll (debounced, so a burst of messages is one request).
  useEffect(() => {
    let t = null;
    const handleChange = () => { clearTimeout(t); t = setTimeout(fetchUnread, 500); };
    const more = ['new_message', 'messages_seen', 'call_missed', 'call_cancelled'];
    more.forEach((e) => socketService.on?.(e, handleChange));

    socketService.on?.('unlock_request_received',  handleChange);
    socketService.on?.('unlock_request_accepted',  handleChange);
    socketService.on?.('unlock_request_declined',  handleChange);
    socketService.on?.('unlock_request_cancelled', handleChange);

    return () => {
      socketService.off?.('unlock_request_received',  handleChange);
      socketService.off?.('unlock_request_accepted',  handleChange);
      socketService.off?.('unlock_request_declined',  handleChange);
      socketService.off?.('unlock_request_cancelled', handleChange);
      more.forEach((e) => socketService.off?.(e, handleChange));
      clearTimeout(t);
    };
  }, [socketService, fetchUnread]);

  return (
    <UnreadContext.Provider value={{ badgeCounts, refreshUnread: fetchUnread }}>
      {children}
    </UnreadContext.Provider>
  );
}

export const useUnread = () => useContext(UnreadContext);
