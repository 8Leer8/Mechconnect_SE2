import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import WalletBadge from '@/components/wallet-badge';
import { eventBus } from '@/utils/eventBus';
import { getDistanceKm, getEstimatedPrice } from '@/app/client/request/main_request_form/LocationContext';
import { styles } from '@/style/mechanic/mapStyles';
import { getImageUrl } from '@/lib/imageUtils';
import { useNotification } from '@/hooks/useNotification';
import { SkeletonMapJobList } from '@/components/skeletons/SkeletonLoaders';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Note: Full map integration requires react-native-maps or similar library
// This is a placeholder UI that can be connected to a mapping library

interface BroadcastRequest {
  id: number;
  description: string;
  latitude: number;
  longitude: number;
  services: {
    id: number;
    name: string;
    description: string;
    minimum_price: number;
  }[];
  add_ons: {
    id: number;
    name: string;
    description: string;
    price: number;
  }[];
  created_at: string;
  expires_at: string;
  status: string;
  concern_picture?: string;
  required_tokens?: number;
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const { showNotification } = useNotification();

  const [broadcasts, setBroadcasts] = useState<BroadcastRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<BroadcastRequest | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [tokensBalance, setTokensBalance] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Map state
  const [region, setRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    initializeMap();
    fetchBroadcasts();
    
    // Poll for broadcasts every 8 seconds
    const interval = setInterval(() => {
      fetchBroadcasts(true);
    }, 8000);
    
    fetchTokensBalance();
    return () => clearInterval(interval);
  }, []);

  // Update current time every second for countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const fetchTokensBalance = async () => {
    try {
      const res = await fetch(`${API_URL}/users/mechanic/wallet/`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setTokensBalance(data.tokens_balance ?? 0);
    } catch (e) {
      // ignore
    }
  };

  const initializeMap = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        // Use default Manila location
        const fallbackRegion = {
          latitude: 14.5995,
          longitude: 120.9842,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setRegion(fallbackRegion);
        setUserLocation({
          latitude: 14.5995,
          longitude: 120.9842,
        });
        return;
      }

      // Get current location with timeout
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000); // 5 second timeout
      });

      const location = await Promise.race([locationPromise, timeoutPromise]);

      if (location) {
        const currentRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setRegion(currentRegion);
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } else {
        // Timeout - use default location
        console.log('Location fetch timeout, using default location');
        const fallbackRegion = {
          latitude: 14.5995,
          longitude: 120.9842,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setRegion(fallbackRegion);
        setUserLocation({
          latitude: 14.5995,
          longitude: 120.9842,
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
      // Use default Manila location
      const fallbackRegion = {
        latitude: 14.5995,
        longitude: 120.9842,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
      setRegion(fallbackRegion);
      setUserLocation({
        latitude: 14.5995,
        longitude: 120.9842,
      });
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchBroadcasts(true);
  };

  const fetchBroadcasts = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/bookings/broadcasts/active/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch broadcasts');
      const data = await response.json() as any;
      setBroadcasts(data.broadcasts || []);
    } catch (err: any) {
      if (!silent) setError(err.message);
      console.error('Error fetching broadcasts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleBroadcastPress = (broadcast: BroadcastRequest) => {
    setSelectedBroadcast(broadcast);
    setModalVisible(true);
    fetchTokensBalance();
  };

  // Calculate distance and estimated earnings for a broadcast
  const calculateBroadcastEarnings = (broadcast: BroadcastRequest) => {
    if (!userLocation) return null;

    const distanceKm = getDistanceKm(
      userLocation,
      { latitude: broadcast.latitude, longitude: broadcast.longitude }
    );

    const serviceTotal = broadcast.services.reduce((sum, s) => sum + (s.minimum_price || 0), 0);
    const addOnsTotal = broadcast.add_ons?.reduce((sum, a) => sum + (a.price || 0), 0) || 0;
    const basePrice = serviceTotal + addOnsTotal;

    const totalPrice = getEstimatedPrice(distanceKm, basePrice, 10);

    return {
      distanceKm,
      basePrice,
      distanceCharge: totalPrice - basePrice,
      totalPrice
    };
  };

  const handleAcceptBroadcast = async () => {
    if (!selectedBroadcast || !userLocation) return;
    
    setAccepting(true);
    try {
      const earnings = calculateBroadcastEarnings(selectedBroadcast);
      
      const response = await fetch(`${API_URL}/bookings/broadcasts/${selectedBroadcast.id}/accept/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mechanic_latitude: userLocation.latitude,
          mechanic_longitude: userLocation.longitude,
          distance_km: earnings?.distanceKm,
          estimated_price: earnings?.totalPrice
        }),
      });

      const data = await response.json() as any;

      if (response.ok) {
        showNotification({ type: 'success', title: 'Accepted!', message: 'You have accepted the broadcast request. Check your bookings.' });
        setModalVisible(false);
        fetchBroadcasts(true);
        fetchTokensBalance();
        try { eventBus.emit('walletChanged'); } catch(e){}
      } else {
        showNotification({ type: 'warning', title: 'Already Taken', message: data.error || 'This broadcast is no longer available. Another mechanic was faster.' });
        setModalVisible(false);
        fetchBroadcasts(true);
      }
    } catch (err: any) {
      showNotification({ type: 'error', message: 'Failed to accept broadcast request' });
      console.error('Error accepting broadcast:', err);
    } finally {
      setAccepting(false);
    }
  };

  const getTimeRemaining = (expiresAt: string): string => {
    const expiry = new Date(expiresAt).getTime();
    const diff = expiry - currentTime;
    
    if (diff <= 0) return 'Expired';
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    return `${minutes}m ${seconds}s`;
  };

  const filteredBroadcasts = broadcasts;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Nearby Jobs</ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.locationButton}>
            <FontAwesome name="crosshairs" size={20} color="#fff" />
          </TouchableOpacity>
          <WalletBadge onPress={() => router.push('/mechanic/wallet')} />
        </View>
      </View>


      {/* Map View */}
      <View style={styles.mapContainer}>
        {region ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={region}
            showsUserLocation={true}
            showsMyLocationButton={true}
            customMapStyle={[
              {
                elementType: 'geometry',
                stylers: [{ color: '#1A1C1E' }],
              },
              {
                elementType: 'labels.text.fill',
                stylers: [{ color: '#8E8E93' }],
              },
              {
                elementType: 'labels.text.stroke',
                stylers: [{ color: '#1A1C1E' }],
              },
              {
                featureType: 'road',
                elementType: 'geometry',
                stylers: [{ color: '#2A2C2E' }],
              },
              {
                featureType: 'water',
                elementType: 'geometry',
                stylers: [{ color: '#111214' }],
              },
            ]}
          >
            {/* Broadcast Request Markers */}
            {filteredBroadcasts.map((broadcast) => (
              <Marker
                key={`broadcast-${broadcast.id}`}
                coordinate={{
                  latitude: broadcast.latitude,
                  longitude: broadcast.longitude,
                }}
                title="Broadcast Request"
                description={broadcast.description}
                pinColor="#34C759"
                onPress={() => handleBroadcastPress(broadcast)}
              />
            ))}
          </MapView>
        ) : (
          <View style={styles.mapLoadingContainer}>
            <ActivityIndicator size="large" color="#FF8C00" />
            <ThemedText style={styles.mapLoadingText}>Loading map...</ThemedText>
          </View>
        )}
        
        {/* Map Stats Overlay */}
        <View style={styles.mapOverlay}>
          <View style={styles.mapStats}>
            <FontAwesome name="map-marker" size={16} color="#FF8C00" />
            <ThemedText style={styles.mapStatsText}>
              {filteredBroadcasts.length} jobs nearby
            </ThemedText>
          </View>
          {broadcasts.length > 0 && (
            <View style={[styles.mapStats, { backgroundColor: '#34C75990', marginTop: 8 }]}>
              <FontAwesome name="volume-up" size={14} color="#34C759" />
              <ThemedText style={styles.mapStatsText}>
                {broadcasts.length} broadcast{broadcasts.length !== 1 ? 's' : ''}
              </ThemedText>
            </View>
          )}
        </View>
        
        {/* My Location Button */}
        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={() => {
            if (userLocation && mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
              }, 1000);
            }
          }}
        >
          <FontAwesome name="crosshairs" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Job List */}
      <View style={styles.jobListContainer}>
        <ThemedText style={styles.jobListTitle}>Available Jobs</ThemedText>
        <ScrollView 
          style={styles.jobList} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
          }
        >
          {loading && !refreshing ? (
            <SkeletonMapJobList />
          ) : error ? (
            <View style={styles.errorContainer}>
              <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
              <TouchableOpacity style={styles.retryButton} onPress={() => fetchBroadcasts()}>
                <ThemedText style={styles.retryText}>Retry</ThemedText>
              </TouchableOpacity>
            </View>
          ) : filteredBroadcasts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome name="map-marker" size={64} color="#8E8E93" />
              <ThemedText style={styles.emptyText}>No jobs available</ThemedText>
              <ThemedText style={styles.emptySubtext}>Check back later for new jobs</ThemedText>
            </View>
          ) : (
            <>
              {/* Render Broadcast Requests */}
              {filteredBroadcasts.map((broadcast) => (
                <TouchableOpacity 
                  key={`broadcast-${broadcast.id}`} 
                  style={[styles.jobCard, styles.broadcastCard]}
                  onPress={() => handleBroadcastPress(broadcast)}
                >
                  <View style={styles.jobCardHeader}>
                    <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
                    <ThemedText style={styles.jobTitle} numberOfLines={1}>
                      Broadcast Request
                    </ThemedText>
                    <View style={styles.urgentBadge}>
                      <ThemedText style={styles.urgentText}>NEW</ThemedText>
                    </View>
                  </View>

                  <ThemedText style={styles.broadcastDescription} numberOfLines={2}>
                    {broadcast.description}
                  </ThemedText>

                  <View style={styles.servicesContainer}>
                    {broadcast.services.slice(0, 2).map((service, idx) => (
                      <View key={service.id} style={styles.serviceTag}>
                        <ThemedText style={styles.serviceTagText}>{service.name}</ThemedText>
                      </View>
                    ))}
                    {broadcast.services.length > 2 && (
                      <View style={styles.serviceTag}>
                        <ThemedText style={styles.serviceTagText}>
                          +{broadcast.services.length - 2} more
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  <View style={styles.jobCardFooter}>
                    <View style={styles.timerContainer}>
                      <FontAwesome name="clock-o" size={14} color="#FF8C00" />
                      <ThemedText style={styles.timerText}>
                        {getTimeRemaining(broadcast.expires_at)}
                      </ThemedText>
                    </View>
                    <TouchableOpacity 
                      style={styles.acceptButton}
                      onPress={() => handleBroadcastPress(broadcast)}
                    >
                      <ThemedText style={styles.acceptText}>View & Accept</ThemedText>
                      <FontAwesome name="arrow-right" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}

          </>
          )}
        </ScrollView>
      </View>

      {/* Broadcast Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Broadcast Request Details</ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <FontAwesome name="times" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedBroadcast && (
                <>
                  {/* Timer */}
                  <View style={styles.modalTimer}>
                    <FontAwesome name="clock-o" size={20} color="#FF8C00" />
                    <ThemedText style={styles.modalTimerText}>
                      Time Remaining: {getTimeRemaining(selectedBroadcast.expires_at)}
                    </ThemedText>
                  </View>

                  {/* Concern Picture */}
                  {selectedBroadcast.concern_picture && (
                    <View style={styles.modalSection}>
                      <ThemedText style={styles.modalSectionTitle}>Concern Photo</ThemedText>
                      <Image 
                        source={{ uri: getImageUrl(selectedBroadcast.concern_picture) || '' }} 
                        style={styles.modalConcernImage}
                        resizeMode="cover"
                        onError={(error) => console.error('Image load error:', error.nativeEvent.error)}
                        onLoad={() => console.log('Image loaded successfully:', selectedBroadcast.concern_picture)}
                      />
                    </View>
                  )}

                  {/* Description */}
                  <View style={styles.modalSection}>
                    <ThemedText style={styles.modalSectionTitle}>Description</ThemedText>
                    <ThemedText style={styles.modalText}>{selectedBroadcast.description}</ThemedText>
                  </View>

                  {/* Services */}
                  <View style={styles.modalSection}>
                    <ThemedText style={styles.modalSectionTitle}>Services Requested</ThemedText>
                    {selectedBroadcast.services.map((service) => (
                      <View key={service.id} style={styles.modalServiceItem}>
                        <View style={styles.modalServiceInfo}>
                          <ThemedText style={styles.modalServiceName}>{service.name}</ThemedText>
                          <ThemedText style={styles.modalServiceDesc}>{service.description}</ThemedText>
                        </View>
                        <ThemedText style={styles.modalServicePrice}>
                          ₱{parseFloat(String(service.minimum_price || '0')).toFixed(2)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>

                  {/* Add-ons */}
                  {selectedBroadcast.add_ons && selectedBroadcast.add_ons.length > 0 && (
                    <View style={styles.modalSection}>
                      <ThemedText style={styles.modalSectionTitle}>Add-ons</ThemedText>
                      {selectedBroadcast.add_ons.map((addon) => (
                        <View key={addon.id} style={styles.modalServiceItem}>
                          <View style={styles.modalServiceInfo}>
                            <ThemedText style={styles.modalServiceName}>{addon.name}</ThemedText>
                            <ThemedText style={styles.modalServiceDesc}>{addon.description}</ThemedText>
                          </View>
                          <ThemedText style={styles.modalServicePrice}>
                            ₱{parseFloat(String(addon.price || '0')).toFixed(2)}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Price Breakdown */}
                  <View style={styles.modalPriceBreakdown}>
                    <View style={styles.modalPriceRow}>
                      <ThemedText style={styles.modalPriceLabel}>Service Fees:</ThemedText>
                      <ThemedText style={styles.modalPriceValue}>
                        ₱{selectedBroadcast.services.reduce((sum, s) => sum + parseFloat(String(s.minimum_price || '0')), 0).toFixed(2)}
                      </ThemedText>
                    </View>
                    {selectedBroadcast.add_ons && selectedBroadcast.add_ons.length > 0 && (
                      <View style={styles.modalPriceRow}>
                        <ThemedText style={styles.modalPriceLabel}>Add-ons:</ThemedText>
                        <ThemedText style={styles.modalPriceValue}>
                          ₱{(selectedBroadcast.add_ons?.reduce((sum, a) => sum + parseFloat(String(a.price || '0')), 0) || 0).toFixed(2)}
                        </ThemedText>
                      </View>
                    )}
                    {(() => {
                      const earnings = calculateBroadcastEarnings(selectedBroadcast);
                      return earnings ? (
                        <>
                          <View style={styles.modalPriceRow}>
                            <ThemedText style={styles.modalPriceLabel}>
                              Distance ({earnings.distanceKm.toFixed(2)} km):
                            </ThemedText>
                            <ThemedText style={styles.modalPriceValue}>
                              ₱{earnings.distanceCharge.toFixed(2)}
                            </ThemedText>
                          </View>
                          <View style={styles.modalPriceNote}>
                            <ThemedText style={styles.modalPriceNoteText}>
                              ₱10/km from your current location
                            </ThemedText>
                          </View>
                        </>
                      ) : null;
                    })()}
                  </View>

                  {/* Total Estimate */}
                  {(() => {
                    const earnings = calculateBroadcastEarnings(selectedBroadcast);
                    const fallbackTotal = (
                      selectedBroadcast.services.reduce((sum, s) => sum + (s.minimum_price || 0), 0) +
                      (selectedBroadcast.add_ons?.reduce((sum, a) => sum + (a.price || 0), 0) || 0)
                    );
                    return (
                      <View style={styles.modalTotal}>
                        <ThemedText style={styles.modalTotalLabel}>Total Estimated Earnings</ThemedText>
                        <ThemedText style={styles.modalTotalValue}>
                          ₱{(earnings?.totalPrice || fallbackTotal).toFixed(2)}
                        </ThemedText>
                      </View>
                    );
                  })()}
                </>
              )}
            </ScrollView>

            {/* Tokens requirement + Accept Button */}
            <View style={styles.modalSection}>
              <ThemedText style={styles.modalSectionTitle}>Tokens Required to Accept</ThemedText>
              <ThemedText style={styles.modalText}>
                {selectedBroadcast?.required_tokens ? `${selectedBroadcast.required_tokens} tokens` : 'Calculating...'}
              </ThemedText>
              <ThemedText style={[styles.modalText, { marginTop: 8 }]}>Your balance: {tokensBalance ?? '...'}</ThemedText>
              {selectedBroadcast && typeof selectedBroadcast.required_tokens === 'number' && tokensBalance !== null && tokensBalance < selectedBroadcast.required_tokens && (
                <ThemedText style={{ color: '#FF3B30', marginTop: 8 }}>You need to top up tokens to accept this job.</ThemedText>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[
                  styles.modalAcceptButton,
                  accepting && styles.modalAcceptButtonDisabled,
                  (selectedBroadcast && typeof selectedBroadcast.required_tokens === 'number' && tokensBalance !== null && tokensBalance < selectedBroadcast.required_tokens) ? styles.modalAcceptButtonDisabled : null,
                ]}
                onPress={handleAcceptBroadcast}
                disabled={accepting || !!(selectedBroadcast && typeof selectedBroadcast.required_tokens === 'number' && tokensBalance !== null && tokensBalance < selectedBroadcast.required_tokens)}
              >
                {accepting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="check" size={18} color="#fff" />
                    <ThemedText style={styles.modalAcceptText}>Accept This Job</ThemedText>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setModalVisible(false)}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
