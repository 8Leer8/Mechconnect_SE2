import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Modal } from 'react-native';
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

interface BroadcastRequest {
  id: number;
  provider: { id: number; name: string } | null;
  description: string;
  providers_note: string | null;
  concern_picture: string | null;
  services: Array<{
    id: number;
    name: string;
  }>;
  status: string;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  created_at: string;
  expires_at: string;
  has_booking: boolean;
}

interface RequestsResponse {
  custom_requests: CustomRequest[];
  direct_requests: DirectRequest[];
  broadcast_requests: BroadcastRequest[];
  total_count: number;
}

interface ErrorResponse {
  error: string;
}

type TabType = 'custom' | 'direct' | 'broadcast';

export default function RequestScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('custom');
  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [directRequests, setDirectRequests] = useState<DirectRequest[]>([]);
  const [broadcastRequests, setBroadcastRequests] = useState<BroadcastRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<BroadcastRequest | null>(null);

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
      const data = await response.json() as RequestsResponse;
      
      setCustomRequests(data.custom_requests || []);
      setDirectRequests(data.direct_requests || []);
      setBroadcastRequests(data.broadcast_requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }

        const response = await fetch(`${API_URL}/bookings/requests/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (cancelled) return;

        if (!response.ok) throw new Error('Failed to fetch requests');
        const data = await response.json() as RequestsResponse;
        
        if (!cancelled) {
          setCustomRequests(data.custom_requests || []);
          setDirectRequests(data.direct_requests || []);
          setBroadcastRequests(data.broadcast_requests || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
          console.error('Error fetching requests:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Update current time every second for countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  const handleCancelRequest = async (requestId: number, requestType: 'custom' | 'direct' | 'broadcast') => {
    try {
      const response = await fetch(`${API_URL}/bookings/requests/${requestId}/cancel/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json() as ErrorResponse;
        throw new Error(data.error || 'Failed to cancel request');
      }

      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request');
      console.error('Error cancelling request:', err);
    }
  };

  const getTimeRemaining = (expiresAt: string): { text: string; isExpired: boolean } => {
    const expiry = new Date(expiresAt).getTime();
    const diff = expiry - currentTime;
    
    if (diff <= 0) return { text: 'Expired', isExpired: true };
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    return { text: `${minutes}m ${seconds}s`, isExpired: false };
  };

  const handleOpenDeleteModal = (request: BroadcastRequest) => {
    setRequestToDelete(request);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!requestToDelete) return;
    
    setDeleteModalVisible(false);
    await handleCancelRequest(requestToDelete.id, 'broadcast');
    setRequestToDelete(null);
  };

  const handleCancelDelete = () => {
    setDeleteModalVisible(false);
    setRequestToDelete(null);
  };

  const handleResendBroadcast = async (requestId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/bookings/requests/${requestId}/broadcast/resend/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json() as any;

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend broadcast request');
      }

      // Refresh the requests list to show updated status
      await fetchRequests();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend broadcast request');
      console.error('Error resending broadcast:', err);
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
    } else if (activeTab === 'broadcast') {
      router.push('/client/request/broadcast/broadcastrequest' as any);
      
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
        {!request.has_booking && request.status !== 'cancelled' && (
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => handleCancelRequest(request.id, 'custom')}
          >
            <ThemedText style={styles.cancelButtonText}>Cancel Request</ThemedText>
          </TouchableOpacity>
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

    return directRequests.map((request) => {
      const addOnsTotal = request.add_ons.reduce((sum, addon) => sum + addon.price, 0);
      const totalPrice = request.service.price + addOnsTotal;
      
      return (
      <View key={request.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>Request #{request.id}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) }]}>
            <ThemedText style={styles.statusText}>{request.status.toUpperCase()}</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.serviceText}>{request.service.name}</ThemedText>
        <ThemedText style={styles.priceText}>Total: ₱{totalPrice.toFixed(2)}</ThemedText>
        {request.add_ons.length > 0 && (
          <ThemedText style={styles.cardText}>
            Add-ons: {request.add_ons.map(a => `${a.name} (₱${a.price.toFixed(2)})`).join(', ')}
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
        {!request.has_booking && request.status !== 'cancelled' && (
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => handleCancelRequest(request.id, 'direct')}
          >
            <ThemedText style={styles.cancelButtonText}>Cancel Request</ThemedText>
          </TouchableOpacity>
        )}
      </View>
      );
    });
  };

  const renderBroadcastRequests = () => {
    if (loading) return <ActivityIndicator size="large" color="#FF8C00" />;
    if (error) return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    if (broadcastRequests.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>No broadcast requests yet</ThemedText>
        </View>
      );
    }

    return broadcastRequests.map((request) => {
      const timeRemaining = getTimeRemaining(request.expires_at);
      const isExpired = request.status === 'expired' || timeRemaining.isExpired;
      
      return (
      <View key={request.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>Broadcast Request #{request.id}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: getBroadcastStatusColor(request.status) }]}>
            <ThemedText style={styles.statusText}>{request.status.toUpperCase()}</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.cardText} numberOfLines={2}>
          {request.description}
        </ThemedText>
        {request.services && request.services.length > 0 && (
          <ThemedText style={styles.cardText}>
            Services: {request.services.map(s => s.name).join(', ')}
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
        
        {/* Timer Display - Only show if not booked and status is searching */}
        {!request.has_booking && request.status === 'searching' && (
          <View style={[styles.timerContainer, isExpired && styles.expiredTimerContainer]}>
            <ThemedText style={[styles.timerText, isExpired && styles.expiredTimerText]}>
              {isExpired ? 'Expired' : `Time remaining: ${timeRemaining.text}`}
            </ThemedText>
          </View>
        )}
        
        {/* Expired State - Only show if status is expired and not booked */}
        {isExpired && !request.has_booking && (
          <View style={styles.expiredContainer}>
            <ThemedText style={styles.expiredMessage}>
              This request has expired. No mechanics responded in time.
            </ThemedText>
            <View style={styles.expiredButtonsContainer}>
              <TouchableOpacity 
                style={styles.resendButton}
                onPress={() => handleResendBroadcast(request.id)}
              >
                <ThemedText style={styles.resendButtonText}>Send Again</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.removeButton}
                onPress={() => handleOpenDeleteModal(request)}
              >
                <ThemedText style={styles.removeButtonText}>Remove</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}
        
        {request.has_booking && (
          <View style={styles.bookingBadge}>
            <ThemedText style={styles.bookingText}>Booked</ThemedText>
          </View>
        )}
      </View>
      );
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return '#FFB84D';
      case 'accepted':
      case 'quoted':
        return '#4CAF50';
      case 'rejected':
      case 'cancelled':
        return '#FF4500';
      default:
        return '#999';
    }
  };

  const getBroadcastStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'searching':
        return '#34C759'; // Green - actively searching
      case 'accepted':
        return '#4CAF50'; // Green - accepted
      case 'expired':
        return '#FF4500'; // Red - expired
      case 'cancelled':
        return '#999'; // Gray - cancelled
      default:
        return '#34C759';
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
          style={[styles.tab, activeTab === 'broadcast' && styles.activeTab]}
          onPress={() => setActiveTab('broadcast')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'broadcast' && styles.activeTabText]}>
            Broadcast
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
        {activeTab === 'broadcast' && renderBroadcastRequests()}
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ThemedText style={styles.modalTitle}>Confirm Deletion</ThemedText>
            
            <ThemedText style={styles.modalLabel}>Request Description:</ThemedText>
            <View style={styles.modalDescriptionBox}>
              <ThemedText style={styles.modalDescription}>
                {requestToDelete?.description || 'No description'}
              </ThemedText>
            </View>
            
            <ThemedText style={styles.modalWarning}>
              Are you sure you want to delete this broadcast request? This action cannot be undone.
            </ThemedText>
            
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity 
                style={styles.modalCancelButton}
                onPress={handleCancelDelete}
              >
                <ThemedText style={styles.modalCancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalDeleteButton}
                onPress={handleConfirmDelete}
              >
                <ThemedText style={styles.modalDeleteButtonText}>Delete</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
