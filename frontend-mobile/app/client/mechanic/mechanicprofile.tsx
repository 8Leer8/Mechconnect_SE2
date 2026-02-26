import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../../style/client/mechanicProfileStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Review {
  id: number;
  reviewer_name: string;
  reviewer_photo: string | null;
  rating: number;
  comment: string;
  created_at: string;
}

interface Service {
  id: number;
  service_id: number;
  service_name: string;
  service_description: string;
  service_category: string | null;
  service_picture: string | null;
  price: string;
}

interface Specialty {
  id: number;
  name: string;
  description: string;
}

interface MechanicProfile {
  id: number;
  account_id: number;
  full_name: string;
  firstname: string;
  lastname: string;
  middlename: string | null;
  email: string;
  username: string;
  profile_photo_url: string | null;
  bio: string | null;
  average_rating: string;
  total_reviews: number;
  reviews: Review[];
  years_active: number;
  account_created: string;
  is_part_of_shop: boolean;
  shop_name: string | null;
  shop_id: number | null;
  specialties: Specialty[];
  services: Service[];
  contact_number: string | null;
  status: string;
}

export default function MechanicProfileScreen() {
  const router = useRouter();
  const { mechanicId } = useLocalSearchParams<{ mechanicId: string }>();
  const [profile, setProfile] = useState<MechanicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mechanicId) {
      fetchMechanicProfile();
    }
  }, [mechanicId]);

  const fetchMechanicProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/users/mechanics/${mechanicId}/profile/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch mechanic profile');

      const data = await response.json() as { mechanic: MechanicProfile };
      setProfile(data.mechanic);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching mechanic profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Ionicons key={i} name="star" size={16} color="#FFD700" />);
      } else if (i === fullStars && hasHalfStar) {
        stars.push(<Ionicons key={i} name="star-half" size={16} color="#FFD700" />);
      } else {
        stars.push(<Ionicons key={i} name="star-outline" size={16} color="#FFD700" />);
      }
    }
    return stars;
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error || !profile) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error || 'Profile not found'}</ThemedText>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Ionicons name="arrow-back" size={24} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Mechanic Profile</ThemedText>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {profile.profile_photo_url ? (
            <Image source={{ uri: profile.profile_photo_url }} style={styles.profilePhoto} />
          ) : (
            <View style={[styles.profilePhoto, styles.profilePhotoPlaceholder]}>
              <ThemedText style={styles.profilePhotoText}>
                {profile.firstname.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
          <ThemedText style={styles.name}>{profile.full_name}</ThemedText>
          
          {/* Rating */}
          <View style={styles.ratingContainer}>
            {profile.total_reviews > 0 ? (
              <>
                <View style={styles.stars}>
                  {renderStars(parseFloat(profile.average_rating))}
                </View>
                <ThemedText style={styles.ratingText}>
                  {parseFloat(profile.average_rating).toFixed(1)} ({profile.total_reviews} reviews)
                </ThemedText>
              </>
            ) : (
              <ThemedText style={styles.noRatingText}>No ratings at the moment</ThemedText>
            )}
          </View>

          {/* Status Badge */}
          <View style={styles.statusBadge}>
            <ThemedText style={styles.statusText}>{profile.status}</ThemedText>
          </View>

          {/* Direct Request Button */}
          <TouchableOpacity 
            style={styles.directRequestButton}
            onPress={() => {
              const providerAccountId = profile.account_id || profile.id;
              console.log('Direct Request pressed for provider account ID:', providerAccountId);
              router.push({
                pathname: '/client/request/direct/mechanicdirectrequest',
                params: { mechanicId: String(providerAccountId) }
              });
            }}
          >
            <Ionicons name="clipboard-outline" size={20} color="#ffffff" />
            <ThemedText style={styles.directRequestButtonText}>Direct Request</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Info Cards */}
        <View style={styles.section}>
          <View style={styles.infoCard}>
            <Ionicons name="calendar-outline" size={20} color="#FF8C00" />
            <ThemedText style={styles.infoText}>
              User joined: {new Date(profile.account_created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </ThemedText>
          </View>

          {profile.contact_number && (
            <View style={styles.infoCard}>
              <Ionicons name="call-outline" size={20} color="#FF8C00" />
              <ThemedText style={styles.infoText}>{profile.contact_number}</ThemedText>
            </View>
          )}

          {profile.is_part_of_shop && profile.shop_name && (
            <View style={styles.infoCard}>
              <Ionicons name="business-outline" size={20} color="#FF8C00" />
              <ThemedText style={styles.infoText}>Works at {profile.shop_name}</ThemedText>
            </View>
          )}
        </View>

        {/* Bio */}
        {profile.bio && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>About</ThemedText>
            <View style={styles.card}>
              <ThemedText style={styles.bioText}>{profile.bio}</ThemedText>
            </View>
          </View>
        )}

        {/* Specialties */}
        {profile.specialties && profile.specialties.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Specialties</ThemedText>
            <View style={styles.tagsContainer}>
              {profile.specialties.map((specialty) => (
                <View key={specialty.id} style={styles.tag}>
                  <ThemedText style={styles.tagText}>{specialty.name}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Services */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Services Offered</ThemedText>
          {profile.services && Array.isArray(profile.services) && profile.services.length > 0 ? (
            profile.services.map((service) => (
              <View key={service.id} style={styles.serviceCard}>
                <View style={styles.serviceHeader}>
                  <ThemedText style={styles.serviceName}>{service.service_name}</ThemedText>
                  <ThemedText style={styles.servicePrice}>₱{parseFloat(service.price).toFixed(2)}</ThemedText>
                </View>
                {service.service_category && (
                  <ThemedText style={styles.serviceCategory}>{service.service_category}</ThemedText>
                )}
                {service.service_description && (
                  <ThemedText style={styles.serviceDescription}>{service.service_description}</ThemedText>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyText}>No service available</ThemedText>
            </View>
          )}
        </View>

        {/* Reviews */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Reviews {profile.total_reviews > 0 && `(${profile.total_reviews})`}</ThemedText>
          {profile.reviews && profile.reviews.length > 0 ? (
            profile.reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  {review.reviewer_photo ? (
                    <Image source={{ uri: review.reviewer_photo }} style={styles.reviewerPhoto} />
                  ) : (
                    <View style={[styles.reviewerPhoto, styles.reviewerPhotoPlaceholder]}>
                      <ThemedText style={styles.reviewerPhotoText}>
                        {review.reviewer_name.charAt(0).toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.reviewerInfo}>
                    <ThemedText style={styles.reviewerName}>{review.reviewer_name}</ThemedText>
                    <View style={styles.reviewStars}>
                      {renderStars(review.rating)}
                    </View>
                  </View>
                </View>
                {review.comment && (
                  <ThemedText style={styles.reviewComment}>{review.comment}</ThemedText>
                )}
                <ThemedText style={styles.reviewDate}>
                  {new Date(review.created_at).toLocaleDateString()}
                </ThemedText>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyText}>No ratings yet</ThemedText>
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}
