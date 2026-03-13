import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_URL } from '@/config';

interface BookingUpdateMessage {
  type: string;
  booking_id: number;
  status: string;
  message: string;
  action?: string;
}

export default function useWebSocket() {
  const [lastMessage, setLastMessage] = useState<BookingUpdateMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const isMounted = useRef(true);

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/ws/updates/`);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as BookingUpdateMessage;
        setLastMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      // onclose will fire next and handle reconnect
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (isMounted.current) {
        setTimeout(connect, 3000);
      }
    };

    socketRef.current = ws;
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connect();
    return () => {
      isMounted.current = false;
      socketRef.current?.close();
    };
  }, [connect]);

  return { lastMessage, isConnected };
}
