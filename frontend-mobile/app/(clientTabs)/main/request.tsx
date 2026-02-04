import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopNav } from '@/components/navigation';
import { router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface CustomRequest {
  id: number;
  provider: { id: number; name: string } | null;
  description: string;
  status: string;
  quoted_price: number | null;
  providers_note: string | null;
  concern_picture: string | null;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  created_at: string;
  has_booking: boolean;
}

interface DirectRequest {
  id: number;
  provider: { id: number; name: string } | null;
  service: {
    id: number;
    name: string;
    price: number;
  };
  add_ons: Array<{
    id: number;
    name: string;
    price: number;
  }>;
  status: string;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  created_at: string;
  has_booking: boolean;
}

interface EmergencyRequest {
  id: number;
  provider: { id: number; name: string } | null;
  description: string;
  providers_note: string | null;
  concern_picture: string | null;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  created_at: string;
  has_booking: boolean;
}

type TabType = 'custom' | 'direct' | 'emergency';

export default function RequestScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('custom');
  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [directRequests, setDirectRequests] = useState<DirectRequest[]>([]);
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/bookings/requests/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch requests');
      const data = await response.json();
      
      setCustomRequests(data.custom_requests || []);
      setDirectRequests(data.direct_requests || []);
      setEmergencyRequests(data.emergency_requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = () => {
    console.log(`Create ${activeTab} request`);
    
    // Navigate to appropriate request creation page based on active tab
    if (activeTab === 'direct') {
      router.push('/client/request/direct/choosePart');
    } else if (activeTab === 'custom') {
      // router.push('/client/request/custom/create');
      console.log('Navigate to custom request creation');
    } else if (activeTab === 'emergency') {
      // router.push('/client/request/emergency/create');
      console.log('Navigate to emergency request creation');
    }
  };

  const renderCustomRequests = () => {
    if (loading) return <ActivityIndicator size="large" color="#0066cc" />;
    if (error) return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    if (customRequests.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>No custom requests yet</ThemedText>
        </View>
      );
    }

    return customRequests.map((request) => (
      <View key={request.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>Request #{request.id}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) }]}>
            <ThemedText style={styles.statusText}>{request.status.toUpperCase()}</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.cardText} numberOfLines={2}>
          {request.description}
        </ThemedText>
        {request.provider && (
          <ThemedText style={styles.cardText}>Provider: {request.provider.name}</ThemedText>
        )}
        {request.quoted_price && (
          <ThemedText style={styles.priceText}>Quoted: ₱{request.quoted_price.toFixed(2)}</ThemedText>
        )}
        {request.service_location && (
          <ThemedText style={styles.cardText}>
            Location: {request.service_location.barangay}, {request.service_location.city_municipality}
          </ThemedText>
        )}
        <ThemedText style={styles.dateText}>
          {new Date(request.created_at).toLocaleDateString()}
        </ThemedText>
        {request.has_booking && (
          <View style={styles.bookingBadge}>
            <ThemedText style={styles.bookingText}>✓ Booked</ThemedText>
          </View>
        )}
      </View>
    ));
  };

  const renderDirectRequests = () => {
    if (loading) return <ActivityIndicator size="large" color="#0066cc" />;
    if (error) return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    if (directRequests.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>No direct requests yet</ThemedText>
        </View>
      );
    }

    return directRequests.map((request) => (
      <View key={request.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>Request #{request.id}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) }]}>
            <ThemedText style={styles.statusText}>{request.status.toUpperCase()}</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.serviceText}>{request.service.name}</ThemedText>
        <ThemedText style={styles.priceText}>₱{request.service.price.toFixed(2)}</ThemedText>
        {request.add_ons.length > 0 && (
          <ThemedText style={styles.cardText}>
            Add-ons: {request.add_ons.map(a => a.name).join(', ')}
          </ThemedText>
        )}
        {request.provider && (
          <ThemedText style={styles.cardText}>Provider: {request.provider.name}</ThemedText>
        )}
        {request.service_location && (
          <ThemedText style={styles.cardText}>
            Location: {request.service_location.barangay}, {request.service_location.city_municipality}
          </ThemedText>
        )}
        <ThemedText style={styles.dateText}>
          {new Date(request.created_at).toLocaleDateString()}
        </ThemedText>
        {request.has_booking && (
          <View style={styles.bookingBadge}>
            <ThemedText style={styles.bookingText}>✓ Booked</ThemedText>
          </View>
        )}
      </View>
    ));
  };

  const renderEmergencyRequests = () => {
    if (loading) return <ActivityIndicator size="large" color="#0066cc" />;
    if (error) return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    if (emergencyRequests.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>No emergency requests yet</ThemedText>
        </View>
      );
    }

    return emergencyRequests.map((request) => (
      <View key={request.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>Emergency Request #{request.id}</ThemedText>
          <View style={styles.emergencyBadge}>
            <ThemedText style={styles.statusText}>⚠ EMERGENCY</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.cardText} numberOfLines={2}>
          {request.description}
        </ThemedText>
        {request.provider && (
          <ThemedText style={styles.cardText}>Provider: {request.provider.name}</ThemedText>
        )}
        {request.service_location && (
          <ThemedText style={styles.cardText}>
            Location: {request.service_location.barangay}, {request.service_location.city_municipality}
          </ThemedText>
        )}
        <ThemedText style={styles.dateText}>
          {new Date(request.created_at).toLocaleDateString()}
        </ThemedText>
        {request.has_booking && (
          <View style={styles.bookingBadge}>
            <ThemedText style={styles.bookingText}>✓ Booked</ThemedText>
          </View>
        )}
      </View>
    ));
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return '#ff9800';
      case 'accepted':
      case 'quoted':
        return '#00cc66';
      case 'rejected':
        return '#cc0000';
      default:
        return '#666';
    }
  };

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'custom' && styles.activeTab]}
          onPress={() => setActiveTab('custom')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'custom' && styles.activeTabText]}>
            Custom
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'direct' && styles.activeTab]}
          onPress={() => setActiveTab('direct')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'direct' && styles.activeTabText]}>
            Direct
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'emergency' && styles.activeTab]}
          onPress={() => setActiveTab('emergency')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'emergency' && styles.activeTabText]}>
            Emergency
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Create Request Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateRequest}>
          <ThemedText style={styles.createButtonText}>
            + Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Request
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {activeTab === 'custom' && renderCustomRequests()}
        {activeTab === 'direct' && renderDirectRequests()}
        {activeTab === 'emergency' && renderEmergencyRequests()}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#0066cc',
  },
  tabText: {
    fontSize: 16,
    opacity: 0.6,
  },
  activeTabText: {
    opacity: 1,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  buttonContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  createButton: {
    backgroundColor: '#0066cc',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  cardText: {
    fontSize: 14,
    marginBottom: 4,
    opacity: 0.8,
    color: '#e0e0e0',
  },
  serviceText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    color: '#ffffff',
  },
  priceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00cc66',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 8,
    color: '#aaa',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emergencyBadge: {
    backgroundColor: '#cc0000',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  bookingBadge: {
    backgroundColor: '#00cc66',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  bookingText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyCard: {
    backgroundColor: '#2a2a2a',
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    fontStyle: 'italic',
    color: '#aaa',
  },
  errorText: {
    color: '#cc0000',
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
  },
});
