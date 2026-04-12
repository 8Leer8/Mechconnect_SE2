import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';

export type ConfirmationType = 'danger' | 'warning' | 'success' | 'info';

export interface ConfirmationModalProps {
  visible: boolean;
  type?: ConfirmationType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIG: Record<ConfirmationType, { color: string; icon: string; iconBg: string }> = {
  danger:  { color: '#FF3B30', icon: 'exclamation-circle',  iconBg: 'rgba(255,59,48,0.14)'  },
  warning: { color: '#FF9500', icon: 'exclamation-triangle', iconBg: 'rgba(255,149,0,0.14)' },
  success: { color: '#34C759', icon: 'check-circle',         iconBg: 'rgba(52,199,89,0.14)'  },
  info:    { color: '#007AFF', icon: 'question-circle',      iconBg: 'rgba(0,122,255,0.14)'  },
};

const CARD_WIDTH = Math.min(Dimensions.get('window').width - 56, 340);

export function ConfirmationModal({
  visible,
  type = 'info',
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const [shouldRender, setShouldRender] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.88)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  const { color, icon, iconBg } = CONFIG[type];

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, tension: 100, friction: 10, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(cardScale, { toValue: 0.88, duration: 180, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setShouldRender(false);
      });
    }
  }, [visible]);

  if (!shouldRender) return null;

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!loading) onCancel();
          }}
          activeOpacity={1}
          disabled={loading}
        />
      </Animated.View>

      {/* Card */}
      <View style={styles.centeredContainer} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            { transform: [{ scale: cardScale }], opacity: cardOpacity },
          ]}
        >
          {/* Icon circle */}
          <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
            <FontAwesome name={icon as any} size={34} color={color} />
          </View>

          {/* Title */}
          <ThemedText style={styles.title}>{title}</ThemedText>

          {/* Message */}
          <ThemedText style={styles.message}>{message}</ThemedText>

          {/* Horizontal divider */}
          <View style={styles.divider} />

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                if (!loading) onCancel();
              }}
              activeOpacity={0.5}
              disabled={loading}
            >
              <ThemedText style={styles.cancelText}>{cancelText}</ThemedText>
            </TouchableOpacity>

            <View style={styles.buttonDivider} />

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={onConfirm}
              activeOpacity={0.5}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={color} />
              ) : (
                <ThemedText style={[styles.confirmText, { color }]}>{confirmText}</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#1A1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.55,
    shadowRadius: 40,
    elevation: 24,
    alignItems: 'center',
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ECEDEE',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  divider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    height: 52,
  },
  cancelButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#8E8E93',
  },
  buttonDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'stretch',
  },
  confirmButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
