import React, { useEffect, useRef } from 'react';
import {
  Animated,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationProps {
  visible: boolean;
  type: NotificationType;
  message: string;
  title?: string;
  onClose: () => void;
  duration?: number;
}

const CONFIG: Record<NotificationType, { color: string; icon: string }> = {
  success: { color: '#34C759', icon: 'check-circle' },
  error:   { color: '#FF3B30', icon: 'times-circle' },
  warning: { color: '#FF9500', icon: 'exclamation-triangle' },
  info:    { color: '#007AFF', icon: 'info-circle' },
};

export function NotificationDropdown({
  visible,
  type,
  message,
  title,
  onClose,
  duration = 3000,
}: NotificationProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { color, icon } = CONFIG[type];

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: -160, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  useEffect(() => {
    if (!visible) return;

    translateY.setValue(-160);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(dismiss, duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 8, transform: [{ translateY }], opacity },
      ]}
    >
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: color }]}
        onPress={dismiss}
        activeOpacity={0.9}
      >
        <FontAwesome name={icon as any} size={22} color={color} />
        <View style={styles.textContainer}>
          {title ? (
            <ThemedText style={[styles.title, { color }]}>{title}</ThemedText>
          ) : null}
          <ThemedText style={styles.message}>{message}</ThemedText>
        </View>
        <TouchableOpacity
          onPress={dismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <FontAwesome name="times" size={14} color="#8E8E93" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    backgroundColor: '#1E2022',
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  textContainer: { flex: 1 },
  title:   { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  message: { fontSize: 13, color: '#ccc', lineHeight: 18 },
});
