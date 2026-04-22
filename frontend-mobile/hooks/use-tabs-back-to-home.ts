import React from 'react';
import { BackHandler, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

export function useTabsBackToHome(homeRoute: string) {
  const router = useRouter();
  const pathname = usePathname();

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== 'android') {
        return undefined;
      }

      const safeReplaceHome = () => {
        if (!homeRoute) return;
        try {
          // Defer navigation to avoid calling replace while React Navigation
          // is rehydrating state during fast refresh (can crash with stale undefined).
          setTimeout(() => {
            try {
              router.replace(homeRoute as any);
            } catch {
              // ignore navigation failures during transient rehydration
            }
          }, 0);
        } catch {
          // ignore
        }
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (pathname && pathname !== homeRoute) {
          safeReplaceHome();
          return true;
        }

        // Consume back press on tab home to avoid returning to a previous role stack.
        return true;
      });

      return () => sub.remove();
    }, [homeRoute, pathname, router])
  );
}
