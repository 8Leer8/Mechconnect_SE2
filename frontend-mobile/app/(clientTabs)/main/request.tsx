import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopNav } from '@/components/navigation';
import { router } from 'expo-router';
import { styles } from '../../../style/client/requestStyles';

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
    if (loading) return <ActivityIndicator size="large" color="#FF8C00" />;
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
    if (loading) return <ActivityIndicator size="large" color="#FF8C00" />;
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
    if (loading) return <ActivityIndicator size="large" color="#FF8C00" />;
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
        return '#FFB84D';
      case 'accepted':
      case 'quoted':
        return '#4CAF50';
      case 'rejected':
        return '#FF4500';
      default:
        return '#999';
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
