/**
 * UnreadContext — tracks total unread message count across all chats.
 * Polls every 30 s while app is active; can be manually refreshed.
 */
import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from 'react';
import { AppState } from 'react-native';

const UnreadContext = createContext({ unreadCount: 0, refreshUnread: () => {} });

export function UnreadProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef(null);

  // NOTE: the old connect_chats unread source was removed along with the
  // free Connect system. Link Up's drop_connections chats don't track
  // per-message read state yet, so there's no real unread count to report
  // right now — this always resolves to 0 until that's built.
  const fetchUnread = useCallback(async () => {
    setUnreadCount(0);
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
