import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useWebSocketContext } from '@/context/WebSocketContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Booking {
  id: number;
  status: string;
  booked_at: string;
  amount_fee: number;
  request: {
    type: string;
  };
  service_location?: {
    street_name?: string;
    barangay?: string;
  } | null;
}

interface BookingsResponse {
  bookings: Booking[];
  total_pages?: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#8E8E93',
  booked: '#00B8D9',
  accepted: '#00B8D9',
  on_the_way: '#007AFF',
  at_location: '#5AC8FA',
  diagnosing: '#AF52DE',
  active: '#FF8C00',
  paused: '#8E8E93',
  pending_payment: '#FFD60A',
  completed: '#34C759',
  cancelled: '#FF3B30',
  reworked: '#FFD60A',
  disputed: '#AF52DE',
};

const getStatusLabel = (status: string) => {
  const key = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    pending: 'Pending',
    booked: 'Booked',
    accepted: 'Booked',
    on_the_way: 'On the Way',
    at_location: 'At Location',
    diagnosing: 'Diagnosing',
    active: 'On Going',
    paused: 'Paused',
    pending_payment: 'Pending Payment',
    completed: 'Completed',
    cancelled: 'Cancelled',
    reworked: 'Reworked',
    disputed: 'Disputed',
  };
  return map[key] || status;
};

const formatDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function MechanicShopScheduleScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(formatDayKey(new Date()));
  const { lastMessage } = useWebSocketContext();

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const collected: Booking[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 5) {
        const response = await fetch(
          `${API_URL}/bookings/mechanic/bookings/?status=all&page=${page}&page_size=50&compact=1`,
          {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch schedule');
        }

        const data = (await response.json()) as BookingsResponse;
        const rows = data.bookings || [];
        collected.push(...rows);
        const totalPages = data.total_pages || 1;
        hasMore = page < totalPages;
        page += 1;
      }

      setBookings(collected);
    } catch (err: any) {
      setError(err.message || 'Unable to load schedule');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBookings();
    }, [fetchBookings])
  );

  useEffect(() => {
    if (lastMessage?.type === 'booking_update') {
      fetchBookings();
    }
  }, [lastMessage, fetchBookings]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const bookingsByDay = useMemo(() => {
    const grouped: Record<string, Booking[]> = {};

    bookings.forEach((booking) => {
      const date = new Date(booking.booked_at);
      const key = formatDayKey(date);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(booking);
    });

    Object.keys(grouped).forEach((key) => {
      grouped[key].sort(
        (a, b) => new Date(a.booked_at).getTime() - new Date(b.booked_at).getTime()
      );
    });

    return grouped;
  }, [bookings]);

  const monthMeta = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = firstDay.getDay();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day));
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return {
      year,
      month,
      monthLabel: monthCursor.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      cells,
    };
  }, [monthCursor]);

  const selectedDayBookings = bookingsByDay[selectedDate] || [];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Schedule</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Calendar of your booking jobs</ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => setMonthCursor(new Date(monthMeta.year, monthMeta.month - 1, 1))}
            >
              <FontAwesome name="chevron-left" size={14} color="#FF8C00" />
            </TouchableOpacity>
            <ThemedText style={styles.monthLabel}>{monthMeta.monthLabel}</ThemedText>
            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => setMonthCursor(new Date(monthMeta.year, monthMeta.month + 1, 1))}
            >
              <FontAwesome name="chevron-right" size={14} color="#FF8C00" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekHeader}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <ThemedText key={day} style={styles.weekdayText}>{day}</ThemedText>
            ))}
          </View>

          <View style={styles.grid}>
            {monthMeta.cells.map((cellDate, index) => {
              if (!cellDate) {
                return <View key={`blank-${index}`} style={styles.dayCellBlank} />;
              }

              const key = formatDayKey(cellDate);
              const jobsCount = bookingsByDay[key]?.length || 0;
              const isSelected = key === selectedDate;
              const isToday = key === formatDayKey(new Date());

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => setSelectedDate(key)}
                  activeOpacity={0.8}
                >
                  <ThemedText style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                    {cellDate.getDate()}
                  </ThemedText>
                  {jobsCount > 0 && (
                    <ThemedText style={[styles.jobsSuperscript, isSelected && styles.jobsSuperscriptSelected]}>
                      {`${jobsCount}`}
                    </ThemedText>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.detailsCard}>
          <ThemedText style={styles.detailsTitle}>
            {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </ThemedText>

          {loading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="small" color="#FF8C00" />
              <ThemedText style={styles.metaText}>Loading schedule...</ThemedText>
            </View>
          ) : error ? (
            <View style={styles.centerBlock}>
              <FontAwesome name="exclamation-circle" size={22} color="#FF3B30" />
              <ThemedText style={[styles.metaText, { color: '#FF3B30' }]}>{error}</ThemedText>
            </View>
          ) : selectedDayBookings.length === 0 ? (
            <View style={styles.centerBlock}>
              <FontAwesome name="calendar-o" size={22} color="#666" />
              <ThemedText style={styles.metaText}>No jobs scheduled for this day</ThemedText>
            </View>
          ) : (
            <View style={styles.dayList}>
              {selectedDayBookings.map((booking) => (
                <TouchableOpacity
                  key={booking.id}
                  style={styles.dayItem}
                  onPress={() =>
                    router.push({
                      pathname: '/mechanic/booking/booking_details',
                      params: {
                        bookingId: booking.id.toString(),
                        source: 'mechanic_shop',
                      },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.dayItemTop}>
                    <ThemedText style={styles.dayItemTime}>
                      {new Date(booking.booked_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </ThemedText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            STATUS_COLORS[String(booking.status || '').toLowerCase()] || '#8E8E93',
                        },
                      ]}
                    >
                      <ThemedText style={styles.statusText}>{getStatusLabel(booking.status)}</ThemedText>
                    </View>
                  </View>

                  <ThemedText style={styles.dayItemTitle}>
                    {booking.request?.type
                      ? `${booking.request.type.charAt(0).toUpperCase() + booking.request.type.slice(1)} Service`
                      : 'Service Request'}
                  </ThemedText>

                  <View style={styles.rowInfo}>
                    <FontAwesome name="map-marker" size={12} color="#8E8E93" />
                    <ThemedText style={styles.rowInfoText} numberOfLines={1}>
                      {booking.service_location
                        ? `${booking.service_location.street_name || ''}, ${booking.service_location.barangay || ''}`
                        : 'No location specified'}
                    </ThemedText>
                  </View>

                  <View style={styles.rowInfo}>
                    <FontAwesome name="money" size={12} color="#8E8E93" />
                    <ThemedText style={styles.rowInfoText}>P{Number(booking.amount_fee || 0).toFixed(2)}</ThemedText>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  calendarCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
    marginBottom: 16,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  monthButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellBlank: {
    width: '14.28%',
    height: 52,
  },
  dayCell: {
    width: '14.28%',
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 6,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#FF8C00',
  },
  dayCellSelected: {
    backgroundColor: '#FF8C00',
  },
  dayText: {
    fontSize: 14,
    color: '#D8D8D8',
    fontWeight: '600',
  },
  dayTextSelected: {
    color: '#fff',
  },
  jobsSuperscript: {
    position: 'absolute',
    top: 6,
    right: 6,
    color: '#FF8C00',
    fontSize: 10,
    fontWeight: '700',
  },
  jobsSuperscriptSelected: {
    color: '#fff',
  },
  detailsCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
  },
  detailsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  centerBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  metaText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  dayList: {
    gap: 10,
  },
  dayItem: {
    backgroundColor: '#202224',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 12,
    padding: 12,
  },
  dayItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dayItemTime: {
    color: '#FF8C00',
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  dayItemTitle: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  rowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  rowInfoText: {
    color: '#8E8E93',
    fontSize: 12,
    flex: 1,
  },
});
