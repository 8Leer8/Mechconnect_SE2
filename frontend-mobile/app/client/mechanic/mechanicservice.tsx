import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function MechanicServiceScreen() {
	const router = useRouter();

	const handleBack = () => {
		router.replace('/(clientTabs)/main/discover');
	};

	return (
		<ThemedView style={{ flex: 1, backgroundColor: '#111214', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<View style={{ alignItems: 'center', gap: 10 }}>
				<FontAwesome name="wrench" size={28} color="#FF8C00" />
				<ThemedText style={{ color: '#ECEDEE', fontSize: 16, fontWeight: '700' }}>
					Mechanic Service
				</ThemedText>
				<ThemedText style={{ color: '#8E8E93', fontSize: 13, textAlign: 'center' }}>
					This page is not yet configured.
				</ThemedText>
				<TouchableOpacity
					style={{ marginTop: 8, backgroundColor: '#FF8C00', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}
					onPress={handleBack}
				>
					<ThemedText style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>Go Back</ThemedText>
				</TouchableOpacity>
			</View>
		</ThemedView>
	);
}
