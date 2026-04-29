import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { ThemedText } from '@/components/themed-text';
import { useTabsBackToHome } from '@/hooks/use-tabs-back-to-home';
import { useWebSocketContext } from '@/context/WebSocketContext';

type ShopOwnerGlobalModalMode = 'accepted' | 'rejected';

export default function ShopOwnerTabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lastMessage } = useWebSocketContext();

  const [shopOwnerGlobalModal, setShopOwnerGlobalModal] = React.useState<{
    visible: boolean;
    title: string;
    body?: string;
    bookingId: number | null;
    mode: ShopOwnerGlobalModalMode;
  }>({
    visible: false,
    title: '',
    bookingId: null,
    mode: 'accepted',
  });

  const lastHandledMessageKeyRef = React.useRef<string | null>(null);
  const lastModalBookingIdRef = React.useRef<number | null>(null);
  const mountedAtRef = React.useRef<number>(Date.now());

  React.useEffect(() => {
    if (!lastMessage) return;

    const actionText = String(lastMessage.action || '').toLowerCase();
    const isBroadcastFinalize =
      actionText === 'booking_finalized' ||
      (lastMessage.type === 'notification_update' && actionText === 'booking_finalized');
    const isOfferRejected =
      actionText === 'offer_rejected' ||
      (lastMessage.type === 'notification_update' && actionText === 'offer_rejected');

    if (!isBroadcastFinalize && !isOfferRejected) return;

    const messageTimestamp = Number(lastMessage._timestamp || 0) || null;
    if (!messageTimestamp || messageTimestamp < mountedAtRef.current) return;

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

    if (isOfferRejected) {
      lastModalBookingIdRef.current = safeBookingId;
      setShopOwnerGlobalModal({
        visible: true,
        title: 'Client chose someone else',
        body: 'The client picked another shop or mechanic. You can return to the map or Jobs when you are ready.',
        bookingId,
        mode: 'rejected',
      });
      return;
    }

    if (isBroadcastFinalize) {
      lastModalBookingIdRef.current = safeBookingId;
      setShopOwnerGlobalModal({
        visible: true,
        title: 'The client accepted your request',
        body: 'They chose your shop for this booking.',
        bookingId,
        mode: 'accepted',
      });
    }
  }, [lastMessage]);

  const closeModal = React.useCallback(() => {
    setShopOwnerGlobalModal((current) => ({ ...current, visible: false }));
  }, []);

  const viewBooking = React.useCallback(() => {
    const id = lastModalBookingIdRef.current;
    setShopOwnerGlobalModal((current) => ({ ...current, visible: false }));
    if (id != null && Number.isFinite(id) && id > 0) {
      router.push({
        pathname: '/shopowner/booking/booking_details',
        params: { bookingId: String(id) },
      } as any);
      return;
    }
    router.push('/(shopownerTabs)/main/jobs' as any);
  }, [router]);

  const modalBodyCopy =
    shopOwnerGlobalModal.body ||
    (shopOwnerGlobalModal.mode === 'rejected'
      ? 'You can return to the map or Jobs when you are ready.'
      : 'Tap View booking to see details and next steps.');

  const modalFeatherIcon =
    shopOwnerGlobalModal.mode === 'rejected' ? 'alert-circle' : 'check-circle';

  const modalIconColor = shopOwnerGlobalModal.mode === 'rejected' ? '#FF9500' : '#34C759';

  useTabsBackToHome('/(shopownerTabs)/main/home');

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarActiveTintColor: '#FF8C00',
          tabBarInactiveTintColor: '#999',
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
          name="main/jobs"
          options={{
            title: 'Jobs',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="briefcase" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/mechanics"
          options={{
            title: 'Mechanics',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="wrench" color={color} />,
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
          name="main/shop"
          options={{
            title: 'Map',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="map" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <FontAwesome size={20} name="user" color={color} />,
          }}
        />
        {/* Hide non-tab routes */}
        <Tabs.Screen name="main/emergency" options={{ href: null }} />
        <Tabs.Screen name="index" options={{ href: null }} />
      </Tabs>

      <Modal
        visible={shopOwnerGlobalModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
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
                backgroundColor: `${modalIconColor}22`,
                marginBottom: 12,
              }}
            >
              <Feather name={modalFeatherIcon as 'check-circle' | 'alert-circle'} size={26} color={modalIconColor} />
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
              {shopOwnerGlobalModal.title}
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
                  flex: shopOwnerGlobalModal.mode === 'accepted' ? 1 : undefined,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#2C2C2E',
                  backgroundColor: '#1A1B1E',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 13,
                  paddingHorizontal: shopOwnerGlobalModal.mode === 'accepted' ? 0 : 22,
                }}
                onPress={closeModal}
                activeOpacity={0.8}
              >
                <ThemedText style={{ color: '#E5E5EA', fontSize: 16, fontWeight: '400' }}>Close</ThemedText>
              </TouchableOpacity>

              {shopOwnerGlobalModal.mode === 'accepted' && (
                <TouchableOpacity
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    backgroundColor: '#34C759',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 13,
                  }}
                  onPress={viewBooking}
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
