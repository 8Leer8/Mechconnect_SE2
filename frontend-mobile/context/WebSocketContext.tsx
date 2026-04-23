import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { WS_URL } from '@/config';

export interface BookingUpdateMessage {
  type: string;
  booking_id?: number;
  status?: string;
  message?: string;
  action?: string;
  _timestamp?: number;
  /** Live mechanic GPS pushed from backend after POST /mechanic-location/ */
  latitude?: number;
  longitude?: number;
}

type WebSocketContextValue = {
  lastMessage: BookingUpdateMessage | null;
  isConnected: boolean;
};

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [lastMessage, setLastMessage] = useState<BookingUpdateMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const disconnectSocket = useCallback(() => {
    if (!socketRef.current) return;

    socketRef.current.onopen = null;
    socketRef.current.onmessage = null;
    socketRef.current.onerror = null;
    socketRef.current.onclose = null;

    if (
      socketRef.current.readyState === WebSocket.OPEN ||
      socketRef.current.readyState === WebSocket.CONNECTING
    ) {
      socketRef.current.close();
    }

    socketRef.current = null;
    setIsConnected(false);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current) return;

    clearReconnectTimer();

    reconnectAttemptsRef.current += 1;
    const delayMs = Math.min(3000 * reconnectAttemptsRef.current, 15000);

    reconnectTimeoutRef.current = setTimeout(() => {
      if (!shouldReconnectRef.current) return;
      connect();
    }, delayMs);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;

    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ws = new WebSocket(`${WS_URL}/ws/updates/`);

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as BookingUpdateMessage;
        setLastMessage({ ...data, _timestamp: Date.now() });
      } catch {
        // ignore malformed payloads
      }
    };

    ws.onerror = () => {
      // onclose handles reconnect policy.
    };

    ws.onclose = (event: CloseEvent) => {
      setIsConnected(false);
      socketRef.current = null;

      // Backend closes with 4001 when session/account is missing.
      // Treat this as logged-out/session-gone and stop reconnecting.
      if (event.code === 4001) {
        shouldReconnectRef.current = false;
        clearReconnectTimer();
        setLastMessage(null);
        return;
      }

      scheduleReconnect();
    };

    socketRef.current = ws;
  }, [clearReconnectTimer, scheduleReconnect]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      disconnectSocket();
    };
  }, [connect, clearReconnectTimer, disconnectSocket]);

  const value = useMemo(
    () => ({
      lastMessage,
      isConnected,
    }),
    [lastMessage, isConnected]
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocketContext() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return ctx;
}
