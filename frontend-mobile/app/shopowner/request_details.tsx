import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';
import { styles } from '@/style/mechanic/bookingDetailsStyles';

export const screenOptions = { headerShown: false } as const;

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type RequestDetailPayload = {
  id: number;
  request_type?: string;
  type?: string;
  vehicle_type?: string | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  created_at?: string | null;
  service_location?: {
    street_name?: string;
    barangay?: string;
    city_municipality?: string;
    subdivision_village?: string | null;
    landmark?: string | null;
  } | null;
  client?: { id?: number; name?: string };
  shop?: { id?: number; shop_name?: string };
  provider?: { id?: number; name?: string };
  has_booking?: boolean;
  description?: string;
  quoted_price?: number | null;
  providers_note?: string | null;
  concern_picture?: string | null;
  status?: string;
  service?: { id?: number; name?: string; price?: number };
  add_ons?: { id?: number; name?: string; price?: number }[];
  services?: { id?: number; name?: string; price?: number }[];
  expires_at?: string | null;
};

function getRequestKind(req: RequestDetailPayload | null): string {
  if (!req) return '';
  return (req.type || req.request_type || '').toLowerCase();
}

function getRequestStatusLabel(status: string | undefined, kind: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return 'Pending';
  if (s === 'searching') return 'Searching';
  if (s === 'quoted') return 'Quoted';
  if (s === 'accepted') return 'Accepted';
  if (!s && kind === 'broadcast') return 'Searching';
  return status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : 'Pending';
}

function getRequestStatusColor(status: string | undefined, kind: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'pending' || s === 'searching' || (!s && kind === 'broadcast')) return '#FF9500';
  if (s === 'quoted') return '#00B8D9';
  if (s === 'accepted') return '#34C759';
  return '#8E8E93';
}

function getRequestHeaderIcon(kind: string): string {
  if (kind === 'direct') return 'wrench';
  if (kind === 'broadcast') return 'bullhorn';
  if (kind === 'custom') return 'file-text-o';
  return 'envelope-o';
}

export default function ShopOwnerRequestDetailsScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const navigation = useNavigation();
  const [req, setReq] = useState<RequestDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      navigation.setOptions && navigation.setOptions({ headerShown: false });
    } catch {
      /* ignore */
    }
    try {
      navigation.getParent && navigation.getParent()?.setOptions && navigation.getParent()?.setOptions({ headerShown: false });
    } catch {
      /* ignore */
    }
  }, [navigation]);

  const load = useCallback(
    async (silent = false) => {
      if (!requestId) return;
      try {
        if (!silent) setLoading(true);
        setError(null);
        const res = await fetch(`${API_URL}/bookings/requests/${requestId}/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = (await res.json()) as { request?: RequestDetailPayload; error?: string };
        if (!res.ok) throw new Error(data?.error || 'Failed to load request');
        setReq(data.request || null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
        setReq(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [requestId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const headerBlock = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
      </TouchableOpacity>
      <ThemedText style={styles.headerTitle}>Request details</ThemedText>
      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
        <FontAwesome name="refresh" size={16} color="#FF8C00" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        {headerBlock}
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          <SkeletonDetailPage />
        </ScrollView>
      </ThemedView>
    );
  }

  if (error || !req) {
    return (
      <ThemedView style={styles.container}>
        {headerBlock}
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error || 'Request not found'}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={() => load()}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  const kind = getRequestKind(req);
  const statusColor = getRequestStatusColor(req.status, kind);
  const statusLabel = getRequestStatusLabel(req.status, kind);
  const serviceTypeLabel = kind
    ? `${kind.charAt(0).toUpperCase() + kind.slice(1)} service`
    : 'Service request';
  const directServices =
    kind === 'direct'
      ? req.services && req.services.length > 0
        ? req.services
        : req.service
          ? [req.service]
          : []
      : [];
  const directServicesTotal = directServices.reduce((sum, service) => sum + Number(service.price || 0), 0);
  const directAddOnsTotal = (req.add_ons || []).reduce((sum, addOn) => sum + Number(addOn.price || 0), 0);

  const headerIcon = getRequestHeaderIcon(kind);
  const displayPrice =
    kind === 'direct' && (directServices.length > 0 || (req.add_ons?.length || 0) > 0)
      ? `₱${Number(directServicesTotal + directAddOnsTotal).toFixed(2)}`
      : kind === 'custom' && req.quoted_price != null && req.quoted_price !== undefined
        ? `₱${Number(req.quoted_price).toFixed(2)}`
        : null;

  const clientName = req.client?.name || '—';

  return (
    <ThemedView style={styles.container}>
      {headerBlock}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}
      >
        <View
          style={[
            styles.statusCard,
            styles.pendingSectionCard,
            { borderColor: `${statusColor}40` },
          ]}
        >
          <View style={[styles.statusIconLarge, { backgroundColor: `${statusColor}20` }]}>
            <FontAwesome name={headerIcon as any} size={28} color={statusColor} />
          </View>

          <View style={styles.statusInfo}>
            <View style={styles.statusBadgeRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                <ThemedText style={styles.statusBadgeText}>{statusLabel}</ThemedText>
              </View>
              <ThemedText style={styles.bookingIdText}>#{req.id}</ThemedText>
            </View>
            <ThemedText style={styles.serviceType}>{serviceTypeLabel}</ThemedText>
          </View>

          {displayPrice ? (
            <ThemedText style={styles.amountLarge}>{displayPrice}</ThemedText>
          ) : (
            <View style={{ width: 8 }} />
          )}
        </View>

        {req.has_booking ? (
          <View style={styles.pendingHintBanner}>
            <FontAwesome name="info-circle" size={14} color="#E6C58B" />
            <ThemedText style={styles.pendingHintText}>This request already has a booking.</ThemedText>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
              <FontAwesome name="car" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={styles.sectionTitle}>Request information</ThemedText>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Vehicle type</ThemedText>
              <ThemedText style={[styles.infoValue, !req.vehicle_type ? styles.infoLabel : null]}>
                {req.vehicle_type || 'Not specified'}
              </ThemedText>
            </View>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Vehicle brand</ThemedText>
              <ThemedText style={[styles.infoValue, !req.vehicle_brand ? styles.infoLabel : null]}>
                {req.vehicle_brand || 'Not specified'}
              </ThemedText>
            </View>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Vehicle model</ThemedText>
              <ThemedText style={[styles.infoValue, !req.vehicle_model ? styles.infoLabel : null]}>
                {req.vehicle_model || 'Not specified'}
              </ThemedText>
            </View>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Created</ThemedText>
              <ThemedText style={styles.infoValue}>
                {req.created_at
                  ? new Date(req.created_at).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
              <FontAwesome name="user" size={16} color="#007AFF" />
            </View>
            <ThemedText style={styles.sectionTitle}>Client information</ThemedText>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Name</ThemedText>
              <ThemedText style={styles.infoValue}>{clientName}</ThemedText>
            </View>
          </View>
        </View>

        {req.service_location ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF3B3015' }]}>
                <FontAwesome name="map-marker" size={16} color="#FF3B30" />
              </View>
              <ThemedText style={styles.sectionTitle}>Service location</ThemedText>
            </View>
            <View style={styles.locationDetails}>
              {req.service_location.street_name ? (
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Street</ThemedText>
                  <ThemedText style={styles.locationValue}>{req.service_location.street_name}</ThemedText>
                </View>
              ) : null}
              {req.service_location.subdivision_village ? (
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Subdivision</ThemedText>
                  <ThemedText style={styles.locationValue}>{req.service_location.subdivision_village}</ThemedText>
                </View>
              ) : null}
              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>Barangay</ThemedText>
                <ThemedText style={styles.locationValue}>{req.service_location.barangay || '—'}</ThemedText>
              </View>
              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>City</ThemedText>
                <ThemedText style={styles.locationValue}>{req.service_location.city_municipality || '—'}</ThemedText>
              </View>
              {req.service_location.landmark ? (
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Landmark</ThemedText>
                  <ThemedText style={styles.locationValue}>{req.service_location.landmark}</ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {kind === 'direct' && directServices.length > 0 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                <FontAwesome name="wrench" size={16} color="#34C759" />
              </View>
              <ThemedText style={styles.sectionTitle}>Service & pricing</ThemedText>
            </View>
            <View style={styles.infoGrid}>
              {directServices.map((service, index) => (
                <View key={`service-${service.id || index}`} style={styles.infoItem}>
                  <ThemedText style={styles.infoLabel}>Service {directServices.length > 1 ? index + 1 : ''}</ThemedText>
                  <ThemedText style={styles.infoValue}>
                    {service.name || '—'}
                    {service.price != null ? ` • ₱${Number(service.price).toFixed(2)}` : ''}
                  </ThemedText>
                </View>
              ))}
            </View>
            {req.add_ons && req.add_ons.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                <ThemedText style={[styles.sectionTitle, { fontSize: 14, marginBottom: 8 }]}>Add-ons</ThemedText>
                {req.add_ons.map((a) => (
                  <View key={a.id} style={[styles.infoItem, { marginBottom: 6 }]}>
                    <ThemedText style={styles.infoLabel}>{a.name}</ThemedText>
                    <ThemedText style={styles.infoValue}>₱{Number(a.price || 0).toFixed(2)}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {kind === 'custom' ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#AF52DE15' }]}>
                <FontAwesome name="file-text-o" size={16} color="#AF52DE" />
              </View>
              <ThemedText style={styles.sectionTitle}>Custom request</ThemedText>
            </View>
            {req.description ? (
              <ThemedText style={[styles.infoValue, { lineHeight: 22 }]}>{req.description}</ThemedText>
            ) : (
              <ThemedText style={styles.infoLabel}>No description provided</ThemedText>
            )}
            {req.providers_note ? (
              <ThemedText style={[styles.infoLabel, { marginTop: 12, lineHeight: 18 }]}>
                Shop note: {req.providers_note}
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {kind === 'broadcast' ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF950015' }]}>
                <FontAwesome name="bullhorn" size={16} color="#FF9500" />
              </View>
              <ThemedText style={styles.sectionTitle}>Broadcast</ThemedText>
            </View>
            {req.description ? (
              <ThemedText style={[styles.infoValue, { lineHeight: 22, marginBottom: 12 }]}>{req.description}</ThemedText>
            ) : null}
            {req.services && req.services.length > 0 ? (
              <View style={styles.infoGrid}>
                {req.services.map((sv) => (
                  <View key={sv.id} style={styles.infoItem}>
                    <ThemedText style={styles.infoLabel}>Service</ThemedText>
                    <ThemedText style={styles.infoValue}>{sv.name}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}
            {req.expires_at ? (
              <ThemedText style={[styles.infoLabel, { marginTop: 10 }]}>
                Expires {new Date(req.expires_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {req.concern_picture ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#8E8E9315' }]}>
                <FontAwesome name="image" size={16} color="#8E8E93" />
              </View>
              <ThemedText style={styles.sectionTitle}>Photo</ThemedText>
            </View>
            <Image
              source={{ uri: req.concern_picture }}
              style={{ width: '100%', height: 220, borderRadius: 12, backgroundColor: '#17191B' }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}
