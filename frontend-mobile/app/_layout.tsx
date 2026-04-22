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
import { LocationProvider } from '@/context/LocationContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    if (!__DEV__) return;

    const keepAwakeErrorText = 'unable to activate keep awake';
    const globalAny = globalThis as any;
    const errorUtils = globalAny?.ErrorUtils;
    const previousRejectionHandler = globalAny?.onunhandledrejection;

    globalAny.onunhandledrejection = (event: any) => {
      const reason = event?.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : String(reason ?? '');

      if (message.toLowerCase().includes(keepAwakeErrorText)) {
        event?.preventDefault?.();
        console.warn('[dev] Ignored keep-awake activation failure.');
        return;
      }

      if (typeof previousRejectionHandler === 'function') {
        previousRejectionHandler(event);
      }
    };

    if (!errorUtils?.getGlobalHandler || !errorUtils?.setGlobalHandler) {
      return () => {
        globalAny.onunhandledrejection = previousRejectionHandler;
      };
    }

    const defaultHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '');

      if (message.toLowerCase().includes(keepAwakeErrorText)) {
        console.warn('[dev] Ignored keep-awake activation failure.');
        return;
      }

      defaultHandler(error, isFatal);
    });

    return () => {
      errorUtils.setGlobalHandler(defaultHandler);
      globalAny.onunhandledrejection = previousRejectionHandler;
    };
  }, []);

  useEffect(() => {
    const processDeepLink = (url: string | null) => {
      if (!url) return;
      const normalizedUrl = String(url || '').toLowerCase();

      // Booking payment deep links
      if (normalizedUrl.startsWith('mechconnect://payment/success')) {
        router.push('/payment/success');
      } else if (normalizedUrl.startsWith('mechconnect://payment/failed')) {
        router.push('/payment/failed');
      }
      // Wallet/token purchase payment deep links (Mechanic)
      else if (normalizedUrl.includes('wallet/payment/success')) {
        router.replace('/wallet/payment/success');
      } else if (normalizedUrl.includes('wallet/payment/failed')) {
        router.replace('/wallet/payment/failed');
      }
      // Shop Owner wallet payment deep links
      else if (normalizedUrl.includes('shop-owner/payment/success')) {
        router.replace('/shopowner/wallet');
      } else if (normalizedUrl.includes('shop-owner/payment/failed')) {
        router.replace('/shopowner/wallet');
      }
    };

    // Handle deep links when app is already running
    const subscription = Linking.addEventListener('url', ({ url }) => processDeepLink(url));

    // Handle initial deep link when app opens from closed state
    Linking.getInitialURL().then(processDeepLink);

    return () => subscription.remove();
  }, [router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <NotificationProvider>
        <WebSocketProvider>
          <LocationProvider>
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
                <Stack.Screen name="shopowner" options={{ headerShown: false }} />
                <Stack.Screen name="notifications" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <StatusBar style="auto" />
            </ConfirmationProvider>
          </LocationProvider>
        </WebSocketProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
