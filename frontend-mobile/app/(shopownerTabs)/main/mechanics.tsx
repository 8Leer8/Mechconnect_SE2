import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Modal, Alert, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TopNav } from '@/components/navigation';
import { getImageUrl } from '@/lib/imageUtils';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Mechanic {
  id: number;
  account_id: number;
  firstname: string;
  lastname: string;
  middlename: string | null;
  email: string;
  username: string;
  profile_photo: string | null;
  contact_number: string | null;
  bio: string | null;
  average_rating: number;
  status: string;
  is_working_for_shop: boolean;
  date_joined?: string;
  current_shop?: string | null;
}

interface MechanicsListData {
  shop_name: string;
  shop_id: number;
  mechanics: Mechanic[];
  count: number;
}

export default function ShopOwnerMechanics() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mechanicsData, setMechanicsData] = useState<MechanicsListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Add mechanic modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Mechanic[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingMechanic, setAddingMechanic] = useState(false);

  const fetchMechanics = async () => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/shops/mechanics/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch mechanics');
      }

      const data = await response.json() as MechanicsListData;
      setMechanicsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mechanics');
      console.error('Mechanics error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const searchAvailableMechanics = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const response = await fetch(`${API_URL}/shops/mechanics/search/?search=${encodeURIComponent(query)}`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to search mechanics');
      }

      const data = await response.json() as { mechanics: Mechanic[]; count: number };
      setSearchResults(data.mechanics);
    } catch (err) {
      console.error('Search error:', err);
      Alert.alert('Error', 'Failed to search mechanics');
    } finally {
      setSearchLoading(false);
    }
  };

  const addMechanicToShop = async (mechanicId: number) => {
    try {
      setAddingMechanic(true);
      const response = await fetch(`${API_URL}/shops/mechanics/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mechanic_id: mechanicId }),
      });

      const data = await response.json() as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add mechanic');
      }

      Alert.alert('Success', 'Mechanic added successfully!');
      setShowAddModal(false);
      setSearchQuery('');
      setSearchResults([]);
      fetchMechanics();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add mechanic');
    } finally {
      setAddingMechanic(false);
    }
  };

  useEffect(() => {
    fetchMechanics();
  }, []);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (showAddModal) {
        searchAvailableMechanics(searchQuery);
      }
    }, 500);

    return () => clearTimeout(delaySearch);
  }, [searchQuery, showAddModal]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMechanics();
  };

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <TopNav onNotificationPress={handleNotificationPress} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={styles.loadingText}>Loading mechanics...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error || !mechanicsData) {
    return (
      <ThemedView style={styles.container}>
        <TopNav onNotificationPress={handleNotificationPress} />
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle.fill" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error || 'No data available'}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.title}>Mechanics</ThemedText>
            <ThemedText style={styles.subtitle}>{mechanicsData.count} total</ThemedText>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <IconSymbol name="plus.circle.fill" size={24} color="#fff" />
            <ThemedText style={styles.addButtonText}>Add</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Mechanics List */}
        {mechanicsData.mechanics.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol name="person.2.slash" size={64} color="#555" />
            <ThemedText style={styles.emptyText}>No mechanics yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>Tap the Add button to hire mechanics</ThemedText>
          </View>
        ) : (
          mechanicsData.mechanics.map((mechanic) => (
            <View key={mechanic.id} style={styles.mechanicCard}>
              <View style={styles.mechanicHeader}>
                {mechanic.profile_photo ? (
                  <Image source={{ uri: getImageUrl(mechanic.profile_photo) || '' }} style={styles.profilePhoto} />
                ) : (
                  <View style={styles.profilePhotoPlaceholder}>
                    <IconSymbol name="person.fill" size={32} color="#555" />
                  </View>
                )}
                <View style={styles.mechanicInfo}>
                  <ThemedText style={styles.mechanicName}>
                    {mechanic.firstname} {mechanic.lastname}
                  </ThemedText>
                  <ThemedText style={styles.mechanicEmail}>{mechanic.email}</ThemedText>
                  {mechanic.contact_number && (
                    <ThemedText style={styles.mechanicContact}>{mechanic.contact_number}</ThemedText>
                  )}
                </View>
              </View>

              <View style={styles.mechanicDetails}>
                {mechanic.bio && (
                  <ThemedText style={styles.mechanicBio} numberOfLines={2}>{mechanic.bio}</ThemedText>
                )}
                
                <View style={styles.mechanicStats}>
                  <View style={styles.statItem}>
                    <IconSymbol name="star.fill" size={16} color="#FF9F0A" />
                    <ThemedText style={styles.statText}>{mechanic.average_rating.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.statusBadge}>
                    <View style={[styles.statusDot, { backgroundColor: mechanic.status === 'available' ? '#34C759' : '#FF9F0A' }]} />
                    <ThemedText style={styles.statusText}>
                      {mechanic.status === 'available' ? 'Available' : 'Working'}
                    </ThemedText>
                  </View>
                </View>

                {mechanic.date_joined && (
                  <ThemedText style={styles.joinedText}>
                    Joined: {new Date(mechanic.date_joined).toLocaleDateString()}
                  </ThemedText>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Mechanic Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Add Mechanic</ThemedText>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <IconSymbol name="xmark.circle.fill" size={28} color="#888" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, email, or username..."
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <ScrollView style={styles.searchResults}>
              {searchLoading ? (
                <ActivityIndicator size="small" color="#007AFF" style={styles.searchLoader} />
              ) : searchResults.length === 0 ? (
                <ThemedText style={styles.noResultsText}>
                  {searchQuery ? 'No mechanics found' : 'Start typing to search'}
                </ThemedText>
              ) : (
                searchResults.map((mechanic) => (
                  <TouchableOpacity
                    key={mechanic.id}
                    style={styles.searchResultItem}
                    onPress={() => addMechanicToShop(mechanic.id)}
                    disabled={addingMechanic}
                  >
                    {mechanic.profile_photo ? (
                      <Image source={{ uri: getImageUrl(mechanic.profile_photo) || '' }} style={styles.searchPhoto} />
                    ) : (
                      <View style={styles.searchPhotoPlaceholder}>
                        <IconSymbol name="person.fill" size={24} color="#555" />
                      </View>
                    )}
                    <View style={styles.searchResultInfo}>
                      <ThemedText style={styles.searchResultName}>
                        {mechanic.firstname} {mechanic.lastname}
                      </ThemedText>
                      <ThemedText style={styles.searchResultEmail}>{mechanic.email}</ThemedText>
                      <View style={styles.searchResultStats}>
                        <IconSymbol name="star.fill" size={14} color="#FF9F0A" />
                        <ThemedText style={styles.searchResultRating}>{mechanic.average_rating.toFixed(2)}</ThemedText>
                        {mechanic.current_shop && (
                          <ThemedText style={styles.searchResultShop}>• {mechanic.current_shop}</ThemedText>
                        )}
                      </View>
                    </View>
                    <IconSymbol name="plus.circle.fill" size={24} color="#007AFF" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#888',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#888',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
  },
  mechanicCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  mechanicHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  profilePhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  profilePhotoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mechanicInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  mechanicName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  mechanicEmail: {
    fontSize: 13,
    color: '#888',
  },
  mechanicContact: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  mechanicDetails: {
    gap: 8,
  },
  mechanicBio: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  mechanicStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  joinedText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  searchInput: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  searchResults: {
    maxHeight: 400,
  },
  searchLoader: {
    marginVertical: 20,
  },
  noResultsText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 40,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginBottom: 8,
  },
  searchPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  searchPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  searchResultEmail: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  searchResultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchResultRating: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  searchResultShop: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
});
