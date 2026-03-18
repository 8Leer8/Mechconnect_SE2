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

      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (pathname !== homeRoute) {
          router.replace(homeRoute as any);
          return true;
        }

        // Consume back press on tab home to avoid returning to a previous role stack.
        return true;
      });

      return () => sub.remove();
    }, [homeRoute, pathname, router])
  );
}
