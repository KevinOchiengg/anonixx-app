import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import socketService from '../services/socket';
import { LOADING_EVENTS } from '../services/loadingMessageEngine';

export const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [connected, setConnected] = useState(false);
  // { type: string, data: object, timestamp: number } | null
  const [loadingEvent, setLoadingEvent] = useState(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token || !mounted) return;

      try {
        const sock = await socketService.connect();
        sock.on('connect',    () => { if (mounted) setConnected(true);  });
        sock.on('disconnect', () => { if (mounted) setConnected(false); });
        if (sock.connected && mounted) setConnected(true);

        // Register listeners for every loading-system event
        LOADING_EVENTS.forEach(event => {
          sock.on(event, (data) => {
            if (mounted) {
              setLoadingEvent({ type: event, data: data || {}, timestamp: Date.now() });
            }
          });
        });
      } catch {
        // silent — polling fallback keeps the app working
      }
    };

    init();

    return () => {
      mounted = false;
      socketService.disconnect();
      setConnected(false);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socketService, connected, loadingEvent }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};
