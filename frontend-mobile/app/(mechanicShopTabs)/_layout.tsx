import { Tabs } from 'expo-router';
import React from 'react';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { Alert, Modal, TouchableOpacity, View } from 'react-native';
import { useTabsBackToHome } from '@/hooks/use-tabs-back-to-home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useWebSocketContext } from '@/context/WebSocketContext';

export default function MechanicShopTabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lastMessage } = useWebSocketContext();
  const [mechanicGlobalModal, setMechanicGlobalModal] = React.useState<{
    visible: boolean;
    title: string;
    body?: string;
    bookingId: number | null;
    mode: 'accepted' | 'rejected' | 'info' | 'cancelled';
  }>({
    visible: false,
    title: 'Client has accepted your request',
    bookingId: null,
    mode: 'accepted',
  });
  const lastHandledMessageKeyRef = React.useRef<string | null>(null);
  const lastModalBookingIdRef = React.useRef<number | null>(null);
  const mountedAtRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    if (!lastMessage) return;
    const actionText = String(lastMessage.action || '').toLowerCase();
    const messageText = String((lastMessage as any).message || '').toLowerCase();
    const eventSource = String(lastMessage.event_source || '').toLowerCase();
    const isQuotationUpdate = actionText.includes('quotation') || messageText.includes('quotation');
    const statusLower = String(lastMessage.status || '').toLowerCase();

    const isMechanicAcceptedDirect =
      lastMessage.type === 'booking_update' &&
      statusLower === 'accepted' &&
      eventSource === 'mechanic_accepted_direct';

    const isBroadcastFinalize =
      actionText === 'booking_finalized'
      || (lastMessage.type === 'notification_update' && actionText === 'booking_finalized');
    const isOfferRejected =
      actionText === 'offer_rejected'
      || (lastMessage.type === 'notification_update' && actionText === 'offer_rejected');
    const isClientCancelled =
      lastMessage.type === 'booking_update' &&
      actionText === 'client_cancelled';
    if (!isBroadcastFinalize && !isOfferRejected && !isQuotationUpdate && !isMechanicAcceptedDirect && !isClientCancelled) return;

    const messageTimestamp = Number(lastMessage._timestamp || 0) || null;
    if (!messageTimestamp) return;
    if (messageTimestamp < mountedAtRef.current) return;

    const bookingIdRaw = (lastMessage as any).booking_id ?? (lastMessage as any).bookingId ?? '';
    const broadcastIdRaw =
      (lastMessage as any).broadcast_id ?? (lastMessage as any).broadcastId ?? '';
    const offerIdRaw = (lastMessage as any).offer_id ?? (lastMessage as any).offerId ?? '';

    let dedupeKey = `${String(lastMessage.action || lastMessage.type || 'unknown')}-${String(offerIdRaw)}-${String(bookingIdRaw)}-${String(messageTimestamp)}`;
    if (isBroadcastFinalize && !isOfferRejected) {
      dedupeKey = `booking_finalized-${String(broadcastIdRaw)}-${String(bookingIdRaw)}`;
    }
    if (lastHandledMessageKeyRef.current === dedupeKey) return;
    lastHandledMessageKeyRef.current = dedupeKey;

    const bookingId = Number((lastMessage as any).booking_id ?? (lastMessage as any).bookingId ?? 0) || null;
    const safeBookingId =
      bookingId != null && Number.isFinite(bookingId) && bookingId > 0 ? bookingId : null;

    if (isClientCancelled) {
      const reason = String((lastMessage as any).cancellation_reason || '').trim();
      lastModalBookingIdRef.current = safeBookingId;
      setMechanicGlobalModal({
        visible: true,
        title: 'Client cancelled this booking',
        body: reason ? `Reason: ${reason}` : 'The client cancelled before the mechanic started travel.',
        bookingId,
        mode: 'cancelled',
      });
      return;
    }

    if (isMechanicAcceptedDirect) {
      lastModalBookingIdRef.current = safeBookingId;
      setMechanicGlobalModal({
        visible: true,
        title: 'You accepted this direct request',
        bookingId,
        mode: 'accepted',
      });
      return;
    }

    if (isQuotationUpdate) {
      const isQuotationRejected = actionText.includes('rejected') || messageText.includes('rejected');
      const isQuotationAccepted = actionText.includes('accepted') || messageText.includes('accepted');
      lastModalBookingIdRef.current = safeBookingId;
      setMechanicGlobalModal({
        visible: true,
        title: isQuotationRejected
          ? 'Quotation rejected by client'
          : isQuotationAccepted
            ? 'Quotation accepted by client'
            : 'Quotation request sent',
        bookingId,
        mode: isQuotationAccepted ? 'accepted' : (isQuotationRejected ? 'rejected' : 'info'),
      });
      return;
    }

    if (isOfferRejected) {
      lastModalBookingIdRef.current = safeBookingId;
      setMechanicGlobalModal({
        visible: true,
        title: 'Client chose a different mechanic',
        body: 'You can return to your map or bookings when you are ready.',
        bookingId,
        mode: 'rejected',
      });
      return;
    }

    if (isBroadcastFinalize) {
      lastModalBookingIdRef.current = safeBookingId;
      Alert.alert(
        'The client accepted your request',
        'They chose you for this booking.',
        [
          {
            text: 'View booking',
            onPress: () => {
              if (safeBookingId) {
                router.push({
                  pathname: '/mechanic/booking/booking_details',
                  params: { bookingId: String(safeBookingId) },
                } as any);
              } else {
                router.push('/(mechanicShopTabs)/main/jobs' as any);
              }
            },
          },
          { text: 'Close', style: 'cancel' },
        ]
      );
    }
  }, [lastMessage, router]);

  const closeAcceptModal = React.useCallback(() => {
    setMechanicGlobalModal((current) => ({ ...current, visible: false }));
  }, []);

  const viewAcceptedBooking = React.useCallback(() => {
    const id = lastModalBookingIdRef.current;
    setMechanicGlobalModal((current) => ({ ...current, visible: false }));
    if (id != null && Number.isFinite(id) && id > 0) {
      router.push({
        pathname: '/mechanic/booking/booking_details',
        params: { bookingId: String(id) },
      } as any);
      return;
    }
    router.push('/(mechanicShopTabs)/main/jobs' as any);
  }, [router]);

  const modalBodyCopy =
    mechanicGlobalModal.body ||
    (mechanicGlobalModal.mode === 'cancelled'
      ? 'The booking was cancelled before travel started.'
      : mechanicGlobalModal.mode === 'rejected'
      ? 'You can return to your map or bookings when you are ready.'
      : mechanicGlobalModal.mode === 'info'
        ? 'Check your bookings for the latest on this quotation.'
        : 'Tap View booking to see details and next steps.');

  const modalFeatherIcon =
    mechanicGlobalModal.mode === 'cancelled'
      ? 'x-circle'
      : mechanicGlobalModal.mode === 'rejected'
      ? 'alert-circle'
      : mechanicGlobalModal.mode === 'info'
        ? 'info'
        : 'check-circle';

  const modalIconColor =
    mechanicGlobalModal.mode === 'cancelled'
      ? '#FF3B30'
      : mechanicGlobalModal.mode === 'rejected'
      ? '#FF9500'
      : mechanicGlobalModal.mode === 'info'
        ? '#0A84FF'
        : '#34C759';

  useTabsBackToHome('/(mechanicShopTabs)/main/home');

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#FF8C00',
          tabBarInactiveTintColor: '#999',
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#1E1E1E',
            borderTopColor: '#333',
            borderTopWidth: 1,
            height: 55 + Math.max(insets.bottom, 6),
            paddingBottom: Math.max(insets.bottom, 6),
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            marginTop: 2,
            fontWeight: '500',
          },
        }}>
        <Tabs.Screen
          name="main/home"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="tachometer" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/jobs"
          options={{
            title: 'Jobs',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="briefcase" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/schedule"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="user" color={color} />,
          }}
        />
        {/* Hide non-tab routes */}
        <Tabs.Screen name="index" options={{ href: null }} />
      </Tabs>

      <Modal
        visible={mechanicGlobalModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeAcceptModal}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
          <View style={{ width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, borderColor: '#2C2C2E', backgroundColor: '#141416', padding: 18 }}>
            <View
              style={{
                alignSelf: 'center',
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${modalIconColor}22`,
                marginBottom: 12,
              }}
            >
              <Feather name={modalFeatherIcon as 'check-circle' | 'alert-circle' | 'info' | 'x-circle'} size={26} color={modalIconColor} />
            </View>
            <ThemedText
              style={{
                fontSize: 12,
                lineHeight: 16,
                color: '#A7A7AF',
                textAlign: 'center',
                fontWeight: '300',
                marginBottom: 8,
              }}
            >
              Update
            </ThemedText>
            <ThemedText
              style={{
                fontSize: 16,
                lineHeight: 22,
                color: '#FFFFFF',
                textAlign: 'center',
                fontWeight: '600',
                marginBottom: 10,
              }}
            >
              {mechanicGlobalModal.title}
            </ThemedText>
            <ThemedText
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: '#D1D1D6',
                textAlign: 'center',
                fontWeight: '400',
                marginBottom: 18,
              }}
            >
              {modalBodyCopy}
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: mechanicGlobalModal.mode === 'accepted' ? 1 : undefined,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#2C2C2E',
                  backgroundColor: '#1A1B1E',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 13,
                  paddingHorizontal: mechanicGlobalModal.mode === 'accepted' ? 0 : 22,
                }}
                onPress={closeAcceptModal}
                activeOpacity={0.8}
              >
                <ThemedText style={{ color: '#E5E5EA', fontSize: 16, fontWeight: '400' }}>Close</ThemedText>
              </TouchableOpacity>
              {mechanicGlobalModal.mode === 'accepted' && (
                <TouchableOpacity
                  style={{ flex: 1, borderRadius: 12, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center', paddingVertical: 13 }}
                  onPress={viewAcceptedBooking}
                  activeOpacity={0.85}
                >
                  <ThemedText style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>View booking</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
