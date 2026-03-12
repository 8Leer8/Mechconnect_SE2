import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Modal, Image } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopNav } from '@/components/navigation';
import { getImageUrl } from '@/lib/imageUtils';
import { useNotification } from '@/hooks/useNotification';

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
  const { showNotification } = useNotification();
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
      showNotification({ type: 'error', message: 'Failed to search mechanics' });
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

      showNotification({ type: 'success', message: 'Mechanic added successfully!' });
      setShowAddModal(false);
      setSearchQuery('');
      setSearchResults([]);
      fetchMechanics();
    } catch (err) {
      showNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add mechanic' });
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
          <ActivityIndicator size="large" color="#FF9500" />
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
          <View style={styles.errorIconWrap}>
            <FontAwesome name="exclamation-triangle" size={36} color="#FF3B30" />
          </View>
          <ThemedText style={styles.errorText}>{error || 'No data available'}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMechanics} activeOpacity={0.8}>
            <FontAwesome name="refresh" size={16} color="#fff" />
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </TouchableOpacity>
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF9500" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.title}>Mechanics</ThemedText>
            <ThemedText style={styles.subtitle}>{mechanicsData.count} total</ThemedText>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)} activeOpacity={0.8}>
            <FontAwesome name="plus-circle" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Mechanics List */}
        {mechanicsData.mechanics.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <FontAwesome name="wrench" size={40} color="#FF9500" />
            </View>
            <ThemedText style={styles.emptyText}>No mechanics yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>Tap “Add Mechanic” to search and add mechanics to your shop</ThemedText>
          </View>
        ) : (
          mechanicsData.mechanics.map((mechanic) => (
            <View key={mechanic.id} style={styles.mechanicCard}>
              <View style={styles.mechanicHeader}>
                {mechanic.profile_photo ? (
                  <Image source={{ uri: getImageUrl(mechanic.profile_photo) || '' }} style={styles.profilePhoto} />
                ) : (
                  <View style={styles.profilePhotoPlaceholder}>
                    <FontAwesome name="user" size={28} color="#666" />
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
                    <FontAwesome name="star" size={14} color="#FF9500" />
                    <ThemedText style={styles.statText}>{mechanic.average_rating.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.statusBadge}>
                    <View style={[styles.statusDot, { backgroundColor: mechanic.status === 'available' ? '#34C759' : '#FF9500' }]} />
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
              <TouchableOpacity onPress={() => setShowAddModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <FontAwesome name="times-circle" size={26} color="#888" />
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
                <ActivityIndicator size="small" color="#FF9500" style={styles.searchLoader} />
              ) : searchResults.length === 0 ? (
                <ThemedText style={styles.noResultsText}>
                  No mechanics found
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
                        <FontAwesome name="user" size={22} color="#666" />
                      </View>
                    )}
                    <View style={styles.searchResultInfo}>
                      <ThemedText style={styles.searchResultName}>
                        {mechanic.firstname} {mechanic.lastname}
                      </ThemedText>
                      <ThemedText style={styles.searchResultEmail}>{mechanic.email}</ThemedText>
                      <View style={styles.searchResultStats}>
                        <FontAwesome name="star" size={12} color="#FF9500" />
                        <ThemedText style={styles.searchResultRating}>{mechanic.average_rating.toFixed(2)}</ThemedText>
                        {mechanic.current_shop && (
                          <ThemedText style={styles.searchResultShop}>• {mechanic.current_shop}</ThemedText>
                        )}
                      </View>
                    </View>
                    <FontAwesome name="plus-circle" size={22} color="#FF9500" />
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
    backgroundColor: '#0D0D0D',
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
    color: '#ccc',
    textAlign: 'center',
  },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B3018',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FF9500',
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FF950018',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  mechanicCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#252525',
    overflow: 'hidden',
  },
  mechanicHeader: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  profilePhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profilePhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#252525',
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
    paddingVertical: 5,
    backgroundColor: '#252525',
    borderRadius: 10,
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
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '82%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#252525',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  searchInput: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#252525',
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
    gap: 14,
    padding: 14,
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252525',
  },
  searchPhoto: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  searchPhotoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#252525',
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
