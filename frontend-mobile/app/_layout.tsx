import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Linking } from 'react-native';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { NotificationProvider } from '@/hooks/useNotification';
import { ConfirmationProvider } from '@/hooks/useConfirmation';
import { WebSocketProvider } from '@/context/WebSocketContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    const handleDeepLink = ({ url }: { url: string }) => {
      const normalizedUrl = String(url || '').toLowerCase();
      if (normalizedUrl.startsWith('mechconnect://payment/success')) {
        router.push('/payment/success');
      } else if (normalizedUrl.startsWith('mechconnect://payment/failed')) {
        router.push('/payment/failed');
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, [router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <NotificationProvider>
        <WebSocketProvider>
          <ConfirmationProvider>
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(clientTabs)" options={{ headerShown: false }} />
              <Stack.Screen name="client" options={{ headerShown: false }} />
              <Stack.Screen name="mechanic" options={{ headerShown: false }} />
              <Stack.Screen name="(mechanicTabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(mechanicShopTabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(shopownerTabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style="auto" />
          </ConfirmationProvider>
        </WebSocketProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
