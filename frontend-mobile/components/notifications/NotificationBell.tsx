import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useWebSocketContext } from '@/context/WebSocketContext';
import {
  fetchNotifications,
  formatNotificationTimestamp,
  markNotificationRead,
  NotificationItem,
} from '@/lib/notifications';
import { NotificationCard } from '@/components/notifications/NotificationCard';

interface NotificationBellProps {
  iconColor?: string;
}

const PAGE_SIZE = 8;

function getBookingPath(role?: string | null) {
  switch (role) {
    case 'client':
      return '/client/booking/booking_details';
    case 'shopowner':
      return '/shopowner/booking/booking_details';
    case 'mechanic':
    case 'mechanic_shop':
      return '/mechanic/booking/booking_details';
    default:
      return null;
  }
}

export default function NotificationBell({ iconColor = '#FF8C00' }: NotificationBellProps) {
  const insets = useSafeAreaInsets();
  const { lastMessage } = useWebSocketContext();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchNotifications({ page: 1, pageSize: PAGE_SIZE });
      setRecentNotifications(response.results || []);
      setUnreadCount(response.unread_count || 0);
    } catch {
      setRecentNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (lastMessage?.type === 'booking_update' || lastMessage?.type === 'notification_update') {
      loadNotifications();
    }
  }, [lastMessage, loadNotifications]);

  const openBell = useCallback(() => {
    setVisible(true);
    loadNotifications();
  }, [loadNotifications]);

  const closeBell = useCallback(() => {
    setVisible(false);
  }, []);

  const updateReadState = useCallback((notificationId: number) => {
    setRecentNotifications((current) =>
      current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item))
    );
    setUnreadCount((current) => Math.max(0, current - 1));
  }, []);

  const navigateToTarget = useCallback((notification: NotificationItem) => {
    const bookingId = notification.payload?.booking_id;
    if (!bookingId) return;

    const targetPath = getBookingPath(notification.payload?.target_role as string | null | undefined);
    if (!targetPath) return;

    router.push({
      pathname: targetPath as never,
      params: { bookingId: String(bookingId) },
    });
  }, []);

  const handleNotificationPress = useCallback(async (notification: NotificationItem) => {
    try {
      if (!notification.is_read) {
        await markNotificationRead(notification.id);
        updateReadState(notification.id);
      }
    } catch {
      // Keep the UI responsive even if the mark-read request fails.
    } finally {
      closeBell();
      navigateToTarget(notification);
    }
  }, [closeBell, navigateToTarget, updateReadState]);

  const handleSeeAll = useCallback(() => {
    closeBell();
    router.push('/notifications');
  }, [closeBell]);

  const badgeLabel = useMemo(() => {
    if (unreadCount <= 0) return null;
    return unreadCount > 99 ? '99+' : String(unreadCount);
  }, [unreadCount]);

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={openBell} activeOpacity={0.85}>
        <View style={styles.triggerInner}>
          <FontAwesome name="bell-o" size={18} color={iconColor} />
        </View>
        {badgeLabel && (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>{badgeLabel}</ThemedText>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeBell}>
        <Pressable style={styles.overlay} onPress={closeBell}>
          <Pressable style={[styles.panel, { paddingTop: insets.top + 14 }]} onPress={() => {}}>
            <View style={styles.panelHeader}>
              <View>
                <ThemedText style={styles.panelTitle}>Notifications</ThemedText>
                <ThemedText style={styles.panelSubtitle}>Latest updates from your account</ThemedText>
              </View>
              <View style={styles.unreadPill}>
                <ThemedText style={styles.unreadPillText}>{unreadCount} unread</ThemedText>
              </View>
            </View>

            <View style={styles.listContainer}>
              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color="#FF8C00" />
                </View>
              ) : recentNotifications.length > 0 ? (
                recentNotifications.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onPress={handleNotificationPress}
                  />
                ))
              ) : (
                <View style={styles.emptyState}>
                  <FontAwesome name="bell-slash-o" size={20} color="#8E8E93" />
                  <ThemedText style={styles.emptyTitle}>No notifications yet</ThemedText>
                  <ThemedText style={styles.emptyText}>You’ll see recent updates here.</ThemedText>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.seeAllButton} onPress={handleSeeAll} activeOpacity={0.85}>
              <ThemedText style={styles.seeAllText}>See All</ThemedText>
              <FontAwesome name="chevron-right" size={12} color="#FF8C00" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'relative',
  },
  triggerInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 140, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.18)',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#111',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  panel: {
    backgroundColor: '#17171A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A2A2E',
    padding: 16,
    maxHeight: '78%',
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
  panelSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#8E8E93',
  },
  unreadPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 199, 89, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
  },
  unreadPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34C759',
  },
  listContainer: {
    flexGrow: 0,
    marginBottom: 12,
  },
  loadingWrap: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  emptyText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 140, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.2)',
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FF8C00',
  },
});