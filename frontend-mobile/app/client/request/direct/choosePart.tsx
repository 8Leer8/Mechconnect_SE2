import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from '@/style/client/choosePartStyles';

export default function ChoosePartScreen() {
  const handleMechanicRequest = () => {
    router.push('/client/request/direct/mechanicdirectrequest' as any);
  };

  const handleShopRequest = () => {
    router.push('/client/request/direct/shopdirectrequest' as any);
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Direct Request</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.title}>Choose Service Provider</ThemedText>
        <ThemedText style={styles.subtitle}>
          Select where you want to create your direct request
        </ThemedText>

        <View style={styles.buttonContainer}>
          {/* Mechanic Request Button */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={handleMechanicRequest}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <FontAwesome name="wrench" size={28} color="#FF8C00" />
            </View>
            <View style={styles.optionTextContainer}>
              <ThemedText style={styles.optionTitle}>Request from Mechanic</ThemedText>
              <ThemedText style={styles.optionDescription}>
                Get services from independent mechanics
              </ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
          </TouchableOpacity>

          {/* Shop Request Button */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={handleShopRequest}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <FontAwesome name="building" size={26} color="#FF8C00" />
            </View>
            <View style={styles.optionTextContainer}>
              <ThemedText style={styles.optionTitle}>Request from Shop</ThemedText>
              <ThemedText style={styles.optionDescription}>
                Get services from registered repair shops
              </ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      </View>
    </ThemedView>
  );
}
