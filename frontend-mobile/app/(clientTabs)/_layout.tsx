import { Tabs } from 'expo-router';
import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Modal, TouchableOpacity, View } from 'react-native';
import { useTabsBackToHome } from '@/hooks/use-tabs-back-to-home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useWebSocketContext } from '@/context/WebSocketContext';

export default function ClientTabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lastMessage } = useWebSocketContext();
  const [offerModalVisible, setOfferModalVisible] = React.useState(false);
  const [offerModalPayload, setOfferModalPayload] = React.useState<{
    broadcastId: number | null;
    mechanicName: string;
    message: string;
  }>({
    broadcastId: null,
    mechanicName: '',
    message: 'A mechanic requested to accept your broadcast.',
  });
  const lastHandledMessageKeyRef = React.useRef<string | null>(null);
  const mountedAtRef = React.useRef<number>(Date.now());

  useTabsBackToHome('/(clientTabs)/main/home');

  React.useEffect(() => {
    if (!lastMessage || lastMessage.action !== 'broadcast_offer_created') return;

    const messageTimestamp = Number(lastMessage._timestamp || 0) || null;
    if (!messageTimestamp) return;
    // Ignore stale messages that existed before this layout was mounted
    // (e.g. switching account views with an old cached lastMessage).
    if (messageTimestamp < mountedAtRef.current) return;
    const broadcastId = Number(
      (lastMessage as any).broadcast_id ?? (lastMessage as any).broadcastId ?? 0
    ) || null;
    const offerId = Number((lastMessage as any).offer_id ?? (lastMessage as any).offerId ?? 0) || null;
    const dedupeKey = `${String(lastMessage.action || 'unknown')}-${String(broadcastId || '')}-${String(offerId || '')}-${String(messageTimestamp)}`;
    if (lastHandledMessageKeyRef.current === dedupeKey) return;
    lastHandledMessageKeyRef.current = dedupeKey;

    const mechanicName = String((lastMessage as any)?.mechanic?.name || '').trim();
    const messageText = String(lastMessage.message || '').trim()
      || 'A mechanic requested to accept your broadcast.';

    setOfferModalPayload({
      broadcastId,
      mechanicName,
      message: messageText,
    });
    setOfferModalVisible(true);
  }, [lastMessage]);

  const closeOfferModal = React.useCallback(() => {
    setOfferModalVisible(false);
  }, []);

  const openOfferDetails = React.useCallback(() => {
    const broadcastId = offerModalPayload.broadcastId;
    setOfferModalVisible(false);
    if (broadcastId) {
      router.push({
        pathname: '/client/request/broadcast/broadcastdetail',
        params: { id: String(broadcastId) },
      } as any);
      return;
    }
    router.push('/(clientTabs)/main/request' as any);
  }, [offerModalPayload.broadcastId, router]);

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
          name="main/booking"
          options={{
            title: 'Bookings',
            tabBarIcon: ({ color }) => <Feather size={20} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/request"
          options={{
            title: 'Requests',
            tabBarIcon: ({ color }) => <Feather size={20} name="file-text" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <Feather size={20} name="home" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/discover"
          options={{
            title: 'Discover',
            tabBarIcon: ({ color }) => <Feather size={20} name="compass" color={color} />,
          }}
        />
        <Tabs.Screen
          name="main/profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <Feather size={20} name="user" color={color} />,
          }}
        />
        {/* Hide non-tab screens */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
      </Tabs>

      <Modal
        visible={offerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeOfferModal}
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
              <Feather name="bell" size={22} color="#34C759" />
            </View>

            <ThemedText
              style={{
                fontSize: 16,
                color: '#FFFFFF',
                textAlign: 'center',
                fontWeight: '600',
                marginBottom: 12,
              }}
            >
              Mechanic Offer Received
            </ThemedText>

            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#2C2C2E',
                backgroundColor: '#1A1B1E',
                padding: 12,
                marginBottom: 16,
              }}
            >
              <ThemedText style={{ fontSize: 12, color: '#A7A7AF', marginBottom: 6, fontWeight: '300' }}>
                Update
              </ThemedText>
              <ThemedText style={{ fontSize: 14, color: '#F5F5F7', lineHeight: 20, fontWeight: '400' }}>
                {offerModalPayload.mechanicName
                  ? `${offerModalPayload.mechanicName} requested to accept your broadcast.`
                  : offerModalPayload.message}
              </ThemedText>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#2C2C2E',
                  backgroundColor: '#1A1B1E',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 13,
                }}
                onPress={closeOfferModal}
                activeOpacity={0.8}
              >
                <ThemedText style={{ color: '#E5E5EA', fontSize: 16, fontWeight: '600' }}>Later</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  borderRadius: 12,
                  backgroundColor: '#FF8C00',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 13,
                  flexDirection: 'row',
                  gap: 8,
                }}
                onPress={openOfferDetails}
                activeOpacity={0.85}
              >
                <Feather name="external-link" size={14} color="#fff" />
                <ThemedText style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>View Details</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
