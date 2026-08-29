/**
 * UnlockWaitingScreen
 *
 * Landing spot right after sending an unlock request — the owner hasn't
 * approved yet, so nothing's been charged. Socket-first for the accept/
 * decline hand-off (see Backend/app/websockets/unlock_requests.py), with a
 * polling fallback against GET /unlock-requests/{id}/status matching the
 * REVEAL_POLL_MS/MAX_REVEAL_ATTEMPTS pattern already used for the M-Pesa
 * reveal flow in DropChatScreen.jsx.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';

import { T } from '../../utils/colorTokens';
import { rs, rp, SPACING, FONT, RADIUS, HIT_SLOP, BUTTON_HEIGHT } from '../../utils/responsive';
import DropScreenHeader from '../../components/drops/DropScreenHeader';
import PulseLoader from '../../components/common/PulseLoader';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../context/SocketContext';
import { API_BASE_URL } from '../../config/api';
import { fetchBalance } from '../../store/slices/coinsSlice';

const POLL_MS = 5000;
const MAX_POLL_ATTEMPTS = 24; // ~2 minutes, matching DropChatScreen's reveal poll

export default function UnlockWaitingScreen({ route, navigation }) {
  const {
    requestId: initialRequestId, targetType, targetId,
    ownerAnonymousName, confessionSnippet,
  } = route.params ?? {};

  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { socketService } = useSocket();

  const [requestId, setRequestId] = useState(initialRequestId);
  const [step, setStep] = useState('waiting'); // waiting | declined | expired | resending
  const pollRef = useRef(null);
  const attemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const goToChat = useCallback((connectionId) => {
    stopPolling();
    dispatch(fetchBalance());
    navigation.replace('DropChat', { connectionId });
  }, [stopPolling, dispatch, navigation]);

  const checkStatus = useCallback(async (id) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${id}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'accepted' && data.connection_id) {
        goToChat(data.connection_id);
      } else if (data.status === 'declined') {
        stopPolling();
        setStep('declined');
      } else if (data.status === 'expired') {
        stopPolling();
        setStep('expired');
      }
    } catch {
      // keep polling — a single missed check isn't fatal
    }
  }, [goToChat, stopPolling]);

  const startPolling = useCallback((id) => {
    stopPolling();
    attemptsRef.current = 0;
    pollRef.current = setInterval(() => {
      attemptsRef.current += 1;
      if (attemptsRef.current > MAX_POLL_ATTEMPTS) {
        stopPolling();
        return;
      }
      checkStatus(id);
    }, POLL_MS);
  }, [checkStatus, stopPolling]);

  useEffect(() => {
    if (!requestId) return;
    startPolling(requestId);
    return stopPolling;
  }, [requestId, startPolling, stopPolling]);

  // Socket is primary — polling above is only the safety net for a missed event.
  useEffect(() => {
    if (!socketService || !requestId) return;

    const handleAccepted = (payload) => {
      if (payload?.request_id !== requestId) return;
      goToChat(payload.connection_id);
    };
    const handleDeclined = (payload) => {
      if (payload?.request_id !== requestId) return;
      stopPolling();
      setStep('declined');
    };

    socketService.on?.('unlock_request_accepted', handleAccepted);
    socketService.on?.('unlock_request_declined', handleDeclined);
    return () => {
      socketService.off?.('unlock_request_accepted', handleAccepted);
      socketService.off?.('unlock_request_declined', handleDeclined);
    };
  }, [socketService, requestId, goToChat, stopPolling]);

  const handleCancel = useCallback(async () => {
    stopPolling();
    try {
      const token = await AsyncStorage.getItem('token');
      await fetch(`${API_BASE_URL}/api/v1/unlock-requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort — leaving is fine even if the cancel call itself fails
    }
    navigation.goBack();
  }, [requestId, stopPolling, navigation]);

  const handleResend = useCallback(async () => {
    setStep('resending');
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, payment_method: 'coins' }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequestId(data.request_id);
        setStep('waiting');
      } else if (data?.detail?.request_id) {
        setRequestId(data.detail.request_id);
        setStep('waiting');
      } else {
        showToast({ type: 'error', message: data.detail?.message || data.detail || 'Could not send request.' });
        setStep('declined');
      }
    } catch {
      showToast({ type: 'error', message: 'Something went wrong. Try again.' });
      setStep('declined');
    }
  }, [targetType, targetId, showToast]);

  return (
    <SafeAreaView style={s.root}>
      <DropScreenHeader title="Link up" navigation={navigation} />

      <View style={s.body}>
        {step === 'waiting' || step === 'resending' ? (
          <>
            <PulseLoader size={56} color={T.primary} />
            <Text style={s.title}>Waiting for a response…</Text>
            <Text style={s.sub}>
              {ownerAnonymousName || 'They'} can see your request. Nothing's
              been charged yet — you'll only pay coins if they accept.
            </Text>
            {!!confessionSnippet && (
              <Text style={s.snippet} numberOfLines={3}>&ldquo;{confessionSnippet}&rdquo;</Text>
            )}
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={handleCancel}
              disabled={step === 'resending'}
              activeOpacity={0.85}
              hitSlop={HIT_SLOP}
            >
              <Text style={s.cancelBtnText}>Cancel request</Text>
            </TouchableOpacity>
          </>
        ) : step === 'declined' ? (
          <>
            <Text style={s.title}>They're not up for it right now</Text>
            <Text style={s.sub}>
              You can send another request anytime — no coins were spent.
            </Text>
            <TouchableOpacity style={s.retryBtn} onPress={handleResend} activeOpacity={0.88} hitSlop={HIT_SLOP}>
              <Text style={s.retryBtnText}>Send another request</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.backLink}>
              <Text style={s.backLinkText}>Back to feed</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.title}>This confession expired</Text>
            <Text style={s.sub}>It's gone before they got to respond — no coins were spent.</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT_SLOP} style={s.backLink}>
              <Text style={s.backLinkText}>Back to feed</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  title: {
    fontSize: FONT.lg, fontWeight: '700', color: T.text,
    fontFamily: 'PlayfairDisplay-Bold', textAlign: 'center',
    marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  sub: {
    fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center',
    lineHeight: FONT.sm * 1.6, marginBottom: SPACING.lg,
  },
  snippet: {
    fontSize: FONT.sm, color: T.textSecondary, textAlign: 'center',
    fontStyle: 'italic', lineHeight: FONT.sm * 1.5, marginBottom: SPACING.xl,
  },
  cancelBtn: { marginTop: SPACING.md, padding: rp(8) },
  cancelBtnText: { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '500' },
  retryBtn: {
    height: BUTTON_HEIGHT, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.primary, width: '100%',
  },
  retryBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
  backLink: { marginTop: SPACING.lg, padding: rp(8) },
  backLinkText: { color: T.textSecondary, fontSize: FONT.sm, fontWeight: '500' },
});
