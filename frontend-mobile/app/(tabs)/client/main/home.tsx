import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopNav } from '@/components/navigation';

// For Android Emulator use: http://10.0.2.2:8000/api/users
// For iOS Simulator use: http://localhost:8000/api/users
// For Real Device: use your computer's IP (Windows) or (Mac/Linux)  ${config} (Mac/Linux)
const API_URL = 'http://192.168.254.113:8000/api/bookings';

interface Booking {
  id: number;
  status: string;
  amount_fee: string;
  booked_at: string;
  request: {
    request_type: string;
    service_location: any;
  };
}

interface Request {
  id: number;
  request_type: string;
  created_at: string;
  request_details: any;
}

interface HomeData {
  current_bookings: Booking[];
  pending_requests: Request[];
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHomeData();
  }, []);

  const fetchHomeData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/home/`, {
        method: 'GET',
        credentials: 'include', // Important for session authentication
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching home data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      <ScrollView style={styles.scrollView}>
        {/* Quick Start Buttons */}
        <View style={styles.quickStartSection}>
          <ThemedText style={styles.sectionTitle}>Quick Start</ThemedText>
          
          {/* Row 1: Services | Request */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.quickButton, styles.servicesButton]}>
              <ThemedText style={styles.buttonText}>Services</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickButton, styles.requestButton]}>
              <ThemedText style={styles.buttonText}>Request</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Row 2: Mechanics | Shops */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.quickButton, styles.mechanicsButton]}>
              <ThemedText style={styles.buttonText}>Mechanics</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickButton, styles.shopsButton]}>
              <ThemedText style={styles.buttonText}>Shops</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Row 3: Emergency (centered) */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.quickButton, styles.emergencyButton, styles.emergencyCentered]}>
              <ThemedText style={styles.buttonText}>Emergency</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Current Bookings Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Current Bookings</ThemedText>
          {loading ? (
            <ActivityIndicator size="large" color="#0066cc" />
          ) : error ? (
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          ) : data?.current_bookings && data.current_bookings.length > 0 ? (
            data.current_bookings.slice(0, 3).map((booking, index) => (
              <View key={booking.id} style={styles.card}>
                <ThemedText style={styles.cardTitle}>
                  Booking #{booking.id} - {booking.status.toUpperCase()}
                </ThemedText>
                <ThemedText style={styles.cardText}>
                  Type: {booking.request.request_type}
                </ThemedText>
                <ThemedText style={styles.cardText}>
                  Amount: ₱{booking.amount_fee}
                </ThemedText>
                <ThemedText style={styles.cardText}>
                  Booked: {new Date(booking.booked_at).toLocaleDateString()}
                </ThemedText>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyText}>No bookings available</ThemedText>
            </View>
          )}
        </View>

        {/* Pending Requests Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Pending Requests</ThemedText>
          {loading ? (
            <ActivityIndicator size="large" color="#0066cc" />
          ) : error ? (
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          ) : data?.pending_requests && data.pending_requests.length > 0 ? (
            data.pending_requests.slice(0, 3).map((request, index) => (
              <View key={request.id} style={styles.card}>
                <ThemedText style={styles.cardTitle}>
                  Request #{request.id} - {request.request_type.toUpperCase()}
                </ThemedText>
                <ThemedText style={styles.cardText}>
                  Created: {new Date(request.created_at).toLocaleDateString()}
                </ThemedText>
                {request.request_details?.description && (
                  <ThemedText style={styles.cardText} numberOfLines={2}>
                    {request.request_details.description}
                  </ThemedText>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyText}>No requests available</ThemedText>
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  quickStartSection: {
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quickButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 60,
  },
  servicesButton: {
    backgroundColor: '#0066cc',
  },
  requestButton: {
    backgroundColor: '#00cc66',
  },
  mechanicsButton: {
    backgroundColor: '#cc6600',
  },
  shopsButton: {
    backgroundColor: '#9966cc',
  },
  emergencyButton: {
    backgroundColor: '#cc0000',
  },
  emergencyCentered: {
    flex: 0.5,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#ffffff',
  },
  cardText: {
    fontSize: 14,
    marginBottom: 4,
    opacity: 0.8,
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
