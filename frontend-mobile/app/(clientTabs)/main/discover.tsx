import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopNav } from '@/components/navigation';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Mechanic {
  id: number;
  name: string;
  profile_photo: string | null;
  contact_number: string;
  average_rating: number;
  status: string;
}

interface Shop {
  id: number;
  shop_name: string;
  owner_name: string;
  contact_number: string;
  email: string;
  description: string;
  service_banner: string | null;
  is_verified: boolean;
  status: string;
}

interface Service {
  id: number;
  name: string;
  description: string;
  service_picture: string | null;
  category: string;
  price: number;
}

type TabType = 'mechanics' | 'shops' | 'services';

export default function DiscoverScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('mechanics');
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'mechanics' && mechanics.length === 0) {
        const response = await fetch(`${API_URL}/users/mechanics/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch mechanics');
        const data = await response.json();
        setMechanics(data.mechanics || []);
      } else if (activeTab === 'shops' && shops.length === 0) {
        const response = await fetch(`${API_URL}/shops/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch shops');
        const data = await response.json();
        setShops(data.shops || []);
      } else if (activeTab === 'services' && services.length === 0) {
        const response = await fetch(`${API_URL}/services/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch services');
        const data = await response.json();
        setServices(data.services || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderMechanics = () => {
    if (loading) return <ActivityIndicator size="large" color="#0066cc" />;
    if (error) return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    if (mechanics.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>No mechanics available</ThemedText>
        </View>
      );
    }

    return mechanics.map((mechanic) => (
      <View key={mechanic.id} style={styles.card}>
        <View style={styles.cardHeader}>
          {mechanic.profile_photo ? (
            <Image source={{ uri: mechanic.profile_photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <ThemedText style={styles.avatarText}>
                {mechanic.name.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
          <View style={styles.cardInfo}>
            <ThemedText style={styles.cardTitle}>{mechanic.name}</ThemedText>
            <ThemedText style={styles.cardText}>⭐ {mechanic.average_rating.toFixed(1)}</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.cardText}>Contact: {mechanic.contact_number}</ThemedText>
        <ThemedText style={styles.cardText}>Status: {mechanic.status}</ThemedText>
      </View>
    ));
  };

  const renderShops = () => {
    if (loading) return <ActivityIndicator size="large" color="#0066cc" />;
    if (error) return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    if (shops.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>No shops available</ThemedText>
        </View>
      );
    }

    return shops.map((shop) => (
      <View key={shop.id} style={styles.card}>
        {shop.service_banner && (
          <Image source={{ uri: shop.service_banner }} style={styles.shopBanner} />
        )}
        <ThemedText style={styles.cardTitle}>{shop.shop_name}</ThemedText>
        <ThemedText style={styles.cardText}>Owner: {shop.owner_name}</ThemedText>
        <ThemedText style={styles.cardText}>Contact: {shop.contact_number}</ThemedText>
        {shop.description && (
          <ThemedText style={styles.cardText} numberOfLines={2}>
            {shop.description}
          </ThemedText>
        )}
        <View style={styles.badgeContainer}>
          {shop.is_verified && (
            <View style={styles.badge}>
              <ThemedText style={styles.badgeText}>✓ Verified</ThemedText>
            </View>
          )}
          <ThemedText style={styles.statusText}>{shop.status}</ThemedText>
        </View>
      </View>
    ));
  };

  const renderServices = () => {
    if (loading) return <ActivityIndicator size="large" color="#0066cc" />;
    if (error) return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    if (services.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>No services available</ThemedText>
        </View>
      );
    }

    return services.map((service) => (
      <View key={service.id} style={styles.card}>
        {service.service_picture && (
          <Image source={{ uri: service.service_picture }} style={styles.servicePicture} />
        )}
        <ThemedText style={styles.cardTitle}>{service.name}</ThemedText>
        <ThemedText style={styles.categoryText}>{service.category}</ThemedText>
        {service.description && (
          <ThemedText style={styles.cardText} numberOfLines={3}>
            {service.description}
          </ThemedText>
        )}
        <ThemedText style={styles.priceText}>₱{service.price.toFixed(2)}</ThemedText>
      </View>
    ));
  };

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mechanics' && styles.activeTab]}
          onPress={() => setActiveTab('mechanics')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'mechanics' && styles.activeTabText]}>
            Mechanics
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'shops' && styles.activeTab]}
          onPress={() => setActiveTab('shops')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'shops' && styles.activeTabText]}>
            Shops
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'services' && styles.activeTab]}
          onPress={() => setActiveTab('services')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'services' && styles.activeTabText]}>
            Services
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {activeTab === 'mechanics' && renderMechanics()}
        {activeTab === 'shops' && renderShops()}
        {activeTab === 'services' && renderServices()}
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
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#0066cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#ffffff',
  },
  cardText: {
    fontSize: 14,
    marginBottom: 4,
    opacity: 0.8,
    color: '#e0e0e0',
  },
  shopBanner: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
  },
  servicePicture: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 12,
    color: '#0066cc',
    marginBottom: 8,
    fontWeight: '600',
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00cc66',
    marginTop: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  badge: {
    backgroundColor: '#00cc66',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 12,
    opacity: 0.7,
    color: '#e0e0e0',
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
