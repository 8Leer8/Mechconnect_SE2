import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { formatNotificationTimestamp, NotificationItem } from '@/lib/notifications';

interface NotificationCardProps {
  notification: NotificationItem;
  onPress: (notification: NotificationItem) => void;
}

export function NotificationCard({ notification, onPress }: NotificationCardProps) {
  const isUnread = !notification.is_read;

  return (
    <TouchableOpacity
      style={[styles.card, isUnread && styles.unreadCard]}
      activeOpacity={0.85}
      onPress={() => onPress(notification)}
    >
      <View style={styles.dotColumn}>
        {isUnread ? <View style={[styles.dot, styles.dotActive]} /> : <View style={styles.dotSpacer} />}
      </View>
      <View style={styles.content}>
        <View style={styles.rowTop}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {notification.title}
          </ThemedText>
          <ThemedText style={styles.timestamp}>
            {formatNotificationTimestamp(notification.updated_at || notification.created_at)}
          </ThemedText>
        </View>
        <ThemedText style={styles.message} numberOfLines={4}>
          {notification.message}
        </ThemedText>
      </View>
      <FontAwesome name="chevron-right" size={12} color="#6C6C70" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2D2D31',
    marginBottom: 10,
  },
  unreadCard: {
    borderColor: 'rgba(52, 199, 89, 0.35)',
    backgroundColor: '#202522',
  },
  dotColumn: {
    width: 14,
    alignItems: 'center',
    paddingTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#34C759',
    shadowColor: '#34C759',
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  dotMuted: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dotSpacer: {
    width: 8,
    height: 8,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  timestamp: {
    fontSize: 11,
    color: '#8E8E93',
  },
  message: {
    fontSize: 13,
    color: '#C7C7CC',
    lineHeight: 18,
  },
});