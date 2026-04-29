import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { NotificationCard } from '@/components/notifications/NotificationCard';
import {
  fetchNotifications,
  markNotificationRead,
  NotificationItem,
} from '@/lib/notifications';

type FilterMode = 'all' | 'unread';

const PAGE_SIZE = 20;

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

export default function NotificationsScreen() {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadPage = useCallback(async (pageToLoad: number, replace = false) => {
    if (replace) {
      setLoading(true);
    } else if (pageToLoad > 1) {
      setLoadingMore(true);
    }

    try {
      const response = await fetchNotifications({
        page: pageToLoad,
        pageSize: PAGE_SIZE,
        unread: filter === 'unread',
      });

      setUnreadCount(response.unread_count || 0);
      setHasNext(Boolean(response.has_next));
      setPage(response.page || pageToLoad);

      setNotifications((current) => (replace || pageToLoad === 1 ? response.results || [] : [...current, ...(response.results || [])]));
    } catch {
      if (replace || pageToLoad === 1) {
        setNotifications([]);
      }
      setHasNext(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useEffect(() => {
    loadPage(1, true);
  }, [loadPage]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadPage(1, true);
  }, [loadPage]);

  const handleFilterChange = useCallback((nextFilter: FilterMode) => {
    if (nextFilter === filter) return;
    setFilter(nextFilter);
    setNotifications([]);
    setPage(1);
    setHasNext(false);
  }, [filter]);

  const loadMore = useCallback(() => {
    if (!hasNext || loading || loadingMore) return;
    loadPage(page + 1, false);
  }, [hasNext, loading, loadingMore, loadPage, page]);

  const updateReadState = useCallback((notificationId: number) => {
    setNotifications((current) => current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)));
    setUnreadCount((current) => Math.max(0, current - 1));
  }, []);

  const navigateToTarget = useCallback((notification: NotificationItem) => {
    const payload = notification.payload;
    const action = String(payload?.action ?? '').toLowerCase();
    const broadcastId = Number(payload?.broadcast_id ?? 0) || null;

    if (broadcastId && payload?.target_role === 'client' && action === 'broadcast_offer_created') {
      const requestId = Number(payload?.request_id ?? payload?.requestId ?? 0) || null;
      const idForScreen = requestId || broadcastId;
      router.push({
        pathname: '/client/request/broadcast/broadcastdetail',
        params: { id: String(idForScreen) },
      } as never);
      return;
    }

    if (
      broadcastId &&
      (payload?.target_role === 'mechanic' || payload?.target_role === 'mechanic_shop') &&
      action === 'broadcast_offer_pending'
    ) {
      router.push('/(mechanicTabs)/main/map' as never);
      return;
    }

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
      // The user can still continue to the target booking if the read request fails.
    } finally {
      navigateToTarget(notification);
    }
  }, [navigateToTarget, updateReadState]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FFF" />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <ThemedText style={styles.headerTitle}>Notifications</ThemedText>
          <ThemedText style={styles.headerSubtitle}>All account updates in one place</ThemedText>
        </View>
        <View style={styles.countPill}>
          <ThemedText style={styles.countPillText}>{unreadCount} unread</ThemedText>
        </View>
      </View>

      <View style={styles.filters}>
        {(['all', 'unread'] as FilterMode[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => handleFilterChange(item)}
            style={[styles.filterChip, filter === item && styles.filterChipActive]}
          >
            <ThemedText style={[styles.filterText, filter === item && styles.filterTextActive]}>
              {item === 'all' ? 'All' : 'Unread'}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <NotificationCard notification={item} onPress={handleNotificationPress} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF8C00" />}
          onEndReachedThreshold={0.2}
          onEndReached={loadMore}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <FontAwesome name="bell-slash-o" size={22} color="#8E8E93" />
              <ThemedText style={styles.emptyTitle}>No notifications yet</ThemedText>
              <ThemedText style={styles.emptyText}>
                {filter === 'unread' ? 'There are no unread notifications right now.' : 'Notifications will appear here as activity happens.'}
              </ThemedText>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#FF8C00" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2D2D31',
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 199, 89, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34C759',
  },
  filters: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2D2D31',
  },
  filterChipActive: {
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    borderColor: 'rgba(255, 140, 0, 0.35)',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#AEAEB2',
  },
  filterTextActive: {
    color: '#FF8C00',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  emptyText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    maxWidth: 280,
  },
  footerLoader: {
    paddingVertical: 18,
  },
});