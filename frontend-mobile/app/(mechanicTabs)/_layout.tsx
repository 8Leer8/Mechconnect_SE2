import { Tabs } from 'expo-router';
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { Modal, TouchableOpacity, View } from 'react-native';
import { useTabsBackToHome } from '@/hooks/use-tabs-back-to-home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useWebSocketContext } from '@/context/WebSocketContext';

export default function MechanicTabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lastMessage } = useWebSocketContext();
  const [mechanicGlobalModal, setMechanicGlobalModal] = React.useState<{
    visible: boolean;
    title: string;
    bookingId: number | null;
    mode: 'accepted' | 'rejected' | 'info';
  }>({
    visible: false,
    title: 'Client has accepted your request',
    bookingId: null,
    mode: 'accepted',
  });
  const lastHandledMessageKeyRef = React.useRef<string | null>(null);
  const mountedAtRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    if (!lastMessage) return;
    const actionText = String(lastMessage.action || '').toLowerCase();
    const messageText = String((lastMessage as any).message || '').toLowerCase();
    const isQuotationUpdate = actionText.includes('quotation') || messageText.includes('quotation');
    const isBroadcastFinalize =
      actionText === 'booking_finalized'
      || (lastMessage.type === 'notification_update' && actionText === 'booking_finalized')
      || (
        lastMessage.type === 'booking_update' &&
        String(lastMessage.status || '').toLowerCase() === 'accepted' &&
        !isQuotationUpdate
      );
    const isOfferRejected =
      actionText === 'offer_rejected'
      || (lastMessage.type === 'notification_update' && actionText === 'offer_rejected');
    if (!isBroadcastFinalize && !isOfferRejected && !isQuotationUpdate) return;

    const messageTimestamp = Number(lastMessage._timestamp || 0) || null;
    if (!messageTimestamp) return;
    if (messageTimestamp < mountedAtRef.current) return;
    const dedupeKey = `${String(lastMessage.action || lastMessage.type || 'unknown')}-${String((lastMessage as any).offer_id || '')}-${String((lastMessage as any).booking_id || '')}-${String(messageTimestamp)}`;
    if (lastHandledMessageKeyRef.current === dedupeKey) return;
    lastHandledMessageKeyRef.current = dedupeKey;

    const bookingId = Number((lastMessage as any).booking_id ?? (lastMessage as any).bookingId ?? 0) || null;
    if (isQuotationUpdate) {
      const isQuotationRejected = actionText.includes('rejected') || messageText.includes('rejected');
      const isQuotationAccepted = actionText.includes('accepted') || messageText.includes('accepted');
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

    setMechanicGlobalModal({
      visible: true,
      title: isOfferRejected
        ? 'Client has accepted a different mechanic'
        : 'Client has accepted your request',
      bookingId,
      mode: isOfferRejected ? 'rejected' : 'accepted',
    });
  }, [lastMessage]);

  const closeAcceptModal = React.useCallback(() => {
    setMechanicGlobalModal((current) => ({ ...current, visible: false }));
  }, []);

  const viewAcceptedBooking = React.useCallback(() => {
    setMechanicGlobalModal((current) => ({ ...current, visible: false }));
    if (mechanicGlobalModal.bookingId) {
      router.push({
        pathname: '/mechanic/booking/booking_details',
        params: { bookingId: String(mechanicGlobalModal.bookingId) },
      } as any);
      return;
    }
    router.push('/(mechanicTabs)/main/bookings' as any);
  }, [mechanicGlobalModal.bookingId, router]);

  useTabsBackToHome('/(mechanicTabs)/main/home');

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
          name="main/bookings"
          options={{
            title: 'Bookings',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="calendar-check-o" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/emergency"
          options={{
            title: 'Emergency',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="exclamation-triangle" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="home" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/map"
          options={{
            title: 'Map',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="map-marker" color={color} />,
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
        <Tabs.Screen name="main/wallet" options={{ href: null }} />
      </Tabs>

      <Modal
        visible={mechanicGlobalModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeAcceptModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#2C2C2E',
              backgroundColor: '#141416',
              padding: 18,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#34C75922',
                marginBottom: 14,
              }}
            >
              <FontAwesome
                name={mechanicGlobalModal.mode === 'rejected' ? 'exclamation-circle' : (mechanicGlobalModal.mode === 'info' ? 'info-circle' : 'check-circle')}
                size={24}
                color={mechanicGlobalModal.mode === 'rejected' ? '#FF9500' : (mechanicGlobalModal.mode === 'info' ? '#0A84FF' : '#34C759')}
              />
            </View>

            <ThemedText
              style={{
                fontSize: 18,
                color: '#FFFFFF',
                textAlign: 'center',
                fontWeight: '700',
                marginBottom: 16,
              }}
            >
              {mechanicGlobalModal.title}
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
                <ThemedText style={{ color: '#E5E5EA', fontSize: 16, fontWeight: '600' }}>Close</ThemedText>
              </TouchableOpacity>

              {mechanicGlobalModal.mode === 'accepted' && (
                <TouchableOpacity
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    backgroundColor: '#34C759',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 13,
                  }}
                  onPress={viewAcceptedBooking}
                  activeOpacity={0.85}
                >
                  <ThemedText style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>View booking</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
