import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Text,
  StyleSheet,
  Platform,
  SafeAreaView,
} from 'react-native';

interface ToastProps {
  message: string;
  visible: boolean;
  duration?: number;
  onHide: () => void;
}

export default function Toast({ message, visible, duration = 3000, onHide }: ToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        s.wrapper,
        { transform: [{ translateY }], opacity },
      ]}
    >
      <SafeAreaView style={s.safeArea}>
        <Text style={s.message} numberOfLines={2}>{message}</Text>
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
    paddingTop: Platform.OS === 'android' ? 32 : 0,
  },
  safeArea: {
    marginHorizontal: 16,
    marginTop: Platform.OS === 'android' ? 0 : 12,
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '400',
    color: '#F5F5F5',
  },
});