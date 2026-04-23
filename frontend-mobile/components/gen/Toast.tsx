import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Text,
  StyleSheet,
  Platform,
  SafeAreaView,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export type ToastVariant = 'default' | 'error' | 'success' | 'warning';

interface ToastProps {
  message: string;
  visible: boolean;
  duration?: number;
  onHide: () => void;
  /** Looks closer to web Toastify: icon + color bar + tinted card */
  variant?: ToastVariant;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { bar: string; bg: string; icon: keyof typeof Feather.glyphMap; iconColor: string }
> = {
  default: {
    bar: '#F97316',
    bg: '#1E1E1E',
    icon: 'info',
    iconColor: '#F97316',
  },
  error: {
    bar: '#EF4444',
    bg: '#2A1518',
    icon: 'alert-circle',
    iconColor: '#F87171',
  },
  success: {
    bar: '#22C55E',
    bg: '#14251A',
    icon: 'check-circle',
    iconColor: '#4ADE80',
  },
  warning: {
    bar: '#EAB308',
    bg: '#2A2410',
    icon: 'alert-triangle',
    iconColor: '#FACC15',
  },
};

export default function Toast({
  message,
  visible,
  duration,
  onHide,
  variant = 'default',
}: ToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const v = VARIANT_STYLES[variant];
  const ms =
    duration ??
    (variant === 'error' || variant === 'warning' ? 4200 : variant === 'success' ? 2800 : 3200);

  useEffect(() => {
    if (!visible) return;

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 20,
        bounciness: 4,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => onHide());
    }, ms);

    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        s.wrapper,
        { transform: [{ translateY }], opacity },
      ]}
    >
      <SafeAreaView style={s.safeAreaOuter}>
        <View style={[s.card, { backgroundColor: v.bg, borderLeftColor: v.bar }]}>
          <Feather name={v.icon} size={22} color={v.iconColor} style={s.icon} />
          <Text style={s.message} numberOfLines={4}>
            {message}
          </Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingTop: Platform.OS === 'android' ? 28 : 0,
  },
  safeAreaOuter: {
    marginHorizontal: 14,
    marginTop: Platform.OS === 'android' ? 4 : 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  icon: {
    marginRight: 12,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#F5F5F5',
    lineHeight: 20,
  },
});
