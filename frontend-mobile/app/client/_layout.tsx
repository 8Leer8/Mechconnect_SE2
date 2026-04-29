import { Slot, useRouter } from 'expo-router';
import React from 'react';
import { LocationProvider } from '@/context/LocationContext';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { consumeClientBroadcastFinalizeNavKey } from '@/lib/clientBroadcastFinalizeNav';

/**
 * When the client is on any /client/* screen (e.g. broadcast details), (clientTabs) may not be
 * mounted — listen here so we still jump to the booking after finalize.
 */
function ClientBroadcastFinalizeToBooking() {
  const router = useRouter();
  const { lastMessage } = useWebSocketContext();
  const mountedAtRef = React.useRef(Date.now());

  React.useEffect(() => {
    if (!lastMessage) return;
    const action = String(lastMessage.action || '').toLowerCase();
    if (action !== 'broadcast_finalized' && action !== 'booking_finalized') return;

    const ts = Number(lastMessage._timestamp || 0) || null;
    if (!ts || ts < mountedAtRef.current) return;

    const raw =
      (lastMessage as any).booking_id ??
      (lastMessage as any).bookingId ??
      (lastMessage as any).booking?.id;
    const bid = Number(raw);
    if (!Number.isFinite(bid) || bid <= 0) return;

    const bcid = Number((lastMessage as any).broadcast_id ?? (lastMessage as any).broadcastId ?? 0) || 0;
    const key = `client-finalize-${bcid}-${bid}`;
    if (!consumeClientBroadcastFinalizeNavKey(key)) return;

    router.replace({
      pathname: '/client/booking/booking_details',
      params: { bookingId: String(bid) },
    } as any);
  }, [lastMessage, router]);

  return null;
}

export default function ClientLayout() {
  return (
    <LocationProvider>
      <ClientBroadcastFinalizeToBooking />
      <Slot />
    </LocationProvider>
  );
}
