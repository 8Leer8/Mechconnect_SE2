import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';
import { useWebSocketContext } from '@/context/WebSocketContext';

interface CashQRDisplayModalProps {
  visible: boolean;
  bookingId: number;
  amount: number;
  onClose: () => void;
  onPaymentReceived: () => void;
}

export default function CashQRDisplayModal({
  visible,
  bookingId,
  amount,
  onClose,
  onPaymentReceived,
}: CashQRDisplayModalProps) {
  const [token, setToken] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [awaitingSettlement, setAwaitingSettlement] = useState(false);
  const { lastMessage } = useWebSocketContext();

  const loadToken = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      if (!awaitingSettlement) setError('');
      const response = await fetch(`${API_URL}/bookings/payments/qr/${bookingId}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const rawPayload: unknown = await response.json().catch(() => ({}));
      const payload: Record<string, unknown> =
        typeof rawPayload === 'object' && rawPayload !== null
          ? (rawPayload as Record<string, unknown>)
          : {};
      const errorMessage =
        typeof payload.error === 'string' ? payload.error : 'Unable to load QR token';
      if (!response.ok) {
        const normalized = String(errorMessage || '').toLowerCase();
        const tokenWasScannedOrConsumed =
          normalized.includes('expired') ||
          normalized.includes('already been used') ||
          normalized.includes('already used');

        if (tokenWasScannedOrConsumed) {
          // Client likely scanned and token is consumed; wait for final payment completion event.
          setAwaitingSettlement(true);
          setToken('');
          setError('');
          return;
        }
        // Token creation is async with payment-method selection; keep retrying quietly.
        setToken('');
        throw new Error(errorMessage);
      }

      setAwaitingSettlement(false);
      setToken(typeof payload.token === 'string' ? payload.token : '');
      setExpiresAt(typeof payload.expires_at === 'string' ? payload.expires_at : '');
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : 'Unable to load QR token';
      setError(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!visible) return;
    setAwaitingSettlement(false);
    loadToken(false);
  }, [visible, loadToken]);

  useEffect(() => {
    if (!visible) return;
    if (awaitingSettlement) return;
    // Realtime retry while waiting for token to be generated/updated.
    const poll = setInterval(() => {
      loadToken(true);
    }, 2000);
    return () => clearInterval(poll);
  }, [visible, loadToken, awaitingSettlement]);

  useEffect(() => {
    if (!expiresAt) return;

    const update = () => {
      const end = new Date(expiresAt).getTime();
      const now = Date.now();
      const seconds = Math.max(0, Math.floor((end - now) / 1000));
      setRemainingSeconds(seconds);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (!visible) return;
    if (remainingSeconds > 0) return;
    // If token is expired while modal is open, keep trying to refresh.
    loadToken(true);
  }, [remainingSeconds, visible, loadToken]);

  useEffect(() => {
    if (!visible || !lastMessage) return;
    const action = String(lastMessage.action || '').toLowerCase();
    const bid = Number(lastMessage.booking_id);
    if (bid === bookingId && action === 'payment.completed') {
      onPaymentReceived();
    }
  }, [lastMessage, bookingId, visible, onPaymentReceived]);

  const countdown = useMemo(() => {
    const hh = String(Math.floor(remainingSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(remainingSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }, [remainingSeconds]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ThemedText style={styles.title}>Show this QR to client</ThemedText>

          <View style={styles.qrContainer}>
            {loading || awaitingSettlement ? <ActivityIndicator color="#FF8C00" /> : null}
            {!loading && token ? <QRCode value={token} size={200} /> : null}
            {!loading && awaitingSettlement ? (
              <ThemedText style={styles.processingText}>Client scanned QR. Finalizing payment...</ThemedText>
            ) : null}
            {!loading && error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
            {!loading && !token && !error && !awaitingSettlement ? (
              <ThemedText style={styles.errorText}>No QR token yet. Tap refresh below.</ThemedText>
            ) : null}
          </View>

          <ThemedText style={styles.meta}>Booking #{bookingId}</ThemedText>
          <ThemedText style={styles.meta}>Amount: PHP {Number(amount || 0).toFixed(2)}</ThemedText>

          <ThemedText style={styles.timerText}>
            {remainingSeconds > 0 ? `Expires in: ${countdown}` : 'Expired'}
          </ThemedText>

          <ThemedText style={styles.waitingText}>
            {awaitingSettlement ? 'Payment is being processed...' : 'Waiting for client scan...'}
          </ThemedText>

          <TouchableOpacity style={styles.retryButton} onPress={() => loadToken(false)} disabled={loading || awaitingSettlement}>
            <ThemedText style={styles.retryText}>{loading ? 'Loading...' : 'Refresh QR'}</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <ThemedText style={styles.closeText}>Close</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    alignItems: 'center',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3D40',
    marginBottom: 14,
  },
  title: {
    color: '#ECEDEE',
    fontWeight: '800',
    fontSize: 20,
    marginBottom: 12,
  },
  qrContainer: {
    width: 230,
    height: 230,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  meta: {
    color: '#ECEDEE',
    marginTop: 4,
  },
  timerText: {
    marginTop: 10,
    color: '#FF8C00',
    fontWeight: '800',
  },
  waitingText: {
    marginTop: 8,
    color: '#8E8E93',
  },
  closeButton: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#2A2C2E',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF8C0040',
    backgroundColor: '#FF8C0015',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryText: {
    color: '#FF8C00',
    fontWeight: '700',
  },
  closeText: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
  errorText: {
    color: '#FF3B30',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  processingText: {
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});