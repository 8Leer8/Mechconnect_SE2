import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const { height } = Dimensions.get('window');

interface EmergencyModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EmergencyModal({ visible, onClose, onSuccess }: EmergencyModalProps) {
  const { showNotification } = useNotification();
  const [description, setDescription] = useState('');
  const [concernPicture, setConcernPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const fetchEmergencyCooldown = async () => {
    try {
      const response = await fetch(`${API_URL}/bookings/requests/emergency/cooldown/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return;

      const data = await response.json() as {
        can_request?: boolean;
        remaining_seconds?: number;
      };

      setCooldownSeconds(data.can_request ? 0 : (data.remaining_seconds || 0));
    } catch (_error) {
      // Non-blocking for modal experience; backend will still enforce cooldown on submit.
    }
  };

  useEffect(() => {
    if (visible) {
      // Reset state when modal opens
      setDescription('');
      setConcernPicture(null);
      setLocation(null);
      // Automatically get location when modal opens
      getCurrentLocation();
      fetchEmergencyCooldown();
    }
  }, [visible]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const getCurrentLocation = async () => {
    try {
      setFetchingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        showNotification({ type: 'warning', title: 'Location Permission Required', message: 'Emergency requests require your location to help mechanics find you quickly.' });
        setFetchingLocation(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Get address from coordinates
      const [addressResult] = await Location.reverseGeocodeAsync({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });

      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        address: addressResult
          ? `${addressResult.street || ''}, ${addressResult.district || addressResult.city || ''}`
          : 'Location detected',
      });
    } catch (error) {
      console.error('Error getting location:', error);
      showNotification({ type: 'error', message: 'Failed to get your current location. Please try again.' });
    } finally {
      setFetchingLocation(false);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showNotification({ type: 'warning', title: 'Permission Denied', message: 'Camera permission is required to take photos' });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setConcernPicture(result.assets[0].uri);
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'Failed to take photo' });
    }
  };

  const handleSubmit = async () => {
    if (cooldownSeconds > 0) {
      showNotification({
        type: 'warning',
        title: 'Emergency Cooldown Active',
        message: `Please wait ${formatCooldown(cooldownSeconds)} before sending another emergency request.`,
      });
      return;
    }

    if (!location) {
      showNotification({ type: 'error', message: 'Location is required for emergency requests. Please enable location services.' });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      
      // Add description (optional)
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      // Add location data
      const serviceLocationData = {
        street_name: location.address || `${location.latitude}, ${location.longitude}`,
        barangay: 'Emergency Location',
        city_municipality: 'Emergency',
        latitude: location.latitude,
        longitude: location.longitude,
      };
      formData.append('service_location', JSON.stringify(serviceLocationData));

      // Add picture (optional)
      if (concernPicture) {
        const filename = concernPicture.split('/').pop() || 'emergency.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('concern_picture', {
          uri: concernPicture,
          name: filename,
          type: type,
        } as any);
      }

      const response = await fetch(`${API_URL}/bookings/requests/emergency/create/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = await response.json();

      if (response.ok) {
        setCooldownSeconds(5 * 60);
        showNotification({ type: 'success', title: 'Emergency Request Sent', message: 'Your emergency request has been sent to nearby mechanics. Help is on the way!' });
        onClose();
        onSuccess?.();
      } else {
        const dataAny = data as any;
        if (response.status === 429 && typeof dataAny?.remaining_seconds === 'number') {
          setCooldownSeconds(dataAny.remaining_seconds);
        }
        showNotification({ type: 'error', message: (data as any).error || 'Failed to send emergency request' });
      }
    } catch (error) {
      console.error('Error sending emergency request:', error);
      showNotification({ type: 'error', message: 'An error occurred while sending the emergency request' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View style={styles.modalBox}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <FontAwesome name="exclamation-triangle" size={20} color="#FF3B30" />
                <ThemedText style={styles.modalTitle}>Emergency Request</ThemedText>
              </View>
              <TouchableOpacity onPress={onClose}>
                <FontAwesome name="times" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalContent}>
            {/* Location Status */}
            {cooldownSeconds > 0 && (
              <View style={styles.cooldownCard}>
                <FontAwesome name="clock-o" size={18} color="#FF3B30" />
                <View style={styles.statusInfo}>
                  <ThemedText style={styles.cooldownLabel}>Emergency Cooldown</ThemedText>
                  <ThemedText style={styles.cooldownValue}>You can send another SOS in {formatCooldown(cooldownSeconds)}</ThemedText>
                </View>
              </View>
            )}

            {fetchingLocation ? (
              <View style={styles.statusCard}>
                <ActivityIndicator size="small" color="#FF3B30" />
                <ThemedText style={styles.statusText}>Getting your location...</ThemedText>
              </View>
            ) : location ? (
              <View style={styles.statusCard}>
                <FontAwesome name="check-circle" size={24} color="#34C759" />
                <View style={styles.statusInfo}>
                  <ThemedText style={styles.statusLabel}>Location Detected</ThemedText>
                  <ThemedText style={styles.statusValue}>{location.address || 'Current Location'}</ThemedText>
                  <ThemedText style={styles.coordsText}>
                    {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </ThemedText>
                </View>
              </View>
            ) : (
              <View style={styles.statusCard}>
                <FontAwesome name="exclamation-circle" size={24} color="#FF3B30" />
                <View style={styles.statusInfo}>
                  <ThemedText style={styles.statusLabel}>Location Required</ThemedText>
                  <ThemedText style={styles.statusValue}>Unable to detect location</ThemedText>
                </View>
                <TouchableOpacity style={styles.retryIconBtn} onPress={getCurrentLocation}>
                  <FontAwesome name="refresh" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            )}

            {/* Description Input (Optional) */}
            <View style={styles.inputSection}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="align-left" size={14} color="#8E8E93" />
                <ThemedText style={styles.sectionTitle}>Description (Optional)</ThemedText>
              </View>
              <TextInput
                style={styles.textArea}
                placeholder="Describe the issue or situation..."
                placeholderTextColor="#6C6C70"
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
                editable={!loading}
              />
            </View>

            {/* Photo Section (Optional) */}
            <View style={styles.inputSection}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="camera" size={14} color="#8E8E93" />
                <ThemedText style={styles.sectionTitle}>Photo (Optional)</ThemedText>
              </View>
              {concernPicture ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: concernPicture }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => setConcernPicture(null)}
                  >
                    <FontAwesome name="times-circle" size={28} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.addPhotoBtn}
                  onPress={takePhoto}
                  disabled={loading}
                >
                  <FontAwesome name="camera" size={28} color="#8E8E93" />
                  <ThemedText style={styles.addPhotoText}>Take Photo</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {/* Info Message */}
            <View style={styles.infoCard}>
              <FontAwesome name="info-circle" size={16} color="#007AFF" />
              <ThemedText style={styles.infoText}>
                Your current location will be shared with nearby mechanics for quick assistance.
              </ThemedText>
            </View>
              </View>
            </ScrollView>

          {/* Action Buttons */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={loading}
            >
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!location || loading || cooldownSeconds > 0) && styles.sendBtnDisabled]}
              onPress={handleSubmit}
              disabled={!location || loading || cooldownSeconds > 0}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <FontAwesome name="send" size={14} color="#FFFFFF" />
                  <ThemedText style={styles.sendBtnText}>Send Emergency</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    maxHeight: height * 0.85,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  scrollView: {
    maxHeight: height * 0.6,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cooldownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FF3B3015',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF3B3040',
  },
  cooldownLabel: {
    fontSize: 12,
    color: '#FF3B30',
    marginBottom: 4,
    fontWeight: '600',
  },
  cooldownValue: {
    fontSize: 14,
    color: '#FFB3AE',
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#ECEDEE',
    marginLeft: 10,
  },
  statusValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  coordsText: {
    fontSize: 11,
    color: '#555',
    fontFamily: 'monospace',
  },
  retryIconBtn: {
    padding: 8,
    backgroundColor: '#FF3B3020',
    borderRadius: 8,
  },
  inputSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  textArea: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#ECEDEE',
    minHeight: 90,
    textAlignVertical: 'top',
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#1A1C1E',
    borderRadius: 20,
    padding: 2,
  },
  addPhotoBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3A3A3C',
    borderStyle: 'dashed',
  },
  addPhotoText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#007AFF15',
    borderRadius: 10,
    padding: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#007AFF',
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#FF3B3060',
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
