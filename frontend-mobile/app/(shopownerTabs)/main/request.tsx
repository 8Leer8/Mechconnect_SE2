import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TopNav } from '@/components/navigation';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type PendingRequest = {
  id: number;
  request_type: string;
  created_at: string;
  service_location?: {
    street_name?: string;
    barangay?: string;
    city_municipality?: string;
  } | null;
  client?: {
    firstname?: string;
    lastname?: string;
  } | null;
};

type HomeResponse = {
  pending_requests: PendingRequest[];
};

type TabType = 'custom' | 'direct' | 'broadcast';

export default function ShopOwnerRequestScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('custom');

  const fetchRequests = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/bookings/home/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('Failed to fetch requests');
      const data = (await res.json()) as HomeResponse;
      setPending(data.pending_requests || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch requests');
      setPending([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleNotificationPress = () => {
    // placeholder
  };

  const customRequests = pending.filter((r) => r.request_type === 'custom');
  const directRequests = pending.filter((r) => r.request_type === 'direct');
  // Treat emergency as "broadcast" for shop owners (can adjust when broadcast type exists)
  const broadcastRequests = pending.filter(
    (r) => r.request_type === 'broadcast' || r.request_type === 'emergency'
  );

  const listToShow =
    activeTab === 'custom'
      ? customRequests
      : activeTab === 'direct'
      ? directRequests
      : broadcastRequests;

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF9500" />
        }
      >
        <View style={styles.header}>
          <ThemedText style={styles.title}>Requests</ThemedText>
          <ThemedText style={styles.subtitle}>Custom, Direct, Broadcast</ThemedText>
        </View>

        {/* Tabs like client Request (custom / direct / broadcast) */}
        <View style={styles.tabRow}>
          {(['custom', 'direct', 'broadcast'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                activeTab === tab && styles.tabActive,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <ThemedText
                style={[
                  styles.tabLabel,
                  activeTab === tab && styles.tabLabelActive,
                ]}
              >
                {tab === 'custom'
                  ? 'Custom'
                  : tab === 'direct'
                  ? 'Direct'
                  : 'Broadcast'}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FF9500" />
            <ThemedText style={styles.muted}>Loading requests...</ThemedText>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <IconSymbol name="exclamationmark.triangle.fill" size={48} color="#FF3B30" />
            <ThemedText style={styles.error}>{error}</ThemedText>
          </View>
        ) : listToShow.length === 0 ? (
          <View style={styles.center}>
            <IconSymbol name="tray.fill" size={52} color="#888" />
            <ThemedText style={styles.muted}>
              {activeTab === 'custom'
                ? 'No custom requests'
                : activeTab === 'direct'
                ? 'No direct requests'
                : 'No broadcast requests'}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {listToShow.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.badge}>
                    <IconSymbol name="envelope.fill" size={16} color="#FF9500" />
                    <ThemedText style={styles.badgeText}>
                      {r.request_type?.toUpperCase?.() || 'REQUEST'}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.date}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </ThemedText>
                </View>

                <View style={styles.row}>
                  <IconSymbol name="person.fill" size={16} color="#888" />
                  <ThemedText style={styles.rowText}>
                    {r.client
                      ? `${r.client.firstname || ''} ${r.client.lastname || ''}`.trim() || 'Client'
                      : 'Client'}
                  </ThemedText>
                </View>

                <View style={styles.row}>
                  <IconSymbol name="mappin.and.ellipse" size={16} color="#888" />
                  <ThemedText style={styles.rowText} numberOfLines={1}>
                    {r.service_location
                      ? `${r.service_location.barangay || ''} ${r.service_location.city_municipality ? `, ${r.service_location.city_municipality}` : ''}`.trim() ||
                        'Location'
                      : 'Location'}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#151718' },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#888' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#FF9500',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  tabLabelActive: {
    color: '#fff',
  },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  muted: { color: '#888' },
  error: { color: '#FF3B30', textAlign: 'center' },
  list: { gap: 12 },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF950015',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FF9500' },
  date: { fontSize: 12, color: '#888' },
  row: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1, fontSize: 13, color: '#ccc' },
});

