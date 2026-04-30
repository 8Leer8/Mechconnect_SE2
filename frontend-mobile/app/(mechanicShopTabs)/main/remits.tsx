import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWebSocketContext } from '@/context/WebSocketContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type RemitRow = {
  id: number;
  booking_id: number;
  amount: number;
  status: 'pending' | 'received' | string;
  reminders_count: number;
  created_at?: string | null;
  received_at?: string | null;
  shop?: { shop_name?: string };
  client?: { firstname?: string; lastname?: string; username?: string };
};

const money = (v: number) => `PHP ${Number(v || 0).toFixed(2)}`;

const personName = (row: RemitRow) => {
  const first = String(row.client?.firstname || '').trim();
  const last = String(row.client?.lastname || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const user = String(row.client?.username || '').trim();
  return user || 'Client';
};

export default function MechanicShopRemitsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lastMessage } = useWebSocketContext();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'received' | 'all'>('pending');
  const [rows, setRows] = useState<RemitRow[]>([]);

  const fetchRows = useCallback(
    async (nextStatus: 'pending' | 'received' | 'all', showLoader: boolean) => {
      if (showLoader) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/bookings/mechanic/cash-remittances/?status=${nextStatus}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(String(body?.error || body?.detail || `HTTP ${res.status}`));
        }
        setRows(Array.isArray(body?.remittances) ? body.remittances : []);
      } catch (e: any) {
        setRows([]);
        setError(String(e?.message || 'Failed to load remits'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      fetchRows(status, true);
    }, [fetchRows, status]),
  );

  // Auto-refresh remits when websocket indicates remittance/payment updates.
  React.useEffect(() => {
    if (!lastMessage) return;
    const action = String((lastMessage as any).action || '').toLowerCase();
    const msg = String((lastMessage as any).message || '').toLowerCase();
    const type = String((lastMessage as any).type || '').toLowerCase();
    const isRemitEvent =
      action.includes('remit') ||
      msg.includes('remit') ||
      msg.includes('remittance') ||
      (type === 'booking_update' && msg.includes('received'));
    if (!isRemitEvent) return;
    fetchRows(status, false);
  }, [lastMessage, status, fetchRows]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRows(status, false);
  };

  const switchStatus = (next: 'pending' | 'received' | 'all') => {
    if (next === status) return;
    setStatus(next);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.pageHeader, { paddingTop: Math.max(insets.top, 10) }]}>
        <View>
          <ThemedText style={styles.title}>Cash Remits</ThemedText>
          <ThemedText style={styles.subtitle}>
            {rows.length} {status === 'all' ? 'total' : status} remit{rows.length !== 1 ? 's' : ''}
          </ThemedText>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell />
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <FontAwesome name="refresh" size={18} color="#FF8C00" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.filtersRowWrap}>
        <View style={styles.filtersRow}>
          {(['pending', 'received', 'all'] as const).map((opt) => (
            <TouchableOpacity
              key={opt}
              onPress={() => switchStatus(opt)}
              style={[styles.filterChip, status === opt ? styles.filterChipActive : null]}
            >
              <ThemedText style={[styles.filterChipText, status === opt ? styles.filterChipTextActive : null]}>
                {opt[0].toUpperCase() + opt.slice(1)}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.infoBox}>
        <ThemedText style={styles.infoTitle}>What this means</ThemedText>
        <ThemedText style={styles.infoText}>
          Pending = you still need to remit this cash share to the shop.
        </ThemedText>
        <ThemedText style={styles.infoText}>
          Received = the shop already confirmed your remittance.
        </ThemedText>
        <ThemedText style={styles.infoHint}>
          Tip: open the booking to review job details before remitting.
        </ThemedText>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}
        >
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          {rows.length === 0 ? (
            <ThemedText style={styles.empty}>No remits found.</ThemedText>
          ) : (
            rows.map((row) => (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <ThemedText style={styles.cardTitle}>Booking #{row.booking_id}</ThemedText>
                  <ThemedText style={[styles.status, row.status === 'received' ? styles.received : styles.pending]}>
                    {String(row.status || '').toUpperCase()}
                  </ThemedText>
                </View>
                <ThemedText style={styles.line}>Amount: {money(row.amount)}</ThemedText>
                <ThemedText style={styles.line}>Shop: {String(row.shop?.shop_name || '-')}</ThemedText>
                <ThemedText style={styles.line}>Client: {personName(row)}</ThemedText>
                <ThemedText style={styles.line}>Reminders: {Number(row.reminders_count || 0)}</ThemedText>
                <TouchableOpacity
                  style={styles.openBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/mechanic/booking/booking_details',
                      params: { bookingId: String(row.booking_id) },
                    } as any)
                  }
                >
                  <ThemedText style={styles.openBtnText}>Open booking</ThemedText>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },
  pageHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#8E8E93', marginTop: 2, fontSize: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#1A1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersRowWrap: { marginBottom: 10, paddingHorizontal: 14, paddingTop: 10 },
  filtersRow: { flexDirection: 'row', gap: 8 },
  filterChip: { borderWidth: 1, borderColor: '#2A2C2E', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#1A1C1E' },
  filterChipActive: { borderColor: '#FF8C00', backgroundColor: '#FF8C0015' },
  filterChipText: { color: '#B8BCC8', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },
  infoBox: {
    marginHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoTitle: { color: '#ECEDEE', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  infoText: { color: '#BFC0C2', fontSize: 12, marginBottom: 2 },
  infoHint: { color: '#8E8E93', fontSize: 11, marginTop: 6 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { color: '#FF6B6B', marginBottom: 8 },
  empty: { color: '#8E8E93', marginTop: 12 },
  card: { backgroundColor: '#1A1C1E', borderColor: '#2A2C2E', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { color: '#ECEDEE', fontSize: 16, fontWeight: '700' },
  status: { fontSize: 11, fontWeight: '700' },
  pending: { color: '#FFB14A' },
  received: { color: '#56D364' },
  line: { color: '#BFC0C2', fontSize: 13, marginBottom: 3 },
  openBtn: { marginTop: 8, alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#FF8C00', paddingHorizontal: 12, paddingVertical: 8 },
  openBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 24 },
});
