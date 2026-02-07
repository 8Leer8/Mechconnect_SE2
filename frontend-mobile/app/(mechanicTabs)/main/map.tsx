import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Note: Full map integration requires react-native-maps or similar library
// This is a placeholder UI that can be connected to a mapping library

interface JobLocation {
  id: number;
  title: string;
  address: string;
  distance?: string;
  status: 'active' | 'pending' | 'emergency';
  earnings: number;
  request_type: string;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  };
}

export default function MapScreen() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'active' | 'pending' | 'emergency'>('all');
  const [jobs, setJobs] = useState<JobLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/bookings/home/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch jobs');
      const data = await response.json();
      
      // Combine current bookings and pending requests
      const allJobs: JobLocation[] = [];
      
      // Add current bookings
      if (data.current_bookings) {
        data.current_bookings.forEach((booking: any) => {
          allJobs.push({
            id: booking.id,
            title: `${booking.request.type} Request`,
            address: `${booking.request.service_location.barangay}, ${booking.request.service_location.city_municipality}`,
            status: 'active',
            earnings: booking.amount_fee,
            request_type: booking.request.type,
            service_location: booking.request.service_location,
          });
        });
      }
      
      // Add pending requests
      if (data.pending_requests) {
        data.pending_requests.forEach((request: any) => {
          allJobs.push({
            id: request.id,
            title: `${request.request_type} Request`,
            address: `${request.service_location.barangay}, ${request.service_location.city_municipality}`,
            status: request.request_type === 'emergency' ? 'emergency' : 'pending',
            earnings: request.request_details?.quoted_price || 0,
            request_type: request.request_type,
            service_location: request.service_location,
          });
        });
      }
      
      setJobs(allJobs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchJobs();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#FF8C00';
      case 'emergency': return '#FF3B30';
      case 'pending': return '#007AFF';
      default: return '#8E8E93';
    }
  };

  const filteredJobs = selectedFilter === 'all' 
    ? jobs 
    : jobs.filter(job => job.status === selectedFilter);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Nearby Jobs</ThemedText>
        <TouchableOpacity style={styles.locationButton}>
          <FontAwesome name="crosshairs" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['all', 'active', 'pending', 'emergency'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                selectedFilter === filter && styles.filterChipActive,
              ]}
              onPress={() => setSelectedFilter(filter)}
            >
              <ThemedText
                style={[
                  styles.filterChipText,
                  selectedFilter === filter && styles.filterChipTextActive,
                ]}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Map Placeholder */}
      <View style={styles.mapPlaceholder}>
        <FontAwesome name="map" size={80} color="#34C759" />
        <ThemedText style={styles.mapPlaceholderText}>Map View</ThemedText>
        <ThemedText style={styles.mapPlaceholderSubtext}>
          Integrate react-native-maps or
        </ThemedText>
        <ThemedText style={styles.mapPlaceholderSubtext}>
          similar library to show real locations
        </ThemedText>
        <View style={styles.mapOverlay}>
          <View style={styles.mapStats}>
            <FontAwesome name="map-marker" size={16} color="#FF8C00" />
            <ThemedText style={styles.mapStatsText}>{filteredJobs.length} jobs nearby</ThemedText>
          </View>
        </View>
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
            <ActivityIndicator size="large" color="#FF8C00" style={styles.loader} />
          ) : error ? (
            <View style={styles.errorContainer}>
              <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
              <TouchableOpacity style={styles.retryButton} onPress={fetchJobs}>
                <ThemedText style={styles.retryText}>Retry</ThemedText>
              </TouchableOpacity>
            </View>
          ) : filteredJobs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome name="map-marker" size={64} color="#8E8E93" />
              <ThemedText style={styles.emptyText}>No jobs available</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                {selectedFilter === 'all' ? 'Check back later for new jobs' : `No ${selectedFilter} jobs nearby`}
              </ThemedText>
            </View>
          ) : (
            filteredJobs.map((job) => (
              <TouchableOpacity key={job.id} style={styles.jobCard}>
                <View style={styles.jobCardHeader}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(job.status) }]} />
                  <ThemedText style={styles.jobTitle} numberOfLines={1}>
                    {job.title}
                  </ThemedText>
                </View>

                <View style={styles.jobInfo}>
                  <View style={styles.jobInfoRow}>
                    <FontAwesome name="map-marker" size={12} color="#8E8E93" />
                    <ThemedText style={styles.jobInfoText} numberOfLines={1}>
                      {job.address}
                    </ThemedText>
                  </View>
                  {job.distance && (
                    <View style={styles.jobInfoRow}>
                      <FontAwesome name="location-arrow" size={12} color="#8E8E93" />
                      <ThemedText style={styles.jobInfoText}>{job.distance} away</ThemedText>
                    </View>
                  )}
                </View>

                <View style={styles.jobCardFooter}>
                  <ThemedText style={styles.jobEarnings}>
                    {job.earnings > 0 ? `₱${job.earnings.toFixed(2)}` : 'TBD'}
                  </ThemedText>
                  <TouchableOpacity style={styles.navigateButton}>
                    <FontAwesome name="directions" size={14} color="#fff" />
                    <ThemedText style={styles.navigateText}>Navigate</ThemedText>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  locationButton: {
    padding: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  filterContainer: {
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    marginRight: 10,
  },
  filterChipActive: {
    backgroundColor: '#34C759',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  mapPlaceholder: {
    height: 280,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    position: 'relative',
  },
  mapPlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  mapPlaceholderSubtext: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  mapOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  mapStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E1E1EDD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  mapStatsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  jobListContainer: {
    flex: 1,
    backgroundColor: '#151718',
  },
  jobListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  jobList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loader: {
    marginTop: 40,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FF8C00',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
  },
  jobList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  jobCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  jobCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  jobInfo: {
    marginBottom: 10,
  },
  jobInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  jobInfoText: {
    fontSize: 13,
    color: '#8E8E93',
    flex: 1,
  },
  jobCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  jobEarnings: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#34C759',
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF8C00',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  navigateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
