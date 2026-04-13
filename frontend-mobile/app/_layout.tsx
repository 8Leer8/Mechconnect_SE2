import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { NotificationProvider } from '@/hooks/useNotification';
import { ConfirmationProvider } from '@/hooks/useConfirmation';
import { WebSocketProvider } from '@/context/WebSocketContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
