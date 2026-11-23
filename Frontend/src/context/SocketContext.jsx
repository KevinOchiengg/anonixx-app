import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import socketService from '../services/socket';
import { useAuth } from './AuthContext';

export const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const userId = user?.id || user?._id || null;

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let mounted = true;

    const init = async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token || !mounted) return;
      try {
        const sock = await socketService.connect();
        sock.on('connect',    () => { if (mounted) setConnected(true);  });
        sock.on('disconnect', () => { if (mounted) setConnected(false); });
        if (sock.connected && mounted) setConnected(true);
      } catch {
        // silent — polling fallback keeps the app working
      }
    };

    init();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !socketService.socket?.connected) socketService.socket?.connect();
    });

    return () => {
      mounted = false;
      sub.remove();
      socketService.disconnect();
      setConnected(false);
    };
  }, [isAuthenticated, userId]);

  return (
    <SocketContext.Provider value={{ socketService, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};
