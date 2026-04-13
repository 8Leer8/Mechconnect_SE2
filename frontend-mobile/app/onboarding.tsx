import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
  FlatList,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

export const screenOptions = { headerShown: false } as const;

const { width } = Dimensions.get('window');
const ONBOARDING_SEEN_KEY = 'onboarding_seen';
const ACCENT_ORANGE = '#FE6526';

type SlideItem = {
  id: string;
  titlePrefix: string;
  titleHighlight?: string;
  titleSuffix?: string;
  description: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  useLogo?: boolean;
};

const SLIDES: SlideItem[] = [
  {
    id: 'welcome',
    titlePrefix: 'Welcome to',
    titleHighlight: ' MechConnect',
    description: 'Book a trusted mechanic in minutes, track service updates, and get help faster directly from this app.',
    icon: 'home',
    useLogo: true,
  },
  {
    id: 'client',
    titlePrefix: 'Book a',
    titleHighlight: ' Mechanic',
    description: 'Request nearby professionals, compare service details, and track updates in real time.',
    icon: 'user',
  },
  {
    id: 'mechanic',
    titlePrefix: 'Be a',
    titleHighlight: ' Mechanic',
    description: 'Accept jobs faster, manage requests efficiently, and build a strong reputation with clients.',
    icon: 'wrench',
  },
  {
    id: 'shopowner',
    titlePrefix: 'Be a',
    titleHighlight: ' Shop Owner',
    description: 'Organize your team, monitor daily bookings, and deliver a better service experience at scale.',
    icon: 'building',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<SlideItem>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const isLast = useMemo(() => activeIndex === SLIDES.length - 1, [activeIndex]);

  const persistSeen = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    } catch {
      // Non-blocking cache issue.
    }
  };

  const goLogin = async () => {
    await persistSeen();
    router.replace('/(auth)/login');
  };

  const goSignup = async () => {
    await persistSeen();
    router.replace('/(auth)/register');
  };

  const handleSkip = async () => {
    await persistSeen();
    router.replace('/(auth)/login');
  };

  const handleNext = () => {
    if (isLast) return;
    const next = activeIndex + 1;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setActiveIndex(next);
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(next);
  };

  const renderSlide = ({ item, index }: { item: SlideItem; index: number }) => {
    const slideIsLast = index === SLIDES.length - 1;
    return (
      <View style={styles.slideWrap}>
        <View style={styles.illustrationWrap}>
          {item.useLogo ? (
            <Image source={require('@/assets/images/logo_main.png')} style={styles.logoImage} />
          ) : (
            <FontAwesome name={item.icon} size={114} color={ACCENT_ORANGE} />
          )}
        </View>

        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {item.titlePrefix}
          {item.titleHighlight ? <Text style={styles.titleAccent}>{item.titleHighlight}</Text> : null}
          {item.titleSuffix || ''}
        </Text>
        <Text style={styles.description}>{item.description}</Text>

        {!slideIsLast ? (
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={handleSkip}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
              <Text style={styles.primaryText}>Next</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.authActionsWrap}>
            <TouchableOpacity style={styles.primaryButton} onPress={goLogin}>
              <Text style={styles.primaryText}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={goSignup}>
              <Text style={styles.secondaryText}>Register</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0E1116',
    justifyContent: 'flex-start',
  },
  slideWrap: {
    width,
    minHeight: '100%',
    paddingHorizontal: 28,
    paddingTop: 88,
    paddingBottom: 34,
  },
  illustrationWrap: {
    marginTop: 34,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 140,
    height: 140,
    resizeMode: 'contain',
  },
  title: {
    marginTop: 34,
    fontSize: 34,
    fontWeight: '800',
    color: '#F4F5F7',
    textAlign: 'center',
    lineHeight: 40,
  },
  titleAccent: {
    color: ACCENT_ORANGE,
  },
  description: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 24,
    color: '#A8ADB8',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  footerRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#B7BCC7',
  },
  primaryButton: {
    minWidth: 96,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: ACCENT_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  authActionsWrap: {
    marginTop: 'auto',
    gap: 12,
  },
  secondaryButton: {
    minWidth: 108,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: ACCENT_ORANGE,
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
