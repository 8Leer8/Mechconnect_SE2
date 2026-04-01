import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, Image, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type SessionResponse = {
  authenticated?: boolean;
  role?: string;
};

const ACCOUNT_ID_KEY = 'account_id';
const AUTH_TOKEN_KEY = 'auth_token';
const USER_ROLE_KEY = 'user_role';
const LAST_ACTIVE_ROLE_KEY = 'last_active_role';
const ONBOARDING_SEEN_KEY = 'onboarding_seen';

const getRouteFromRole = (role?: string | null, isWorkingForShopMechanic = false) => {
  if (!role) return '/(clientTabs)/main/home';

  if (role === 'mechanic') {
    if (isWorkingForShopMechanic) return '/(mechanicShopTabs)/main/home';
    return '/(mechanicTabs)/main/home';
  }

  if (role === 'shop_owner') {
    return '/(shopownerTabs)/main/home';
  }

  return '/(clientTabs)/main/home';
};

export default function Index() {
  const router = useRouter();
  const spinAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const hasNavigatedRef = useRef(false);
  const [lineWidth, setLineWidth] = useState(0);

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.timing(progressAnim, {
      toValue: 0.75,
      duration: 2200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressAnim, spinAnim]);

  useEffect(() => {
    let isMounted = true;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        retryTimeout = setTimeout(() => resolve(), ms);
      });

    const isNetworkFailure = (error: unknown) => {
      const message = String((error as any)?.message || '').toLowerCase();
      return (
        message.includes('network request failed') ||
        message.includes('failed to fetch') ||
        message.includes('network error') ||
        message.includes('timeout')
      );
    };

    const fetchWithTimeout = async (url: string, timeoutMs = 12000) => {
      const request = fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
      });

      return Promise.race([request, timeout]);
    };

    const finishAndNavigate = (path: string) => {
      if (!isMounted || hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start(() => {
        if (!isMounted) return;
        router.replace(path as any);
      });
    };

    const clearAuthStorage = async () => {
      await AsyncStorage.multiRemove([ACCOUNT_ID_KEY, AUTH_TOKEN_KEY, USER_ROLE_KEY, LAST_ACTIVE_ROLE_KEY]);
    };

    const navigateByRole = (role?: string | null, isWorkingForShopMechanic = false) => {
      if (!isMounted) return;
      finishAndNavigate(getRouteFromRole(role, isWorkingForShopMechanic));
    };

    const navigateToLogin = () => {
      if (!isMounted) return;
      finishAndNavigate('/(auth)/login');
    };

    const bootstrapAuth = async () => {
      try {
        const onboardingSeen = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
        if (!onboardingSeen) {
          finishAndNavigate('/onboarding');
          return;
        }
      } catch {
        // If storage fails, continue with normal auth bootstrap.
      }

      if (!API_URL) {
        await clearAuthStorage();
        navigateToLogin();
        return;
      }

      while (isMounted && !hasNavigatedRef.current) {
        try {
          const response = await fetchWithTimeout(`${API_URL}/users/check-session/`);

          if (!response.ok) {
            await clearAuthStorage();
            navigateToLogin();
            return;
          }

          const data = (await response.json()) as SessionResponse;

          if (data?.authenticated) {
            const roleFromSession = data.role || null;
            let roleFromApi: string | null = null;
            let isWorkingForShopMechanic = false;

            try {
              const roleResponse = await fetch(`${API_URL}/users/profile/active-role/`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
              });

              if (roleResponse.ok) {
                const roleData = (await roleResponse.json()) as { active_role?: string };
                roleFromApi = roleData?.active_role || null;
              }
            } catch {
              roleFromApi = null;
            }

            const finalRole = roleFromApi || roleFromSession;

            if (!finalRole) {
              await clearAuthStorage();
              navigateToLogin();
              return;
            }

            try {
              await AsyncStorage.multiSet([
                [USER_ROLE_KEY, finalRole],
                [LAST_ACTIVE_ROLE_KEY, finalRole],
              ]);
            } catch {
              // Non-fatal cache write issue.
            }

            if (finalRole === 'mechanic') {
              try {
                const profileResponse = await fetch(`${API_URL}/users/profile/details/`, {
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                  },
                });

                if (profileResponse.ok) {
                  const profileData = await profileResponse.json() as any;
                  const mechanicProfile = profileData?.profile?.current_role_profile?.mechanic;
                  isWorkingForShopMechanic = !!mechanicProfile?.is_working_for_shop;
                }
              } catch {
                isWorkingForShopMechanic = false;
              }
            }

            navigateByRole(finalRole, isWorkingForShopMechanic);
            return;
          }

          await clearAuthStorage();
          navigateToLogin();
          return;
        } catch (error) {
          if (!isMounted || hasNavigatedRef.current) return;

          if (isNetworkFailure(error)) {
            await wait(2500);
            continue;
          }

          await clearAuthStorage();
          navigateToLogin();
          return;
        }
      }
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [progressAnim, router]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, lineWidth || 1],
  });

  return (
    <View style={styles.container}>
      <View style={styles.glowOrbTop} />
      <View style={styles.glowOrbBottom} />
      <Image
        source={require('@/assets/images/logo_main.png')}
        style={styles.logo}
      />
      <Text style={styles.title}>MechConnect: On-Demand Home Auto Repair Platform</Text>

      <View style={styles.bottomLoaderWrap}>
        <Animated.View
          style={{
            transform: [
              {
                rotate: spinAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          }}
        >
          <FontAwesome name="gear" size={18} color="#FF8C00" />
        </Animated.View>
        <View
          style={styles.loadingLineTrack}
          onLayout={(event) => setLineWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[
              styles.loadingLineFill,
              {
                width: progressWidth,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  glowOrbTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#FF8C001A',
    top: -80,
    right: -70,
  },
  glowOrbBottom: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#007AFF1F',
    bottom: -60,
    left: -60,
  },
  logo: {
    width: 84,
    height: 84,
    marginBottom: 14,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: '#E8E8EA',
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: 30,
  },
  bottomLoaderWrap: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingLineTrack: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#2B2D31',
    overflow: 'hidden',
  },
  loadingLineFill: {
    width: 0,
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FF8C00',
  },
});
